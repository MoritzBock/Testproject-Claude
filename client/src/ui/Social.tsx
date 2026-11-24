import { useEffect, useRef, useState } from 'preact/hooks';
import { EMOTES, LEADERBOARD_LABELS, type LeaderboardCriterion } from '@pixel/shared';
import { get, post } from '../api/http';
import { appState, closeOverlay, notify, openSettings } from '../core/app-state';
import { sessionStore } from '../core/session';
import { useStore } from '../core/store';
import { sendEmote } from '../net/realtime';
import { playSfx } from '../audio/sfx';
import { Modal } from './Modal';
import { LEARNING_NOTE } from './Menus';

/** Predefined emotes only – no free chat. */
export function EmoteMenu() {
  const pol = useStore(sessionStore, (s) => s.policies);
  const me = useStore(sessionStore, (s) => s.me);
  const allowed = me?.role === 'teacher' || pol?.['multiplayer.emotes'];
  const pick = (id: (typeof EMOTES)[number]['id'], text: string) => {
    sendEmote(id);
    appState.set({ myEmote: { text, at: Date.now() } });
    playSfx('talk');
    closeOverlay();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const em = EMOTES[n - 1];
      if (allowed && em) pick(em.id, em.text);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <Modal title="Emotes" onClose={closeOverlay}>
      {!allowed ? (
        <p>Emotes sind gerade nicht aktiviert.</p>
      ) : (
        <div class="emote-grid">
          {EMOTES.map((e, i) => (
            <button key={e.id} class="btn emote-btn" onClick={() => pick(e.id, e.text)}>
              <kbd>{i + 1}</kbd> {e.text}
            </button>
          ))}
        </div>
      )}
      <p class="note">
        Es gibt bewusst keinen freien Chat. Emotes sehen nur Mitspielende deiner Klasse, wenn deine
        Lehrkraft das gemeinsame Spielen aktiviert hat.
      </p>
    </Modal>
  );
}

export function AnnouncementBanner() {
  const a = useStore(appState, (s) => s.announcement);
  if (!a) return null;
  return (
    <div class="announcement" role="alert">
      <strong>Nachricht von {a.from}:</strong> {a.text}
      <button class="btn btn-small" onClick={() => appState.set({ announcement: null })}>
        OK
      </button>
    </div>
  );
}

export function FrozenBanner() {
  const f = useStore(appState, (s) => s.frozen);
  return f ? (
    <div class="frozen-banner" role="status">
      ⏸ Deine Lehrkraft hat das Spiel kurz angehalten.
    </div>
  ) : null;
}

interface Board {
  criterion: LeaderboardCriterion;
  criteria: Array<{ id: LeaderboardCriterion; label: string }>;
  top: Array<{ rank: number; name: string; value: number; me: boolean }>;
  me: { rank: number; value: number } | null;
  total: number;
  unit: string;
}

export function Leaderboard() {
  const [criterion, setCriterion] = useState<LeaderboardCriterion | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Board>(`/api/leaderboard${criterion ? `?criterion=${criterion}` : ''}`)
      .then(setBoard)
      .catch((e: Error) => setError(e.message));
  }, [criterion]);
  return (
    <Modal title="Rangliste der Klasse" onClose={closeOverlay}>
      {error && <p class="warning">{error}</p>}
      {board && (
        <>
          <div class="tabs" role="tablist">
            {board.criteria.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={board.criterion === c.id}
                class={`tab ${board.criterion === c.id ? 'tab-active' : ''}`}
                onClick={() => setCriterion(c.id)}
              >
                {LEADERBOARD_LABELS[c.id]}
              </button>
            ))}
          </div>
          <table class="board">
            <thead>
              <tr>
                <th scope="col">Platz</th>
                <th scope="col">Name</th>
                <th scope="col">Wert</th>
              </tr>
            </thead>
            <tbody>
              {board.top.map((r, i) => (
                <tr key={i} class={r.me ? 'board-me' : ''}>
                  <td>{r.rank}.</td>
                  <td>{r.name}</td>
                  <td>
                    {r.value} {board.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.me && !board.top.some((r) => r.me) && (
            <p>
              Dein Platz: <strong>{board.me.rank}</strong> von {board.total} ({board.me.value}{' '}
              {board.unit})
            </p>
          )}
          <p class="note">
            Du möchtest anonym erscheinen?{' '}
            <button class="btn btn-ghost btn-small" onClick={() => openSettings()}>
              Einstellungen → Privatsphäre
            </button>
          </p>
          <p class="note">{LEARNING_NOTE}</p>
        </>
      )}
    </Modal>
  );
}

