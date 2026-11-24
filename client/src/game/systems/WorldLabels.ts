import type Phaser from 'phaser';

interface Label {
  el: HTMLElement;
  x: number;
  y: number;
}

/**
 * Crisp HTML labels anchored to world positions (portal titles, speech bubbles).
 * HTML instead of canvas text: sharp at any zoom, respects the text-size setting,
 * readable by screen readers.
 */
export class WorldLabels {
  private root: HTMLElement;
  private labels = new Map<string, Label>();

  constructor(
    private camera: Phaser.Cameras.Scene2D.Camera,
    private canvas: HTMLCanvasElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'world-labels';
    this.root.setAttribute('aria-hidden', 'true');
    document.getElementById('ui-root')!.prepend(this.root);
  }

  set(id: string, x: number, y: number, html: string, className = ''): HTMLElement {
    let l = this.labels.get(id);
    if (!l) {
      const el = document.createElement('div');
      this.root.appendChild(el);
      l = { el, x, y };
      this.labels.set(id, l);
    }
    l.x = x;
    l.y = y;
    l.el.className = `world-label ${className}`;
    if (l.el.innerHTML !== html) l.el.innerHTML = html; // html is built from trusted, escaped strings only
    return l.el;
  }

  remove(id: string): void {
    this.labels.get(id)?.el.remove();
    this.labels.delete(id);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  update(): void {
    const rect = this.canvas.getBoundingClientRect();
    const view = this.camera.worldView;
    const zoom = rect.width / this.camera.width;
    for (const l of this.labels.values()) {
      const sx = rect.left + (l.x - view.x) * zoom;
      const sy = rect.top + (l.y - view.y) * zoom;
      const inside =
        sx > rect.left - 100 &&
        sx < rect.right + 100 &&
        sy > rect.top - 50 &&
        sy < rect.bottom + 50;
      l.el.style.display = inside ? '' : 'none';
      if (inside) l.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    }
  }

  destroy(): void {
    this.root.remove();
    this.labels.clear();
  }
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
