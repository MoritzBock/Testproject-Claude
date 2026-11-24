import { useEffect, useState } from 'preact/hooks';
import {
  ACHIEVEMENT_BY_ID,
  GAME,
  RARITY_INFO,
  getItem,
  type RunStartResponse,
  type RunSummary,
  type TaskResult,
} from '@pixel/shared';
import { post } from '../api/http';
import { appState, closeOverlay, notify } from '../core/app-state';
import { bus } from '../core/bus';
import { loadCharacter } from '../core/character-store';
import { getSettings } from '../core/settings-store';
import { useStore } from '../core/store';
import { playSfx } from '../audio/sfx';
import { refreshWorld } from '../game/data/world';
import { starString } from '../game/portal-status';
import { getTaskRenderer } from '../tasks';
import { Modal } from './Modal';
import { LEARNING_NOTE } from './Menus';

interface TaskUiState {
  done: boolean;
  points: number;
  result: TaskResult | null;
  hints: string[];
}

export function LevelView() {
  const level = useStore(appState, (s) => s.activeLevel);
  const [run, setRun] = useState<RunStartResponse | null>(null);
  const [states, setStates] = useState<Record<string, TaskUiState>>({});
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<{ value: unknown; complete: boolean }>({
    value: null,
    complete: false,
  });
  const [attemptKey, setAttemptKey] = useState(0);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start (or resume) the run
  useEffect(() => {
    if (!level) return;
    post<RunStartResponse>(`/api/levels/${level.levelId}/start`)
      .then((r) => {
        setRun(r);
        const st: Record<string, TaskUiState> = {};
        for (const p of r.progress)
          st[p.taskId] = { done: p.done, points: p.points, result: null, hints: [] };
        setStates(st);
        const firstOpen = r.progress.findIndex((p) => !p.done);
        setIndex(firstOpen === -1 ? r.tasks.length : firstOpen);
      })
      .catch((e: Error) => setError(e.message));
  }, [level?.levelId]);

  const task = run?.tasks[index];
  // report "task shown" → server starts timing
  useEffect(() => {
    if (run && task && !states[task.id]?.done)
      void post(`/api/runs/${run.runId}/tasks/${task.id}/view`).catch(() => {});
  }, [run?.runId, task?.id]);

  const close = () => {
    closeOverlay();
    bus.emit('levelClosed');
    void refreshWorld();
    void loadCharacter();
  };

  if (!level) return null;
  if (error)
    return (
      <Modal title={level.title} onClose={close}>
        <p class="warning">{error}</p>
        <button class="btn btn-primary" onClick={close}>
          Zurück zur Insel
        </button>
      </Modal>
    );
  if (!run) return <Modal title={level.title}>Lade Aufgaben …</Modal>;
  if (summary) return <Summary summary={summary} title={run.level.title} onClose={close} />;

  const st = task ? (states[task.id] ?? { done: false, points: 0, result: null, hints: [] }) : null;
  const allDone = run.tasks.every((t) => states[t.id]?.done);
  const Renderer = task ? getTaskRenderer(task.type) : undefined;

  const check = async () => {
    if (!task || !answer.complete) return;
    setBusy(true);
    try {
      const r = await post<TaskResult>(`/api/runs/${run.runId}/tasks/${task.id}/answer`, {
        answer: answer.value,
      });
      playSfx(r.correct ? 'confirm' : 'deny');
      setStates((s) => ({
        ...s,
        [task.id]: {
          ...(s[task.id] ?? st!),
          done: r.done,
          points: Math.max(r.points, st!.points),
          result: r,
        },
      }));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const hint = async () => {
    if (!task) return;
    try {
      const r = await post<{ hint: string }>(`/api/runs/${run.runId}/tasks/${task.id}/hint`);
      playSfx('ui');
      setStates((s) => ({
        ...s,
        [task.id]: { ...(s[task.id] ?? st!), hints: [...(s[task.id]?.hints ?? []), r.hint] },
      }));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    }
  };

  const retry = () => {
    setStates((s) => ({ ...s, [task!.id]: { ...s[task!.id]!, result: null } }));
    setAnswer({ value: null, complete: false });
    setAttemptKey((k) => k + 1);
  };

  const next = () => {
    setAnswer({ value: null, complete: false });
    setAttemptKey((k) => k + 1);
    const following = run.tasks.findIndex((t, i) => i > index && !states[t.id]?.done);
    setIndex(following === -1 ? run.tasks.length : following);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const s = await post<RunSummary>(`/api/runs/${run.runId}/finish`);
      playSfx(s.passed ? 'unlock' : 'deny');
      setSummary(s);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const result = st?.result;
  return (
    <Modal title={run.level.title} onClose={close} wide>
      <div class="level-view">
        <div class="level-head">
          <span class="note">{run.level.subject}</span>
          {run.preview && (
            <span class="preview-badge">Vorschau (Lehrkraft) – nichts wird gespeichert</span>
          )}
          <ol class="task-dots" aria-label="Fortschritt">
            {run.tasks.map((t, i) => (
              <li
                key={t.id}
                class={`task-dot ${states[t.id]?.done ? 'dot-done' : ''} ${i === index ? 'dot-current' : ''}`}
                aria-label={`Aufgabe ${i + 1}${states[t.id]?.done ? ', erledigt' : ''}`}
              />
            ))}
          </ol>
        </div>

        {task && st ? (
          <section class="task" aria-live="polite">
            <h3>
              Aufgabe {index + 1} von {run.tasks.length}
            </h3>
            <p class="task-prompt">{task.prompt}</p>
            {Renderer ? (
              <Renderer
                key={`${task.id}-${attemptKey}`}
                task={task as never}
                disabled={!!result || busy}
                onChange={(value: unknown, complete: boolean) => setAnswer({ value, complete })}
              />
            ) : (
              <p class="warning">Unbekannter Aufgabentyp „{task.type}“.</p>
            )}
            {st.hints.length > 0 && (
              <ul class="hints">
                {st.hints.map((h, i) => (
                  <li key={i}>💡 {h}</li>
                ))}
              </ul>
            )}
            {result && (
              <div
                class={`feedback ${result.correct ? 'feedback-ok' : 'feedback-bad'}`}
                role="status"
              >
                <strong>{result.correct ? '✓ Richtig' : '✗ Nicht richtig'}</strong> –{' '}
                {result.feedback}
                <div class="note">
                  {result.points} von {task.maxPoints} Punkten · Versuch {result.attempt} von{' '}
                  {task.maxAttempts}
                </div>
                {result.explanation && <p class="explanation">{result.explanation}</p>}
              </div>
            )}
            <div class="menu-row">
              {!result && (
                <>
                  <button
                    class="btn btn-primary"
                    disabled={!answer.complete || busy}
                    onClick={() => void check()}
                  >
                    Prüfen
                  </button>
                  {task.hintCount > st.hints.length && (
                    <button class="btn" onClick={() => void hint()}>
                      Hinweis ({task.hintCount - st.hints.length})
                    </button>
                  )}
                </>
              )}
              {result && !result.done && (
                <button class="btn btn-primary" onClick={retry}>
                  Nochmal versuchen ({result.attemptsLeft} übrig)
                </button>
              )}
              {result?.done && (
                <button class="btn btn-primary" onClick={next}>
                  Weiter
                </button>
              )}
            </div>
            <p class="note">Hinweise und weitere Versuche geben weniger Punkte.</p>
          </section>
        ) : (
          <section class="task">
            <h3>{allDone ? 'Alle Aufgaben bearbeitet!' : 'Bereit zur Auswertung'}</h3>
            <p>Sieh dir jetzt dein Ergebnis an.</p>
            <button class="btn btn-primary btn-big" disabled={busy} onClick={() => void finish()}>
              Auswertung anzeigen
            </button>
          </section>
        )}
        {!summary && task && (
          <details class="level-exit">
            <summary>Level verlassen</summary>
            <p class="note">
              Dein Durchgang bleibt einige Stunden gespeichert und kann fortgesetzt werden.
            </p>
            <div class="menu-row">
              <button class="btn" onClick={close}>
                Pausieren und zur Insel
              </button>
              <button class="btn" onClick={() => void finish()}>
                Jetzt abgeben
              </button>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}

function Summary({
  summary: s,
  title,
  onClose,
}: {
  summary: RunSummary;
  title: string;
  onClose: () => void;
}) {
  const reduced = getSettings().a11y.reducedMotion;
  const [shown, setShown] = useState(reduced ? s.stars : 0);
  useEffect(() => {
    if (shown >= s.stars) return;
    const t = setTimeout(() => {
      setShown((n) => n + 1);
      playSfx('confirm');
    }, 500);
    return () => clearTimeout(t);
  }, [shown]);
  const stars = starString(shown);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div class="summary">
        <p class="summary-stars" aria-label={starString(s.stars).text}>
          {stars.visual}
        </p>
        {shown < s.stars && (
          <button class="btn btn-small" onClick={() => setShown(s.stars)}>
            Animation überspringen
          </button>
        )}
        <p>
          {s.points} von {s.maxPoints} Punkten ·{' '}
          {s.passed ? (
            <strong>Level geschafft!</strong>
          ) : (
            'Für einen Stern brauchst du mindestens die Hälfte der Punkte.'
          )}
        </p>
        {s.preview ? (
          <p class="note">Vorschau-Modus: Es wurde nichts gespeichert und nichts ausgezahlt.</p>
        ) : (
          <ul class="rewards">
            {s.newStars > 0 && (
              <li>
                +{s.newStars} neue Sterne (Bestwert: {s.bestStars})
              </li>
            )}
            {s.currency > 0 && (
              <li>
                +{s.currency} {GAME.currency.name}
              </li>
            )}
            {s.items.map((i) => {
              const item = getItem(i.itemId);
              if (!item) return null;
              const r = RARITY_INFO[item.rarity];
              return (
                <li key={i.itemId}>
                  <span style={{ color: r.color }}>
                    {r.symbol} {item.name}
                  </span>{' '}
                  {i.duplicate
                    ? `(schon vorhanden → +${i.converted} ${GAME.currency.name})`
                    : '– neu in deiner Garderobe!'}
                </li>
              );
            })}
            {s.achievements.map((a) => (
              <li key={a}>🏆 Erfolg: {ACHIEVEMENT_BY_ID.get(a)?.name ?? a}</li>
            ))}
            {s.newStars === 0 && s.currency === 0 && s.items.length === 0 && (
              <li class="note">Belohnungen gibt es nur für neu erreichte Sterne.</li>
            )}
          </ul>
        )}
        <p class="note">{LEARNING_NOTE}</p>
        <button class="btn btn-primary btn-big" onClick={onClose}>
          Zurück zur Insel
        </button>
      </div>
    </Modal>
  );
}
