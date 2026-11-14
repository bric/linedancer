// Stilisierte Gliederpuppe. Wird pro Frame aus einer Pose (siehe player.js) aufgebaut:
// Füße und Hände sind Ziele, Knie/Ellbogen ergeben sich per IK.

import * as THREE from 'three';
import { solveTwoBone } from './ik.js';

export const COLORS = { L: 0x2f76e0, R: 0xe0492f };

const UP = new THREE.Vector3(0, 1, 0);
const THIGH = 0.46;
const SHIN = 0.46;
const LEG = 0.9; // etwas weniger als THIGH+SHIN → Knie nie ganz durchgestreckt
const ANKLE = 0.08;
const HIP_Y = ANKLE + 0.9;
const HIP_W = 0.1;
const SHOULDER_W = 0.2;
const CHEST = 0.5;
const UPPER = 0.28;
const LOWER = 0.26;

const v = () => new THREE.Vector3();
const tmp = { a: v(), b: v(), c: v(), d: v() };

function capsule(radius, length, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), material);
  mesh.castShadow = true;
  return mesh;
}

function between(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  tmp.d.subVectors(b, a).normalize();
  mesh.quaternion.setFromUnitVectors(UP, tmp.d);
}

export class Figure {
  constructor() {
    this.group = new THREE.Group();
    const mat = (color, roughness = 0.65) => new THREE.MeshStandardMaterial({ color, roughness });
    const shirt = mat(0xf2ead8);
    const skin = mat(0xe8b998);
    const belt = mat(0x5a3b22);
    const hatMat = mat(0x8a6238, 0.8);
    const legMat = { L: mat(COLORS.L), R: mat(COLORS.R) };
    const bootMat = { L: mat(0x1c4690, 0.5), R: mat(0x96281a, 0.5) };

    const add = (m) => (this.group.add(m), m);
    this.torso = add(capsule(0.15, CHEST - 0.12, shirt));
    this.pelvis = add(capsule(0.13, 0.12, belt));
    this.pelvis.geometry.rotateZ(Math.PI / 2);

    // Kopf mit Hut und Nase, damit die Blickrichtung klar erkennbar ist
    this.head = add(new THREE.Group());
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), skin);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
    nose.position.set(0, -0.01, -0.115);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.015, 32), hatMat);
    brim.position.y = 0.07;
    brim.scale.z = 1.15;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.125, 0.13, 24), hatMat);
    crown.position.y = 0.14;
    for (const m of [skull, nose, brim, crown]) {
      m.castShadow = true;
      this.head.add(m);
    }
    this.neck = add(capsule(0.045, 0.06, skin));

    this.legs = {};
    this.arms = {};
    for (const f of ['L', 'R']) {
      const foot = add(new THREE.Group());
      foot.rotation.order = 'YXZ';
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), bootMat[f]);
      boot.position.set(0, -0.045, -0.06);
      const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 16), bootMat[f]);
      toe.position.set(0, -0.045, -0.185);
      toe.scale.z = 1.3;
      boot.castShadow = toe.castShadow = true;
      foot.add(boot, toe);
      this.legs[f] = {
        thigh: add(capsule(0.075, THIGH - 0.1, legMat[f])),
        shin: add(capsule(0.06, SHIN - 0.08, legMat[f])),
        foot,
      };
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), skin);
      hand.castShadow = true;
      this.arms[f] = {
        upper: add(capsule(0.05, UPPER - 0.06, shirt)),
        lower: add(capsule(0.042, LOWER - 0.06, shirt)),
        hand: add(hand),
      };
    }
    this.centre = v(); // Beckenposition, z. B. für die Kamera
  }

  update(pose) {
    const th = THREE.MathUtils.degToRad(pose.theta);
    const F = tmp.a.set(Math.sin(th), 0, -Math.cos(th));
    const R = tmp.b.set(Math.cos(th), 0, Math.sin(th));

    // Beckenhöhe so wählen, dass beide Beine den Boden erreichen
    let hipY = HIP_Y;
    for (const f of ['L', 'R']) {
      const ft = pose.feet[f];
      if (ft.y > 0.12) continue;
      const s = f === 'R' ? 1 : -1;
      const dh = Math.hypot(ft.x - (pose.com.x + R.x * s * HIP_W), ft.z - (pose.com.z + R.z * s * HIP_W));
      hipY = Math.min(hipY, ANKLE + ft.y + Math.sqrt(Math.max(0.04, LEG * LEG - dh * dh)));
    }
    hipY = Math.max(hipY, 0.72) - pose.dip + pose.hop;

    const P = this.centre.set(pose.com.x, hipY, pose.com.z);
    const chest = v().copy(P).addScaledVector(UP, CHEST);
    this.pelvis.position.copy(P);
    this.pelvis.rotation.y = -th;
    between(this.torso, v().copy(P).addScaledVector(UP, 0.08), chest);
    this.head.position.copy(chest).addScaledVector(UP, 0.26);
    this.head.rotation.y = -th;
    between(this.neck, chest, this.head.position);

    const knee = v();
    const end = v();
    const pole = v();
    for (const f of ['L', 'R']) {
      const s = f === 'R' ? 1 : -1;
      const ft = pose.feet[f];
      const leg = this.legs[f];
      const hip = v().copy(P).addScaledVector(R, s * HIP_W);
      const ankle = v().set(ft.x, ANKLE + ft.y, ft.z);
      const fr = THREE.MathUtils.degToRad(ft.rot);
      // Knie zeigt nach vorn, leicht in Richtung der Fußspitze
      pole.set(Math.sin(fr), 0, -Math.cos(fr)).add(F).addScaledVector(R, s * 0.15).normalize();
      solveTwoBone(hip, ankle, THIGH, SHIN, pole, knee, end);
      between(leg.thigh, hip, knee);
      between(leg.shin, knee, end);
      leg.foot.position.copy(end);
      leg.foot.rotation.set(-ft.pitch, -fr, 0);

      const arm = this.arms[f];
      const h = pose.hands[f];
      const shoulder = v().copy(chest).addScaledVector(R, s * SHOULDER_W).addScaledVector(UP, -0.03);
      const hand = v().copy(P).addScaledVector(R, h[0]).addScaledVector(UP, h[1]).addScaledVector(F, h[2]);
      pole.copy(R).multiplyScalar(s).addScaledVector(F, -0.6).addScaledVector(UP, -0.3).normalize();
      solveTwoBone(shoulder, hand, UPPER, LOWER, pole, knee, end);
      between(arm.upper, shoulder, knee);
      between(arm.lower, knee, end);
      arm.hand.position.copy(end);
    }
  }
}
