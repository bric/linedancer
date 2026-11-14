// Führt die geparsten Aktionen auf einem Tänzer-Zustand aus und erzeugt Keyframes.
//
// Koordinaten: Bodenebene (x, z), 12 Uhr = -z, 3 Uhr = +x. theta in Grad im Uhrzeigersinn
// (von oben gesehen), nicht auf 0–360 begrenzt, damit Drehungen in der richtigen Richtung laufen.

import { parseRow, resolveReferences, clockToDeg } from '../sheet/parse.js';

export const STANCE = 0.24; // Abstand der Füße im Stand
export const STEP = 0.42; // normale Schrittlänge

export const other = (f) => (f === 'L' ? 'R' : 'L');
export const sgn = (f) => (f === 'R' ? 1 : -1);
const rad = (d) => (d * Math.PI) / 180;
export const fwdV = (th) => [Math.sin(rad(th)), -Math.cos(rad(th))];
export const rightV = (th) => [Math.cos(rad(th)), Math.sin(rad(th))];
export const mod360 = (d) => ((d % 360) + 360) % 360;

export function cloneState(s) {
  return {
    ...s,
    feet: { L: { ...s.feet.L }, R: { ...s.feet.R } },
    com: { ...s.com },
    fx: { ...s.fx },
  };
}

function updateCom(s) {
  const w = s.feet[s.weight];
  const o = s.feet[other(s.weight)];
  const k = o.y > 0.1 ? 0.92 : 0.72; // Spielbein in der Luft → Körper ganz über dem Standbein
  s.com = { x: w.gx * k + o.gx * (1 - k), z: w.gz * k + o.gz * (1 - k) };
  if (s.sway) {
    // Hüftschwung: Becken in die genannte Richtung schieben
    const F = fwdV(s.theta);
    const R = rightV(s.theta);
    s.com.x += (R[0] * s.sway.side + F[0] * s.sway.fwd) * 0.09;
    s.com.z += (R[1] * s.sway.side + F[1] * s.sway.fwd) * 0.09;
  }
}

export function initialState(theta = 0) {
  const R = rightV(theta);
  const s = { theta, weight: 'L', feet: {}, gesture: null, fx: {}, lastFoot: null, com: { x: 0, z: 0 } };
  for (const f of ['L', 'R']) {
    const x = (R[0] * sgn(f) * STANCE) / 2;
    const z = (R[1] * sgn(f) * STANCE) / 2;
    s.feet[f] = { x, z, y: 0, pitch: 0, rot: theta, gx: x, gz: z };
  }
  updateCom(s);
  return s;
}

