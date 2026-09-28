"""Parser, expansion, file generation, and whole-catalogue regression tests."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from preprocess_courses import (
    COURSE_FIELDS, DatasetBuilder, RELATIONS, RequirementParser, ROOT,
    build, course_key, encode, record_id, validate_rows,
)


def course(number, prerequisite="", corequisite="", *, campus="MAIN", term="2610", **changes):
    return {
        "id": f"00{number}", "prefix": "TEST", "number": number, "title": f"Course {number}",
        "description": "Description", "prerequisite": prerequisite, "corequisite": corequisite,
        "exclusion": "", "min_credits": 1, "max_credits": 3, "school_code": "SENG",
        "department_code": "CSE", "cilos": [{"description": "Learning outcome"}],
        "campus_code": campus, "campus_name": campus + " Campus", "term_code": term,
        "term_name": term + " Term", **changes,
    }


def expression_shape(node):
    if node is None:
        return None
    if node["type"] == "course":
        return f"{node['prefix']} {node['number']}"
    if node["type"] in {"all", "any", "cases", "at_least"}:
        return (node["type"], *(expression_shape(c) for c in node["children"]))
    if "requirement" in node:
        return (node["type"], expression_shape(node["requirement"]))
    return (node["type"], node.get("text"))


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.parser = RequirementParser({"TEST", "COMP", "MATH", "UFUG", "FINA", "CHEM"})

    def parse(self, text):
        return self.parser.parse(text)[0]

    def test_parentheses_and_operator_precedence(self):
        self.assertEqual(expression_shape(self.parse("TEST 1000 OR TEST 2000 AND TEST 3000")),
                         ("any", "TEST 1000", ("all", "TEST 2000", "TEST 3000")))
        self.assertEqual(expression_shape(self.parse("{TEST 1000 OR [TEST 2000 AND TEST 3000]} AND TEST 4000")),
                         ("all", ("any", "TEST 1000", ("all", "TEST 2000", "TEST 3000")), "TEST 4000"))

    def test_case_spacing_suffixes_and_ranges(self):
        self.assertEqual(expression_shape(self.parse("comp2012h\n AnD\u202fMATH 1000-1010")),
                         ("all", "COMP 2012H", "MATH 1000-1010"))

    def test_shorthand_codes_and_slash_precedence(self):
        self.assertEqual(expression_shape(self.parse("(UFUG 1103 or 1106) AND UFUG 1502/1504")),
                         ("all", ("any", "UFUG 1103", "UFUG 1106"), ("any", "UFUG 1502", "UFUG 1504")))
        self.assertEqual(expression_shape(self.parse("TEST 1000/TEST 2000 AND TEST 3000")),
                         ("all", ("any", "TEST 1000", "TEST 2000"), "TEST 3000"))

    def test_grade_threshold_is_not_an_or_operator(self):
        tree = self.parse("Grade A- or above in COMP 2012 / COMP 2012H")
        self.assertEqual(tree["type"], "qualified")
        self.assertEqual(tree["qualifier"], "Grade A- or above")
        self.assertEqual(expression_shape(tree["requirement"]), ("any", "COMP 2012", "COMP 2012H"))

    def test_non_course_conditions_survive(self):
        tree = self.parse("Level 3 or above in HKDSE Mathematics Extended Module M1/M2")
        self.assertEqual(tree["type"], "condition")
        self.assertIn("M1/M2", tree["text"])
        self.assertEqual(self.parse("Any CHEM course at or above 1000-level")["type"], "condition")

    def test_historical_qualifier_and_old_three_digit_code(self):
        tree = self.parse("FINA 7900B (or FINA 790E prior to 2011-12)")
        self.assertEqual(tree["type"], "any")
        self.assertEqual(tree["children"][1]["requirement"]["number"], "790E")
        self.assertIn("2011-12", tree["children"][1]["qualifier"])

    def test_unknown_historical_prefix_is_not_lost(self):
        self.assertEqual(expression_shape(self.parse("CORE 1120")), "CORE 1120")
        self.assertEqual(self.parse("prior to 2022-23")["type"], "condition")
        self.assertEqual(self.parse("from 2022")["type"], "condition")

    def test_conditional_cohort_applies_to_whole_expression(self):
        tree = self.parse("(For COMP and DSCT) TEST 1000 OR TEST 2000; (For others) Nil")
        self.assertEqual(tree["type"], "cases")
        self.assertEqual(tree["children"][0]["condition"], "For COMP and DSCT")
        self.assertEqual(tree["children"][0]["requirement"]["type"], "any")
        self.assertIsNone(tree["children"][1]["requirement"])

    def test_choose_two_preserves_count(self):
        tree = self.parse("[Any 2 courses from (TEST 1000 OR TEST 2000 OR TEST 3000)]")
        self.assertEqual(tree["type"], "at_least")
        self.assertEqual(tree["count"], 2)
        self.assertEqual(len(tree["children"]), 3)

    def test_equivalence_applies_to_each_course(self):
        self.assertEqual(expression_shape(self.parse("TEST 1000 or equivalent AND TEST 2000 or equivalent")),
                         ("all", ("any", "TEST 1000", ("condition", "equivalent")),
                          ("any", "TEST 2000", ("condition", "equivalent"))))

    def test_semicolon_enumeration_groups_alternatives(self):
        tree = self.parse("(a) TEST 1000 or TEST 2000; and (b) TEST 3000 or 4000; and (c) TEST 5000")
        self.assertEqual(expression_shape(tree),
                         ("all", ("any", "TEST 1000", "TEST 2000"),
                          ("any", "TEST 3000", "TEST 4000"), "TEST 5000"))

    def test_comma_conjunction_and_one_of(self):
        self.assertEqual(expression_shape(self.parse("TEST 1000, TEST 2000 and TEST 3000")),
                         ("all", "TEST 1000", "TEST 2000", "TEST 3000"))
        self.assertEqual(expression_shape(self.parse("One of TEST 1000, TEST 2000 or TEST 3000")),
                         ("any", "TEST 1000", "TEST 2000", "TEST 3000"))

    def test_ambiguous_text_is_flagged_and_keeps_references(self):
        source = "TEST 1000. (TEST 2000 AND TEST 3000) for students without corequisites."
        tree, warnings = self.parser.parse(source)
        self.assertEqual(tree["type"], "unparsed")
        self.assertTrue(warnings)
        self.assertEqual(len(tree["references"]), 3)
        self.assertIn("without corequisites", tree["text"])

    def test_malformed_expression_does_not_drop_references(self):
        for source in ("(TEST 1000 OR TEST 2000", "TEST 1000 AND"):
            with self.subTest(source=source):
                tree, warnings = self.parser.parse(source)
                self.assertEqual(tree["type"], "unparsed")
                self.assertTrue(warnings)
                self.assertTrue(tree["references"])

    def test_blank_is_different_from_a_non_course_requirement(self):
        self.assertIsNone(self.parse("  "))
        self.assertIsNone(self.parse("Nil"))
        self.assertEqual(self.parse("MSc status")["type"], "condition")

    def test_explicit_nil_alternative_does_not_erase_course_references(self):
        self.assertEqual(expression_shape(self.parse("TEST 1000 OR Nil")), ("any", "TEST 1000", None))
        self.assertEqual(expression_shape(self.parse("TEST 1000 AND Nil")), "TEST 1000")


class ExpansionTests(unittest.TestCase):
    def expand(self, rows):
        return dict(DatasetBuilder(rows).datasets())

    def test_deep_prerequisites_and_corequisites_are_embedded(self):
        rows = [course("1000", "TEST 2000", "TEST 3000"),
                course("2000", corequisite="TEST 4000"), course("3000", "TEST 5000"),
                course("4000"), course("5000")]
        result = self.expand(rows)[("MAIN", "2610")]["TEST 1000"]["requirements"]
        self.assertEqual(result["prerequisite"]["requirements"]["corequisite"]["number"], "4000")
        self.assertEqual(result["corequisite"]["requirements"]["prerequisite"]["number"], "5000")

    def test_shared_course_expands_in_both_branches(self):
        rows = [course("1000", "TEST 2000 AND TEST 3000"), course("2000", "TEST 4000"),
                course("3000", "TEST 4000"), course("4000", "TEST 5000"), course("5000")]
        branches = self.expand(rows)[("MAIN", "2610")]["TEST 1000"]["requirements"]["prerequisite"]["children"]
        for branch in branches:
            shared = branch["requirements"]["prerequisite"]
            self.assertEqual(shared["status"], "expanded")
            self.assertEqual(shared["requirements"]["prerequisite"]["number"], "5000")

    def test_cycle_across_relation_types_stops_at_repeated_ancestor(self):
        rows = [course("1000", "TEST 2000"), course("2000", corequisite="TEST 1000")]
        builder = DatasetBuilder(rows)
        output = dict(builder.datasets())[("MAIN", "2610")]
        marker = output["TEST 1000"]["requirements"]["prerequisite"]["requirements"]["corequisite"]
        self.assertEqual(marker["id"], output["TEST 1000"]["id"])
        self.assertEqual(marker["status"], "cycle")
        self.assertIsNone(marker["requirements"])
        self.assertEqual(len(builder.cycles), 1)

    def test_missing_course_never_resolves_from_another_scope(self):
        rows = [course("1000", "TEST 2000"), course("2000", campus="GZ"), course("2000", term="2540")]
        ref = self.expand(rows)[("MAIN", "2610")]["TEST 1000"]["requirements"]["prerequisite"]
        self.assertEqual(ref["status"], "missing")
        self.assertIsNone(ref["id"])
        self.assertEqual(ref["number"], "2000")

    def test_ids_include_scope_and_preserve_leading_zeroes(self):
        rows = [course("1000"), course("1000", campus="GZ"), course("1000", term="2540")]
        output = self.expand(rows)
        ids = [records["TEST 1000"]["id"] for records in output.values()]
        self.assertEqual(len(set(ids)), 3)
        self.assertIn("MAIN:2610:001000", ids)

    def test_no_metadata_or_unselected_fields_in_course_records(self):
        row = course("1000", background="Unused", extra="Unused")
        saved = deepcopy(row)
        result = self.expand([row])[("MAIN", "2610")]["TEST 1000"]
        self.assertEqual(set(result), {*COURSE_FIELDS, "id", "cilos", "requirements"})
        self.assertEqual(result["cilos"], ["Learning outcome"])
        self.assertEqual(row, saved)

    def test_invalid_source_records_fail(self):
        samples = [[], [course("1000"), course("1000")], [course("1000", max_credits=float("nan"))],
                   [course("1000", min_credits=5)], [course("1000", campus="../MAIN")],
                   [course("1000", cilos=[{"description": 1}])]]
        for rows in samples:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                validate_rows(rows)

    def test_generated_files_are_deterministic_and_check_detects_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "source.json", root / "output"
            original = encode([course("2000"), course("1000", "TEST 2000")])
            source.write_bytes(original)
            build(source, output)
            first = {p.relative_to(output): p.read_bytes() for p in output.rglob("*.json")}
            build(source, output)
            self.assertEqual(first, {p.relative_to(output): p.read_bytes() for p in output.rglob("*.json")})
            build(source, output, check=True)
            self.assertEqual(source.read_bytes(), original)
            dataset = output / "MAIN/2610.json"
            dataset.write_text("{}\n")
            with self.assertRaisesRegex(ValueError, "outdated"):
                build(source, output, check=True)
            self.assertEqual(dataset.read_text(), "{}\n")


class CatalogueTests(unittest.TestCase):
    """Exercise the actual supplied dataset, including every expanded branch."""

    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads((ROOT / "courses.json").read_text())
        cls.builder = DatasetBuilder(cls.rows)
        cls.datasets = dict(cls.builder.datasets())

    def test_all_records_and_selected_fields_are_preserved(self):
        self.assertEqual(sum(map(len, self.datasets.values())), len(self.rows))
        ids = set()
        for row in self.rows:
            result = self.datasets[(row["campus_code"], row["term_code"])][course_key(row)]
            self.assertNotIn(result["id"], ids)
            ids.add(result["id"])
            self.assertEqual(result["id"], record_id(row))
            for field in COURSE_FIELDS:
                self.assertEqual(result[field], row[field])
            self.assertEqual(result["cilos"], [c["description"] for c in row["cilos"]])

    def test_every_embedded_course_is_complete_or_explicitly_marked(self):
        def verify(node, scope, ancestors):
            if node is None:
                return
            if node["type"] == "course":
                self.assertNotIn("title", node)
                target = self.datasets[scope].get(course_key(node))
                if target is None:
                    self.assertEqual(node["status"], "missing")
                    self.assertIsNone(node["id"])
                    self.assertIsNone(node["requirements"])
                    return
                self.assertEqual(node["id"], target["id"])
                if node["id"] in ancestors:
                    self.assertEqual(node["status"], "cycle")
                    self.assertIsNone(node["requirements"])
                    return
                self.assertEqual(node["status"], "expanded")
                self.assertEqual(set(node["requirements"]), set(RELATIONS))
                for relation in RELATIONS:
                    verify(node["requirements"][relation], scope, ancestors | {node["id"]})
                return
            for field in ("children", "references"):
                for child in node.get(field, []):
                    verify(child, scope, ancestors)
            if "requirement" in node:
                verify(node["requirement"], scope, ancestors)

        for scope, courses in self.datasets.items():
            for row in courses.values():
                for relation in RELATIONS:
                    verify(row["requirements"][relation], scope, {row["id"]})

    def test_actual_cycle_and_historical_missing_subject_are_present(self):
        gz = self.datasets[("GZ", "2610")]
        self.assertTrue(any(gz["UCMP 6030"]["id"] in cycle for cycle in self.builder.cycles))
        self.assertTrue(any(item["course"].startswith("CORE ") for item in self.builder.missing))


if __name__ == "__main__":
    unittest.main()
