export const EXAMPLE_URL = 'https://www.get-in-line.de/dances/My%20Mama%20Said_-_Glover.htm';

// Übersetzt eine get-in-line.de-Adresse auf den lokalen Proxy-Pfad (siehe vite.config.js).
export function toProxyUrl(input) {
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error('Das ist keine gültige Adresse.');
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