function applyMove(s, m) {
  const free = other(s.weight);
  const f = m.foot || ((m.type === 'heelUp' || m.type === 'heelDown') && s.lastFoot) || free;
  const o = other(f);
  if (m.turn) s.theta += (m.turn.dir === 'R' ? 1 : -1) * m.turn.frac * 360;
  const th = s.theta;
  const F = fwdV(th);
  const R = rightV(th);
  const base = s.feet[o];
  const self = s.feet[f];
  const d = m.dir || { side: 0, fwd: 0 };
  const dv = (len) => [(R[0] * d.side + F[0] * d.fwd) * len, (R[1] * d.side + F[1] * d.fwd) * len];
  const home = (k = 1) => [base.gx + R[0] * sgn(f) * STANCE * k, base.gz + R[1] * sgn(f) * STANCE * k];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

  const place = (p, { y = 0, pitch = 0, ground = true } = {}) => {
    Object.assign(self, { x: p[0], z: p[1], y, pitch, rot: th });
    if (ground) Object.assign(self, { gx: p[0], gz: p[1] });
  };
  const takeWeight = (foot) => {
    const ft = s.feet[foot];
    Object.assign(ft, { x: ft.gx, z: ft.gz, y: 0, pitch: 0 });
    s.weight = foot;
  };
  const footBased = !['hold', 'clap', 'arm', 'hips', 'swivel', 'unknown', 'pivot', 'turn'].includes(m.type);
  if (m.turn && footBased) base.rot = th; // Standbein dreht auf dem Ballen mit

  switch (m.type) {
    case 'step': {
      if (m.inPlace || !m.dir) {
        place(m.inPlace ? [self.gx, self.gz] : home());
      } else {
        const v = dv(STEP * (m.size ?? 1));
        // relativ zum Standbein – oder vom eigenen Platz aus, wenn das weiter trägt (z. B. Pony Steps)
        const a = add(home(), v);
        const b = add([self.gx, self.gz], v);
        const prog = (p) => p[0] * v[0] + p[1] * v[1];
        place(prog(b) > prog(a) + 1e-9 ? b : a);
      }
      takeWeight(f);
      if (m.jump) s.fx.jump = true;
      if (m.stomp) s.fx.stomp = f;
      break;
    }
    case 'cross': {
      const k = m.behind ? -0.13 : 0.13;
      place([base.gx - R[0] * sgn(f) * 0.14 + F[0] * k, base.gz - R[1] * sgn(f) * 0.14 + F[1] * k]);
      takeWeight(f);
      break;
    }
    case 'together':
      place(home());
      takeWeight(f);
      break;
    case 'recover':
      place([self.gx, self.gz]);
      takeWeight(f);
      break;
    case 'stomp':
      place(m.dir && !m.beside ? add(home(), dv(0.3)) : home());
      takeWeight(f);
      s.fx.stomp = f;
      break;
    case 'touch': {
      const k = m.cross === 'behind' ? -0.2 : 0.2;
      const p = m.cross
        ? [base.gx - R[0] * sgn(f) * 0.07 + F[0] * k, base.gz - R[1] * sgn(f) * 0.07 + F[1] * k]
        : m.dir && !m.beside
          ? add(home(), dv(0.4))
          : home(0.9);
      if (m.part === 'heel') place(p, { y: 0.02, pitch: -0.5 });
      else if (m.part === 'flat') place(p);
      else place(p, { y: 0.07, pitch: 0.7 });
      break;
    }
    case 'kick':
      place(add(home(0.8), m.dir ? dv(0.45) : [F[0] * 0.45, F[1] * 0.45]), { y: 0.3, pitch: -0.5, ground: false });
      break;
    case 'hitch':
      place(add(home(0.75), [F[0] * 0.12, F[1] * 0.12]), { y: m.small ? 0.16 : 0.42, pitch: 0.5, ground: false });
      break;
    case 'scuff':
      place(add(home(), m.dir ? dv(0.32) : [F[0] * 0.32, F[1] * 0.32]), { y: 0.06, pitch: -0.25, ground: false });
      break;
    case 'heelUp':
      Object.assign(self, { y: 0.06, pitch: 0.5 });
      break;
    case 'heelDown':
      Object.assign(self, { y: 0, pitch: 0 });
      break;
    case 'pivot':
    case 'turn':
      s.feet.L.rot = th;
      s.feet.R.rot = th;
      takeWeight(m.weightEnd || other(s.weight));
      break;
    case 'hips':
      s.sway = m.dir;
      break;
    case 'hook':
      place(add(home(0.3), [F[0] * (m.behind ? -0.18 : 0.15), F[1] * (m.behind ? -0.18 : 0.15)]), { y: 0.32, pitch: 0.6, ground: false });
      break;
    case 'swivel': {
      // Fußspitzen bzw. Hacken auf der Stelle drehen
      const k = m.part === 'toe' ? 1 : -1;
      for (const ft of m.both || !m.foot ? ['L', 'R'] : [m.foot]) {
        const delta = m.mode === 'centre' ? 0 : m.mode === 'apart' ? sgn(ft) * k * 35 : Math.sign(d.side) * k * 35;
        s.feet[ft].rot = th + delta;
      }
      break;
    }
    case 'clap':
      s.gesture = 'clap';
      break;
    case 'arm':
      s.gesture = m.up === false ? null : 'up' + (m.foot || 'R');
      break;
    default: // hold, unknown
      break;
  }
  if (m.sweep) s.fx.sweep = f;
  if (m.weightEnd && footBased) takeWeight(m.weightEnd);
  if (footBased) s.lastFoot = f;
}

function applyAction(state, action) {
  const s = cloneState(state);
  s.gesture = null;
  s.sway = null;
  s.fx = {};
  for (const m of action.moves) applyMove(s, m);
  updateCom(s);
  return s;
}

const sectionLength = (rows) =>
  Math.max(1, ...rows.flatMap((r) => r.parsed.actions.map((a) => Math.floor(a.beat) + 1)));

// Simuliert eine Folge von Abschnitten ab `state`/`beat0`.
function runSections(sections, keyPrefix, state, beat0, { snap, round }) {
  const events = [];
  const mismatches = [];
  let beat = beat0;
  sections.forEach((sec, si) => {
    const len = sectionLength(sec.rows);
    sec.rows.forEach((row, ri) => {
      for (const action of row.parsed.actions) {
        state = applyAction(state, action);
        if (action.clock != null) {
          let delta = action.clock - mod360(state.theta);
          delta = ((delta + 540) % 360) - 180;
          if (Math.abs(delta) > 1) {
            mismatches.push({ row, expected: action.clock, got: mod360(state.theta) });
            if (snap) {
              state.theta += delta;
              state.feet.L.rot += delta;
              state.feet.R.rot += delta;
            }
          }
        }
        events.push({
          beat: beat + action.beat,
          label: action.label,
          raw: action.raw,
          rowKey: `${keyPrefix}:${si}:${ri}`,
          section: si,
          sectionTitle: sec.title,
          secStart: beat,
          secEnd: beat + len,
          round,
          state,
        });
      }
    });
    beat += len;
  });
  events.sort((a, b) => a.beat - b.beat);
  return { events, state, beat, mismatches };
}

