import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCounts } from '../src/sheet/counts.js';
import { extractSheet } from '../src/sheet/extract.js';
import { parseRow, resolveReferences } from '../src/sheet/parse.js';
import { buildChoreo, mod360 } from '../src/choreo/simulate.js';
import { Timeline } from '../src/player/player.js';
import { listDances, saveDance, removeDance, compactSource } from '../src/sheet/library.js';

const html = readFileSync(new URL('./fixtures/my-mama-said.htm', import.meta.url), 'utf8');
const beats = (l) => parseCounts(l).map((s) => s.beat);

describe('counts', () => {
  it('parses labels', () => {
    expect(beats('1-2')).toEqual([0, 1]);
    expect(beats('3&4')).toEqual([2, 2.5, 3]);
    expect(beats('&7-8')).toEqual([5.5, 6, 7]);
    expect(beats('&1-2')).toEqual([-0.5, 0, 1]);
    expect(beats('5-8')).toEqual([4, 5, 6, 7]);
    expect(beats('7&8&')).toEqual([6, 6.5, 7, 7.5]);
    expect(parseCounts('&', 3).map((s) => s.beat)).toEqual([3.5]);
  });
});

describe('extract', () => {
  const sheet = extractSheet(html);
  it('reads metadata and structure', () => {
    expect(sheet.title).toBe('My Mama Said');
    expect(sheet.choreo).toBe('Maddison Glover');
    expect(sheet.counts).toBe(48);
    expect(sheet.walls).toBe(2);
    expect(sheet.sections).toHaveLength(6);
    expect(sheet.sections.every((s) => s.rows.length === 4)).toBe(true);
    expect(sheet.extras).toHaveLength(1);
    expect(sheet.extras[0].kind).toBe('ending');
    expect(sheet.extras[0].rows).toHaveLength(3);
    expect(sheet.sections[0].rows[3].text).toContain('¼ Drehung rechts herum');
  });
  it('keeps notes without counts, such as restarts', () => {
    const s = extractSheet('<DIV class=pro_o>S1: x</DIV><DIV class=pro_l>1-2</DIV><DIV class=pro_s>Schritt nach vorn mit rechts - Halten</DIV><DIV class=pro_l>&nbsp;</DIV><DIV class=pro_s>(<font color="#FF00FF">Restart:</font> In der 4. Runde - Richtung 12 Uhr - hier abbrechen und von vorn beginnen)</DIV><DIV class=pro_l>3-4</DIV><DIV class=pro_s>Schritt nach vorn mit links - Halten</DIV>');
    expect(s.sections[0].rows).toHaveLength(2);
    expect(s.sections[0].rows[0].note).toBe('(Restart: In der 4. Runde - Richtung 12 Uhr - hier abbrechen und von vorn beginnen)');
    expect(s.sections[0].rows[1].note).toBeUndefined();
  });
  it('reads text copied from a get-in-line page', () => {
    const t = extractSheet(`My Mama Said
Choreographie: Maddison Glover
Beschreibung:48 count, 2 wall, intermediate line dance; 0 restarts, 1 ending
Musik:My Mama Said von The Stompers
S1: Step, step, back 2
1-2Schritt nach vorn mit rechts - Kleinen Schritt nach vorn mit links
3-4
Kleinen Schritt nach hinten mit rechts - Halten
&5-6Schritt nach links mit links und rechten Fuß an linken heransetzen - Halten
Wiederholung bis zum Ende
Ending/Ende  (nach Ende der 7. Runde - 6 Uhr)
Stomp forward, clap
1-2Rechten Fuß vorn aufstampfen - Klatschen`);
    expect(t.title).toBe('My Mama Said');
    expect(t.choreo).toBe('Maddison Glover');
    expect([t.counts, t.walls]).toEqual([48, 2]);
    expect(t.sections).toHaveLength(1);
    expect(t.sections[0].rows.map((r) => r.counts)).toEqual(['1-2', '3-4', '&5-6']);
    expect(t.sections[0].rows[1].text).toBe('Kleinen Schritt nach hinten mit rechts - Halten');
    expect(t.extras).toHaveLength(1);
    expect(t.extras[0].note).toBe('nach Ende der 7. Runde - 6 Uhr');
    expect(t.extras[0].rows).toHaveLength(1);
  });
  it('reads copied text where several rows run together on one line', () => {
    const t = extractSheet(`

Va Va Test
Choreographie: Erika Muster
Beschreibung:32 count, 4 wall, improver line dance; 0 restarts, 0 tags Musik:Ein Lied von Jemand Hinweis:Der Tanz beginnt nach 32 Taktschlägen
S1: Rock across, shuffle
1&Rechten Fuß über linken kreuzen und Gewicht zurück auf den linken Fuß 2&Schritt nach rechts mit rechts und Gewicht zurück auf den linken Fuß 3&4⅛ Drehung rechts herum und Schritt nach vorn mit rechts - Linken Fuß an rechten heransetzen und Schritt nach vorn mit rechts (1:30) 5-84 Schritte nach hinten (r - l - r - l)
(Restart: In der 3. Runde hier abbrechen)
S2: Walk
1-2Schritt nach vorn mit rechts - ½ Drehung links herum auf beiden Ballen, Gewicht am Ende links (7:30) 3-42 Schritte nach vorn (r - l)
Wiederholung bis zum Ende
 
Erika Muster
 Adresse: Irgendwo Links: [eMail] [Homepage]
Aufnahme: 19.10.2026; Stand: 02.11.2026`);
    expect(t.title).toBe('Va Va Test');
    expect(t.choreo).toBe('Erika Muster');
    expect(t.music).toBe('Ein Lied von Jemand');
    expect(t.hint).toBe('Der Tanz beginnt nach 32 Taktschlägen');
    expect([t.counts, t.walls]).toEqual([32, 4]);
    expect(t.sections.map((s) => s.title)).toEqual(['S1: Rock across, shuffle', 'S2: Walk']);
    expect(t.sections[0].rows.map((r) => r.counts)).toEqual(['1&', '2&', '3&4', '5-8']);
    expect(t.sections[0].rows[2].text).toBe('⅛ Drehung rechts herum und Schritt nach vorn mit rechts - Linken Fuß an rechten heransetzen und Schritt nach vorn mit rechts (1:30)');
    expect(t.sections[0].rows[3].text).toBe('4 Schritte nach hinten (r - l - r - l)');
    expect(t.sections[0].rows[3].note).toBe('(Restart: In der 3. Runde hier abbrechen)');
    expect(t.sections[1].rows.map((r) => r.counts)).toEqual(['1-2', '3-4']);
    expect(t.sections[1].rows[1].text).toBe('2 Schritte nach vorn (r - l)');
    // kein falsches Trennen, wenn die Zählzeiten ordentlich abgesetzt sind
    expect(extractSheet('T\n9-12 Schritte nach vorn mit rechts - Halten - Halten - Halten').sections[0].rows[0].counts).toBe('9-12');
    const all = [...t.sections, ...t.extras].flatMap((s) => s.rows);
    buildChoreo(t);
    expect(all.flatMap((r) => r.warnings)).toEqual([]);
  });
  it('reads plain text', () => {
    const t = extractSheet('Testtanz\nBeschreibung: 16 count, 4 wall\nS1: Walk\n1-2\tSchritt nach vorn mit rechts - Schritt nach vorn mit links\n3&4 Schritt nach vorn mit rechts - Linken Fuß an rechten heransetzen und Schritt nach vorn mit rechts');
    expect(t.title).toBe('Testtanz');
    expect(t.walls).toBe(4);
    expect(t.sections[0].rows.map((r) => r.counts)).toEqual(['1-2', '3&4']);
  });
});

