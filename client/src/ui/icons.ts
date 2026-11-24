/** Small inline SVG icons (own drawings, pixel style). Static, trusted markup only. */
const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 8 8" width="1em" height="1em" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  lock: svg(
    '<rect x="2" y="1" width="4" height="1" fill="currentColor"/><rect x="1" y="2" width="1" height="2" fill="currentColor"/><rect x="6" y="2" width="1" height="2" fill="currentColor"/><rect x="1" y="4" width="6" height="4" fill="currentColor"/><rect x="3" y="5" width="2" height="2" fill="#0008"/>',
  ),
  play: svg('<path d="M2 1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill="currentColor"/>'),
  half: svg(
    '<rect x="1" y="1" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/><rect x="1" y="1" width="3" height="6" fill="currentColor"/>',
  ),
  check: svg(
    '<path d="M1 4h1v1h1v1h1v-1h1v-1h1v-1h1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1z" fill="currentColor"/>',
  ),
  star: svg('<path d="M3 0h2v2h3v2h-1v1h1v3h-2v-1h-2v1h-2v-3h1v-1h-1v-2h3z" fill="currentColor"/>'),
  chip: svg(
    '<rect x="2" y="2" width="4" height="4" fill="currentColor"/><rect x="0" y="3" width="1" height="1" fill="currentColor"/><rect x="7" y="3" width="1" height="1" fill="currentColor"/><rect x="3" y="0" width="1" height="1" fill="currentColor"/><rect x="4" y="7" width="1" height="1" fill="currentColor"/><rect x="3" y="3" width="2" height="2" fill="#fff8"/>',
  ),
  map: svg(
    '<path d="M0 1h2v1h2v-1h2v1h2v6h-2v-1h-2v1h-2v-1h-2z" fill="currentColor"/><rect x="2" y="2" width="1" height="5" fill="#0006"/><rect x="5" y="1" width="1" height="5" fill="#0006"/>',
  ),
  menu: svg(
    '<rect x="1" y="1" width="6" height="1" fill="currentColor"/><rect x="1" y="3.5" width="6" height="1" fill="currentColor"/><rect x="1" y="6" width="6" height="1" fill="currentColor"/>',
  ),
  talk: svg(
    '<rect x="0" y="1" width="8" height="5" fill="currentColor"/><rect x="2" y="6" width="2" height="1" fill="currentColor"/><rect x="2" y="3" width="1" height="1" fill="#0008"/><rect x="4" y="3" width="1" height="1" fill="#0008"/><rect x="6" y="3" width="1" height="1" fill="#0008"/>',
  ),
  hanger: svg(
    '<rect x="3" y="0" width="2" height="1" fill="currentColor"/><rect x="4" y="1" width="1" height="2" fill="currentColor"/><path d="M4 3h1v1h1v1h1v1h1v1h-8v-1h1v-1h1v-1h1z" fill="currentColor"/><rect x="1" y="6" width="6" height="1" fill="#0006"/>',
  ),
  coin: svg(
    '<rect x="2" y="0" width="4" height="1" fill="currentColor"/><rect x="1" y="1" width="6" height="6" fill="currentColor"/><rect x="2" y="7" width="4" height="1" fill="currentColor"/><rect x="3" y="2" width="2" height="4" fill="#0005"/>',
  ),
  trophy: svg(
    '<rect x="1" y="0" width="6" height="4" fill="currentColor"/><rect x="0" y="1" width="1" height="2" fill="currentColor"/><rect x="7" y="1" width="1" height="2" fill="currentColor"/><rect x="3" y="4" width="2" height="2" fill="currentColor"/><rect x="2" y="6" width="4" height="2" fill="currentColor"/>',
  ),
  person: svg(
    '<rect x="3" y="0" width="2" height="2" fill="currentColor"/><rect x="2" y="3" width="4" height="3" fill="currentColor"/><rect x="2" y="6" width="1" height="2" fill="currentColor"/><rect x="5" y="6" width="1" height="2" fill="currentColor"/>',
  ),
} as const;

export type IconName = keyof typeof ICONS;
