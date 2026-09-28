export interface Course {
  /** id = Campus code, term code, and original ID joined with colons. */
  id: string;
  prefix: string;
  number: string;
  title: string;
  description: string;
  exclusion: string;
  min_credits: number;
  max_credits: number;
  cilos: string[];
  school_code: string;
  department_code: string;
  requirements: Requirements;
}

/** One file per campus/semester, keyed by course code (e.g. "COMP 2011"). */
export type CourseDataset = Record<string, Course>;

export interface Requirements {
  prerequisite: RequirementTree;
  corequisite: RequirementTree;
}

/** null = no requirement. */
export type RequirementTree = RequirementNode | null;

export type RequirementNode =
  | CourseNode
  | AllNode
  | AnyNode
  | AtLeastNode
  | ConditionNode
  | QualifiedNode
  | ConditionalNode
  | CasesNode
  | UnparsedNode;

export type CourseNode = {
  type: 'course';
  prefix: string;
  number: string;
} & (
  | {
      /** Requirements for this course. */
      status: 'expanded';
      id: string;
      requirements: Requirements;
    }
  | {
      /** When requirements creates a cycle. */
      status: 'cycle';
      id: string;
      requirements: null;
    }
  | {
      /** No matching course in this campus/semester. */
      status: 'missing';
      id: null;
      requirements: null;
    }
);

/** All children are required. */
export interface AllNode {
  type: 'all';
  children: RequirementNode[];
}

/** Any children are required. */
export interface AnyNode {
  type: 'any';
  children: RequirementTree[];
}

/** At least N requirements. */
export interface AtLeastNode {
  type: 'at_least';
  count: number;
  children: RequirementTree[];
}

/** Non-course requirement. */
export interface ConditionNode {
  type: 'condition';
  text: string;
}

/** Minimum grade. */
export interface QualifiedNode {
  type: 'qualified';
  qualifier: string;
  requirement: RequirementTree;
}

/** Eg for engineering students. */
export interface ConditionalNode {
  type: 'conditional';
  condition: string;
  requirement: RequirementTree;
}

/** eg different path for engineering/science student. */
export interface CasesNode {
  type: 'cases';
  children: ConditionalNode[];
}

/** Script couldn't interpret requirement. */
export interface UnparsedNode {
  type: 'unparsed';
  text: string;
  references: CourseNode[];
}

export interface CourseDatasetEntry {
  campus: string;
  term: string;
  path: string;
  course_count: number;
}

export interface CourseManifest {
  schema_version: 1;
  campuses: Record<string, string>;
  terms: Record<string, string>;
  datasets: CourseDatasetEntry[];
}