// --- admin console (teachers) -------------------------------------------------------------
interface Meta {
  commands: Array<{ name: string; usage: string }>;
  players: string[];
  classes: string[];
  groups: string[];
  levels: string[];
  items: string[];
  boxes: string[];
  settings: string[];
}
const history: string[] = []; // memory only (this page session)
const outputLog: Array<{ text: string; kind: 'in' | 'out' | 'err' }> = [
  {
    text: 'Admin-Konsole – tippe „help“. Tab vervollständigt, ↑/↓ blättert in der Historie.',
    kind: 'out',
  },
];

export function completionsFor(line: string, meta: Meta): string[] {
  const parts = line.split(' ');
  const word = parts[parts.length - 1] ?? '';
  const pos = parts.length - 1;
  const cmd = parts[0] ?? '';
  let pool: string[];
  if (pos === 0) pool = meta.commands.map((c) => c.name);
  else if (cmd === 'give' && pos === 2) pool = ['coins', 'item'];
  else if (cmd === 'give' && pos === 3 && parts[2] === 'item') pool = meta.items;
  else if (['unlock', 'lock', 'clear'].includes(cmd) && pos === 2) pool = ['level'];
  else if (['unlock', 'lock', 'clear', 'reset'].includes(cmd) && pos === 3) pool = meta.levels;
  else if (cmd === 'reset' && pos === 2) pool = ['progress', 'level'];
  else if (cmd === 'spawnbox' && pos === 2) pool = meta.boxes;
  else if (cmd === 'invisible') pool = ['on', 'off'];
  else if (cmd === 'set' && pos === 1) pool = meta.settings;
  else if (cmd === 'set' && pos === 2) pool = ['an', 'aus'];
  else
    pool = [
      ...meta.players,
      'alle',
      ...meta.classes.map((c) => `klasse:${c.includes(' ') ? `"${c}"` : c}`),
      ...meta.groups.map((g) => `gruppe:${g.includes(' ') ? `"${g}"` : g}`),
    ];
  return pool.filter((p) => p.toLowerCase().startsWith(word.toLowerCase()));
}

export function AdminConsole({
  onAction,
}: {
  onAction: (a: { type: string; x?: number; y?: number; on?: boolean }) => void;
}) {
  const [line, setLine] = useState('');
  const [log, setLog] = useState(outputLog);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [histIdx, setHistIdx] = useState(history.length);
  const [hint, setHint] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void get<Meta>('/api/teacher/console/meta')
      .then(setMeta)
      .catch(() => {});
    ref.current?.focus();
  }, []);
  useEffect(() => out.current?.scrollTo(0, out.current.scrollHeight), [log]);

  const push = (text: string, kind: 'in' | 'out' | 'err') => {
    outputLog.push({ text, kind });
    if (outputLog.length > 300) outputLog.shift();
    setLog([...outputLog]);
  };

  const run = async () => {
    const cmd = line.trim();
    if (!cmd) return;
    history.push(cmd);
    setHistIdx(history.length);
    setLine('');
    setHint([]);
    push(`> ${cmd}`, 'in');
    try {
      const r = await post<{
        ok: boolean;
        output: string[];
        action?: { type: string; x?: number; y?: number; on?: boolean };
      }>('/api/teacher/console', {
        command: cmd,
      });
      for (const l of r.output) push(l, r.ok ? 'out' : 'err');
      if (r.action) onAction(r.action);
    } catch (e) {
      push(e instanceof Error ? e.message : 'Fehler', 'err');
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void run();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = Math.max(0, histIdx - 1);
      setHistIdx(i);
      setLine(history[i] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const i = Math.min(history.length, histIdx + 1);
      setHistIdx(i);
      setLine(history[i] ?? '');
    } else if (e.key === 'Tab' && meta) {
      e.preventDefault();
      const options = completionsFor(line, meta);
      if (options.length === 1) {
        const parts = line.split(' ');
        parts[parts.length - 1] = options[0]!;
        setLine(`${parts.join(' ')} `);
        setHint([]);
      } else setHint(options.slice(0, 12));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closeOverlay();
    }
  };

  return (
    <div class="console" role="dialog" aria-label="Admin-Konsole">
      <div class="console-out" ref={out} aria-live="polite">
        {log.map((l, i) => (
          <div key={i} class={`console-${l.kind}`}>
            {l.text}
          </div>
        ))}
      </div>
      {hint.length > 0 && <div class="console-hint">{hint.join('   ')}</div>}
      <div class="console-in">
        <span aria-hidden="true">&gt;</span>
        <input
          ref={ref}
          value={line}
          aria-label="Befehl"
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => setLine((e.target as HTMLInputElement).value)}
          onKeyDown={onKey}
        />
        <button class="btn btn-small" onClick={closeOverlay}>
          Schließen
        </button>
      </div>
    </div>
  );
}

export function notifyError(e: unknown) {
  notify(e instanceof Error ? e.message : 'Fehler', 'warning');
}
