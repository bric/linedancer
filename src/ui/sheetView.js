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
