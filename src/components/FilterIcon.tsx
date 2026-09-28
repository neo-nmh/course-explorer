import { StyleSheet, View } from 'react-native';

export function FilterIcon() {
  return <View style={styles.icon} pointerEvents="none" accessible={false}>
    {[4, 12, 7].map((left, index) => <View key={index} style={styles.row}>
      <View style={styles.track} />
      <View style={[styles.thumb, { left }]} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  icon: { width: 22, height: 22, justifyContent: 'space-between' },
  row: { height: 6 },
  track: { position: 'absolute', left: 0, right: 0, top: 2, height: 2, borderRadius: 1, backgroundColor: '#222' },
  thumb: { position: 'absolute', top: 0, width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: '#222', backgroundColor: '#fff' },
});
