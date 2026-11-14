# LineDancer

Line-Dance-Schritte in 3D lernen: LineDancer liest eine Schrittbeschreibung, übersetzt den Text in Bewegungen und lässt eine stilisierte Figur den Tanz vortanzen.

**Direkt im Browser starten: <https://bric.github.io/linedancer/>**

## Bedienung

Einen Tanz laden – drei Wege:

- **Einfügen:** Die Seite mit der Schrittbeschreibung im Browser öffnen (z. B. auf [get-in-line.de](https://www.get-in-line.de) oder [copperknob.co.uk](https://www.copperknob.co.uk)), alles markieren und kopieren. In LineDancer dann einfach **Strg/Cmd+V** drücken oder auf **Einfügen** klicken.
- **Datei:** Die Seite speichern und die Datei ins LineDancer-Fenster ziehen oder über **Datei öffnen** wählen (`.html` oder `.txt`).
- **Meine Tänze:** Jeder geladene Tanz wird im Browser gemerkt und steht danach unter **Meine Tänze** bereit – der Import ist pro Tanz nur einmal nötig. Die Liste liegt nur in diesem Browser auf diesem Gerät.

Danach:

- **Leertaste** startet und pausiert, **←/→** gehen eine Zählzeit zurück bzw. vor.
- Ein Klick auf eine Zeile der Schrittliste springt dorthin; die aktuelle Zeile ist hervorgehoben.
- **Tempo** und **BPM** regeln die Geschwindigkeit, **Abschnitt wiederholen** übt einen Abschnitt in Schleife, das **Metronom** klickt die Schläge mit.
- Kamera: von hinten, von vorn, von oben – oder frei mit der Maus drehen.
- Das linke Bein der Figur ist blau, das rechte rot; Hut und Nase zeigen die Blickrichtung, am Boden liegen die Wandmarken 12/3/6/9 Uhr.

## Welche Beschreibungen werden verstanden?

Erwartet werden pro Zeile die Zählzeiten und die Beschreibung, zum Beispiel:

```
1-2  Schritt nach vorn mit rechts - Linken Fuß neben rechtem auftippen
3&4  Schritt nach rechts mit rechts - Linken Fuß an rechten heransetzen und Schritt nach rechts mit rechts
5-8  Walk around ¾ turn over R shoulder stepping on R, L, R, L (9:00)
```

- **Deutsch** im Stil von get-in-line.de und **Englisch** im Stil von Copperknob.
- Schritte, Kreuzen, Heransetzen, Auftippen, Kicks, Stomps, Hitches, Hooks, Scuffs, Rock Steps, Drehungen, Hacken- und Spitzen-Swivels, Heel Bounces, Hüftschwünge, Klatschen.
- Benannte Figuren: Shuffle/Chassé, Coaster Step, Vine, Sailor Step, Jazz Box.
- Rückverweise wie „Wie 1-4“ oder „Wie Schrittfolge S1, aber spiegelbildlich“.

Was nicht erkannt wird, ist in der Schrittliste mit ⚠ markiert; die Figur hält an dieser Stelle.

## Grenzen

- Die Auswertung ist regelbasiert und deckt das übliche Vokabular ab, nicht beliebige Freitexte.
- Restarts, Tags und Endings werden angezeigt (Tags und Endings sind einzeln abspielbar), aber nicht automatisch in den Ablauf eingebaut.
- Es wird keine Musik abgespielt.
- Stilhinweise in Klammern werden überwiegend ignoriert.

## Lokal ausführen

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Tests
npm run build    # statischer Build nach dist/
```

## Technik

Vanilla JavaScript mit [three.js](https://threejs.org) und [Vite](https://vite.dev).

```
Text/HTML → src/sheet/extract.js   Titel, Abschnitte, Zeilen
          → src/sheet/parse.js     deutscher Text → Bewegungen pro Zählzeit
            src/sheet/parseEn.js   englischer Text → Bewegungen pro Zählzeit
          → src/choreo/simulate.js Fußpositionen, Blickrichtung, Gewicht je Zählzeit
          → src/player/player.js   Interpolation zwischen den Zählzeiten
          → src/figure/            Figur mit Bein- und Arm-IK
```

Die Seite wird bei jedem Push auf `main` per GitHub Actions gebaut und auf GitHub Pages veröffentlicht (`.github/workflows/deploy.yml`).

## Hinweis

Die Rechte an den Choreografien und Schrittbeschreibungen liegen bei den jeweiligen Choreografen und Seitenbetreibern. LineDancer selbst enthält keine Tanzsammlung; die Dateien unter `tests/fixtures/` dienen nur als Testdaten.
