import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { canInlineCourseQualifier, describeRequirement, requirementBranches, type RequirementRelation } from '../functions/requirements';
import type { Course, CourseDataset, CourseNode, Requirements, RequirementTree } from '../types/course';
import { DiagramViewport } from './DiagramViewport';

type DiagramProps = {
  course: Course;
  dataset: CourseDataset;
  onOpenCourse: (code: string) => void;
  onInteractionChange: (active: boolean) => void;
};
type TreeProps = Pick<DiagramProps, 'dataset' | 'onOpenCourse'> & {
  currentId: string;
  relation: RequirementRelation;
};

const relationStyles = {
  prerequisite: { label: 'Prerequisite', color: '#215C91', backgroundColor: '#EDF5FC', borderColor: '#8FB6D8' },
  corequisite: { label: 'Corequisite', color: '#75429B', backgroundColor: '#F6EFFB', borderColor: '#B899D0' },
};

function Branch({ card, children }: { card: ReactNode; children?: ReactNode }) {
  return <View style={styles.branch}>
    {card}
    {children && <><View style={styles.connector} />{children}</>}
  </View>;
}

function Relations({ requirements, ...props }: Omit<TreeProps, 'relation'> & {
  requirements: Requirements;
}) {
  return <View style={styles.relations}>
    {requirementBranches(requirements).map(branch => {
      const relation = branch.relation;
      return <TreeNode key={relation} node={branch.node} relation={relation} {...props} />;
    })}
  </View>;
}

