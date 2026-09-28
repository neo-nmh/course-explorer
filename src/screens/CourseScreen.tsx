import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Action, LoadingState, ui } from '../components/common';
import { RequirementDiagram } from '../components/RequirementDiagram';
import { useDataset } from '../hooks/useDataset';
import { scopeLabel } from '../functions/catalogue';
import type { RootStackParamList } from '../types/navigation';

export function CourseScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Course'>) {
  const [diagramInteracting, setDiagramInteracting] = useState(false);
  const { campus, term, code } = route.params;
  const { data, error, retry } = useDataset({ campus, term });
  const course = data?.[code];

  function openCourse(nextCode: string) {
    if (!data?.[nextCode] || nextCode === code) return;
    const state = navigation.getState();
    const existing = state.routes.findLastIndex(item => item.name === 'Course' && item.params?.code === nextCode
      && item.params.campus === campus && item.params.term === term);
    // A cycle can link back to an earlier detail screen. Reuse that screen
    // instead of endlessly pushing the same courses onto the navigation stack.
    if (existing >= 0) navigation.pop(state.index - existing);
    else navigation.push('Course', { campus, term, code: nextCode });
  }

  return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}>
    {!data ? <LoadingState error={error} retry={retry} /> : !course ? <View style={ui.center}>
      <Text style={ui.heading}>Course unavailable</Text>
      <Text style={ui.body}>{code} is not in {scopeLabel({ campus, term })}.</Text>
      <Action label="Go back" onPress={() => navigation.goBack()} />
    </View> : <ScrollView contentContainerStyle={styles.content} scrollEnabled={!diagramInteracting}>
      <Text style={ui.muted}>{scopeLabel({ campus, term })}</Text>
      <Text style={styles.title} accessibilityRole="header">{course.title || code}</Text>
      <Text style={ui.body}>{course.min_credits === course.max_credits ? course.min_credits
        : `${course.min_credits}–${course.max_credits}`} {course.max_credits === 1 && course.min_credits === 1 ? 'credit' : 'credits'}</Text>
      <Text style={ui.muted}>School: {course.school_code || 'Not specified'} · Department: {course.department_code || 'Not specified'}</Text>
      <Text style={ui.heading} accessibilityRole="header">Description</Text>
      <Text style={ui.body}>{course.description.trim() || 'No description available.'}</Text>
      {(course.requirements.prerequisite || course.requirements.corequisite) && <>
        <Text style={ui.heading} accessibilityRole="header">Prerequisites and corequisites</Text>
        <RequirementDiagram course={course} dataset={data} onOpenCourse={openCourse}
          onInteractionChange={setDiagramInteracting} />
      </>}
      <Text style={ui.heading} accessibilityRole="header">Exclusions</Text>
      <Text style={ui.body}>{course.exclusion.trim() || 'No exclusions listed.'}</Text>
      <Text style={ui.heading} accessibilityRole="header">Learning outcomes</Text>
      {course.cilos.length ? course.cilos.map((outcome, index) => <Text key={index} style={ui.body}>{index + 1}. {outcome}</Text>)
        : <Text style={ui.body}>No learning outcomes listed.</Text>}
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  title: { fontSize: 24, fontWeight: '600', color: '#111' },
});