describe('parse', () => {
  const types = (counts, text) => parseRow({ counts, text }).actions.map((a) => a.moves.map((m) => m.type + (m.foot || '')).join('+'));
  it('maps clauses to counts', () => {
    expect(types('&7-8', 'Schritt nach rechts mit rechts (etwas nach vorn), ⅛ Drehung links herum und linken Fuß neben rechtem auftippen - Halten (1:30)')).toEqual(['stepR', 'touchL', 'hold']);
    expect(types('5&6', 'Rechten Fuß flach neben linkem auftippen - Rechte Hacke heben und senken (Gewicht bleibt links)')).toEqual(['touchR', 'heelUpR', 'heelDownR']);
    expect(types('5-8', '3 stampfende Schritte nach vorn (r - l - r) - Linkes Knie anheben/rechte Hand (Faust) nach oben')).toEqual(['stepR', 'stepL', 'stepR', 'hitchL+armR']);
    expect(types('5-6', 'Rechten Fuß im Kreis nach hinten schwingen und hinter linken kreuzen - Schritt nach links mit links')).toEqual(['crossR', 'stepL']);
    expect(types('1-2', 'Sprung nach hinten mit links/rechten Fuß nach vorn kicken - Schritt nach vorn mit rechts')).toEqual(['stepL+kickR', 'stepR']);
  });
  it('handles repeats, hip sways and bare directions', () => {
    expect(types('3-4', 'Rechte Hacke vorn 2x auftippen')).toEqual(['touchR', 'touchR']);
    expect(types('1-2', 'Hüften 2x nach vorn schwingen')).toEqual(['hips', 'hips']);
    const a = parseRow({ counts: '5-8', text: 'Hüften nach vorn, hinten, vorn und wieder nach hinten schwingen' }).actions;
    expect(a.map((x) => x.moves[0].type)).toEqual(['hips', 'hips', 'hips', 'hips']);
    expect(a.map((x) => x.moves[0].dir.fwd)).toEqual([1, -1, 1, -1]);
  });
  it('resolves back-references, optionally mirrored', () => {
    const rows = [
      { counts: '1-2', text: 'Schritt nach rechts mit rechts - Linken Fuß an rechten heransetzen' },
      { counts: '3-4', text: 'Wie 1-2' },
      { counts: '5-6', text: 'Wie 1-2, aber spiegelbildlich nach links' },
    ];
    for (const r of rows) r.parsed = parseRow(r);
    resolveReferences([{ rows }]);
    expect(rows[1].parsed.actions.map((a) => [a.label, a.beat, a.moves[0].type + a.moves[0].foot])).toEqual([['3', 2, 'stepR'], ['4', 3, 'togetherL']]);
    expect(rows[2].parsed.actions.map((a) => a.moves[0].foot)).toEqual(['L', 'R']);
    expect(rows[2].parsed.actions[0].moves[0].dir.side).toBe(-1);
    expect(rows[2].parsed.unknown).toBe(false);
  });
  it('touches behind the other foot', () => {
    const a = parseRow({ counts: '1-2', text: 'Schritt nach rechts mit rechts - Linke Fußspitze hinter rechtem Fuß auftippen' }).actions;
    expect(a[1].moves[0]).toMatchObject({ type: 'touch', foot: 'L', part: 'toe', cross: 'behind' });
    const s = buildChoreo(extractSheet('T\n1-2 Schritt nach rechts mit rechts - Linke Fußspitze hinter rechtem Fuß auftippen\n3-4 Schritt nach links mit links - Rechte Fußspitze hinter linkem Fuß auftippen')).main.events;
    // 12 Uhr = -z: "hinter" heißt größeres z; gekreuzt heißt auf der anderen Seite des Standfußes
    expect(s[1].state.feet.L.z).toBeGreaterThan(s[1].state.feet.R.z + 0.15);
    expect(s[1].state.feet.L.x).toBeGreaterThan(s[1].state.feet.R.x);
    expect(s[3].state.feet.R.z).toBeGreaterThan(s[3].state.feet.L.z + 0.15);
    expect(s[3].state.feet.R.x).toBeLessThan(s[3].state.feet.L.x);
    expect(s[3].state.weight).toBe('L');
  });
  it('brings the trailing foot level after a diagonal step', () => {
    const s = buildChoreo(extractSheet('T\n1-2 Schritt nach schräg rechts vorn mit rechts - Halten\n3-4 Kleinen Schritt nach links mit links - Halten')).main.events;
    const start = s[0].state.feet.L;
    const { L, R } = s[2].state.feet;
    expect(L.z).toBeCloseTo(R.z); // auf gleicher Höhe wie der rechte Fuß
    expect(L.z).toBeLessThan(start.z - 0.25); // also deutlich nach vorn gewandert
    expect(L.x).toBeLessThan(R.x - 0.3); // und links vom rechten Fuß
    expect(s[2].state.weight).toBe('L');
  });
  it('steps back normally after a scuff', () => {
    const s = buildChoreo(extractSheet('T\n1-2 Schritt nach vorn mit rechts - Linken Fuß nach vorn schwingen, Hacke am Boden schleifen lassen\n3-4 Schritt nach vorn mit links - Rechten Fuß nach vorn schwingen, Hacke am Boden schleifen lassen\n5-8 4 Schritte nach hinten (r - l - r - l)')).main.events;
    const gap = (i) => s[i].state.feet.R.gz - s[i].state.feet.L.gz; // > 0: rechts steht weiter hinten
    expect(gap(4)).toBeCloseTo(0.42); // erster Rückwärtsschritt: eine normale Schrittlänge hinter links
    expect(gap(5)).toBeCloseTo(-0.42);
    expect(gap(6)).toBeCloseTo(0.42);
    expect(gap(7)).toBeCloseTo(-0.42);
  });
  it('spreads a turn over repeated heel bounces', () => {
    const row = { counts: '5-8', text: 'Schritt nach vorn mit rechts - Beide Hacken 3x heben und senken, dabei eine ½ Drehung links herum, Gewicht am Ende links (6 Uhr)' };
    const a = parseRow(row);
    expect(a.unknown || a.uncertain).toBe(false);
    expect(a.actions.map((x) => x.moves[0].type)).toEqual(['step', 'bounce', 'bounce', 'bounce']);
    expect(a.actions.slice(1).map((x) => x.moves[0].turn.frac)).toEqual([1 / 6, 1 / 6, 1 / 6]);
    expect(a.actions.map((x) => x.moves[0].weightEnd)).toEqual([undefined, undefined, undefined, 'L']);
    const ev = buildChoreo(extractSheet(`T\n${row.counts} ${row.text}`)).main.events.filter((e) => e.round === 0);
    expect(ev.map((e) => Math.round(mod360(e.state.theta)))).toEqual([0, 300, 240, 180]);
    expect(ev.map((e) => e.state.weight)).toEqual(['R', 'R', 'R', 'L']);
    expect(ev[3].state.feet.R.rot).toBeCloseTo(ev[3].state.theta);
    expect(ev[2].state.fx.bounce).toEqual(['L', 'R']);
    // weiterhin: heben und senken auf zwei Zählzeiten, wenn kein "3x" dabeisteht
    expect(types('5&6', 'Rechten Fuß flach neben linkem auftippen - Rechte Hacke heben und senken')).toEqual(['touchR', 'heelUpR', 'heelDownR']);
  });
  it('walks a ¾ circle and fans single heels (Ziggy)', () => {
    const run = (text) => buildChoreo(extractSheet(text)).main.events.filter((e) => e.round === 0);
    const row = { counts: '5-8', text: '4 Schritte nach vorn auf einem ¾ Kreis rechts herum (r - l - r - l) (9 Uhr)' };
    const a = parseRow(row);
    expect(a.unknown || a.uncertain).toBe(false);
    expect(a.actions.map((x) => x.moves[0].foot)).toEqual(['R', 'L', 'R', 'L']);
    expect(a.actions.map((x) => x.moves[0].turn)).toEqual(Array(4).fill({ frac: 0.1875, dir: 'R' }));
    expect(a.actions.map((x) => x.moves[0].dir)).toEqual(Array(4).fill({ side: 0, fwd: 1 }));
    const circle = run(`T\n${row.counts} ${row.text}`);
    expect(circle.map((e) => mod360(e.state.theta))).toEqual([67.5, 135, 202.5, 270]);
    expect(buildChoreo(extractSheet(`T\n${row.counts} ${row.text}`)).main.rounds).toBe(4);

    const fan = run('T\n5-6 Rechte Hacke nach außen drehen - Rechte Hacke wieder zurück drehen\n7-8 Linke Hacke nach außen drehen - Linke Hacke wieder zurück drehen');
    const rot = (i, f) => fan[i].state.feet[f].rot;
    expect([rot(0, 'R'), rot(0, 'L')]).toEqual([-35, 0]); // rechte Hacke nach rechts = Spitze nach links
    expect(rot(1, 'R')).toBe(0);
    expect([rot(2, 'L'), rot(2, 'R')]).toEqual([35, 0]);
    expect(rot(3, 'L')).toBe(0);
    // Der Ballen bleibt stehen, die Hacke (Knöchel) schwenkt nach außen – nicht die Fußspitze
    const ballOf = (ft) => [ft.x + Math.sin((ft.rot * Math.PI) / 180) * 0.14, ft.z - Math.cos((ft.rot * Math.PI) / 180) * 0.14];
    const [r0, r1, l2] = [fan[0].state.feet.R, fan[1].state.feet.R, fan[2].state.feet.L];
    expect(ballOf(r0)[0]).toBeCloseTo(ballOf(r1)[0]);
    expect(ballOf(r0)[1]).toBeCloseTo(ballOf(r1)[1]);
    expect(r0.x - r1.x).toBeGreaterThan(0.07); // rechte Hacke nach rechts
    expect(l2.x - fan[3].state.feet.L.x).toBeLessThan(-0.07); // linke Hacke nach links
    expect([r1.x, r1.z]).toEqual([r1.gx, r1.gz]);
  });
  it('treats "Fuß etwas anheben" as styling of the rock step', () => {
    const row = { counts: '5-6', text: 'Schritt nach vorn mit links, rechten Fuß etwas anheben - Gewicht zurück auf den rechten Fuß' };
    const a = parseRow(row);
    expect(a.unknown || a.uncertain).toBe(false);
    expect(a.actions.map((x) => x.moves.map((m) => m.type + m.foot).join('+'))).toEqual(['stepL+hookR', 'recoverR']);
    const ev = buildChoreo(extractSheet(`T\n1-2 2 Schritte nach vorn (r - l)\n3-4 Schritt nach vorn mit rechts - Halten\n${row.counts} ${row.text}`)).main.events.filter((e) => e.round === 0);
    const [rock, rec] = [ev[4].state, ev[5].state];
    expect(rock.weight).toBe('L');
    expect(rock.feet.R.y).toBeGreaterThan(0.05); // rechter Fuß leicht angehoben …
    expect([rock.feet.R.x, rock.feet.R.z]).toEqual([rock.feet.R.gx, rock.feet.R.gz]); // … an seinem Platz
    expect(rec.weight).toBe('R');
    expect(rec.feet.R.y).toBe(0);
    expect(types('3-4', 'Rechten Fuß hinter linkem Bein anheben - Rechten Fuß an linken heransetzen')).toEqual(['hookR', 'togetherR']);
    expect(types('1-2', 'Linken Fuß anheben - Halten')).toEqual(['hookL', 'hold']);
  });
  it('handles the Hoedown vocabulary', () => {
    // Abschnitt per Namen spiegeln
    const rows1 = [{ counts: '1-2', text: 'Schritt nach vorn mit rechts - Linken Fuß neben rechtem auftippen' }];
    const rows2 = [{ counts: '1-2', text: 'Wie Schrittfolge S1, aber spiegelbildlich mit links beginnend' }];
    for (const r of [...rows1, ...rows2]) r.parsed = parseRow(r);
    resolveReferences([{ title: 'S1: Step, touch', rows: rows1 }, { title: 'S2: Step, touch', rows: rows2 }]);
    expect(rows2[0].parsed.unknown).toBe(false);
    expect(rows2[0].parsed.actions.map((a) => a.moves[0].type + a.moves[0].foot)).toEqual(['stepL', 'touchR']);

    // wandernde Swivels: Hacken, Spitzen, Hacken, Spitzen nach links
    const row = { counts: '5-8', text: 'Beide Hacken, Fußspitzen, Hacken und wieder Fußspitzen nach links drehen' };
    const a = parseRow(row);
    expect(a.unknown || a.uncertain).toBe(false);
    expect(a.actions.map((x) => x.moves[0].type + ':' + x.moves[0].part)).toEqual(['swivel:heel', 'swivel:toe', 'swivel:heel', 'swivel:toe']);
    const ev = buildChoreo(extractSheet(`T\n1-4 ${row.text}\n5-6 Schritt nach vorn mit rechts - Halten`)).main.events;
    expect(ev.slice(0, 4).map((e) => e.state.feet.R.rot)).toEqual([35, -35, 35, -35]);
    const xs = ev.slice(0, 4).map((e) => e.state.feet.L.x);
    expect(xs[2]).toBeLessThan(xs[0] - 0.1); // Hacken wandern nach links
    expect(xs[1]).toBe(xs[0]); // Spitzen drehen um die Hacke
    expect(ev[4].state.feet.L.rot).toBe(0); // beim nächsten Schritt stehen die Füße wieder gerade
    expect(ev[4].state.feet.R.rot).toBe(0);

    // Hook vor dem Schienbein ist eine Bewegung
    expect(types('7-8', 'Rechte Hacke vorn auftippen - Rechten Fuß anheben und vor linkem Schienbein kreuzen')).toEqual(['touchR', 'hookR']);
  });
  it('lifts the knee across the other leg', () => {
    const a = parseRow({ counts: '3&4', text: 'Rechte Fußspitze rechts auftippen - Rechtes Knie über linkes anheben und rechte Fußspitze rechts auftippen' }).actions;
    expect(a.map((x) => x.moves[0].type + x.moves[0].foot)).toEqual(['touchR', 'hitchR', 'touchR']);
    expect(a[1].moves[0].across).toBe(true);
    expect(parseRow({ counts: '1', text: 'Linkes Knie anheben' }).actions[0].moves[0].across).toBe(false);
  });
  it('animates repeated kicks and touches (Miles On It)', () => {
    expect(types('1-4', '3 Schritte nach vorn (r - l . r) - Linken Fuß nach vorn kicken')).toEqual(['stepR', 'stepL', 'stepR', 'kickL']);
    const tl = new Timeline(buildChoreo(extractSheet('T\n1-2 Rechten Fuß 2x nach vorn kicken\n3-4 Rechte Hacke vorn 2x auftippen')).main);
    const [k1, k2, t1, t2] = tl.events;
    expect(k1.state.fx.repeat).toBeUndefined();
    expect(k2.state.fx.repeat).toBe('R');
    expect(t1.state.fx.repeat).toBeUndefined();
    expect(t2.state.fx.repeat).toBe('R');
    // zwischen den beiden Kicks wird der Fuß zurückgenommen …
    const mid = tl.sample(0.6).pose.feet.R;
    expect(mid.y).toBeLessThan(k1.state.feet.R.y - 0.1);
    expect(Math.abs(mid.z)).toBeLessThan(Math.abs(k1.state.feet.R.z) - 0.1);
    // … und landet wieder in der Kick-Position
    expect(tl.sample(1).pose.feet.R.y).toBeCloseTo(k1.state.feet.R.y);
    // zwischen den beiden Hacken-Tipps hebt der Fuß kurz ab
    expect(tl.sample(2.6).pose.feet.R.y).toBeGreaterThan(t1.state.feet.R.y + 0.05);
  });
  it('keeps turns and clocks', () => {
    const a = parseRow({ counts: '7-8', text: 'Rechten Fuß über linken kreuzen - ¼ Drehung rechts herum und Schritt nach hinten mit links (3 Uhr)' }).actions;
    expect(a[1].moves[0]).toMatchObject({ type: 'step', foot: 'L', turn: { frac: 0.25, dir: 'R' }, dir: { side: 0, fwd: -1 } });
    expect(a[1].clock).toBe(90);
  });
  it('recognises every row of the fixture', () => {
    const sheet = extractSheet(html);
    for (const sec of [...sheet.sections, ...sheet.extras]) {
      for (const row of sec.rows) {
        const p = parseRow(row);
        expect(p.unknown, row.text).toBe(false);
        expect(p.uncertain, row.text).toBe(false);
      }
    }
  });
});

