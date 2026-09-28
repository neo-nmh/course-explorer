/* global __dirname */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { createSearchIndex, searchCourses } = require('../src/functions/search.ts');
const { describeRequirement, requirementBranches } = require('../src/functions/requirements.ts');
const { clampDiagramOffset } = require('../src/functions/diagramPan.ts');

const course = (prefix, number, title) => ({ prefix, number, title });
const courses = [
  course('COMP', '2011', 'Programming with C++'),
  course('COMP', '1023', 'Introduction to Python Programming'),
  course('COMP', '2011H', 'Honors Programming'),
  course('LANG', '1002', 'English for University Studies'),
];
const index = createSearchIndex(courses);
const codes = query => searchCourses(index, query).map(c => `${c.prefix} ${c.number}`);

test('code search ignores case, whitespace and punctuation, and ranks exact codes first', () => {
  for (const query of ['comp2011', ' COMP 2011 ', 'CoMp-2011', 'COMP / 2011']) {
    assert.deepEqual(codes(query), ['COMP 2011', 'COMP 2011H']);
  }
});

test('search accepts partial titles, course numbers and reordered words', () => {
  assert.deepEqual(codes('102'), ['COMP 1023']);
  assert.deepEqual(codes('python intro'), ['COMP 1023']);
  assert.deepEqual(codes('2011 comp'), ['COMP 2011', 'COMP 2011H']);
  assert.deepEqual(codes('UNI studies'), ['LANG 1002']);
});

test('search accepts word typos but does not silently change course numbers', () => {
  assert.deepEqual(codes('pyhton programing'), ['COMP 1023']);
  assert.deepEqual(codes('cmop 1023'), ['COMP 1023']);
  assert.deepEqual(codes('COMP 1024'), []);
  assert.deepEqual(codes('no matching course anywhere'), []);
  assert.deepEqual(codes('   '), ['COMP 1023', 'COMP 2011', 'COMP 2011H', 'LANG 1002']);
});

test('AND, OR and course counts preserve every alternative, including Nil', () => {
  const child = { type: 'condition', text: 'English test score' };
  assert.equal(describeRequirement({ type: 'all', children: [child] }).label, 'AND');
  const or = describeRequirement({ type: 'any', children: [null, child] });
  assert.equal(or.label, 'OR');
  assert.equal(or.children.length, 2);
  assert.equal(describeRequirement(or.children[0].node).label, 'No requirement');
  assert.equal(describeRequirement({ type: 'at_least', count: 2, children: [child, child, child] }).label, 'At least 2');
});

test('conditions, restrictions and student-group cases keep their meaning', () => {
  const condition = { type: 'condition', text: 'HKDSE English level 4' };
  const qualified = { type: 'qualified', qualifier: 'Grade B or above', requirement: condition };
  const conditional = { type: 'conditional', condition: 'For engineering students', requirement: qualified };
  assert.equal(describeRequirement(condition).detail, condition.text);
  assert.equal(describeRequirement(qualified).detail, qualified.qualifier);
  assert.equal(describeRequirement(conditional).detail, conditional.condition);
  assert.deepEqual(describeRequirement({ type: 'cases', children: [conditional] }).children, [{ node: conditional }]);
});

test('unparsed text is shown without turning its course references into OR', () => {
  const node = { type: 'unparsed', text: 'FINA 790I prior to 2011-12; FINA 7900A from 2011-12', references: [
    { type: 'course', prefix: 'FINA', number: '790I', status: 'missing', id: null, requirements: null },
  ] };
  const description = describeRequirement(node);
  assert.equal(description.detail, node.text);
  assert.equal(description.label, 'Read requirement');
  assert.equal(description.children[0].node, node.references[0]);
  assert.match(description.children[0].label, /Mentioned course/);
});

test('missing and cycle nodes stop, while expanded nodes preserve both relations', () => {
  const node = { type: 'course', prefix: 'COMP', number: '2011', id: 'MAIN:2610:1', requirements: null };
  assert.equal(describeRequirement({ ...node, status: 'missing', id: null }).children.length, 0);
  assert.equal(describeRequirement({ ...node, status: 'cycle' }).children.length, 0);
  const requirements = { prerequisite: null, corequisite: { type: 'condition', text: 'Permission' } };
  const expanded = describeRequirement({ ...node, status: 'expanded', requirements });
  assert.deepEqual(expanded.children, requirementBranches(requirements));
  assert.equal(expanded.children.length, 1);
  assert.equal(expanded.children[0].relation, 'corequisite');
  assert.match(expanded.children[0].label, /Corequisite/);
});

