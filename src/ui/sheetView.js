// Rechte Spalte: die Schrittbeschreibung als anklickbare Liste.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export class SheetView {
  constructor(root, onSelect) {
    this.root = root;
    this.onSelect = onSelect;
    this.rows = new Map();
    this.active = null;
  }

  render(sheet) {
    this.rows.clear();
    this.active = null;
    const frag = document.createDocumentFragment();
    frag.append(el('h2', 'sheet-title', sheet.title || 'Ohne Titel'));
    const meta = el('dl', 'sheet-meta');
    for (const [k, val] of [['Choreographie', sheet.choreo], ['Beschreibung', sheet.description], ['Musik', sheet.music], ['Hinweis', sheet.hint]]) {
      if (val) meta.append(el('dt', null, k), el('dd', null, val));
    }
    frag.append(meta);

    const addRows = (rows, prefix, si) => {
      const list = el('ol', 'rows');
      rows.forEach((row, ri) => {
        const key = `${prefix}:${si}:${ri}`;
        const li = el('li', 'row');
        li.tabIndex = 0;
        li.append(el('span', 'row-counts', row.counts), el('span', 'row-text', row.text));
        if (row.note) li.append(el('span', 'row-note', row.note.replace(/^\((.*)\)$/gm, '$1')));
        if (row.warnings?.length) {
          li.classList.add('warn');
          li.append(el('span', 'row-warn', '⚠ ' + row.warnings.join(' ')));
        }
        const go = () => this.onSelect(key);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') go();
        });
        this.rows.set(key, li);
        list.append(li);
      });
      return list;
    };

    sheet.sections.forEach((sec, si) => {
      frag.append(el('h3', 'section-title', sec.title || `Abschnitt ${si + 1}`), addRows(sec.rows, 'm', si));
    });
    sheet.extras.forEach((x, xi) => {
      const h = el('h3', 'section-title extra', x.title);
      if (x.note) h.append(el('span', 'extra-note', ` (${x.note})`));
      frag.append(h);
      if (x.summary) frag.append(el('p', 'extra-summary', x.summary));
      frag.append(addRows(x.rows, `x${xi}`, 0));
    });
    this.root.replaceChildren(frag);
    this.root.scrollTop = 0;
  }

  // Ohne geladenen Tanz: Liste der gemerkten Tänze und kurze Anleitung
  renderLibrary(dances, { onOpen, onRemove }) {
    this.rows.clear();
    this.active = null;
    const frag = document.createDocumentFragment();
    frag.append(el('h2', 'sheet-title', 'Meine Tänze'));
    if (dances.length) {
      const list = el('ul', 'library');
      for (const d of dances) {
        const li = el('li');
        const open = el('button', 'open');
        open.type = 'button';
        open.append(el('strong', null, d.title), el('span', null, [d.choreo, d.description].filter(Boolean).join(' · ')));
        open.addEventListener('click', () => onOpen(d));
        const remove = el('button', 'remove ghost', '✕');
        remove.type = 'button';
        remove.title = `„${d.title}“ aus der Liste entfernen`;
        remove.setAttribute('aria-label', remove.title);
        remove.addEventListener('click', () => onRemove(d));
        li.append(open, remove);
        list.append(li);
      }
      frag.append(list);
    } else {
      frag.append(el('p', 'library-hint', 'Hier erscheinen die Tänze, die du geladen hast. Sie werden in diesem Browser gemerkt.'));
    }
    frag.append(el('h3', 'section-title', 'Tanz laden'));
    const how = el('ol', 'library-hint');
    for (const text of [
      'Seite mit der Schrittbeschreibung öffnen, alles markieren und kopieren – dann hier Strg/Cmd+V drücken oder oben „Einfügen“ wählen.',
      'Oder die Seite speichern und die Datei in dieses Fenster ziehen bzw. über „Datei öffnen“ wählen.',
    ]) {
      how.append(el('li', null, text));
    }
    frag.append(how);
    this.root.replaceChildren(frag);
    this.root.scrollTop = 0;
  }

  highlight(key) {
    if (key === this.active) return;
    this.rows.get(this.active)?.classList.remove('active');
    this.active = key;
    const li = this.rows.get(key);
    if (!li) return;
    li.classList.add('active');
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