const fmtClock = (deg) => {
  const d = mod360(deg);
  const h = Math.floor(d / 30) || 12;
  return d % 30 ? `${h}:30` : `${h} Uhr`;
};
export { fmtClock };

function centre(s) {
  return { x: (s.feet.L.gx + s.feet.R.gx) / 2, z: (s.feet.L.gz + s.feet.R.gz) / 2 };
}

// Erwartete Drehung pro Runde laut "x wall".
function wallsConsistent(walls, delta) {
  const d = Math.round(mod360(delta));
  if (walls === 1) return d === 0;
  if (walls === 2) return d === 180;
  if (walls === 4) return d === 90 || d === 270;
  return true;
}

function parseAll(sheet) {
  for (const sec of [...sheet.sections, ...sheet.extras]) {
    let after = null;
    for (const row of sec.rows) {
      row.parsed = parseRow(row, after);
      if (row.parsed.actions.length) after = row.parsed.actions.at(-1).beat;
    }
  }
  resolveReferences(sheet.sections);
  for (const sec of [...sheet.sections, ...sheet.extras]) {
    for (const row of sec.rows) {
      row.warnings = [];
      if (row.parsed.unknown) row.warnings.push('Nicht alle Bewegungen dieser Zeile wurden erkannt.');
      else if (row.parsed.uncertain) row.warnings.push('Die Zuordnung zu den Zählzeiten ist unsicher.');
    }
  }
}

function buildMain(sheet) {
  const start = initialState(0);
  if (!sheet.sections.length) return null;
  // Erst den Drehangaben im Text trauen; nur wenn die Wandzahl nicht aufgeht, an den Uhr-Angaben ausrichten.
  let snap = false;
  let probe = runSections(sheet.sections, 'm', start, 0, { snap, round: 0 });
  if (!wallsConsistent(sheet.walls, probe.state.theta) && probe.mismatches.length) {
    const alt = runSections(sheet.sections, 'm', start, 0, { snap: true, round: 0 });
    if (wallsConsistent(sheet.walls, alt.state.theta)) {
      snap = true;
      probe = alt;
    }
  }
  for (const mm of probe.mismatches) {
    mm.row.warnings.push(
      snap
        ? `Laut Text steht man hier auf ${fmtClock(mm.expected)}, die Drehungen ergeben ${fmtClock(mm.got)} – die Figur folgt der Uhr-Angabe.`
        : `Laut Text steht man hier auf ${fmtClock(mm.expected)}, die Drehungen ergeben aber ${fmtClock(mm.got)} – die Figur folgt den Drehungen.`,
    );
  }
  const roundLen = probe.beat;
  const perRound = probe.state.theta - start.theta;
  let rounds = [1, 2, 3, 4].find((n) => Math.round(mod360(perRound * n)) === 0) || 0;
  const cyclic = rounds > 0;
  if (!cyclic) rounds = 1;

  let events = probe.events;
  let state = probe.state;
  let beat = probe.beat;
  for (let r = 1; r < rounds; r++) {
    const next = runSections(sheet.sections, 'm', state, beat, { snap, round: r });
    events = events.concat(next.events);
    state = next.state;
    beat = next.beat;
  }
  const c0 = centre(start);
  const c1 = centre(state);
  return {
    events,
    initial: start,
    length: beat,
    roundLen,
    rounds,
    cyclic,
    drift: { x: c1.x - c0.x, z: c1.z - c0.z, theta: state.theta - start.theta },
  };
}

function buildExtra(extra, xi) {
  const start = initialState(clockToDeg(extra.note) ?? 0);
  const run = runSections([{ title: extra.title, rows: extra.rows }], `x${xi}`, start, 0, { snap: false, round: 0 });
  for (const mm of run.mismatches) {
    mm.row.warnings.push(`Laut Text steht man hier auf ${fmtClock(mm.expected)}, die Drehungen ergeben aber ${fmtClock(mm.got)}.`);
  }
  return { events: run.events, initial: start, length: run.beat, roundLen: run.beat, rounds: 1, cyclic: false, drift: null };
}

// sheet (aus extract.js) → abspielbare Daten. Ergänzt die Zeilen um `parsed` und `warnings`.
export function buildChoreo(sheet) {
  parseAll(sheet);
  return {
    main: buildMain(sheet),
    extras: sheet.extras.map(buildExtra),
  };
}
