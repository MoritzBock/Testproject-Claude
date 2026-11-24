import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { notify } from '../core/app-state';
import { useStore } from '../core/store';
import { appState } from '../core/app-state';

export const LEARNING_NOTE =
  'Die Lernstandsdaten dienen der Lernbegleitung und nicht der Notengebung.';

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
export const fmtMinutes = (min: number) =>
  min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std. ${min % 60} Min.`;
export const fmtMs = (ms: number | null) =>
  ms === null
    ? '–'
    : ms < 60_000
      ? `${Math.round(ms / 1000)} s`
      : `${(ms / 60_000).toFixed(1).replace('.', ',')} Min.`;
export const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)} %`);

export function showError(e: unknown) {
  notify(e instanceof Error ? e.message : 'Fehler', 'warning', 6000);
}

/** Dialog with focus on the first control; Esc closes. */
export function Dialog(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="modal-backdrop dash-modal">
      <div
        class={`modal ${props.wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        ref={ref}
      >
        <header class="modal-header">
          <h2>{props.title}</h2>
          <button class="btn btn-ghost" onClick={props.onClose} aria-label="Schließen">
            ✕
          </button>
        </header>
        <div class="modal-body">{props.children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore(appState, (s) => s.toasts);
  return (
    <div class="toasts dash-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Tri-state selector: Standard (inherit) / An / Aus. */
export function TriState(props: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean | null) => void;
  hint?: string;
}) {
  const v = props.value === undefined ? 'std' : props.value ? 'on' : 'off';
  return (
    <div class="tri">
      <span class="tri-label">
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
      <div class="tri-buttons" role="radiogroup" aria-label={props.label}>
        {(
          [
            ['std', 'Standard'],
            ['on', 'An'],
            ['off', 'Aus'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="radio"
            aria-checked={v === k}
            class={`tri-btn ${v === k ? 'tri-on' : ''}`}
            onClick={() => props.onChange(k === 'std' ? null : k === 'on')}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useLoad<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): [T | null, () => void, string | null] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [...deps, n]);
  return [data, () => setN((x) => x + 1), error];
}

/**
 * Single-series bar chart (inline SVG). One hue, no legend (title names the series),
 * per-bar tooltip, a visually hidden table as accessible alternative.
 */
export function BarChart(props: {
  title: string;
  data: Array<{ label: string; value: number }>;
  unit: string;
  height?: number;
}) {
  const h = props.height ?? 120;
  const max = Math.max(1, ...props.data.map((d) => d.value));
  const n = props.data.length || 1;
  const w = 600;
  const gap = 2;
  const bw = Math.min(48, Math.max(2, (w - gap * (n - 1)) / n));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure class="chart">
      <figcaption>{props.title}</figcaption>
      <div class="chart-wrap">
        <svg
          viewBox={`0 0 ${w} ${h + 18}`}
          role="img"
          aria-label={`${props.title} – Diagramm, Werte in der Tabelle darunter`}
        >
          <line x1="0" x2={w} y1={h} y2={h} class="chart-axis" />
          {props.data.map((d, i) => {
            const bh = (d.value / max) * (h - 8);
            const x = i * (bw + gap);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x} y={0} width={bw} height={h} fill="transparent" />
                {d.value > 0 && <path class="chart-bar" d={roundedTop(x, h, bw, bh)} />}
                <title>{`${d.label}: ${d.value} ${props.unit}`}</title>
                {(i === 0 || i === n - 1 || i % 7 === 0) && (
                  <text
                    x={i === 0 ? x : i === n - 1 ? x + bw : x + bw / 2}
                    y={h + 14}
                    class="chart-tick"
                    text-anchor={i === 0 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && props.data[hover] && (
          <div class="chart-tip" style={{ left: `${(((hover + 0.5) * (bw + gap)) / w) * 100}%` }}>
            <strong>
              {props.data[hover]!.value} {props.unit}
            </strong>
            <span>{props.data[hover]!.label}</span>
          </div>
        )}
      </div>
      <details class="chart-table">
        <summary>Als Tabelle anzeigen</summary>
        <table>
          <tbody>
            {props.data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td>
                  {d.value} {props.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function roundedTop(x: number, base: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

/** Horizontal meter for a share (0..1) with the value as text. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <span class="meter" title={`${label}: ${pct(value)}`}>
      <span class="meter-track" aria-hidden="true">
        <span class="meter-fill" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </span>
      <span class="meter-text">{pct(value)}</span>
    </span>
  );
}