describe('english sheets', () => {
  const text = readFileSync(new URL('./fixtures/english-sample.txt', import.meta.url), 'utf8');
  const sheet = extractSheet(text);
  const choreo = buildChoreo(sheet);
  const types = (counts, t) => parseRow({ counts, text: t }).actions.map((a) => a.moves.map((m) => m.type + (m.foot || '')).join('+'));

  it('reads Copperknob-style text with counts glued to the description', () => {
    expect(sheet.title).toBe('');
    expect(sheet.hint).toBe('32-count intro');
    expect(sheet.sections.map((s) => s.rows.length)).toEqual([4, 3, 4, 4]);
    expect(sheet.sections[0].title).toMatch(/^CHASSE R/);
    expect(sheet.sections[0].rows[0]).toEqual({ counts: '1&2', text: 'Step to R on R foot, step on L foot beside R, step to R on R foot', parsed: expect.anything(), warnings: [] });
    expect(sheet.extras).toHaveLength(1);
    expect(sheet.extras[0].rows).toHaveLength(2);
  });
  it('recognises every row', () => {
    for (const r of [...sheet.sections, ...sheet.extras].flatMap((s) => s.rows)) expect(r.warnings, r.text).toEqual([]);
  });
  it('maps the vocabulary', () => {
    expect(types('1&2', 'Step to R on R foot, step on L foot beside R, step to R on R foot')).toEqual(['stepR', 'togetherL', 'stepR']);
    expect(types('3-4', 'Rock back on L foot, recover weight onto R')).toEqual(['stepL', 'recoverR']);
    expect(types('1-2', 'Step forward on R foot, kick L foot forward')).toEqual(['stepR', 'kickL']);
    expect(types('5-6', 'Fan R heel out to R, bring R heel back to centre')).toEqual(['swivelR', 'swivelR']);
    expect(types('1-2', 'Step forward on R, pivot ½ L')).toEqual(['stepR', 'pivot']);
    expect(types('1-2', 'Cross R over L, step L back')).toEqual(['crossR', 'stepL']);
    expect(types('1-2', 'Step R forward and touch L beside R')).toEqual(['stepR', 'touchL']);
    expect(types('1&2', 'Shuffle forward R-L-R')).toEqual(['stepR', 'togetherL', 'stepR']);
    expect(types('3&4', 'L coaster step')).toEqual(['stepL', 'togetherR', 'stepL']);
    expect(types('7-8', 'Stomp R beside L, hold')).toEqual(['stompR', 'hold']);
  });
  it('expands vine, sailor step and jazz box', () => {
    expect(types('1-4', 'Vine R')).toEqual(['stepR', 'crossL', 'stepR', 'touchL']);
    expect(types('1-3', 'Grapevine to the left')).toEqual(['stepL', 'crossR', 'stepL']);
    expect(types('1-4', 'Vine L, scuff R')).toEqual(['stepL', 'crossR', 'stepL', 'scuffR']);
    expect(types('5-8', 'Vine L with ¼ turn L and brush')).toEqual(['stepL', 'crossR', 'stepL', 'scuffR']);
    expect(types('3&4', 'R sailor step')).toEqual(['crossR', 'stepL', 'stepR']);
    expect(types('5&6', 'Sailor step L, R, L')).toEqual(['crossL', 'stepR', 'stepL']);
    expect(types('1-4', 'Jazz box R')).toEqual(['crossR', 'stepL', 'stepR', 'stepL']);
    expect(types('5-8', 'Jazz box ¼ turn R, touch')).toEqual(['crossR', 'stepL', 'stepR', 'touch']);
    expect(types('5-8', 'Jazz box R with touch')).toEqual(['crossR', 'stepL', 'stepR', 'touchL']);
    expect(types('1-4', 'Vine R: step R to side, cross L behind R, step R to side, touch L beside R')).toEqual(['stepR', 'crossL', 'stepR', 'touchL']);
    // auch in deutschen Zeilen
    expect(types('1-4', 'Vine nach rechts')).toEqual(['stepR', 'crossL', 'stepR', 'touchL']);
    expect(types('1-4', 'Jazz Box mit ¼ Drehung rechts herum')).toEqual(['crossR', 'stepL', 'stepR', 'stepL']);
    expect(types('3&4', 'Sailor Step links')).toEqual(['crossL', 'stepR', 'stepL']);

    const turnOf = (counts, t, i) => parseRow({ counts, text: t }).actions[i].moves[0].turn;
    expect(turnOf('5-8', 'Vine L with ¼ turn L and brush', 2)).toEqual({ frac: 0.25, dir: 'L' });
    expect(turnOf('5-8', 'Jazz box ¼ turn R, touch', 2)).toEqual({ frac: 0.25, dir: 'R' });

    const run = (text) => buildChoreo(extractSheet(text)).main.events.filter((e) => e.round === 0);
    const vine = run('T\n1-4 Vine R');
    expect(vine[3].state.feet.R.gx - vine[0].state.feet.L.gx).toBeGreaterThan(0.7); // deutlich nach rechts gewandert
    expect(vine[3].state.weight).toBe('R');
    const jazz = run('T\n1-4 Jazz box ¼ turn R');
    expect(mod360(jazz[3].state.theta)).toBe(90);
    for (const e of [...vine, ...jazz, ...run('T\n1&2 R sailor step')]) {
      const { L, R } = e.state.feet;
      expect(Math.hypot(L.gx - R.gx, L.gz - R.gz)).toBeLessThan(0.95);
    }
  });
  it('walks around a ¾ turn and comes out on 9 o’clock', () => {
    const a = sheet.sections[1].rows[2].parsed.actions;
    expect(a.map((x) => x.moves[0].foot)).toEqual(['R', 'L', 'R', 'L']);
    expect(a.every((x) => x.moves[0].turn.frac === 0.1875)).toBe(true);
    expect(a[3].clock).toBe(270);
    expect(choreo.main.roundLen).toBe(32);
    expect(choreo.main.rounds).toBe(4);
    expect(mod360(choreo.main.events.filter((e) => e.round === 0).at(-1).state.theta)).toBe(270);
  });
  it('keeps the V-step feet level and returns to centre', () => {
    const ev = choreo.main.events.filter((e) => e.round === 0 && e.section === 3);
    // Blick 9 Uhr: vorn = -x, rechts = -z
    const { L, R } = ev[1].state.feet;
    expect(L.x).toBeCloseTo(R.x);
    expect(Math.abs(L.z - R.z)).toBeGreaterThan(0.4);
    const end = ev[3].state.feet;
    expect(Math.hypot(end.L.x - end.R.x, end.L.z - end.R.z)).toBeCloseTo(0.24);
  });
  it('starts the tag facing the back wall', () => {
    expect(mod360(choreo.extras[0].initial.theta)).toBe(180);
    expect(mod360(choreo.extras[0].events.at(-1).state.theta)).toBe(270);
  });
  it('still treats German rows as German', () => {
    expect(types('1-2', 'Schritt nach vorn mit rechts - Linken Fuß an rechten heransetzen')).toEqual(['stepR', 'togetherL']);
  });
});

