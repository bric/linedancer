// Übersetzt den deutschen Beschreibungstext einer Zeile in Aktionen pro Zählzeit.
//
// Eine Aktion = alles, was auf einer Zählzeit passiert: { label, beat, moves[], clock?, raw }.
// Ein Move = { type, foot?, dir?, size?, turn?, ... } (siehe parsePart).

import { parseCounts } from './counts.js';

const FRAC = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '1/4': 0.25, '1/2': 0.5, '3/4': 0.75, '1/8': 0.125, '3/8': 0.375, '5/8': 0.625, '7/8': 0.875,
  volle: 1, ganze: 1,
};
const TURN_RE = /(¼|½|¾|⅛|⅜|⅝|⅞|\d\s*\/\s*\d|volle|ganze)\s*drehung\s+(?:nach\s+)?(rechts|links)(?:\s*herum)?/;
const CLOCK_RE = /\(\s*(?:(\d{1,2})(?::(\d{2}))?\s*Uhr|(\d{1,2}):(\d{2}))\s*\)/i;

// "(nach Ende der 7. Runde - 6 Uhr)" → 180
export function clockToDeg(text) {
  const m = String(text).match(/(\d{1,2})(?::(\d{2}))?\s*Uhr/i);
  return m ? (+m[1] % 12) * 30 + (m[2] ? +m[2] / 2 : 0) : null;
}

function footOf(t) {
  let m = t.match(/\bmit (rechts|links)\b/);
  if (m) return m[1] === 'rechts' ? 'R' : 'L';
  m = t.match(/\b(recht|link)(?:e|en|er|es|em)\b/);
  if (m) return m[1] === 'recht' ? 'R' : 'L';
  return null;
}

function dirOf(t) {
  let side = 0;
  let fwd = 0;
  let tweak = 0;
  const rem = t
    .replace(/\bmit (rechts|links)\b/, '')
    .replace(/etwas nach (vorne?|hinten)/, (m, w) => {
      tweak = w[0] === 'v' ? 0.35 : -0.35;
      return '';
    });
  for (const [w] of rem.matchAll(/\b(rechts|links|vorne?|vorwärts|hinten|zurück|rückwärts)\b/g)) {
    if (w === 'rechts') side = 1;
    else if (w === 'links') side = -1;
    else if (w[0] === 'v') fwd = 1;
    else fwd = -1;
  }
  if (side && fwd) {
    side *= 0.75;
    fwd *= 0.75;
  }
  fwd += tweak;
  return side || fwd ? { side, fwd } : null;
}

// Ein einzelner Bewegungsbaustein (Teil zwischen "und", "," oder "/").
export function parsePart(src) {
  let t = src.toLowerCase().replace(/\s+/g, ' ').trim();
  const mv = {};
  const tm = t.match(TURN_RE);
  if (tm) {
    mv.turn = { frac: FRAC[tm[1].replace(/\s/g, '')] ?? 0.25, dir: tm[2] === 'rechts' ? 'R' : 'L' };
    t = t.replace(TURN_RE, '').trim();
    if (!t) return { ...mv, type: 'turn' };
    if (/ballen/.test(t)) return { ...mv, type: 'pivot' };
  }
  const foot = footOf(t);
  const dir = dirOf(t);
  const out = (type, extra = {}) => ({ ...mv, type, foot, dir, ...extra });

  if (/^(halten|pause)\b|\bhold\b/.test(t)) return { ...mv, type: 'hold' };
  if (/klatschen/.test(t)) return { ...mv, type: 'clap' };
  const we = t.match(/gewicht (?:am ende|bleibt) (?:auf )?(rechts|links)/);
  if (we) return { type: 'modPrev', patch: { weightEnd: we[1] === 'rechts' ? 'R' : 'L' } };
  if (/gewicht (?:zurück |wieder )?auf/.test(t)) return out('recover');
  if (/hüfte/.test(t)) return { ...mv, type: 'hips', dir };
  if (/im kreis/.test(t) && /schwingen/.test(t)) return out('sweep');
  if (/schwingen/.test(t)) return out('scuff');
  if (/schleifen/.test(t)) return { type: 'modPrev', patch: {} };
  if (/kick/.test(t)) return out('kick');
  if (/knie\b.*(heben|hochziehen)/.test(t)) return out('hitch', { small: /wenig|leicht/.test(t) });
  if (/drehen/.test(t) && /spitze|hacke|ferse/.test(t)) {
    // Swivels: "Beide Hacken nach links drehen - … wieder zur Mitte drehen"
    const mode = /mitte|zurück/.test(t) ? 'centre' : /auseinander/.test(t) ? 'apart' : 'side';
    return out('swivel', { part: /spitze/.test(t) ? 'toe' : 'heel', mode, both: /beide|hacken|spitzen/.test(t) });
  }
  if (/\b(fuß|bein)\b.*anheben/.test(t)) return out('hook', { behind: /hinter/.test(t) });
  if (/heranziehen/.test(t)) return out('touch', { part: 'flat', beside: true });
  if (/hacken?\b.*heben/.test(t)) return out('heelUp');
  if (/senken/.test(t)) return out('heelDown');
  if (/tippen/.test(t)) {
    const part = /hacke|ferse/.test(t) ? 'heel' : /flach/.test(t) ? 'flat' : 'toe';
    return out('touch', { part, beside: /neben/.test(t) });
  }
  if (/aufstampfen|stampfen$/.test(t)) return out('stomp', { beside: /neben/.test(t) });
  if (/heransetzen|schließen/.test(t)) return out('together');
  if (/kreuzen/.test(t)) {
    // "hinter linken kreuzen" nennt nur den Standfuß → der andere kreuzt
    const m = t.match(/^(?:über|hinter|vor) (?:den |dem )?(recht|link)en/);
    return out('cross', { behind: /hinter/.test(t), foot: m ? (m[1] === 'recht' ? 'L' : 'R') : foot });
  }
  if (/schritt|sprung|springen|auf der stelle/.test(t)) {
    const size = /sehr klein/.test(t) ? 0.4 : /klein/.test(t) ? 0.6 : /groß|weit/.test(t) ? 1.4 : 1;
    return out('step', {
      size,
      inPlace: /auf der stelle/.test(t),
      jump: /sprung|springen/.test(t),
      stomp: /stampfend/.test(t),
    });
  }
  if (/\b(hand|arm|faust)\b/.test(t)) return out('arm', { up: /oben|hoch/.test(t) });
  // "… nach vorn, hinten, vorn und wieder nach hinten schwingen": nur eine Richtung, die Bewegung steht daneben
  const bare = !!dir && /^(?:(?:wieder|und|nach|schräg|rechts|links|vorne?|hinten|zurück)\s*)+$/.test(t);
  return { ...mv, type: 'unknown', dir, bare };
}