test('empty relations disappear while explicit no-requirement alternatives remain', () => {
  assert.deepEqual(requirementBranches({ prerequisite: null, corequisite: null }), []);
  const exempt = { type: 'any', children: [null, { type: 'condition', text: 'Permission' }] };
  const branches = requirementBranches({ prerequisite: exempt, corequisite: null });
  assert.equal(branches[0].relation, 'prerequisite');
  assert.equal(describeRequirement(branches[0].node).children[0].node, null);
});

test('COMP 2711 keeps its MATH alternatives in the corequisite branch', () => {
  const dataset = require('../data/MAIN/2520.json');
  const [prerequisite, corequisite] = requirementBranches(dataset['COMP 2711'].requirements);
  assert.equal(prerequisite.relation, 'prerequisite');
  assert.equal(prerequisite.node.type, 'condition');
  assert.equal(corequisite.relation, 'corequisite');
  assert.equal(corequisite.node.condition, 'For students without prerequisites');
  const alternatives = corequisite.node.requirement;
  assert.equal(alternatives.type, 'any');
  assert.equal(alternatives.children.length, 6);
  const math1014 = alternatives.children.find(node => node.type === 'course' && node.number === '1014');
  assert.equal(requirementBranches(math1014.requirements)[0].relation, 'prerequisite');
});

test('COMP 2711H displays one flat OR list with each course retaining its minimum grade', () => {
  const source = require('../data/MAIN/2520.json')['COMP 2711H'].requirements.prerequisite;
  const original = structuredClone(source);
  const display = describeRequirement(source);
  assert.equal(display.label, 'OR');
  assert.deepEqual(display.children.map(({ node }) => node.type === 'qualified'
    ? [`${node.requirement.prefix} ${node.requirement.number}`, node.qualifier]
    : node.text), [
    'Level 5* or above in HKDSE Mathematics Extended Module M1/M2',
    ['MATH 1014', 'grade A- or above'],
    ['MATH 1020', 'grade B+ or above'],
    ['MATH 1024', 'grade B+ or above'],
  ]);
  assert.deepEqual(source, original);
});

test('flattening repeated operators preserves mixed logic, exemptions and group restrictions', () => {
  const reference = number => ({ type: 'course', prefix: 'TEST', number, status: 'missing', id: null, requirements: null });
  const a = reference('1000');
  const b = reference('2000');
  const conjunction = { type: 'all', children: [a, b] };
  const choice = { type: 'any', children: [a, b] };
  const collective = { type: 'qualified', qualifier: 'TWO passing grades', requirement: choice };
  const conditional = { type: 'conditional', condition: 'For engineering students', requirement: choice };
  const count = { type: 'at_least', count: 2, children: [a, b] };
  const alternatives = describeRequirement({ type: 'any', children: [
    { type: 'any', children: [null, a] }, conjunction, collective, conditional, count,
  ] });
  assert.deepEqual(alternatives.children.map(branch => branch.node), [null, a, conjunction, collective, conditional, count]);
  const all = describeRequirement({ type: 'all', children: [conjunction, choice] });
  assert.deepEqual(all.children.map(branch => branch.node), [a, b, choice]);
});

test('diagram moves diagonally, stops at every edge, and clamps after collapsing content', () => {
  const content = { width: 900, height: 1200 };
  const viewport = { width: 350, height: 400 };
  assert.deepEqual(clampDiagramOffset({ x: -130, y: -220 }, content, viewport), { x: -130, y: -220 });
  assert.deepEqual(clampDiagramOffset({ x: -900, y: -1300 }, content, viewport), { x: -550, y: -800 });
  assert.deepEqual(clampDiagramOffset({ x: 50, y: 70 }, content, viewport), { x: 0, y: 0 });
  assert.deepEqual(clampDiagramOffset({ x: -500, y: -700 }, { width: 250, height: 300 }, viewport), { x: 0, y: 0 });
});

test('every node in all eight generated catalogues has a valid display and scoped course link', () => {
  let visited = 0;
  const types = new Set();
  const statuses = new Set();
  for (const campus of ['MAIN', 'GZ']) {
    const directory = join(__dirname, '..', 'data', campus);
    for (const filename of readdirSync(directory).filter(name => name.endsWith('.json'))) {
      const dataset = require(join(directory, filename));
      const pending = Object.values(dataset).flatMap(course => requirementBranches(course.requirements).map(branch => branch.node));
      while (pending.length) {
        const node = pending.pop();
        const display = describeRequirement(node);
        assert.ok(display.label);
        visited++;
        if (node) types.add(node.type);
        if (node?.type === 'course') {
          statuses.add(node.status);
          if (node.status !== 'missing') assert.equal(dataset[display.label]?.id, node.id);
        }
        for (const child of display.children) pending.push(child.node);
      }
    }
  }
  assert.equal(types.size, 9);
  assert.equal(statuses.size, 3);
  assert.ok(visited > 15000);
});