describe('simulate', () => {
  const sheet = extractSheet(html);
  const choreo = buildChoreo(sheet);
  const facingAfter = (key, round = 0) =>
    mod360(choreo.main.events.filter((e) => e.rowKey === key && e.round === round).at(-1).state.theta);

  it('builds 2 rounds of 48 counts', () => {
    expect(choreo.main.roundLen).toBe(48);
    expect(choreo.main.rounds).toBe(2);
    expect(choreo.main.cyclic).toBe(true);
    expect(choreo.main.length).toBe(96);
    expect(mod360(choreo.main.drift.theta)).toBe(0);
  });
  it('faces the walls named in the sheet', () => {
    expect(facingAfter('m:0:3')).toBe(90); // 3 Uhr
    expect(facingAfter('m:1:3')).toBe(45); // 1:30
    expect(facingAfter('m:2:0')).toBe(90); // 3 Uhr
    expect(facingAfter('m:2:2')).toBe(270); // 9 Uhr
    expect(facingAfter('m:3:1')).toBe(90); // 3 Uhr
    expect(facingAfter('m:5:3')).toBe(180); // Runde endet auf 6 Uhr
    expect(facingAfter('m:5:3', 1)).toBe(0);
  });
  it('flags the clock annotation that contradicts the turns', () => {
    const warned = sheet.sections.flatMap((s) => s.rows).filter((r) => r.warnings.length);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toBe(sheet.sections[5].rows[2]);
  });
  it('plays the ending from 6 to 12 o’clock', () => {
    const e = choreo.extras[0];
    expect(mod360(e.initial.theta)).toBe(180);
    expect(mod360(e.events.at(-1).state.theta)).toBe(0);
    expect(e.events.at(-1).state.gesture).toBe('upR');
  });
  it('keeps feet within reach of each other', () => {
    for (const ev of choreo.main.events) {
      const { L, R } = ev.state.feet;
      expect(Math.hypot(L.gx - R.gx, L.gz - R.gz), `${ev.rowKey} ${ev.label}`).toBeLessThan(0.95);
    }
  });
});

