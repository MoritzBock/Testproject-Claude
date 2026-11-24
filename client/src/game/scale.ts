export interface Viewport {
  /** Internal game resolution (world pixels visible on screen). */
  gameW: number;
  gameH: number;
  /** Integer zoom in *device* pixels – keeps pixel art crisp on HiDPI screens. */
  deviceZoom: number;
  /** Zoom factor in CSS pixels (deviceZoom / dpr), passed to Phaser's setZoom. */
  cssZoom: number;
}

/** Largest integer zoom so that the base resolution fits (min. 1). */
export function integerZoom(viewW: number, viewH: number, baseW: number, baseH: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / baseW, viewH / baseH)));
}

/**
 * Fills the whole viewport while scaling only by integer factors in device pixels.
 * 'auto' rounds to the nearest integer factor, so the visible world stays close to the base
 * resolution (important on phones, where flooring would make characters tiny).
 * A fixed `pixelScale` is clamped so that at least a quarter of the base view stays visible.
 */
export function computeViewport(
  vw: number,
  vh: number,
  dpr: number,
  base: { width: number; height: number },
  pixelScale: 'auto' | number,
): Viewport {
  const dw = Math.max(1, Math.round(vw * dpr));
  const dh = Math.max(1, Math.round(vh * dpr));
  const auto = Math.max(1, Math.round(Math.min(dw / base.width, dh / base.height)));
  const maxZoom = integerZoom(dw, dh, base.width / 2, base.height / 2);
  const deviceZoom = pixelScale === 'auto' ? auto : Math.max(1, Math.min(pixelScale, maxZoom));
  return {
    gameW: Math.floor(dw / deviceZoom),
    gameH: Math.floor(dh / deviceZoom),
    deviceZoom,
    cssZoom: deviceZoom / dpr,
  };
}
