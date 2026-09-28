import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export function Action({ label, onPress, selected = false, disabled = false }: {
  label: string; onPress: () => void; selected?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [ui.button, selected && ui.selected, pressed && ui.pressed, disabled && { opacity: 0.5 }]}>
      <Text style={ui.body}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ error, retry }: { error: string | null; retry: () => void }) {
  return <View style={ui.center}>
    {error ? <><Text style={ui.body}>{error}</Text><Action label="Try again" onPress={retry} /></>
      : <><ActivityIndicator accessibilityLabel="Loading courses" /><Text style={ui.body}>Loading courses…</Text></>}
  </View>;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  body: { fontSize: 16, color: '#222', lineHeight: 23 },
  muted: { fontSize: 14, color: '#555', lineHeight: 20 },
  heading: { fontSize: 20, fontWeight: '600', color: '#111' },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#bbb', borderRadius: 5 },
  selected: { borderColor: '#222', backgroundColor: '#e5e5e5' },
  pressed: { backgroundColor: '#eee' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 12 },
});
