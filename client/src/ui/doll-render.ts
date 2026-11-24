import { CHAR_H, CHAR_W } from '../game/constants';
import { textureImages } from '../game/assets-registry';
import { layerStack, layerTexture, type Appearance } from '../game/doll';

const scratch = document.createElement('canvas');
scratch.width = CHAR_W;
scratch.height = CHAR_H;
const sctx = scratch.getContext('2d')!;

/** Draws one tinted (multiplicative) layer frame onto ctx. `tint = null` → black silhouette. */
function drawLayer(
  ctx: CanvasRenderingContext2D,
  key: string,
  tint: string | null,
  frame: number,
  x: number,
  y: number,
  scale: number,
) {
  const img = textureImages.get(layerTexture(key));
  if (!img) return;
  const sx = (frame % 4) * CHAR_W;
  const sy = Math.floor(frame / 4) * CHAR_H;
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, CHAR_W, CHAR_H);
  sctx.drawImage(img, sx, sy, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
  sctx.globalCompositeOperation = tint ? 'multiply' : 'source-in';
  sctx.fillStyle = tint ?? '#0b0e1a';
  sctx.fillRect(0, 0, CHAR_W, CHAR_H);
  if (tint) {
    // restore the original alpha mask
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(img, sx, sy, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, CHAR_W, CHAR_H, x, y, CHAR_W * scale, CHAR_H * scale);
}

/** Full doll preview. dirRow: 0 down, 1 left, 2 right, 3 up. */
export function renderDoll(
  canvas: HTMLCanvasElement,
  a: Appearance,
  dirRow = 0,
  walkFrame = 0,
  scale = 6,
): void {
  canvas.width = CHAR_W * scale;
  canvas.height = CHAR_H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const l of layerStack(a, dirRow === 3))
    drawLayer(ctx, l.key, l.tint, dirRow * 4 + walkFrame, 0, 0, scale);
}

/** Thumbnail of a single item layer (front view), silhouette if locked. */
export function renderItemThumb(
  canvas: HTMLCanvasElement,
  layerKey: string,
  tint: string | null,
  scale = 3,
): void {
  canvas.width = CHAR_W * scale;
  canvas.height = CHAR_H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawLayer(ctx, 'body', tint ? '#59607a' : '#1a1f33', 0, 0, 0, scale);
  drawLayer(ctx, layerKey, tint, 0, 0, 0, scale);
}
