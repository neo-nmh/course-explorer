import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Action, LoadingState, ui } from '../components/common';
import { FilterIcon } from '../components/FilterIcon';
import { ScopeSettings } from '../components/ScopeSettings';
import { useDataset } from '../hooks/useDataset';
import { defaultScope, scopeLabel } from '../functions/catalogue';
import { createSearchIndex, searchCourses } from '../functions/search';
import type { Course } from '../types/course';
import type { RootStackParamList } from '../types/navigation';

type BrowseRow = { kind: 'prefix'; prefix: string; count: number } | { kind: 'course'; course: Course };

export function BrowseScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Browse'>) {
  const [scope, setScope] = useState(defaultScope);
  const [query, setQuery] = useState('');
  const searchQuery = useDeferredValue(query);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data, error, retry } = useDataset(scope);
  const index = useMemo(() => createSearchIndex(Object.values(data ?? {})), [data]);
  const searching = searchQuery.trim().length > 0;
  const rows = useMemo<BrowseRow[]>(() => {
    if (searching) return searchCourses(index, searchQuery).map(course => ({ kind: 'course', course }));
    const groups = new Map<string, Course[]>();
    for (const { course } of index) {
      const courses = groups.get(course.prefix) ?? [];
      courses.push(course);
      groups.set(course.prefix, courses);
    }
    return [...groups].flatMap(([prefix, courses]): BrowseRow[] => [
      { kind: 'prefix', prefix, count: courses.length },
      ...(expanded.has(prefix) ? courses.map(course => ({ kind: 'course' as const, course })) : []),
    ]);
  }, [index, searchQuery, searching, expanded]);
  const courseCount = searching ? rows.length : index.length;

  function togglePrefix(prefix: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }

  return (
    <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}>
      <View style={styles.searchRow}>
        <TextInput style={styles.input} value={query} onChangeText={setQuery}
          placeholder="Search code or title" accessibilityLabel="Search courses"
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} />
        {query.length > 0 && <Action label="Clear" onPress={() => setQuery('')} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Catalogue settings"
          onPress={() => { Keyboard.dismiss(); setSettingsOpen(true); }}
          style={({ pressed }) => [styles.settingsButton, pressed && ui.pressed]}>
          <FilterIcon />
        </Pressable>
      </View>
      <View style={styles.catalogueSummary}>
        <Text style={styles.scope} numberOfLines={1}>{scopeLabel(scope)}</Text>
        {data && <Text style={styles.summary} accessibilityLiveRegion="polite">
          {query !== searchQuery ? 'Searching…' : `${courseCount} ${courseCount === 1 ? 'course' : 'courses'}`}
        </Text>}
      </View>
      {!data ? <LoadingState error={error} retry={retry} /> :
        <FlatList<BrowseRow>
          key={`${scope.campus}/${scope.term}/${searchQuery}`}
          data={rows} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list} initialNumToRender={20}
          keyExtractor={row => row.kind === 'prefix' ? `prefix:${row.prefix}` : row.course.id}
          ListEmptyComponent={<View style={ui.center}>
            <Text style={ui.heading}>{searching ? 'No courses found' : 'No courses available'}</Text>
            <Text style={ui.body}>Try a different search, campus, or semester.</Text>
          </View>}
          renderItem={({ item }) => item.kind === 'prefix' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.prefix}, ${item.count} courses`}
              accessibilityState={{ expanded: expanded.has(item.prefix) }} onPress={() => togglePrefix(item.prefix)}
              style={({ pressed }) => [styles.row, styles.prefix, pressed && ui.pressed]}>
              <Text style={ui.heading}>{item.prefix}</Text>
              <Text style={ui.body}>{item.count}  {expanded.has(item.prefix) ? '−' : '+'}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button"
              accessibilityLabel={`${item.course.prefix} ${item.course.number}, ${item.course.title}`}
              onPress={() => {
                Keyboard.dismiss();
                navigation.push('Course', { ...scope, code: `${item.course.prefix} ${item.course.number}` });
              }} style={({ pressed }) => [styles.row, !searching && styles.indented, pressed && ui.pressed]}>
              <Text style={styles.code}>{item.course.prefix} {item.course.number}</Text>
              <Text style={ui.body}>{item.course.title || 'Untitled course'}</Text>
            </Pressable>
          )}
        />
      }
      {settingsOpen && <ScopeSettings scope={scope} onClose={() => setSettingsOpen(false)}
        onApply={next => {
          if (next.campus !== scope.campus || next.term !== scope.term) setExpanded(new Set());
          setScope(next);
          setSettingsOpen(false);
        }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchRow: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#aaa', borderRadius: 5, fontSize: 16, color: '#222' },
  settingsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  catalogueSummary: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scope: { ...ui.muted, flex: 1 },
  summary: { ...ui.muted, flexShrink: 0 },
  list: { flexGrow: 1, paddingBottom: 24 },
  row: { padding: 16, minHeight: 60, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  prefix: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f5f5' },
  indented: { paddingLeft: 28 },
  code: { fontSize: 17, color: '#111', fontWeight: '600' },
});
