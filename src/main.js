import { Stage } from './scene.js';
import { Figure } from './figure/figure.js';
import { Timeline, standingPose } from './player/player.js';
import { extractSheet } from './sheet/extract.js';
import { buildChoreo, fmtClock, initialState } from './choreo/simulate.js';
import { SheetView } from './ui/sheetView.js';
import { listDances, saveDance, removeDance } from './sheet/library.js';

const $ = (id) => document.getElementById(id);
const ui = {
  status: $('status'),
  count: $('count'), stepText: $('step-text'), info: $('info'),
  play: $('play'), prev: $('prev'), next: $('next'), restart: $('restart'),
  rate: $('rate'), rateOut: $('rate-out'), bpm: $('bpm'), loop: $('loop'), click: $('click'),
  pasteOpen: $('paste-open'), pasteDialog: $('paste-dialog'), pasteText: $('paste-text'),
  views: $('views'),
  fileOpen: $('file-open'), fileInput: $('file-input'), libraryOpen: $('library-open'), dropHint: $('drop-hint'),
};

const stage = new Stage($('canvas'));
const figure = new Figure();
stage.scene.add(figure.group);
const sheetView = new SheetView($('sheet'), selectRow);

const app = {
  sheet: null,
  timelines: {}, // 'm' = Tanz, 'x0'… = Ending/Tags
  tl: null,
  t: 0,
  playing: false,
  stopAt: null, // Zielzeit für Einzelschritte
  loopRange: null,
  shownIndex: NaN,
  snapCamera: true,
};

// ---------- Laden ----------

function setStatus(text, kind = 'error') {
  ui.status.hidden = !text;
  ui.status.textContent = text || '';
  ui.status.className = kind;
}

function loadSheet(source) {
  const sheet = extractSheet(source);
  const choreo = buildChoreo(sheet);
  if (!choreo.main) throw new Error('In diesem Text wurden keine Schritte gefunden (erwartet: Zählzeiten und Beschreibung pro Zeile).');
  app.sheet = sheet;
  app.timelines = { m: new Timeline(choreo.main) };
  choreo.extras.forEach((x, i) => {
    if (x.events.length) app.timelines[`x${i}`] = new Timeline(x);
  });
  sheetView.render(sheet);
  setPlaying(false);
  useTimeline('m');
  saveDance(sheet, source); // in „Meine Tänze“ merken
}

// Lädt eine Beschreibung und zeigt Fehler in der Statuszeile. Liefert true bei Erfolg.
function tryLoad(source) {
  try {
    loadSheet(source);
    setStatus('');
    return true;
  } catch (err) {
    setStatus(err.message);
    return false;
  }
}

// Aus der Zwischenablage: bevorzugt das HTML einer get-in-line-Seite, sonst den reinen Text
function loadClipboard(html, text) {
  if (html && /class\s*=\s*["']?pro_s/i.test(html)) {
    try {
      loadSheet(html);
      setStatus('');
      return true;
    } catch {
      // HTML unbrauchbar → mit dem Text weiter
    }
  }
  if (!text?.trim()) {
    setStatus('Die Zwischenablage enthält keinen Text. Bitte zuerst die Schrittbeschreibung markieren und kopieren.');
    return false;
  }
  return tryLoad(text);
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > 3_000_000) return setStatus('Die Datei ist zu groß. Erwartet wird eine gespeicherte Seite (.html) oder eine Textdatei.');
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    return setStatus('PDF-Dateien können nicht gelesen werden. Bitte die Seite als HTML speichern oder den Text kopieren und einfügen.');
  }
  tryLoad(await file.text());
}

