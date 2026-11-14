import * as THREE from 'three';

const dir = new THREE.Vector3();
const perp = new THREE.Vector3();

// Analytische Zwei-Knochen-IK. Schreibt das Gelenk (Knie/Ellbogen) nach `joint`
// und das tatsächlich erreichte Ende nach `end` (falls das Ziel außer Reichweite liegt).
export function solveTwoBone(root, target, l1, l2, pole, joint, end) {
  dir.subVectors(target, root);
  const d0 = dir.length() || 1e-6;
  dir.divideScalar(d0);
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  perp.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(dir.y, -dir.x, 0);
  perp.normalize();
  joint.copy(root).addScaledVector(dir, a).addScaledVector(perp, h);
  end.copy(root).addScaledVector(dir, d);
}
