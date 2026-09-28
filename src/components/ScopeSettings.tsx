import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { manifest, termsForCampus } from '../functions/catalogue';
import type { CourseScope } from '../types/navigation';
import { Action, ui } from './common';

export function ScopeSettings({ scope, onApply, onClose }: {
  scope: CourseScope; onApply: (scope: CourseScope) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(scope);
  const terms = termsForCampus(draft.campus);

  function selectCampus(campus: string) {
    const available = termsForCampus(campus);
    setDraft({ campus, term: available.includes(draft.term) ? draft.term : available[0] });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={ui.screen}>
        <View style={styles.header}>
          <Text style={ui.heading} accessibilityRole="header">Catalogue settings</Text>
          <Action label="Cancel" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={ui.heading}>Campus</Text>
          {Object.entries(manifest.campuses).map(([code, name]) => (
            <Action key={code} label={name} selected={draft.campus === code} onPress={() => selectCampus(code)} />
          ))}
          <Text style={ui.heading}>Semester</Text>
          {terms.map(term => <Action key={term} label={manifest.terms[term]} selected={draft.term === term}
            onPress={() => setDraft({ ...draft, term })} />)}
          {!terms.length && <Text style={ui.body}>No semesters available for this campus.</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Action label="Apply" disabled={!terms.includes(draft.term)} onPress={() => onApply(draft)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  content: { padding: 16, gap: 12 },
  footer: { padding: 16 },
});