// Zurück zur Liste der gemerkten Tänze (ohne geladenen Tanz)
function showLibrary() {
  setPlaying(false);
  app.sheet = null;
  app.tl = null;
  app.timelines = {};
  figure.update(standingPose(initialState()));
  stage.track(figure.centre, true);
  ui.count.textContent = '–';
  ui.stepText.textContent = 'Noch kein Tanz geladen';
  ui.info.textContent = 'Kopierte Schrittbeschreibung mit Strg/Cmd+V einfügen, eine Datei hierher ziehen oder rechts einen Tanz wählen.';
  sheetView.renderLibrary(listDances(), {
    onOpen: (d) => tryLoad(d.source),
    onRemove: (d) => {
      removeDance(d.id);
      showLibrary();
    },
  });
}

// ---------- Wiedergabe ----------

function useTimeline(key) {
  app.tl = app.timelines[key];
  app.tlKey = key;
  app.t = app.tl.start;
  app.loopRange = null;
  app.stopAt = null;
  app.shownIndex = NaN;
  app.snapCamera = true;
}

function setPlaying(on) {
  app.playing = on;
  app.stopAt = null;
  ui.play.textContent = on ? '⏸' : '▶';
  if (on && ui.click.checked) audio();
}

function seek(t) {
  app.t = t;
  app.loopRange = null;
  app.stopAt = null;
}

function selectRow(key) {
  const tlKey = key.split(':')[0];
  if (!app.timelines[tlKey]) return;
  if (tlKey !== app.tlKey) useTimeline(tlKey);
  const ev = app.tl.events.find((e) => e.rowKey === key);
  if (!ev) return;
  // Beim Abspielen mit Anlauf einsteigen, sonst die erste Zählzeit der Zeile zeigen
  seek(app.playing ? Math.max(app.tl.start, ev.beat - 1) : ev.beat);
}

function step(dir) {
  const tl = app.tl;
  if (!tl) return;
  const n = tl.indexAt(app.t);
  if (dir > 0) {
    if (!tl.cyclic && n >= tl.N - 1) return;
    app.loopRange = null;
    app.playing = true; // bis zur nächsten Zählzeit laufen lassen, dann anhalten
    app.stopAt = tl.at(n + 1).beat;
    ui.play.textContent = '▶';
  } else {
    setPlaying(false);
    const here = tl.at(n).beat;
    seek(n >= 0 && app.t > here + 0.02 ? here : n > 0 ? tl.at(n - 1).beat : tl.start);
  }
}

// Bereich des aktuellen Abschnitts für "Abschnitt wiederholen"
function sectionRange() {
  const tl = app.tl;
  if (tl.cyclic && app.t >= tl.b0 + tl.length) app.t -= Math.floor((app.t - tl.b0) / tl.length) * tl.length;
  const ev = tl.events[Math.max(0, tl.indexAt(app.t))];
  const same = (e) => e.round === ev.round && e.section === ev.section;
  const first = tl.events.findIndex(same);
  const last = tl.events.findLastIndex(same);
  return { start: tl.events[first].beat - 1, end: Math.max(ev.secEnd, tl.events[last].beat + 0.5), maxIndex: last };
}

function advance(dt) {
  const tl = app.tl;
  const before = app.t;
  app.t += (dt * (+ui.bpm.value || 100) * (+ui.rate.value / 100)) / 60;
  if (ui.click.checked && Math.floor(app.t) > Math.floor(before) && app.t >= 0) tick(Math.floor(app.t) % 8 === 0);

  if (app.stopAt !== null) {
    if (app.t >= app.stopAt) {
      app.t = app.stopAt;
      setPlaying(false);
    }
    return;
  }
  if (ui.loop.checked) {
    const r = app.loopRange;
    if (!r || app.t < r.start - 0.01) app.loopRange = sectionRange();
    else if (app.t >= r.end) app.t = r.start;
  } else {
    app.loopRange = null;
    if (!tl.cyclic && app.t >= tl.length) app.t = tl.start;
  }
}

// ---------- Metronom ----------

