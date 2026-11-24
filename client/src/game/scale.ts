/** Largest integer zoom so that the internal resolution fits into the viewport (min. 1). */
export function integerZoom(viewW: number, viewH: number, baseW: number, baseH: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / baseW, viewH / baseH)));
}
