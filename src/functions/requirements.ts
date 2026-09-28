import type { AllNode, AnyNode, CourseNode, QualifiedNode, Requirements, RequirementTree } from '../types/course';

export type RequirementRelation = keyof Requirements;
export type RequirementBranch = { label?: string; relation?: RequirementRelation; node: RequirementTree };
type NodeDescription = { label: string; detail?: string; course?: CourseNode; children: RequirementBranch[] };

export function requirementBranches(requirements: Requirements): (RequirementBranch & { relation: RequirementRelation })[] {
  const branches: (RequirementBranch & { relation: RequirementRelation })[] = [
    { label: 'Prerequisite', relation: 'prerequisite', node: requirements.prerequisite },
    { label: 'Corequisite', relation: 'corequisite', node: requirements.corequisite },
  ];
  // Omit empty relations, but preserve explicit Nil alternatives inside OR/cases.
  return branches.filter(branch => branch.node !== null);
}

export function canInlineCourseQualifier(node: QualifiedNode): boolean {
  return node.requirement?.type === 'course'
    || (/^(?:grade\s+)?[ABCDF][+-]?\s+or\s+above$/i.test(node.qualifier)
      && node.requirement?.type === 'any'
      && node.requirement.children.every(child => child?.type === 'course'));
}

function booleanBranches(node: AllNode | AnyNode): RequirementBranch[] {
  return node.children.flatMap(child => {
    if (child?.type === node.type) return booleanBranches(child);
    if (child?.type === 'qualified' && child.requirement?.type === node.type && canInlineCourseQualifier(child)) {
      // Move the shared grade onto each alternative before flattening the OR.
      // These are display-only wrappers; the generated requirement tree is unchanged.
      return booleanBranches(child.requirement).map(branch => ({
        node: { type: 'qualified' as const, qualifier: child.qualifier, requirement: branch.node },
      }));
    }
    // Mixed operators, conditions, course dependencies and collective restrictions
    // retain their boundaries. Null remains a meaningful OR alternative.
    return [{ node: child }];
  });
}

// Describe one existing node. No dependency resolution or expression parsing occurs here.
export function describeRequirement(node: RequirementTree): NodeDescription {
  if (!node) return { label: 'No requirement', children: [] };
  switch (node.type) {
    case 'course': {
      const children = node.requirements && (node.requirements.prerequisite || node.requirements.corequisite)
        ? requirementBranches(node.requirements) : [];
      return {
        label: `${node.prefix} ${node.number}`, course: node, children,
        detail: node.status === 'missing' ? 'Unavailable in this campus / semester'
          : node.status === 'cycle' ? 'Already on this branch · cycle stops here'
          : undefined,
      };
    }
    case 'all': return { label: 'AND', children: booleanBranches(node) };
    case 'any': return { label: 'OR', children: booleanBranches(node) };
    case 'at_least': return { label: `At least ${node.count}`, children: node.children.map(node => ({ node })) };
    case 'condition': return { label: 'Condition', detail: node.text, children: [] };
    case 'qualified': return { label: 'With this restriction', detail: node.qualifier, children: [{ node: node.requirement }] };
    case 'conditional': return { label: 'Applies when', detail: node.condition, children: [{ node: node.requirement }] };
    case 'cases': return { label: 'Student groups', detail: 'Follow the applicable case(s)', children: node.children.map(node => ({ node })) };
    case 'unparsed': return {
      label: 'Read requirement', detail: node.text,
      children: node.references.map(node => ({ label: 'Mentioned course · see wording', node })),
    };
  }
}
