// Zeitachse über den Keyframes: liefert zu jeder Zeit (in Schlägen) eine interpolierte Pose.
// Eine Bewegung "landet" auf ihrer Zählzeit, läuft also im Intervall davor ab.

import { cloneState, fwdV, rightV, sgn, other } from '../choreo/simulate.js';

const HANDS = {
  belt: { L: [-0.17, 0.05, 0.1], R: [0.17, 0.05, 0.1] },
  clap: { L: [-0.025, 0.4, 0.3], R: [0.025, 0.4, 0.3] },
  upR: { L: [-0.17, 0.05, 0.1], R: [0.24, 0.98, 0.05] },
  upL: { L: [-0.24, 0.98, 0.05], R: [0.17, 0.05, 0.1] },
};
const handsOf = (s) => HANDS[s.gesture] || HANDS.belt;
const lerp = (a, b, e) => a + (b - a) * e;
const smooth = (p) => p * p * (3 - 2 * p);

function shifted(state, k, drift) {
  const s = cloneState(state);
  for (const f of ['L', 'R']) {
    const ft = s.feet[f];
    ft.x += k * drift.x;
    ft.gx += k * drift.x;
    ft.z += k * drift.z;
    ft.gz += k * drift.z;
    ft.rot += k * drift.theta;
  }
  s.com.x += k * drift.x;
  s.com.z += k * drift.z;
  s.theta += k * drift.theta;
  return s;
}

// Ein Fuß kann nicht durch den anderen hindurch: Führt der gerade Weg über den stehenden Fuß,
// wird er vorn (bzw. hinten) um ihn herumgeführt. Gerechnet wird im Koordinatensystem des
// stehenden Fußes o: lx = seitlich, lf = nach vorn.
const CLEAR = 0.3; // nötiger Abstand Knöchel–Knöchel in Fußrichtung, wenn die Füße seitlich überlappen
const BAND = 0.2; // seitlicher Bereich, in dem ausgewichen wird
function clearOtherFoot(x, z, a, b, oA, oB, e, p, behindHint) {
  // Der stehende Fuß kann sich mitdrehen (Drehung auf dem Ballen) – daher seine aktuelle Lage verwenden
  const o = { x: lerp(oA.x, oB.x, e), z: lerp(oA.z, oB.z, e), rot: lerp(oA.rot, oB.rot, e) };
  const F = fwdV(o.rot);
  const localTo = (ref) => {
    const f = fwdV(ref.rot);
    const r = rightV(ref.rot);
    return (px, pz) => [(px - ref.x) * r[0] + (pz - ref.z) * r[1], (px - ref.x) * f[0] + (pz - ref.z) * f[1]];
  };
  const [lx, lf] = localTo(o)(x, z);
  const need = CLEAR * (1 - (lx / BAND) ** 2);
  if (need <= 0) return [x, z];
  // vorn oder hinten herum: laut Schritt ("über"/"hinter"), sonst dort, wo Start und Ziel liegen
  const ends = localTo(oA)(a.x, a.z)[1] + localTo(oB)(b.x, b.z)[1];
  const side = behindHint === true ? -1 : behindHint === false ? 1 : ends < -1e-6 ? -1 : 1;
  if (side * lf >= need) return [x, z];
  // an Start und Ziel nichts verschieben, dazwischen voll ausweichen
  const w = Math.min(1, 3 * Math.sin(Math.PI * p));
  const shift = (side * need - lf) * w;
  return [x + F[0] * shift, z + F[1] * shift];
}