describe('timeline', () => {
  const choreo = buildChoreo(extractSheet(html));
  const tl = new Timeline(choreo.main);
  it('samples finite poses across cycles', () => {
    for (let t = tl.start; t < tl.length * 2.5; t += 0.37) {
      const { pose } = tl.sample(t);
      for (const v of [pose.theta, pose.com.x, pose.com.z, pose.feet.L.x, pose.feet.R.z, pose.feet.L.y, pose.hands.R[1]]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  it('lands exactly on the event state', () => {
    const ev = tl.events[10];
    const { pose, event } = tl.sample(ev.beat);
    expect(event).toBe(ev);
    expect(pose.feet.R.x).toBeCloseTo(ev.state.feet.R.x);
    expect(pose.theta).toBeCloseTo(ev.state.theta);
  });
  it('never moves one foot through the other', () => {
    // Abstand der Füße im Koordinatensystem des jeweils anderen Fußes: überlappen sie seitlich,
    // müssen sie in Fußrichtung auseinander liegen (und umgekehrt).
    const check = (text, label) => {
      const t2 = new Timeline(buildChoreo(extractSheet(text)).main);
      for (let t = t2.start; t < t2.length; t += 0.02) {
        const { pose } = t2.sample(t);
        const { L, R } = pose.feet;
        if (L.y > 0.2 || R.y > 0.2) continue; // Kick/Hitch: Fuß ist deutlich über dem anderen
        const th = (R.rot * Math.PI) / 180;
        const dx = L.x - R.x;
        const dz = L.z - R.z;
        const lx = dx * Math.cos(th) + dz * Math.sin(th);
        const lf = dx * Math.sin(th) - dz * Math.cos(th);
        if (Math.abs(lx) < 0.08) expect(Math.abs(lf), `${label} t=${t.toFixed(2)} lx=${lx.toFixed(2)}`).toBeGreaterThan(0.22);
      }
    };
    check('T\n1-2 Schritt nach rechts mit rechts - Linken Fuß über rechten kreuzen\n3-4 Schritt nach rechts mit rechts - Linken Fuß hinter rechten kreuzen\n5-6 Schritt nach rechts mit rechts - Linken Fuß an rechten heransetzen\n7-8 Rechten Fuß über linken kreuzen - Schritt nach links mit links', 'weave');
    check('T\n1-2 Schritt nach rechts mit rechts - Linke Fußspitze hinter rechtem Fuß auftippen\n3-4 Schritt nach links mit links - Rechte Fußspitze hinter linkem Fuß auftippen', 'touch behind');
    check('T\n1-4 Jazz box R\n5-8 Vine L', 'jazz+vine');
    check(html, 'My Mama Said');
  });
  it('continues seamlessly into the next cycle', () => {
    const a = tl.sample(tl.length - 0.001).pose;
    const b = tl.sample(tl.length + 0.001).pose;
    expect(Math.hypot(a.com.x - b.com.x, a.com.z - b.com.z)).toBeLessThan(0.02);
  });
});

describe('library', () => {
  const fakeStore = (limit = Infinity) => {
    const data = new Map();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (v.length > limit) throw new Error('QuotaExceededError');
        data.set(k, v);
      },
    };
  };
  it('remembers dances, newest first, and replaces same-named entries', () => {
    const store = fakeStore();
    const sheet = extractSheet(html);
    saveDance(sheet, html, store);
    saveDance(extractSheet('Testtanz\n1-2 Schritt nach vorn mit rechts - Halten'), 'Testtanz\n1-2 Schritt nach vorn mit rechts - Halten', store);
    saveDance(sheet, html, store);
    const list = listDances(store);
    expect(list.map((d) => d.title)).toEqual(['My Mama Said', 'Testtanz']);
    expect(list[0].choreo).toBe('Maddison Glover');
    removeDance(list[0].id, store);
    expect(listDances(store).map((d) => d.title)).toEqual(['Testtanz']);
  });
  it('stores a compact source that loads to the same dance', () => {
    const compact = compactSource(html);
    expect(compact.length).toBeLessThan(html.length * 0.75);
    expect(compact).not.toMatch(/<script/i);
    const a = extractSheet(html);
    const b = extractSheet(compact);
    expect(b.title).toBe(a.title);
    expect(b.sections).toEqual(a.sections);
    expect(b.extras).toEqual(a.extras);
  });
  it('survives a missing, broken or full store', () => {
    expect(listDances(null)).toEqual([]);
    expect(listDances({ getItem: () => '{kaputt' })).toEqual([]);
    expect(() => saveDance(extractSheet(html), html, null)).not.toThrow();
    const tiny = fakeStore(6000);
    saveDance(extractSheet('A\n1-2 Schritt nach vorn mit rechts - Halten'), 'A\n1-2 Schritt nach vorn mit rechts - Halten', tiny);
    saveDance(extractSheet(html), html, tiny); // passt nicht zusätzlich → ältester Eintrag weicht
    expect(listDances(tiny).length).toBeLessThanOrEqual(1);
  });
});

describe('html input', () => {
  it('reads get-in-line markup copied with extra attributes', () => {
    const s = extractSheet('<div style="color: rgb(0,0,0)" class="pro_a">Kopiert</div><div class="pro_o" style="x">S1: Walk</div><div class="pro_l" style="width:65px">1-2</div><div style="y" class="pro_s">Schritt nach vorn mit rechts - Schritt nach vorn mit links</div>');
    expect(s.title).toBe('Kopiert');
    expect(s.sections[0].rows).toEqual([{ counts: '1-2', text: 'Schritt nach vorn mit rechts - Schritt nach vorn mit links' }]);
  });
  it('falls back to text for other saved pages', () => {
    const s = extractSheet('<html><head><title>x</title><style>p{}</style></head><body><h1>Ziggy</h1><p>CHASSE R; ROCK BACK</p><p>1&amp;2 Step to R on R foot, step on L foot beside R, step to R on R foot</p><div>3-4<br>Rock back on L foot, recover weight onto R</div><script>var a = "1-2 nope";</script></body></html>');
    expect(s.title).toBe('Ziggy');
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].rows.map((r) => r.counts)).toEqual(['1&2', '3-4']);
  });
});


