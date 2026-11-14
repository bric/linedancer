// Übersetzt eine get-in-line.de-Adresse auf den lokalen Proxy-Pfad (siehe vite.config.js).
export function toProxyUrl(input) {
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error('Das ist keine gültige Adresse.');
  }
  if (/(^|\.)copperknob\.co\.uk$/i.test(u.hostname)) {
    throw new Error('Copperknob lässt keinen automatischen Abruf zu. Bitte die Seite im Browser öffnen, den Schritt-Text markieren und kopieren und über „Text einfügen“ laden.');
  }
  if (!/(^|\.)get-in-line\.de$/i.test(u.hostname) || !u.pathname.startsWith('/dances/')) {
    throw new Error('Es werden nur Adressen unter https://www.get-in-line.de/dances/ unterstützt. Andere Beschreibungen bitte über „Text einfügen“ laden.');
  }
  return '/sheet/' + u.pathname.slice('/dances/'.length);
}

export async function fetchSheet(input) {
  const res = await fetch(toProxyUrl(input));
  if (!res.ok) throw new Error(`Die Seite konnte nicht geladen werden (HTTP ${res.status}).`);
  const html = await res.text();
  if (!/pro_s/i.test(html)) {
    throw new Error('Unter dieser Adresse wurde keine Schrittbeschreibung gefunden. Alternativ den Text über „Text einfügen“ laden.');
  }
  return html;
}
