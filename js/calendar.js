/* ═══════════════════════════════════════════════
   SHITS LEAGUE — calendar.js
   Lee próximos partidos desde Google Calendar API pública.
   El calendario debe estar compartido públicamente.
═══════════════════════════════════════════════ */

// TODO: reemplaza con tu Calendar ID y API Key
const CALENDAR_ID  = 'TU_CALENDAR_ID@group.calendar.google.com';
const CALENDAR_KEY = 'TU_API_KEY';

// Devuelve los próximos N eventos del calendario
async function fetchProximosPartidos(maxResults = 5) {
  if (CALENDAR_ID.startsWith('TU_')) return null;
  try {
    const now = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
      + `?key=${CALENDAR_KEY}`
      + `&timeMin=${now}`
      + `&maxResults=${maxResults}`
      + `&singleEvents=true`
      + `&orderBy=startTime`;
    const res  = await fetch(url);
    const json = await res.json();
    return (json.items || []).map(ev => ({
      titulo:  ev.summary || '',
      fecha:   ev.start?.dateTime || ev.start?.date || '',
      lugar:   ev.location || '',
      desc:    ev.description || '',
    }));
  } catch (e) {
    console.warn('[calendar] No se pudo cargar el calendario:', e);
    return null;
  }
}