function CourseBranch({ node, qualifiers, ...props }: TreeProps & { node: CourseNode; qualifiers: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const { dataset, currentId, onOpenCourse, relation } = props;
  const description = describeRequirement(node);
  const code = description.label;
  const colors = relationStyles[relation];
  const canOpen = node.status !== 'missing' && dataset[code]?.id === node.id && node.id !== currentId;
  const hasRequirements = description.children.length > 0;
  const card = <View style={styles.courseColumn}>
    <View style={[styles.card, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor },
      node.status === 'missing' && styles.missing]}>
      <View style={styles.cardRow}>
        <Pressable accessibilityRole="button" disabled={!canOpen} accessibilityState={{ disabled: !canOpen }}
          accessibilityLabel={[code, colors.label.toLowerCase(), ...qualifiers, description.detail,
            node.id === currentId ? 'Currently viewing' : '', canOpen ? 'open course' : ''].filter(Boolean).join(', ')}
          onPress={() => onOpenCourse(code)} style={({ pressed }) => [styles.courseLink, pressed && styles.pressed]}>
          <Text style={[styles.courseCode, { color: colors.color },
            !hasRequirements && styles.centeredText]}>{code}</Text>
          {qualifiers.map((qualifier, index) => <Text key={index} style={[styles.qualifier, { color: colors.color },
            !hasRequirements && styles.centeredText]}>
            {qualifier.replace(new RegExp(`^${node.prefix}\\s*${node.number}\\b\\s*`, 'i'), '') || qualifier}
          </Text>)}
          {description.detail && <Text style={[styles.status, !hasRequirements && styles.centeredText]}>{description.detail}</Text>}
          {node.id === currentId && <Text style={[styles.status, !hasRequirements && styles.centeredText]}>Currently viewing</Text>}
        </Pressable>
        {hasRequirements && <Pressable accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} requirements for ${code}`}
          accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
          <Text style={[styles.toggleText, { color: colors.color }]}>{expanded ? '−' : '+'}</Text>
        </Pressable>}
      </View>
    </View>
  </View>;
  return <Branch card={card}>
    {expanded && node.requirements && <Relations requirements={node.requirements}
      dataset={dataset} currentId={currentId} onOpenCourse={onOpenCourse} />}
  </Branch>;
}

function TreeNode({ node, qualifiers = [], ...props }: TreeProps & { node: RequirementTree; qualifiers?: string[] }) {
  // Nil alternatives are meaningful; Relations already omits empty relation branches.
  if (!node) return <Text style={styles.note}>No requirement</Text>;
  if (node.type === 'course') return <CourseBranch node={node} qualifiers={qualifiers} {...props} />;

  if (node.type === 'qualified' && canInlineCourseQualifier(node)) {
    return <TreeNode node={node.requirement} qualifiers={[...qualifiers, node.qualifier]} {...props} />;
  }

  if (node.type === 'condition' && (/\b(?:HKDSE|Gaokao|IELTS)\b/i.test(node.text) || /\b(?:AL|AS)\b/.test(node.text))) {
    const colors = relationStyles[props.relation];
    return <View style={[styles.card, styles.schoolCard, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor }]}>
      <Text style={[styles.schoolRequirement, { color: colors.color }]}
        accessibilityLabel={`${node.text}, ${colors.label.toLowerCase()}`}>{node.text}</Text>
    </View>;
  }

  const description = describeRequirement(node);
  const booleanGroup = node.type === 'all' || node.type === 'any';
  const grouped = booleanGroup || node.type === 'at_least';
  const color = relationStyles[props.relation].color;
  return <View style={styles.expression}>
    {node.type === 'at_least' && <Text style={[styles.note, styles.emphasis]}>Choose at least {node.count}</Text>}
    {description.detail && node.type !== 'cases' && <Text style={styles.note}>{description.detail}</Text>}
    {!!description.children.length && <View style={grouped ? [styles.group, { borderLeftColor: color }] : styles.expression}>
      {description.children.map((branch, index) => <Fragment key={index}>
        {booleanGroup && index > 0 && <Text style={[styles.operator, { color }]}>{description.label}</Text>}
        <View style={styles.expression}>
          {branch.label && <Text style={styles.note}>{branch.label}</Text>}
          <TreeNode node={branch.node} qualifiers={qualifiers} {...props} />
        </View>
      </Fragment>)}
    </View>}
  </View>;
}

export function RequirementDiagram({ course, dataset, onOpenCourse, onInteractionChange }: DiagramProps) {
  if (!course.requirements.prerequisite && !course.requirements.corequisite) return null;
  const code = `${course.prefix} ${course.number}`;
  return <View style={styles.container}>
    <View style={styles.legend}>
      {Object.entries(relationStyles).map(([relation, colors]) => <View key={relation} style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: colors.color }]} />
        <Text style={[styles.legendText, { color: colors.color }]}>
          {colors.label}
        </Text>
      </View>)}
    </View>
    <DiagramViewport key={course.id} onInteractionChange={onInteractionChange}>
      <View style={styles.rootTree}>
        <View style={[styles.card, styles.rootCard]}><Text style={[styles.courseCode, styles.centeredText]}>{code}</Text></View>
        <View style={styles.rootBranches}>
          <Relations requirements={course.requirements}
            dataset={dataset} currentId={course.id} onOpenCourse={onOpenCourse} />
        </View>
      </View>
    </DiagramViewport>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 12, lineHeight: 18 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  branch: { flexDirection: 'row', alignItems: 'flex-start' },
  rootTree: { alignItems: 'flex-start' },
  rootBranches: { marginLeft: 12, paddingLeft: 10, paddingTop: 10, borderLeftWidth: 1, borderLeftColor: '#BAC3CD' },
  connector: { width: 14, height: 1, marginTop: 28, backgroundColor: '#BAC3CD' },
  relations: { gap: 14, alignItems: 'flex-start' },
  expression: { gap: 5, alignItems: 'flex-start' },
  group: { borderLeftWidth: 1, paddingLeft: 9, gap: 3, alignItems: 'flex-start' },
  operator: { width: 164, textAlign: 'center', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 18, color: '#4B5563', maxWidth: 230 },
  emphasis: { fontWeight: '600' },
  courseColumn: { width: 164 },
  card: { width: 164, borderWidth: 1, borderRadius: 7, padding: 5 },
  schoolCard: { padding: 9 },
  schoolRequirement: { fontSize: 13, lineHeight: 18 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  rootCard: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#F3F4F6', borderColor: '#AEB7C2' },
  missing: { borderStyle: 'dashed' },
  courseLink: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, gap: 2, borderRadius: 3 },
  qualifier: { fontSize: 12, lineHeight: 17 },
  courseCode: { fontWeight: '700', fontSize: 16, lineHeight: 22, color: '#253041' },
  centeredText: { textAlign: 'center' },
  toggle: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  toggleText: { fontSize: 22 },
  pressed: { opacity: 0.6 },
  status: { fontSize: 11, lineHeight: 15, color: '#59616B' },
});
