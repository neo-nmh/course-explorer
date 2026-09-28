#!/usr/bin/env python3
"""Build campus/term JSON files with fully expanded requirement trees (stdlib only)."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
RELATIONS = ("prerequisite", "corequisite")
COURSE_FIELDS = (
    "prefix", "number", "title", "description", "exclusion",
    "min_credits", "max_credits", "school_code", "department_code",
)
NUMBER = r"\d{3,4}[A-Z]?(?:-\d{3,4}[A-Z]?)?"
BRACKETS = {"(": ")", "[": "]", "{": "}"}


def group(kind: str, children: list) -> dict | None:
    """Flatten identical operators, but do not discard repeated requirements."""
    flattened = []
    for child in children:
        if child is not None and child.get("type") == kind:
            flattened.extend(child["children"])
        elif child is not None or kind == "any":
            flattened.append(child)
    if not flattened:
        return None
    if len(flattened) == 1:
        return flattened[0]
    return {"type": kind, "children": flattened}


def walk_expression(node):
    """Visit a parsed expression, not the requirements of referenced courses."""
    if node is None:
        return
    yield node
    for child in node.get("children", []):
        yield from walk_expression(child)
    for child in node.get("references", []):
        yield from walk_expression(child)
    if "requirement" in node:
        yield from walk_expression(node["requirement"])


class RequirementParser:
    """Conservative expression parser; unsupported prose remains a labeled node."""

    def __init__(self, prefixes):
        alternatives = "|".join(re.escape(p) for p in sorted(prefixes, key=lambda p: (-len(p), p)))
        self.course_pattern = re.compile(
            # Historical subjects such as CORE can be absent from the catalogue.
            # Unknown prefixes must be uppercase; prose such as 'from 2022' is not a course.
            rf"(?<![A-Za-z0-9])({alternatives}|(?-i:[A-Z]{{4}}))\s*({NUMBER})(?![A-Za-z0-9-])",
            re.IGNORECASE,
        )
        self.warnings = set()

    @staticmethod
    def reference(match):
        return {"type": "course", "prefix": match[1].upper(), "number": match[2].upper()}

    def references(self, text):
        return [self.reference(m) for m in self.course_pattern.finditer(text)]

    def parse(self, text):
        self.warnings = set()
        text = " ".join(text.split())
        text = re.sub(r"^pre-?requisites?\s*:\s*", "", text, flags=re.I)
        # Expand abbreviated alternatives, e.g. UFUG 1103 or 1106, LIFS 2040/2210.
        shorthand = re.compile(rf"(\bOR\b|\bAND\b|/|,)\s*({NUMBER})(?![\w-])", re.I)
        offset = 0
        while match := shorthand.search(text, offset):
            preceding = list(self.course_pattern.finditer(text[:match.start()]))
            if preceding:
                replacement = f"{match[1]} {preceding[-1][1].upper()} {match[2]}"
                text = text[:match.start()] + replacement + text[match.end():]
                offset = match.start() + len(replacement)
            else:
                offset = match.end()
        # 'A or equivalent AND B or equivalent' qualifies each course separately.
        equivalent = re.compile(self.course_pattern.pattern + r"\s+or\s+equivalent\b", re.I)
        text = equivalent.sub(lambda m: f"({m[0]})", text)
        try:
            result = self._parse(text)
        except ValueError as error:
            result = self.unparsed(text, str(error).replace(" ", "_"))
        return result, sorted(self.warnings)

    def unparsed(self, text, reason="ambiguous_expression"):
        self.warnings.add(reason)
        # References remain expandable, without assigning an invented AND/OR meaning.
        references = list({(r["prefix"], r["number"]): r for r in self.references(text)}.values())
        return {"type": "unparsed", "text": text, "references": references}

    @staticmethod
    def top_level_positions(text):
        stack = []
        positions = set()
        for i, char in enumerate(text):
            if not stack:
                positions.add(i)
            if char in BRACKETS:
                stack.append(BRACKETS[char])
            elif char in BRACKETS.values():
                if not stack or stack.pop() != char:
                    raise ValueError("unbalanced brackets")
        if stack:
            raise ValueError("unbalanced brackets")
        return positions

    def split(self, text, pattern, *, boolean=False):
        positions = self.top_level_positions(text)
        matches = []
        for match in re.finditer(pattern, text, re.I):
            if match.start() not in positions:
                continue
            if boolean and match[0].lower() == "or" and re.match(
                r"\s+(?:above|below|higher|lower|more|less|equal)\b", text[match.end():], re.I
            ):
                continue
            matches.append(match)
        if not matches:
            return [text]
        parts, start = [], 0
        for match in matches:
            parts.append(text[start:match.start()].strip())
            start = match.end()
        parts.append(text[start:].strip())
        if any(not p for p in parts):
            raise ValueError("empty operand")
        return parts

    def _parse(self, text):
        text = text.strip().rstrip(".").strip()
        if not text or text.lower() in {"nil", "none", "n/a"}:
            return None
        positions = self.top_level_positions(text)
        # Strip brackets only if they wrap the entire expression.
        if text[0] in BRACKETS and text[-1] == BRACKETS[text[0]] and len(positions) == 1:
            return self._parse(text[1:-1])
        text = re.sub(r"^\([a-z]\)\s*", "", text, flags=re.I)

        # Semicolon-delimited clauses are grouped before their internal AND/ORs.
        clauses = self.split(text, r";")
        if len(clauses) > 1:
            operators = [re.match(r"^(AND|OR)\b\s*", p, re.I) for p in clauses[1:]]
            if all(op is not None for op in operators):
                kinds = {op[1].upper() for op in operators}
                if len(kinds) != 1:
                    return self.unparsed(text)
                kind = "all" if kinds == {"AND"} else "any"
                return group(kind, [self._parse(clauses[0])] + [
                    self._parse(p[op.end():]) for p, op in zip(clauses[1:], operators)
                ])
            children = [self._parse(p) for p in clauses]
            if all(c and c["type"] == "conditional" for c in children):
                return {"type": "cases", "children": children}
            if any(re.search(r"\b(prior to|from)\s+\d{4}", p, re.I) for p in clauses):
                return self.unparsed(text, "ambiguous_historical_alternatives")
            if any(op is not None for op in operators):
                return self.unparsed(text)
            self.warnings.add("semicolon_assumed_all")
            return group("all", children)

        conditional = re.match(r"^\((for\b[^)]*)\)\s*(.+)$", text, re.I)
        if conditional:
            return {"type": "conditional", "condition": conditional[1],
                    "requirement": self._parse(conditional[2])}

        # Natural-language course counts must not collapse to a simple OR.
        count = re.match(r"^any\s+(\d+)\s+courses?\s+from\s+(.+)$", text, re.I)
        if count:
            expression = self._parse(count[2])
            if expression and expression["type"] == "any":
                if int(count[1]) == 1:
                    return expression
                return {"type": "at_least", "count": int(count[1]), "children": expression["children"]}
            return self.unparsed(text)
        one_of = re.match(r"^one of\s+(.+)$", text, re.I)
        if one_of:
            if len(self.split(one_of[1], r"\bAND\b", boolean=True)) > 1:
                return self.unparsed(text, "ambiguous_one_of")
            return self._parse(one_of[1].replace(",", " OR "))

        # Comma before an explicit conjunction separates whole clauses.
        clauses = self.split(text, r",\s*AND\b")
        if len(clauses) > 1:
            return group("all", [self._parse(p) for p in clauses])
        clauses = self.split(text, r",")
        if len(clauses) > 1:
            if all(self.course_pattern.fullmatch(p) for p in clauses):
                self.warnings.add("comma_assumed_all")
                return group("all", [self._parse(p) for p in clauses])
            # A, B and C is a conjunction; other prose lists stay intact.
            if all(self.course_pattern.fullmatch(p) for p in clauses[:-1]):
                tail = self.split(clauses[-1], r"\bAND\b", boolean=True)
                if len(tail) > 1 and all(self.course_pattern.fullmatch(p) for p in tail):
                    return group("all", [self._parse(p) for p in clauses[:-1] + tail])
            return self.unparsed(text, "ambiguous_comma_list")

        # An explanatory sentence with additional links is not a Boolean expression.
        if re.search(r"\.\s+[A-Z(]", text) and self.references(text):
            return self.unparsed(text, "explanatory_prose")

        alternatives = self.split(text, r"\bOR\b", boolean=True)
        conjunctions = self.split(text, r"\bAND\b|&", boolean=True)
        if len(alternatives) > 1:
            if len(conjunctions) > 1:
                self.warnings.add("mixed_operators_and_before_or")
            return group("any", [self._parse(p) for p in alternatives])
        if len(conjunctions) > 1:
            return group("all", [self._parse(p) for p in conjunctions])

        # A shared grade qualifier applies to the entire slash-separated alternative.
        grade = re.match(r"^((?:grade\s+)?[ABCDF][+-]?\s+or\s+above|(?:a|two) passing grades?)\s+in\s+(.+)$", text, re.I)
        if grade and self.references(grade[2]):
            return {"type": "qualified", "qualifier": grade[1], "requirement": self._parse(grade[2])}
        slash_parts = self.split(text, r"/")
        if len(slash_parts) > 1 and all(self.references(p) for p in slash_parts):
            # Slash alternatives bind more tightly than AND: A/B AND C -> (A OR B) AND C.
            return group("any", [self._parse(p) for p in slash_parts])

        historical = re.match(r"^(.+?)\s*\(or\s+(.+)\)$", text, re.I)
        if historical and self.course_pattern.fullmatch(historical[1]):
            return group("any", [self._parse(historical[1]), self._parse(historical[2])])

        matches = list(self.course_pattern.finditer(text))
        if not matches:
            return {"type": "condition", "text": text}
        if len(matches) == 1:
            ref = self.reference(matches[0])
            if not self.course_pattern.fullmatch(text):
                # Keep qualifiers such as historical dates, minimum grades, or exceptions.
                return {"type": "qualified", "qualifier": text, "requirement": ref}
            return ref
        return self.unparsed(text)


def course_key(row):
    return f"{row['prefix']} {row['number']}"


def record_id(row):
    return f"{row['campus_code']}:{row['term_code']}:{row['id']}"


def validate_rows(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError("Input must be a nonempty array of courses")
    ids, codes = set(), set()
    for index, row in enumerate(rows):
        strings = ("id", "campus_code", "campus_name", "term_code", "term_name",
                   *RELATIONS, *(f for f in COURSE_FIELDS if not f.endswith("credits")))
        if not isinstance(row, dict) or any(not isinstance(row.get(k), str) for k in strings):
            raise ValueError(f"Record {index}: missing or non-string course field")
        for key in ("id", "campus_code", "term_code", "prefix", "number"):
            if not re.fullmatch(r"[A-Za-z0-9_-]+", row[key]):
                raise ValueError(f"Record {index}: invalid {key}")
        for key in ("min_credits", "max_credits"):
            value = row.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"Record {index}: invalid {key}")
        if not 0 <= row["min_credits"] <= row["max_credits"]:
            raise ValueError(f"Record {index}: invalid credit range")
        if not isinstance(row.get("cilos"), list) or any(
            not isinstance(c, dict) or not isinstance(c.get("description"), str) for c in row["cilos"]
        ):
            raise ValueError(f"Record {index}: invalid learning outcomes")
        key = (row["campus_code"], row["term_code"], course_key(row))
        if record_id(row) in ids or key in codes:
            raise ValueError(f"Record {index}: duplicate course ID or course code within campus/semester")
        ids.add(record_id(row))
        codes.add(key)


class DatasetBuilder:
    def __init__(self, rows):
        validate_rows(rows)
        self.rows = sorted(rows, key=lambda r: (r["campus_code"], r["term_code"], course_key(r)))
        self.scopes = defaultdict(dict)
        self.parsed = {}
        self.parser = RequirementParser({r["prefix"] for r in rows})
        self.parse_issues = {}
        self.missing = []
        self.cycles = set()
        self.node_counts = Counter()
        self.largest_tree = {"id": None, "nodes": 0}

        for row in self.rows:
            self.scopes[(row["campus_code"], row["term_code"])][course_key(row)] = row
        cache = {}
        for row in self.rows:
            requirements = {}
            for field in RELATIONS:
                source = row[field]
                if source not in cache:
                    cache[source] = self.parser.parse(source)
                tree, warnings = cache[source]
                # Every explicit course reference must survive parsing, including fallbacks.
                expected = {(n["prefix"], n["number"]) for n in self.parser.references(source)}
                actual = {(n["prefix"], n["number"]) for n in walk_expression(tree) if n["type"] == "course"}
                if not expected <= actual:
                    raise ValueError(f"Parser lost a reference in {record_id(row)} {field}")
                requirements[field] = tree
                if warnings:
                    issue = self.parse_issues.setdefault(source, {"text": source, "warnings": warnings, "uses": []})
                    issue["uses"].append({"id": record_id(row), "field": field})
                for prefix, number in sorted(actual):
                    if f"{prefix} {number}" not in self.scopes[(row["campus_code"], row["term_code"])]:
                        self.missing.append({"id": record_id(row), "field": field, "course": f"{prefix} {number}"})
            self.parsed[record_id(row)] = requirements

    def expand(self, node, scope, ancestors):
        if node is None:
            return None
        self.node_counts[node["type"]] += 1
        if node["type"] != "course":
            result = dict(node)
            for key in ("children", "references"):
                if key in node:
                    result[key] = [self.expand(c, scope, ancestors) for c in node[key]]
            if "requirement" in node:
                result["requirement"] = self.expand(node["requirement"], scope, ancestors)
            return result

        row = self.scopes[scope].get(f"{node['prefix']} {node['number']}")
        result = {"type": "course", "id": None, "prefix": node["prefix"], "number": node["number"],
                  "status": "missing", "requirements": None}
        if row is None:
            return result
        identity = record_id(row)
        result.update(id=identity, status="expanded")
        if identity in ancestors:
            result["status"] = "cycle"
            cycle = ancestors[ancestors.index(identity):]
            # Canonicalize rotations, so the report lists each directed cycle once.
            self.cycles.add(min(cycle[i:] + cycle[:i] for i in range(len(cycle))))
            return result
        result["requirements"] = {
            field: self.expand(self.parsed[identity][field], scope, ancestors + (identity,))
            for field in RELATIONS
        }
        return result

    def datasets(self):
        for scope, courses in sorted(self.scopes.items()):
            output = {}
            for code, row in sorted(courses.items()):
                identity = record_id(row)
                before = self.node_counts.total()
                requirements = {
                    field: self.expand(self.parsed[identity][field], scope, (identity,))
                    for field in RELATIONS
                }
                nodes = self.node_counts.total() - before
                if nodes > self.largest_tree["nodes"]:
                    self.largest_tree = {"id": identity, "nodes": nodes}
                output[code] = {"id": identity, **{k: row[k] for k in COURSE_FIELDS},
                                "cilos": [c["description"] for c in row["cilos"]],
                                "requirements": requirements}
            yield scope, output

    def labels(self, code, name):
        result = {}
        for row in self.rows:
            if row[code] in result and result[row[code]] != row[name]:
                raise ValueError(f"Inconsistent label for {row[code]}")
            result[row[code]] = row[name]
        return dict(sorted(result.items()))


def encode(data, *, pretty=False):
    return (json.dumps(data, ensure_ascii=False, allow_nan=False,
                       indent=2 if pretty else None, separators=None if pretty else (",", ":")) + "\n").encode("utf-8")


def write_or_check(path, content, check):
    if check:
        if not path.exists() or path.read_bytes() != content:
            raise ValueError(f"Generated file is missing or outdated: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        # Replace complete files, never expose a partially written JSON document.
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(content)
        temporary.replace(path)


def build(input_path, output_path, *, check=False):
    source = input_path.read_bytes()
    builder = DatasetBuilder(json.loads(source))
    manifest = {"schema_version": 1, "campuses": builder.labels("campus_code", "campus_name"),
                "terms": builder.labels("term_code", "term_name"), "datasets": []}
    files = []
    for (campus, term), courses in builder.datasets():
        relative = f"{campus}/{term}.json"
        content = encode(courses, pretty=True)
        write_or_check(output_path / relative, content, check)
        manifest["datasets"].append({"campus": campus, "term": term, "path": relative, "course_count": len(courses)})
        files.append({"path": relative, "bytes": len(content), "course_count": len(courses)})
    report = {
        "source_sha256": hashlib.sha256(source).hexdigest(), "source_bytes": len(source),
        "course_count": len(builder.rows), "files": files,
        "generated_course_bytes": sum(f["bytes"] for f in files),
        "node_counts": dict(sorted(builder.node_counts.items())), "largest_tree": builder.largest_tree,
        "missing_references": builder.missing,
        "cycles": [list(cycle) + [cycle[0]] for cycle in sorted(builder.cycles)],
        "parse_issues": [builder.parse_issues[k] for k in sorted(builder.parse_issues)],
    }
    write_or_check(output_path / "manifest.json", encode(manifest, pretty=True), check)
    write_or_check(output_path / "report.json", encode(report, pretty=True), check)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "courses.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "generated")
    parser.add_argument("--check", action="store_true", help="Verify generated files without changing them")
    args = parser.parse_args()
    try:
        report = build(args.input, args.output, check=args.check)
    except (ValueError, OSError, RecursionError) as error:
        parser.exit(1, f"Preprocessing failed: {error}\n")
    action = "Verified" if args.check else "Generated"
    print(f"{action} {len(report['files'])} datasets, {report['course_count']:,} courses, "
          f"{report['generated_course_bytes'] / 1_000_000:.2f} MB")
    print(f"{len(report['parse_issues'])} expressions flagged for review; "
          f"{len(report['missing_references'])} missing direct references; "
          f"{len(report['cycles'])} distinct cycles. See {args.output / 'report.json'}")


if __name__ == "__main__":
    main()
