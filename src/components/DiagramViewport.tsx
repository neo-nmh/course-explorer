import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clampDiagramOffset, type Point, type Size } from '../functions/diagramPan';

const HEIGHT = 400;

export function DiagramViewport({ children, onInteractionChange }: {
  children: ReactNode; onInteractionChange: (active: boolean) => void;
}) {
  const [translation] = useState(() => new Animated.ValueXY());
  const position = useRef<Point>({ x: 0, y: 0 });
  const origin = useRef<Point>({ x: 0, y: 0 });
  const content = useRef<Size>({ width: 0, height: 0 });
  const viewport = useRef<Size>({ width: 0, height: HEIGHT });

  const moveTo = useCallback((next: Point) => {
    position.current = clampDiagramOffset(next, content.current, viewport.current);
    translation.setValue(position.current);
  }, [translation]);

  const startPan = useCallback(() => {
    origin.current = position.current;
    onInteractionChange(true);
  }, [onInteractionChange]);
  const movePan = useCallback((_: unknown, gesture: { dx: number; dy: number }) => {
    moveTo({ x: origin.current.x + gesture.dx, y: origin.current.y + gesture.dy });
  }, [moveTo]);

  // PanResponder.create only stores callbacks; refs are read later during gestures.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    // Leave taps to course links; take over only when the finger starts dragging.
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 5,
    onPanResponderGrant: startPan,
    onPanResponderMove: movePan,
    onPanResponderRelease: () => onInteractionChange(false),
    onPanResponderTerminate: () => onInteractionChange(false),
    onPanResponderReject: () => onInteractionChange(false),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [startPan, movePan, onInteractionChange]);

  useEffect(() => () => onInteractionChange(false), [onInteractionChange]);

  return <View style={styles.container}>
    <View style={styles.viewport} {...responder.panHandlers}
      onLayout={event => { viewport.current = event.nativeEvent.layout; moveTo(position.current); }}
      onTouchStart={() => onInteractionChange(true)}
      onTouchEnd={event => { if (!event.nativeEvent.touches.length) onInteractionChange(false); }}
      onTouchCancel={() => onInteractionChange(false)}>
      {/* Disabled scroll views measure unrestricted content. Only the single
          responder above handles dragging, so neither axis can lock the other. */}
      <ScrollView horizontal scrollEnabled={false} removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.horizontalContent}>
        <ScrollView scrollEnabled={false} removeClippedSubviews={false} style={styles.vertical}
          showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.canvas, { transform: translation.getTranslateTransform() }]}
            onLayout={event => { content.current = event.nativeEvent.layout; moveTo(position.current); }}>
            {children}
          </Animated.View>
        </ScrollView>
      </ScrollView>
    </View>
    <View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset diagram position"
        accessibilityHint="Additional actions move the diagram up, down, left or right."
        onPress={() => moveTo({ x: 0, y: 0 })} style={styles.reset}
        accessibilityActions={[
          { name: 'up', label: 'Scroll up' }, { name: 'down', label: 'Scroll down' },
          { name: 'left', label: 'Scroll left' }, { name: 'right', label: 'Scroll right' },
        ]}
        onAccessibilityAction={event => {
          const action = event.nativeEvent.actionName;
          moveTo({
            x: position.current.x + (action === 'left' ? 120 : action === 'right' ? -120 : 0),
            y: position.current.y + (action === 'up' ? 120 : action === 'down' ? -120 : 0),
          });
        }}>
        <Text style={styles.resetText}>Reset view</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  viewport: { height: HEIGHT, overflow: 'hidden', backgroundColor: '#FCFCFD', borderRadius: 8 },
  horizontalContent: { minWidth: '100%' },
  vertical: { height: HEIGHT },
  canvas: { padding: 10, alignItems: 'flex-start' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
  reset: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  resetText: { fontSize: 12, color: '#215C91' },
});