let ctx = null;
function audio() {
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tick(accent) {
  const ac = audio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = accent ? 1320 : 880;
  gain.gain.setValueAtTime(0.15, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.07);
}

// ---------- Anzeige ----------

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function updateHud(sample) {
  const tl = app.tl;
  const ev = sample.event;
  if (!ev) {
    const first = tl.events[0];
    ui.count.textContent = '–';
    ui.stepText.textContent = `Gleich: ${cap(first.raw)}`;
    ui.info.textContent = `${first.sectionTitle} · Blick ${fmtClock(tl.initial.theta)}`;
    sheetView.highlight(first.rowKey);
    return;
  }
  ui.count.textContent = ev.label;
  ui.stepText.textContent = cap(ev.raw);
  const cycle = tl.cyclic ? Math.floor(sample.index / tl.N) : 0;
  const parts = [ev.sectionTitle.replace(/:.*/, '')];
  if (app.tlKey === 'm') parts.push(`Runde ${cycle * tl.rounds + ev.round + 1}`);
  parts.push(`Blick ${fmtClock(sample.state.theta)}`, `Gewicht ${sample.state.weight === 'L' ? 'links' : 'rechts'}`);
  ui.info.textContent = parts.join(' · ');
  sheetView.highlight(ev.rowKey);
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  if (app.tl) {
    if (app.playing) advance(dt);
    const sample = app.tl.sample(app.t, app.loopRange?.maxIndex);
    figure.update(sample.pose);
    stage.track(figure.centre, app.snapCamera);
    app.snapCamera = false;
    if (sample.index !== app.shownIndex) {
      app.shownIndex = sample.index;
      updateHud(sample);
      stage.setTrail(app.tl.trail(sample.index));
    }
  }
  stage.render();
  requestAnimationFrame(frame);
}

// ---------- Bedienung ----------

// „Einfügen“: direkt aus der Zwischenablage; verweigert der Browser den Zugriff, von Hand im Dialog
ui.pasteOpen.addEventListener('click', async () => {
  try {
    let html = '';
    let text = '';
    if (navigator.clipboard.read) {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
      }
    } else {
      text = await navigator.clipboard.readText();
    }
    loadClipboard(html, text);
  } catch {
    ui.pasteText.value = '';
    ui.pasteDialog.showModal();
  }
});
ui.pasteDialog.addEventListener('close', () => {
  if (ui.pasteDialog.returnValue !== 'ok' || !ui.pasteText.value.trim()) return;
  tryLoad(ui.pasteText.value);
});
// Strg/Cmd+V irgendwo auf der Seite
document.addEventListener('paste', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  e.preventDefault();
  loadClipboard(e.clipboardData.getData('text/html'), e.clipboardData.getData('text/plain'));
});

ui.fileOpen.addEventListener('click', () => ui.fileInput.click());
ui.fileInput.addEventListener('change', () => {
  loadFile(ui.fileInput.files[0]);
  ui.fileInput.value = '';
});
ui.libraryOpen.addEventListener('click', showLibrary);

// Datei (oder markierten Text) ins Fenster ziehen
let dragDepth = 0;
const showDrop = (on) => (ui.dropHint.hidden = !on);
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  showDrop(true);
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) showDrop(false);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  showDrop(false);
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
  else loadClipboard(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
});
ui.play.addEventListener('click', () => setPlaying(!app.playing || app.stopAt !== null));
ui.prev.addEventListener('click', () => step(-1));
ui.next.addEventListener('click', () => step(1));
ui.restart.addEventListener('click', () => app.tl && seek(app.tl.start));
ui.rate.addEventListener('input', () => (ui.rateOut.textContent = `${ui.rate.value} %`));
ui.loop.addEventListener('change', () => (app.loopRange = null));
ui.click.addEventListener('change', () => ui.click.checked && audio());
ui.views.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  stage.setView(btn.dataset.view);
  for (const b of ui.views.children) b.classList.toggle('active', b === btn);
});
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, dialog') && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  if (e.key === ' ') setPlaying(!app.playing || app.stopAt !== null);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Home') app.tl && seek(app.tl.start);
  else return;
  e.preventDefault();
});

// Start ohne geladenen Tanz: Figur steht bereit, bis eine Beschreibung geladen wird
showLibrary();
requestAnimationFrame(frame);
