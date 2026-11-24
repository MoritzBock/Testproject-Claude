# Asset-Lizenzen

In diesem Projekt dürfen nur Assets verwendet werden, deren Nutzung rechtlich geklärt ist.
Für jedes Asset, das nicht selbst erzeugt wurde, kommt hier ein Eintrag hinein.

| Datei / Ordner              | Herkunft                  | Urheber/in | Lizenz      | Nachweis (URL / Datum) |
| --------------------------- | ------------------------- | ---------- | ----------- | ---------------------- |
| `client/public/favicon.svg` | selbst erstellt (Projekt) | Projekt    | wie Projekt | –                      |

## Programmatisch erzeugte Platzhalter

Folgende Dateien erzeugt `scripts/generate-assets.ts` vollständig im Projekt. Sie enthalten keine fremden
Werke, Vorlagen oder Fremdgrafiken:

- `client/public/assets/tilesets/tiles.png`: Kacheln der Bit-Insel
- `client/public/assets/sprites/player.png`, `npcs.png`: Spielfigur und NPCs
- `client/public/assets/sprites/portals.png`: Portale
- `client/public/assets/maps/hub.json`: Hub-Karte (Tiled-Format)
- UI-Symbole: `client/src/ui/icons.ts` (Inline-SVG)
- Soundeffekte: zur Laufzeit per Web Audio synthetisiert (`client/src/audio/sfx.ts`)

Schriften: Es werden keine Web-Fonts eingebunden. Die Oberfläche nutzt die Systemschrift des Geräts.

## Eigene oder CC0-Assets einbinden

1. Die Datei unter gleichem Namen und gleichem Raster in `client/public/assets/…` ablegen
   (das Raster ist in `docs/LEVEL_ERSTELLEN.md` bzw. in der Asset-Doku beschrieben).
2. Hier einen Eintrag ergänzen, mit Lizenz und Link zur Quelle.
3. Bei CC-BY-Assets die Namensnennung zusätzlich im Spiel unter „Mitwirkende“ eintragen (ab M8).
