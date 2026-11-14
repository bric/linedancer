// Zählzeiten-Label ("1-2", "3&4", "&7-8", "5-8") → Liste von Slots.
// beat ist relativ zum Abschnittsanfang: Zählzeit 1 = 0, "&" liegt einen halben Schlag davor/danach.
// `after` = letzter Schlag der vorherigen Zeile, für Zeilen, die nur aus "&" bestehen.
export function parseCounts(label, after = null) {
  const s = String(label)
    .replace(/[–—]/g, '-')
    .replace(/\bund\b|\+/gi, '&')
    .replace(/\s+/g, '');
  const tokens = s.match(/\d+|&|-/g) || [];
  const slots = [];
  let lastNum = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '&') {
      const next = tokens[i + 1];
      if (next && /^\d+$/.test(next)) slots.push({ label: '&', beat: +next - 1.5 });
      else if (lastNum !== null) slots.push({ label: '&', beat: lastNum - 0.5 });
      else if (after !== null) slots.push({ label: '&', beat: after + 0.5 });
    } else if (t !== '-') {
      const n = +t;
      // "5-8" meint 5, 6, 7, 8
      if (tokens[i - 1] === '-' && /^\d+$/.test(tokens[i - 2] || '')) {
        for (let k = +tokens[i - 2] + 1; k < n; k++) slots.push({ label: String(k), beat: k - 1 });
      }
      slots.push({ label: t, beat: n - 1 });
      lastNum = n;
    }
  }
  return slots;
}
