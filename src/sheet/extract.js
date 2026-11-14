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
  if (/ending|ende/i.test(title)) return 'ending';
  if (/restart/i.test(title)) return 'restart';
  return 'tag';
}

function finish(sheet) {
  const c = sheet.description.match(/(\d+)\s*count/i);
  const w = sheet.description.match(/(\d+)\s*wall/i);
  sheet.counts = c ? +c[1] : null;
  sheet.walls = w ? +w[1] : null;
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
  const re = /<div\s+class\s*=\s*["']?(pro_\w+)["']?\s*>((?:(?!<div)[\s\S])*?)<\/div>/gi;
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
      counts = null;
    }
  }
  return finish(sheet);
}

export function extractFromText(text) {
  const sheet = emptySheet();
  let current = null;
  const rowRe = /^((?:&\s*)?\d[\d&\s\-–]*?)[\s:.)]\s*(\S.*)$/;
  for (const raw of decodeEntities(text).split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ').trim();
    if (!line) continue;
    const meta = line.match(/^(Choreograph?ie|Beschreibung|Musik|Hinweis)\s*:\s*(.*)$/i);
    if (meta) {
      setMeta(sheet, meta[1], meta[2]);
      continue;
    }
    const row = line.match(rowRe);
    if (row && !/^\d+\s*(count|wall)/i.test(line)) {
      if (!current) {
        current = { title: '', rows: [] };
        sheet.sections.push(current);
      }
      current.rows.push({ counts: row[1].replace(/\s+/g, ''), text: row[2].trim() });
      continue;
    }
    if (/^wiederholung/i.test(line)) continue;
    if (!sheet.title && !current) {
      sheet.title = line;
      continue;
    }
    if (/^(ending|ende|tag|brücke|restart)/i.test(line)) {
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

export function extractSheet(input) {
  return /<div[\s>]/i.test(input) ? extractFromHtml(input) : extractFromText(input);
}