// Trennt an `sep`, aber nicht innerhalb von Klammern.
function splitOutsideParens(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const m = text.slice(i).match(sep);
      if (m && m.index === 0) {
        parts.push(text.slice(start, i));
        i += m[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Drehungen und "im Kreis schwingen" gehören zur folgenden Bewegung,
// "Gewicht am Ende links" u. ä. zur vorherigen.
function mergeUnits(units) {
  const out = [];
  let pend = null;
  for (const u of units) {
    const m = u.moves[0];
    if (u.moves.length === 1 && (m.type === 'turn' || m.type === 'sweep')) {
      pend = pend || { raw: [] };
      if (m.type === 'turn') pend.turn = m.turn;
      else Object.assign(pend, { sweep: true, foot: m.foot, dir: m.dir });
      pend.raw.push(u.raw);
      continue;
    }
    if (m.type === 'modPrev') {
      if (out.length) {
        Object.assign(out.at(-1).moves[0], m.patch);
        out.at(-1).raw += ', ' + u.raw;
      }
      continue;
    }
    if (m.type === 'heelDown' && !m.foot && out.length) m.foot = out.at(-1).moves[0].foot;
    if (pend) {
      if (pend.turn && !m.turn) m.turn = pend.turn;
      if (pend.sweep) {
        m.sweep = true;
        if (pend.foot) m.foot = pend.foot;
      }
      u.raw = [...pend.raw, u.raw].join(' und ');
      pend = null;
    }
    out.push(u);
  }
  out.forEach((u, i) => {
    const m = u.moves[0];
    if (!m.bare) return;
    const model = [...out.slice(0, i).reverse(), ...out.slice(i + 1)].map((x) => x.moves[0]).find((x) => x.type !== 'unknown');
    if (model) u.moves[0] = { ...model, dir: m.dir };
  });
  // "Hüften nach vorn … und wieder nach hinten schwingen": das Verb am Ende meint weiter die Hüften
  if (out.some((u) => u.moves[0].type === 'hips')) {
    for (const u of out) {
      const m = u.moves[0];
      if (m.type === 'scuff' && !m.foot) u.moves[0] = { type: 'hips', dir: m.dir };
    }
  }
  if (pend) {
    const raw = pend.raw.join(' und ');
    if (pend.turn) out.push({ moves: [{ type: 'pivot', turn: pend.turn }], raw });
    else out.push({ moves: [{ type: 'scuff', foot: pend.foot, dir: pend.dir }], raw });
  }
  return out;
}

function parseSegment(seg) {
  let text = seg;
  let clock = null;
  let feet = null;
  text = text.replace(CLOCK_RE, (m, h1, m1, h2, m2) => {
    clock = (+(h1 ?? h2) % 12) * 30 + +(m1 ?? m2 ?? 0) / 2;
    return '';
  });
  text = text.replace(/\(\s*([rl](?:\s*[-–,]\s*[rl])+)\s*\)/i, (m, list) => {
    feet = list.toUpperCase().match(/[RL]/g);
    return '';
  });
  text = text
    .replace(/\(\s*(etwas nach (?:vorne?|hinten))\s*\)/i, ' $1')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];

  let units = [];
  const multi = text.match(/^(\d+)\s+(.*?)schritte\b(.*)$/i);
  if (multi && +multi[1] >= 2 && +multi[1] <= 8) {
    // "2 Schritte nach vorn (r - l)"
    for (let i = 0; i < +multi[1]; i++) {
      const mv = parsePart(`${multi[2]}schritt${multi[3]}`);
      if (feet) mv.foot = feet[i % feet.length];
      units.push({ moves: [mv], raw: text });
    }
  } else {
    for (const clause of text.split(/\s*,\s*|\s+und\s+/).filter(Boolean)) {
      units.push({ moves: clause.split(/(?<!\d)\s*\/\s*(?!\d)/).map(parsePart), raw: clause });
    }
    units = mergeUnits(units);
    // "Rechte Hacke vorn 2x auftippen"
    const times = text.match(/\b([2-8])\s?x\b/i);
    if (times && units.length === 1) units = Array.from({ length: +times[1] }, () => ({ ...units[0] }));
  }
  if (clock !== null && units.length) units.at(-1).clock = clock;
  return units;
}

// Zeile { counts, text } → { actions[], uncertain, unknown }
export function parseRow(row, after = null) {
  const slots = parseCounts(row.counts, after);
  const units = splitOutsideParens(row.text, /^\s+[-–]\s+/).flatMap(parseSegment);
  const actions = slots.map((s) => ({ ...s, moves: [], raw: '', clock: null }));
  const uncertain = units.length !== slots.length;
  const put = (action, u) => {
    action.moves.push(...u.moves);
    action.raw = action.raw ? `${action.raw} / ${u.raw}` : u.raw;
    if (u.clock != null) action.clock = u.clock;
  };
  if (slots.length) {
    units.forEach((u, i) => {
      const idx =
        units.length <= slots.length
          ? Math.floor((i * slots.length) / units.length)
          : Math.min(i, slots.length - 1);
      put(actions[idx], u);
    });
  }
  for (const a of actions) {
    if (!a.moves.length) {
      a.moves.push({ type: 'hold' });
      a.raw = a.raw || '…';
    }
  }
  const unknown = units.some((u) => u.moves.some((m) => m.type === 'unknown'));
  return { actions, uncertain, unknown };
}

const swap = (f) => (f === 'L' ? 'R' : f === 'R' ? 'L' : f);
function mirrorMove(m) {
  const out = { ...m, foot: swap(m.foot) };
  if (m.dir) out.dir = { side: -m.dir.side, fwd: m.dir.fwd };
  if (m.turn) out.turn = { ...m.turn, dir: swap(m.turn.dir) };
  if (m.weightEnd) out.weightEnd = swap(m.weightEnd);
  return out;
}

// Rückverweise auflösen: "Wie 1-4", "Wie 1-4, aber spiegelbildlich nach links", "Wie Schrittfolge zuvor".
// Erwartet Zeilen mit bereits gesetztem row.parsed.
export function resolveReferences(sections) {
  sections.forEach((sec, si) => {
    sec.rows.forEach((row, ri) => {
      const own = row.parsed.actions;
      if (!own.length) return;
      const range = row.text.match(/^wie\s+(\d+)\s*[-–]\s*(\d+)/i);
      let source = null;
      let from = 0;
      if (range) {
        from = +range[1] - 1;
        const to = +range[2] - 1;
        source = sec.rows.slice(0, ri).flatMap((r) => r.parsed.actions).filter((a) => a.beat >= from && a.beat <= to);
      } else if (/^wie\s+(die\s+)?schrittfolge\s+(zu)?vor/i.test(row.text) && si > 0) {
        source = sections[si - 1].rows.flatMap((r) => r.parsed.actions);
        from = Math.floor(source[0]?.beat ?? 0);
      }
      if (!source?.length) return;
      const span = (list) => Math.floor(list.at(-1).beat) - Math.floor(list[0].beat);
      if (span(source) !== span(own)) return;
      const mirror = /spiegel|seitenverkehrt/i.test(row.text);
      const offset = Math.floor(own[0].beat) - from;
      row.parsed = {
        actions: source.map((a) => ({ ...a, beat: a.beat + offset, moves: mirror ? a.moves.map(mirrorMove) : a.moves })),
        uncertain: false,
        unknown: source.some((a) => a.moves.some((m) => m.type === 'unknown')),
      };
      for (const a of row.parsed.actions) a.label = Number.isInteger(a.beat) ? String(a.beat + 1) : '&';
    });
  });
}
