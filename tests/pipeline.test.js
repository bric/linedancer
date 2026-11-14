import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCounts } from '../src/sheet/counts.js';
import { extractSheet } from '../src/sheet/extract.js';
import { parseRow, resolveReferences } from '../src/sheet/parse.js';
import { buildChoreo, mod360 } from '../src/choreo/simulate.js';
import { Timeline } from '../src/player/player.js';
import { toProxyUrl } from '../src/sheet/load.js';

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
  it('continues seamlessly into the next cycle', () => {
    const a = tl.sample(tl.length - 0.001).pose;
    const b = tl.sample(tl.length + 0.001).pose;
    expect(Math.hypot(a.com.x - b.com.x, a.com.z - b.com.z)).toBeLessThan(0.02);
  });
});

describe('load', () => {
  it('maps get-in-line URLs to the proxy', () => {
    expect(toProxyUrl('https://www.get-in-line.de/dances/My%20Mama%20Said_-_Glover.htm')).toBe('/sheet/My%20Mama%20Said_-_Glover.htm');
    expect(() => toProxyUrl('https://example.com/dances/x.htm')).toThrow();
  });
});