function blend(A, B, p) {
  const e = smooth(p);
  const arc = Math.sin(Math.PI * p);
  const fx = B.fx || {};
  const feet = {};
  for (const f of ['L', 'R']) {
    const a = A.feet[f];
    const b = B.feet[f];
    const stomp = fx.stomp === f;
    const ef = stomp ? p * p : e; // Stampfer landen hart
    let x = lerp(a.x, b.x, ef);
    let z = lerp(a.z, b.z, ef);
    let y = lerp(a.y, b.y, ef);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    if (stomp) y += 0.16 * arc;
    else if (dist > 0.03) y += (fx.jump ? 0.14 : 0.05 + dist * 0.1) * arc;
    else if (A.weight !== f && B.weight === f && a.y < 0.02) y += 0.025 * arc;
    if (fx.sweep === f) {
      // Fuß im Bogen nach außen führen
      const R = rightV(B.theta);
      x += R[0] * sgn(f) * 0.2 * arc;
      z += R[1] * sgn(f) * 0.2 * arc;
    }
    if (dist > 0.03) [x, z] = clearOtherFoot(x, z, a, b, A.feet[other(f)], B.feet[other(f)], e, p, fx.cross?.foot === f ? fx.cross.behind : null);
    let pitch = lerp(a.pitch, b.pitch, e);
    if (fx.bounce?.includes(f)) {
      y += 0.05 * arc;
      pitch += 0.45 * arc;
    }
    feet[f] = { x, z, y, rot: lerp(a.rot, b.rot, e), pitch };
  }
  const ha = handsOf(A);
  const hb = handsOf(B);
  const hands = {};
  for (const f of ['L', 'R']) hands[f] = ha[f].map((v, i) => lerp(v, hb[f][i], e));
  return {
    feet,
    hands,
    theta: lerp(A.theta, B.theta, e),
    com: { x: lerp(A.com.x, B.com.x, e), z: lerp(A.com.z, B.com.z, e) },
    dip: (A.weight !== B.weight ? 0.03 : 0.012) * arc,
    hop: fx.jump ? 0.07 * arc : 0,
    weight: p < 0.5 ? A.weight : B.weight,
  };
}

export class Timeline {
  constructor(data) {
    Object.assign(this, data);
    this.N = this.events.length;
    this.b0 = this.events[0].beat;
    this.start = this.b0 - 1;
  }

  // Globaler Ereignisindex (über Wiederholungen hinweg) → { beat, state, ev }
  at(n) {
    if (n < 0) return { beat: this.start, state: this.initial, ev: null };
    if (!this.cyclic) {
      const ev = this.events[Math.min(n, this.N - 1)];
      return { beat: ev.beat, state: ev.state, ev };
    }
    const k = Math.floor(n / this.N);
    const ev = this.events[n - k * this.N];
    return { beat: ev.beat + k * this.length, state: k ? shifted(ev.state, k, this.drift) : ev.state, ev };
  }

  indexAt(t) {
    if (t < this.b0) return -1;
    let k = 0;
    let local = t;
    if (this.cyclic) {
      k = Math.floor((t - this.b0) / this.length);
      local = t - k * this.length;
    }
    let lo = 0;
    let hi = this.N - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.events[mid].beat <= local + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return k * this.N + lo;
  }

  // maxIndex begrenzt die Vorschau auf folgende Bewegungen (für Abschnitts-Wiederholung).
  sample(t, maxIndex = Infinity) {
    const n = Math.min(this.indexAt(t), maxIndex);
    const A = this.at(n);
    const hasNext = n + 1 <= maxIndex && (this.cyclic || n + 1 < this.N);
    let pose;
    if (hasNext) {
      const B = this.at(n + 1);
      const tA = n < 0 ? B.beat - 1 : A.beat;
      const dur = Math.min(B.beat - tA, 1) * 0.85;
      const p = Math.min(1, Math.max(0, (t - (B.beat - dur)) / dur));
      pose = blend(A.state, B.state, p);
    } else {
      pose = blend(A.state, A.state, 1);
    }
    return { pose, index: n, event: A.ev, state: A.state };
  }

  // Letzte belastete Fußpositionen bis zum Ereignis n (für die Fußspuren).
  trail(n, count = 6) {
    const out = [];
    for (let i = n; i >= 0 && out.length < count; i--) {
      const s = this.at(i).state;
      const ft = s.feet[s.weight];
      const last = out.at(-1);
      if (last && last.foot === s.weight && Math.hypot(last.x - ft.gx, last.z - ft.gz) < 0.01) continue;
      out.push({ foot: s.weight, x: ft.gx, z: ft.gz, rot: ft.rot });
    }
    return out;
  }
}
