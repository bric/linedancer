// "Meine Tänze": zuletzt geladene Schrittbeschreibungen im Browser merken (localStorage),
// damit jeder Tanz nur einmal importiert werden muss.

const KEY = 'linedancer.dances.v1';
const MAX_DANCES = 30;
const MAX_SOURCE = 200_000;

const defaultStore = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // z. B. blockierte Website-Daten
  }
};

// Von einer get-in-line-Seite nur die Beschreibungs-Blöcke behalten – der Rest der Seite wird nicht gebraucht.
export function compactSource(source) {
  const blocks = source.match(/<div\b[^>]*\bclass\s*=\s*["']?pro_\w+["']?[^>]*>(?:(?!<div)[\s\S])*?<\/div>/gi);
  return (blocks && blocks.length > 3 ? blocks.join('\n') : source.trim()).slice(0, MAX_SOURCE);
}

export function listDances(store = defaultStore()) {
  try {
    const list = JSON.parse(store?.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((d) => d && d.id && d.source) : [];
  } catch {
    return [];
  }
}

function write(list, store) {
  try {
    store?.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // Speicher voll oder nicht verfügbar
  }
}

const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

// Legt den Tanz oben in der Liste ab; ein gleichnamiger Eintrag wird ersetzt.
export function saveDance(sheet, source, store = defaultStore()) {
  const title = sheet.title || sheet.sections[0]?.title || 'Ohne Titel';
  const entry = {
    id: slug(`${title} ${sheet.choreo}`) || 'tanz',
    title,
    choreo: sheet.choreo || '',
    description: sheet.description || '',
    source: compactSource(source),
    savedAt: Date.now(),
  };
  let list = [entry, ...listDances(store).filter((d) => d.id !== entry.id)].slice(0, MAX_DANCES);
  // Bei vollem Speicher die ältesten Einträge opfern
  while (!write(list, store) && list.length > 1) list = list.slice(0, -1);
  return entry;
}

export function removeDance(id, store = defaultStore()) {
  write(listDances(store).filter((d) => d.id !== id), store);
}
