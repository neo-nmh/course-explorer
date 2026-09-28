export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export function clampDiagramOffset(offset: Point, content: Size, viewport: Size): Point {
  return {
    x: Math.min(0, Math.max(Math.min(0, viewport.width - content.width), offset.x)),
    y: Math.min(0, Math.max(Math.min(0, viewport.height - content.height), offset.y)),
  };
}