describe('Copperknob page copied with counts in brackets (Glass of Wine)', () => {
  const sheet = extractSheet(readFileSync(new URL('./fixtures/glass-of-wine.txt', import.meta.url), 'utf8'));
  const choreo = buildChoreo(sheet);
  const types = (row) => row.parsed.actions.map((a) => a.moves[0].type + (a.moves[0].foot || ''));
  it('reads the header with labels and values on separate lines', () => {
    expect(sheet.title).toBe('Glass of Wine');
    expect(sheet.choreo).toBe('Malene Jakobsen (DK) - July 2022');
    expect(sheet.music).toBe('Cry to Me - Kilotile');
    expect(sheet.counts).toBe(32);
    expect(sheet.walls).toBe(4);
    expect(sheet.sections.map((s) => s.rows.length)).toEqual([2, 2, 2, 2]);
  });
  it('recognises every row', () => {
    for (const r of sheet.sections.flatMap((s) => s.rows)) expect(r.warnings, r.text).toEqual([]);
  });
  it('maps the count markers, travelling swivels and the bare clock', () => {
    const [s1, , , s4] = sheet.sections;
    expect(types(s1.rows[0])).toEqual(['stompR', 'swivelL', 'swivelL', 'swivelL']);
    expect(s1.rows[0].parsed.actions.map((a) => a.moves[0].part)).toEqual([undefined, 'heel', 'toe', 'heel']);
    expect(s1.rows[0].parsed.actions[0].moves[0].dir).toEqual({ side: 0.75, fwd: 0.75 });
    expect(types(s4.rows[0])).toEqual(['stepR', 'recoverL', 'stepR', 'pivot']);
    expect(s4.rows[0].parsed.actions[3].clock).toBe(270);
    // linker Fuß wandert bei den Swivels zum rechten
    const xs = choreo.main.events.slice(0, 4).map((e) => e.state.feet.L.x);
    expect(xs[3]).toBeGreaterThan(xs[0] + 0.05);
  });
  it('turns a quarter left per wall', () => {
    expect(mod360(choreo.main.drift.theta)).toBe(0);
    expect(choreo.main.rounds).toBe(4);
    expect(choreo.main.roundLen).toBe(32);
  });
});
