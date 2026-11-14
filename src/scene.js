import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS } from './figure/figure.js';

const VIEWS = {
  back: [0, 2.3, 5.4], // hinter der Figur, Blick Richtung 12 Uhr
  front: [0, 2.3, -5.4],
  top: [0, 7.5, 0.6],
};

function wallSign(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,24,32,0.82)';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f4d58d';
  g.font = '600 62px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  // flach auf dem Boden, von hinten gesehen aufrecht lesbar
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  return mesh;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2130);
    this.scene.fog = new THREE.Fog(0x1b2130, 12, 30);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 14;
    this.controls.target.set(0, 0.8, 0);
    this.setView('back');

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3026, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
    this.scene.add(this.sun, this.sun.target);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x6f5540, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const grid = new THREE.GridHelper(80, 160, 0x8a6e55, 0x7c624b);
    grid.position.y = 0.002;
    this.scene.add(floor, grid);

    // Wandschilder 12/3/6/9 wandern mit der Figur mit und geben die Orientierung im Raum
    this.walls = new THREE.Group();
    const radius = 1.9;
    for (const [label, x, z] of [['12', 0, -1], ['3', 1, 0], ['6', 0, 1], ['9', -1, 0]]) {
      const s = wallSign(label);
      s.position.set(x * radius, 0.008, z * radius);
      this.walls.add(s);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.012, radius + 0.012, 96),
      new THREE.MeshBasicMaterial({ color: 0xf4d58d, transparent: true, opacity: 0.35 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    this.walls.add(ring);
    this.scene.add(this.walls);

    // Fußspuren der letzten belasteten Schritte
    this.prints = [];
    const printGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(printGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.scale.set(0.055, 1, 0.13);
      m.visible = false;
      this.prints.push(m);
      this.scene.add(m);
    }

    this.follow = new THREE.Vector3(0, 0.8, 0);
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas.parentElement;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setView(name) {
    const [x, y, z] = VIEWS[name];
    const t = this.controls.target;
    this.camera.position.set(t.x + x, y, t.z + z);
    this.controls.update();
  }

  setTrail(trail) {
    this.prints.forEach((m, i) => {
      const p = trail[i];
      m.visible = !!p;
      if (!p) return;
      m.position.set(p.x, 0.006 + i * 0.0005, p.z);
      m.rotation.y = -THREE.MathUtils.degToRad(p.rot);
      m.material.color.setHex(COLORS[p.foot]);
      m.material.opacity = 0.55 * (1 - i / this.prints.length);
    });
  }

  // Kamera, Licht und Wandschilder der Figur nachführen. snap = ohne Verzögerung (nach Sprüngen).
  track(centre, snap = false) {
    const goal = new THREE.Vector3(centre.x, 0.8, centre.z);
    const far = this.follow.distanceTo(goal) > 2.5;
    const before = this.follow.clone();
    if (snap || far) this.follow.copy(goal);
    else this.follow.lerp(goal, 0.06);
    const delta = this.follow.clone().sub(before);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.walls.position.set(this.follow.x, 0, this.follow.z);
    this.sun.position.set(this.follow.x + 2.5, 6, this.follow.z + 3);
    this.sun.target.position.set(this.follow.x, 0, this.follow.z);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
