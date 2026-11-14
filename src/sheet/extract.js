// Liest eine Schrittbeschreibung im get-in-line.de-Format (HTML) oder als reinen Text
// und liefert eine einheitliche Struktur.

const ENTITIES = {
  amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', copy: '©',
  frac14: '¼', frac12: '½', frac34: '¾', frac18: '⅛', frac38: '⅜', frac58: '⅝', frac78: '⅞',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ntilde: 'ñ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bdquo: '„',
};

export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[name] ?? m;
  });
}

const clean = (html) =>
  decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

function emptySheet() {
  return { title: '', choreo: '', description: '', music: '', hint: '', counts: null, walls: null, sections: [], extras: [] };
}

function extraKind(title) {
  if (/ending|ende|finish/i.test(title)) return 'ending';
  if (/restart/i.test(title)) return 'restart';
  return 'tag';
}

function finish(sheet) {
  const c = sheet.description.match(/(\d+)\s*count/i);
  const w = sheet.description.match(/(\d+)\s*wall/i);
  sheet.counts = c ? +c[1] : sheet.counts;
  sheet.walls = w ? +w[1] : sheet.walls;
  sheet.sections = sheet.sections.filter((s) => s.rows.length);
  sheet.extras = sheet.extras.filter((x) => x.rows.length);
  return sheet;
}

function setMeta(sheet, label, value) {
  if (/beschreibung/i.test(label)) sheet.description = value;
  else if (/musik/i.test(label)) sheet.music = value;
  else if (/hinweis/i.test(label)) sheet.hint = value;
  else if (/choreo/i.test(label)) sheet.choreo = value;
}

