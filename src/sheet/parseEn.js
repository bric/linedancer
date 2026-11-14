// Englische Schrittbeschreibungen (z. B. von copperknob.co.uk):
// "Step to R on R foot, step on L foot beside R, step to R on R foot".
// Liefert dieselben Einheiten/Moves wie der deutsche Parser in parse.js.

import { mergeUnits } from './parse.js';

const FOOT = '(right|left|[rl])f?';
const code = (s) => (s[0].toLowerCase() === 'r' ? 'R' : 'L');
const swap = (f) => (f === 'L' ? 'R' : 'L');

const FRAC = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '1/4': 0.25, '1/2': 0.5, '3/4': 0.75, '1/8': 0.125, '3/8': 0.375, '5/8': 0.625, '7/8': 0.875,
  quarter: 0.25, half: 0.5, full: 1,
};
const F = '(¼|½|¾|⅛|⅜|⅝|⅞|\\d\\s*\\/\\s*\\d|quarter|half|full)';
const PRE = '(?:(?:make|making)\\s+)?(?:(?:turn|pivot)(?:ing)?\\s+)?(?:an?\\s+)?';
// "turn ¼ R", "¾ turn over R shoulder", "pivot ½ left", "make a ¼ turn to the left"
const TURN_A = new RegExp(`${PRE}${F}\\s*(?:turn|pivot)?\\s*(?:to|over)?\\s*(?:the|your)?\\s*\\b(right|left|r|l)\\b(?:\\s+shoulder)?`);
// "turn left ¼"
const TURN_B = new RegExp(`(?:turn|pivot)(?:ing)?\\s+(?:to\\s+)?(?:the\\s+)?(right|left|r|l)\\s+${F}(?:\\s+turn)?`);

const ENGLISH = /\b(step|stepping|steps|touch|rock|recover|kick|point|walk|cross|stomp|hold|turn|pivot|shuffle|heels?|toes?|foot|forward|beside|weight|hitch|scuff|brush|fan|coaster|chasse|triple|clap)\b/i;
const GERMAN = /\b(schritt\w*|fuß\w*|mit|nach|drehung|gewicht|halten|hacken?|und|auftippen|kreuzen)\b/i;
export const isEnglish = (text) => ENGLISH.test(text) && !GERMAN.test(text);

function dirOf(t, foot) {
  let side = 0;
  let fwd = 0;
  if (/\b(forward|front)\b/.test(t)) fwd = 1;
  if (/\b(back|backward|backwards)\b/.test(t)) fwd = -1;
  const m =
    t.match(/\bto\s+(?:the\s+|your\s+)?(right|left|[rl])\b/) ||
    t.match(/\b(right|left|[rl])\s+(?:side|diagonal)\b/) ||
    t.match(/\b(?:side|diagonal(?:ly)?)\s+(?:to\s+)?(?:the\s+)?(right|left|[rl])\b(?!\s*(?:foot|heel|toe|knee))/);
  if (m) side = code(m[1]) === 'R' ? 1 : -1;
  else if (/\b(side|out)\b/.test(t) && foot) side = foot === 'R' ? 1 : -1;
  if (/diagonal/.test(t) && !fwd) fwd = 1;
  if (side && fwd) {
    side *= 0.75;
    fwd *= 0.75;
  }
  return side || fwd ? { side, fwd } : null;
}

