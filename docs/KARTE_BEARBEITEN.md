# Hub-Karte bearbeiten (Tiled) und Grafiken austauschen

Die Hub-Welt liegt als Tiled-kompatible JSON-Karte unter `client/public/assets/maps/hub.json`.
Sie können sie mit dem kostenlosen Editor [Tiled](https://www.mapeditor.org/) (Version 1.10 oder neuer) bearbeiten.

## Aufbau der Karte

| Ebene       | Typ     | Zweck                                                 |
| ----------- | ------- | ----------------------------------------------------- |
| `ground`    | Kacheln | Boden (Gras, Wege, Wasser, Klippen)                   |
| `deco`      | Kacheln | Gebäude, Bäume (Stamm), Zäune, Deko                   |
| `gates`     | Kacheln | Brücke und Firewall der freischaltbaren Zonen         |
| `above`     | Kacheln | Baumkronen, über der Spielfigur gezeichnet            |
| `objects`   | Objekte | `spawn`, `portal`, `npc`                              |
| `zones`     | Objekte | Rechtecke der Zonen (Zonen-Banner, später Musik)      |
| `gateAreas` | Objekte | Bereiche, die beim Freischalten einer Zone umschalten |

**Kollision:** Jede Kachel im Tileset hat die Eigenschaft `collides` (wahr/falsch). Sie bestimmt, ob man
über die Kachel laufen kann.

**Animierte Kacheln** (Wasser, Firewall) werden in Tiled als Kachel-Animation gepflegt und vom Spiel abgespielt.

### Objekt-Eigenschaften

| Objekttyp         | Eigenschaften                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `portal` (Punkt)  | `levelId` (z. B. `demo-a`), `kind` (`terminal`, `rack`, `cave`, `frame`)                                                             |
| `npc` (Punkt)     | `npcId`, `sprite` (0–3), `lines` (Sätze mit `\|` getrennt); der Objektname ist der angezeigte Name                                   |
| `zone` (Rechteck) | `zoneId` (z. B. `datenstrand`); der Objektname ist der angezeigte Zonenname                                                          |
| `gate` (Rechteck) | `gateId` (= Zonen-ID), `mode` (`appear`: Kacheln erscheinen, z. B. eine Brücke; `vanish`: Kacheln verschwinden, z. B. eine Firewall) |

Ein Portal steht mit seiner Unterkante auf dem Punkt. Freischaltung, Titel und Beschreibung kommen nicht aus
der Karte, sondern aus den Leveldaten (ab M4, siehe `docs/LEVEL_ERSTELLEN.md`).

## Wichtig

- Die Karte wurde einmalig von `npm run assets` erzeugt. Danach wird sie **nicht mehr automatisch überschrieben**.
  Nur `npm run assets -- --map` erzeugt sie neu, und dabei gehen Ihre Änderungen verloren.
- Speichern Sie in Tiled als **JSON** und lassen Sie das Tileset **eingebettet**.
- Nach Änderungen prüfen:

  ```bash
  npm test
  ```

  Der Kartentest prüft, ob alle Portale erreichbar sind und die Zonen richtig gesperrt werden. Er nutzt
  allerdings die Generator-Daten. Bei stark veränderten Karten im Spiel selbst testen.

- Eine Vorschau der Karte als Bild erzeugen Sie so (ohne Tiled):

  ```bash
  npm run map:preview
  ```

## Grafiken austauschen

Alle Platzhalter-Grafiken erzeugt `scripts/generate-assets.ts`. Eigene oder CC0-Grafiken legen Sie mit
**gleichem Dateinamen und gleichem Raster** ab:

| Datei                        | Raster                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `assets/tilesets/tiles.png`  | 16×16-Kacheln, 16 Spalten. Die Reihenfolge entspricht `scripts/assets/tiles.ts` |
| `assets/sprites/player.png`  | 16×24 pro Bild; 4 Spalten (Laufphasen) × 4 Zeilen (unten, links, rechts, oben)  |
| `assets/sprites/npcs.png`    | wie `player.png`, je NPC 4 Zeilen untereinander                                 |
| `assets/sprites/portals.png` | 32×32 pro Bild; je Portal-Art 2 Animationsbilder (terminal, rack, cave, frame)  |

Tragen Sie neue Assets anschließend in `ASSETS_LICENSES.md` ein. Achtung: `npm run assets` überschreibt die
PNG-Dateien. Nach dem Austausch das Skript also nicht mehr ausführen oder die Dateien vorher sichern.