export function extractFromHtml(html) {
  const sheet = emptySheet();
  // Nur "Blatt"-DIVs ohne verschachtelte DIVs
  // tolerant gegenüber weiteren Attributen (kopiertes HTML aus der Zwischenablage trägt z. B. style="…")
  const re = /<div\b[^>]*?\bclass\s*=\s*["']?(pro_\w+)["']?[^>]*>((?:(?!<div)[\s\S])*?)<\/div>/gi;
  let current = null; // Abschnitt oder Extra, in den Zeilen einsortiert werden
  let label = null;
  let counts = null;
  for (const m of html.matchAll(re)) {
    const cls = m[1].toLowerCase();
    const text = clean(m[2]);
    if (cls === 'pro_a') {
      if (!sheet.title && text) sheet.title = text;
    } else if (cls === 'pro_b') {
      sheet.choreo = text.replace(/^choreograph?ie:\s*/i, '');
    } else if (cls === 'pro_d') {
      label = text;
    } else if (cls === 'pro_e') {
      if (label) setMeta(sheet, label, text);
      label = null;
    } else if (cls === 'pro_o') {
      if (/^wiederholung/i.test(text) || !text) continue;
      current = { title: text, rows: [] };
      sheet.sections.push(current);
    } else if (cls === 'pro_x') {
      const t = text.match(/^(.*?)\s*(?:\((.*)\))?$/);
      current = { kind: extraKind(text), title: t[1].trim(), note: t[2] || '', summary: '', rows: [] };
      sheet.extras.push(current);
    } else if (cls === 'pro_y') {
      if (current && 'kind' in current) current.summary = text;
    } else if (cls === 'pro_l') {
      counts = text;
    } else if (cls === 'pro_s') {
      if (!current) {
        current = { title: '', rows: [] };
        sheet.sections.push(current);
      }
      if (counts) current.rows.push({ counts, text });
      else if (text && current.rows.length) {
        // Zeile ohne Zählzeiten, z. B. "(Restart: In der 4. Runde … hier abbrechen)": Anmerkung zur Zeile davor
        const prev = current.rows.at(-1);
        prev.note = prev.note ? `${prev.note}\n${text}` : text;
      }
      counts = null;
    }
  }
  return finish(sheet);
}

export function extractFromText(text) {
  const sheet = emptySheet();
  let current = null;
  // Zählzeiten am Zeilenanfang, auch direkt am Text klebend wie bei Copperknob: "1&2Step to R …"
  const rowRe = /^((?:&\s*)?\d{1,2}(?:\s*(?:[&\-–,]|und)\s*\d{0,2})*&?)(?:\s*[:.)]\s*|\s+|(?=[\p{L}¼½¾⅛⅜⅝⅞(]))(\S.*)$/u;
  // Text beginnt mit einem Wort, einem Bruch oder einer Anzahl ("4 Schritte nach hinten")
  const isRow = (m) => m && m[1].match(/\d+/g).every((n) => +n >= 1 && +n <= 16) && /^(?:\d+\s+)?[\p{L}¼½¾⅛⅜⅝⅞(]/u.test(m[2]);
  // Beim Kopieren aus dem Browser landen oft mehrere Zeilen einer Seite in einer Textzeile:
  //   "1&Rechten Fuß … 2&Schritt nach rechts … 3&4Rechten Fuß …"
  //   "Beschreibung:32 count … Musik:… Hinweis:…"
  // Vor jeder Zählzeit, die direkt an einem Satzanfang klebt, und vor jedem Kopf-Stichwort neu umbrechen.
  const LABEL = '(?:&\\s?)?\\d{1,2}(?:[&\\-–]\\d{0,2}|&)*';
  const START = '(?:[A-ZÄÖÜ¼½¾⅛⅜⅝⅞]|\\d\\s+[A-ZÄÖÜ])'; // auch "5-84 Schritte" = "5-8" + "4 Schritte"
  const gluedRow = new RegExp(`^${LABEL}${START}`);
  const nextRow = new RegExp(`\\s+(?=${LABEL}${START})`, 'g');
  const lines = decodeEntities(text)
    .split(/\r?\n/)
    .flatMap((l) => l.replace(/\s+(?=(?:Choreograph?ie|Beschreibung|Musik|Hinweis):)/g, '\n').split('\n'))
    .map((l) => l.replace(/\t/g, '  ').trim())
    .flatMap((l) => (gluedRow.test(l) ? l.replace(nextRow, '\n').split('\n') : [l]))
    // "7-82 Schritte nach vorn": Zählzeiten "7-8" kleben an "2 Schritte" – trennen, wenn das einen gültigen Bereich ergibt
    .map((l) => l.replace(/^((?:&\s?)?(?:\d{1,2}[&\-–])*?(\d{1,2})[\-–](\d))(?=\d\s+\p{L})/u, (m, label, from, to) => (+to > +from ? `${label} ` : m)))
    .filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const meta = line.match(/^(Choreograph?ie|Choreographer|Choreographed by|Beschreibung|Musik|Music|Hinweis)\s*:?\s*(.*)$/i);
    if (meta && (line.includes(':') || /by/i.test(meta[1]))) {
      setMeta(sheet, meta[1].replace(/^music$/i, 'Musik'), meta[2]);
      continue;
    }
    // Copperknob-Kopf: "Count: 32  Wall: 4  Level: Beginner"
    const cnt = line.match(/\bcount\s*:\s*(\d+)/i);
    const wall = line.match(/\bwalls?\s*:\s*(\d+)/i);
    if (cnt || wall || /^level\s*:/i.test(line)) {
      if (cnt) sheet.counts = +cnt[1];
      if (wall) sheet.walls = +wall[1];
      continue;
    }
    if (/^\d+[- ]?counts?\b|^intro\b/i.test(line)) {
      sheet.hint = sheet.hint || line;
      continue;
    }
    // Zählzeiten allein in einer Zeile, Beschreibung in der nächsten (je nach Browser beim Kopieren)
    const alone = /^(?:&\s*)?\d{1,2}(?:\s*(?:[&\-–,]|und)\s*\d{0,2})*&?$/.test(line) && lines[i + 1] && !/^[\d&]/.test(lines[i + 1]);
    if (alone) {
      lines[i + 1] = `${line} ${lines[i + 1]}`;
      continue;
    }
    const row = line.match(rowRe);
    if (isRow(row)) {
      if (!current) {
        current = { title: '', rows: [] };
        sheet.sections.push(current);
      }
      current.rows.push({ counts: row[1].replace(/\s+/g, ''), text: row[2].trim() });
      continue;
    }
    if (/^(wiederholung|start again|begin again|repeat\b|enjoy|have fun)/i.test(line)) continue;
    // "(Restart: In der 4. Runde … hier abbrechen)" – Anmerkung zur Zeile davor
    if (/^\(.*\)$/.test(line) && current?.rows.length) {
      const prev = current.rows.at(-1);
      prev.note = prev.note ? `${prev.note}\n${line}` : line;
      continue;
    }
    // Eine Zeile direkt vor Schrittzeilen ist eine Abschnittsüberschrift, kein Tanztitel
    if (!sheet.title && !current && !isRow((lines[i + 1] || '').match(rowRe))) {
      sheet.title = line;
      continue;
    }
    if (/^(ending|ende|tag|brücke|bridge|restart|finish)\b/i.test(line)) {
      const t = line.match(/^(.*?)\s*(?:\((.*)\))?$/);
      current = { kind: extraKind(line), title: t[1].trim(), note: t[2] || '', summary: '', rows: [] };
      sheet.extras.push(current);
    } else if (current && 'kind' in current && !current.rows.length && !current.summary) {
      current.summary = line;
    } else {
      current = { title: line, rows: [] };
      sheet.sections.push(current);
    }
  }
  return finish(sheet);
}

// Beliebiges HTML → Text mit Zeilenumbrüchen an Blockgrenzen
export function htmlToText(html) {
  return html
    .replace(/<(script|style|head|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(div|p|tr|li|h\d|td|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
}

export function extractSheet(input) {
  if (!/<(div|p|br|span|table|body|html)[\s>/]/i.test(input)) return extractFromText(input);
  const sheet = extractFromHtml(input);
  // Keine get-in-line-Struktur (z. B. gespeicherte Seite einer anderen Quelle): als Text lesen
  return sheet.sections.length ? sheet : extractFromText(htmlToText(input));
}
