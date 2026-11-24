import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_EQUIPMENT,
  SKIN_TONES,
  STARTER_HAIR,
  getItem,
  type MeResponse,
} from '@pixel/shared';
import { get, post } from '../api/http';
import { proceed, sessionStore } from '../core/session';
import { playSfx } from '../audio/sfx';
import { renderDoll } from './doll-render';

/** First login: choose skin tone and hair colour (everything else is unlocked later). */
export function CharacterCreator() {
  const [skin, setSkin] = useState(1);
  const [hair, setHair] = useState<string>(STARTER_HAIR[0]!);
  const [dir, setDir] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const appearance = { skinTone: skin, equipped: { ...DEFAULT_EQUIPMENT, hair } };

  const create = async () => {
    try {
      await post('/api/character', { skinTone: skin, hair });
      playSfx('unlock');
      sessionStore.set({ me: await get<MeResponse>('/api/auth/me') });
      await proceed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  };

  return (
    <div class="title-screen">
      <div class="title-card onboarding-card wide" role="dialog" aria-label="Charakter erstellen">
        <h1>Deine Spielfigur</h1>
        <div class="creator">
          <div class="creator-preview">
            <DollPreview appearance={appearance} dir={dir} />
            <div class="menu-row center">
              <button
                class="btn btn-small"
                aria-label="Figur nach links drehen"
                onClick={() => setDir((d) => (d + 3) % 4)}
              >
                ◀
              </button>
              <button
                class="btn btn-small"
                aria-label="Figur nach rechts drehen"
                onClick={() => setDir((d) => (d + 1) % 4)}
              >
                ▶
              </button>
            </div>
          </div>
          <div class="creator-options">
            <fieldset>
              <legend>Hautton</legend>
              <div class="swatches">
                {SKIN_TONES.map((c, i) => (
                  <button
                    key={c}
                    class={`swatch ${skin === i ? 'swatch-active' : ''}`}
                    style={{ background: c }}
                    aria-label={`Hautton ${i + 1}`}
                    aria-pressed={skin === i}
                    onClick={() => setSkin(i)}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Haarfarbe</legend>
              <div class="swatches">
                {STARTER_HAIR.map((id) => {
                  const item = getItem(id)!;
                  return (
                    <button
                      key={id}
                      class={`swatch ${hair === id ? 'swatch-active' : ''}`}
                      style={{ background: item.tint }}
                      aria-label={item.name}
                      aria-pressed={hair === id}
                      title={item.name}
                      onClick={() => setHair(id)}
                    />
                  );
                })}
              </div>
            </fieldset>
            <p class="note">
              Weitere Frisuren, Kleidung und Accessoires schaltest du im Spiel frei – durch Level,
              Erfolge, den Shop oder deine Lehrkraft. Dein Aussehen kannst du jederzeit in der
              Garderobe ändern.
            </p>
          </div>
        </div>
        {error && (
          <p class="warning" role="alert">
            {error}
          </p>
        )}
        <button class="btn btn-primary btn-big" onClick={() => void create()}>
          Los geht’s!
        </button>
      </div>
    </div>
  );
}

export function DollPreview({
  appearance,
  dir = 0,
  scale = 6,
}: {
  appearance: Parameters<typeof renderDoll>[1];
  dir?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const reduced = document.documentElement.classList.contains('reduced-motion');
    if (reduced) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 4), 220);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (ref.current) renderDoll(ref.current, appearance, dir, frame, scale);
  });
  return (
    <canvas ref={ref} class="doll-canvas" role="img" aria-label="Vorschau deiner Spielfigur" />
  );
}