export function parsePartEn(src) {
  let t = src.toLowerCase().replace(/\bfwd\b/g, 'forward').replace(/\s+/g, ' ').trim();
  const mv = {};
  const pivot = /\bpivot/.test(t);
  const a = t.match(TURN_A);
  const b = a ? null : t.match(TURN_B);
  if (a || b) {
    const frac = (a ? a[1] : b[2]).replace(/\s/g, '');
    mv.turn = { frac: FRAC[frac] ?? 0.25, dir: code(a ? a[2] : b[1]) };
    t = t.replace(a ? a[0] : b[0], ' ').replace(/\s+/g, ' ').trim();
    if (!t.replace(/\b(and|then|while|a|an|turn(ing)?|pivot(ing)?|make|making)\b/g, '').trim()) {
      return { ...mv, type: pivot ? 'pivot' : 'turn' };
    }
  }
  const on = t.match(new RegExp(`\\b(?:on|onto|with)\\s+(?:the\\s+|your\\s+)?${FOOT}\\b`));
  const any = t.match(new RegExp(`\\b${FOOT}\\b`));
  const foot = on ? code(on[1]) : any ? code(any[1]) : null;
  const dir = dirOf(t, foot);
  const beside = /\b(beside|next to|together|in place)\b/.test(t);
  const out = (type, extra = {}) => ({ ...mv, type, foot, dir, ...extra });

  if (/^(hold|pause|wait)\b/.test(t)) return { ...mv, type: 'hold' };
  if (/^clap/.test(t)) return { ...mv, type: 'clap' };
  if (/\b(recover|replace)\b|\bweight\s+(?:back\s+)?(?:on|onto|to)\b/.test(t)) {
    const m = t.match(new RegExp(`\\b(?:on|onto|to|with)\\s+(?:the\\s+|your\\s+)?${FOOT}\\b`));
    return out('recover', { foot: m ? code(m[1]) : foot });
  }
  if (/\bhitch|\bknee\b.*\b(up|lift|raise)|\b(lift|raise)\b.*\bknee\b/.test(t)) return out('hitch');
  if (/\bflick|\bhook\b/.test(t)) return out('hook', { behind: /flick|behind/.test(t) });
  if (/\bkick/.test(t)) return out('kick');
  if (/\b(scuff|brush|sweep|ronde)\b/.test(t)) return out('scuff');
  if (/\b(fan|swivel|twist|bring|return)\b/.test(t) && /\b(heels?|toes?)\b/.test(t)) {
    const mode = /cent(re|er)|back to place|\bin$/.test(t) ? 'centre' : /apart/.test(t) ? 'apart' : 'side';
    return out('swivel', { part: /\btoes?\b/.test(t) ? 'toe' : 'heel', mode, both: /\b(heels|toes|both)\b/.test(t) });
  }
  if (/\bbounce/.test(t) && /\bheels?\b/.test(t)) return out('bounce', { both: /\b(heels|both)\b/.test(t) });
  if (/\b(touch|tap|point|dig)\b/.test(t)) {
    const cross = /\bbehind\b/.test(t) ? 'behind' : /\b(across|in front of|over)\b/.test(t) ? 'front' : null;
    return out('touch', { part: /\bheel\b/.test(t) ? 'heel' : 'toe', beside, cross });
  }
  if (/\b(stomp|stamp)\b/.test(t)) return out('stomp', { beside, noWeight: /stomp up|no weight|without weight/.test(t) });
  if (beside || /\bclose\b/.test(t)) return out('together');
  if (/\b(cross|across|behind)\b/.test(t)) return out('cross', { behind: /\bbehind\b/.test(t) });
  if (/\b(step|steps|stepping|walk|walking|run|rock|jump|hop|stride|lunge|press)\b/.test(t)) {
    const walk = /\b(walk|walking|run)\b/.test(t);
    return out('step', {
      dir: dir || (walk ? { side: 0, fwd: 1 } : null),
      size: /\bsmall\b/.test(t) || (walk && mv.turn) ? 0.6 : /\b(big|large|long)\b/.test(t) ? 1.4 : 1,
      inPlace: /in place|on the spot/.test(t),
      jump: /\b(jump|hop)\b/.test(t),
      stomp: false,
      out: /\bout\b/.test(t) && /diagonal/.test(t),
    });
  }
  return { ...mv, type: 'unknown', dir };
}

// Zusammengesetzte Schritte, die auf mehrere Zählzeiten verteilt werden.
function compound(clause, feet) {
  const t = clause.toLowerCase();
  const base = parsePartEn(clause.replace(/\b(shuffle|chass[eé]|triple(\s+step)?|cha[- ]cha|coaster(\s+step)?)\b/gi, 'step'));
  if (base.type !== 'step' && base.type !== 'together') return null;
  const f = feet?.[0] || base.foot || (base.dir?.side < 0 ? 'L' : 'R');
  const o = swap(f);
  const unit = (m) => ({ moves: [m], raw: clause });
  if (/\b(shuffle|chass[eé]|triple|cha[- ]cha)\b/.test(t)) {
    const step = { type: 'step', dir: base.dir, size: 0.7, inPlace: !base.dir };
    const first = { ...step, foot: f };
    if (base.turn) first.turn = base.turn;
    return [unit(first), unit({ type: 'together', foot: o }), unit({ ...step, foot: f })];
  }
  if (/\bcoaster\b/.test(t)) {
    return [
      unit({ type: 'step', foot: f, dir: { side: 0, fwd: -1 }, size: 0.7 }),
      unit({ type: 'together', foot: o }),
      unit({ type: 'step', foot: f, dir: { side: 0, fwd: 1 }, size: 0.7 }),
    ];
  }
  return null;
}

function build(clauses, feet) {
  let units = [];
  for (const clause of clauses) {
    const multi = compound(clause, feet);
    if (multi) {
      units.push(...multi);
      continue;
    }
    const moves = [parsePartEn(clause)];
    if (/\bclap/.test(clause.toLowerCase()) && moves[0].type !== 'clap') moves.push({ type: 'clap' });
    units.push({ moves, raw: clause });
  }
  units = mergeUnits(units);
  // "Walk around ¾ turn over R shoulder stepping on R, L, R, L": ein Schritt pro genanntem Fuß
  if (feet && units.length === 1 && units[0].moves[0].type !== 'unknown') {
    const [first, ...rest] = units[0].moves;
    units = feet.map((foot) => {
      const m = { ...first, foot };
      if (m.turn) m.turn = { ...m.turn, frac: m.turn.frac / feet.length };
      return { ...units[0], moves: [m, ...rest] };
    });
  }
  // V-Step: zweimal "out to diagonal" nacheinander – der zweite Fuß setzt neben den ersten, nicht davor
  units.forEach((u, i) => {
    const m = u.moves[0];
    const p = units[i - 1]?.moves[0];
    if (m.out && p?.out && m.dir && p.dir && Math.sign(m.dir.side) === -Math.sign(p.dir.side)) {
      m.dir = { side: Math.sign(m.dir.side), fwd: 0 };
      m.size = 0.6;
    }
  });
  return units;
}

// Ganzer Zeilentext → Einheiten. nSlots = Anzahl der Zählzeiten der Zeile.
export function parseUnitsEn(source, nSlots) {
  let text = source;
  let clock = null;
  let feet = null;
  text = text.replace(/[([]\s*(\d{1,2})[:.](\d{2})\s*[)\]]|[([]?\s*(\d{1,2})\s*o'?clock\s*[)\]]?/gi, (m, h1, m1, h2) => {
    clock = (+(h1 ?? h2) % 12) * 30 + +(m1 ?? 0) / 2;
    return '';
  });
  // Fußfolge am Ende: "… stepping on R, L, R, L" / "(R-L-R)"
  text = text.replace(/(?:\bstepping\s+(?:on\s+)?|\bon\s+)?\(?\b((?:right|left|[rl])(?:\s*[,\-–]\s*(?:right|left|[rl])\b){1,7})\)?\s*$/i, (m, list) => {
    feet = list.match(/right|left|[rl]/gi).map(code);
    return '';
  });
  text = text.replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  // Erst nur an Kommas trennen; passt die Anzahl nicht zu den Zählzeiten, auch an "and"/"then".
  const splitters = [/\s*[,;]\s*|\s+[-–]\s+/, /\s*[,;]\s*|\s+[-–]\s+|\s+(?:and|then|&)\s+/i];
  let units = null;
  for (const re of splitters) {
    const candidate = build(text.split(re).filter(Boolean), feet);
    if (!units) units = candidate;
    if (candidate.length === nSlots) {
      units = candidate;
      break;
    }
  }
  if (clock !== null && units.length) units.at(-1).clock = clock;
  return units;
}
