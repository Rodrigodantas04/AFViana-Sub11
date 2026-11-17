/**
 * iCalendar (RFC 5545) feed of one team's games. Only team names, dates and results: no players.
 * The workbook has dates but no kick-off times or pitches, so every game is an all-day event.
 */
import { teamById, groupById, phaseById } from './domain.js';

const text = value => String(value).replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
const encoder = new TextEncoder();
/** Lines longer than 75 octets continue on the next line after a space, never splitting a character. */
function fold(line) {
  let out = '', size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > 75) { out += '\r\n '; size = 1; }
    out += ch; size += bytes;
  }
  return out;
}
const compact = date => date.replaceAll('-', '');
const nextDay = date => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return compact(d.toISOString().slice(0, 10)); };

export const calendarPath = teamId => `/calendario/${teamId}.ics`;

export function teamCalendar(data, teamId, { origin = '' } = {}) {
  const team = teamById(data, teamId);
  if (!team) return null;
  const stamp = new Date(data.importedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = data.matches
    .filter(m => m.date && (m.homeId === teamId || m.awayId === teamId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
    .flatMap(m => {
      const home = teamById(data, m.homeId).name, away = teamById(data, m.awayId).name;
      const g = groupById(data, m.groupId), phase = phaseById(data, m.phaseId);
      const score = m.status === 'finished' ? ` ${m.homeGoals}–${m.awayGoals} ` : ' × ';
      const link = origin ? `${origin}/jogos/${m.id}` : '';
      const description = `${data.competition.name} · ${phase.name} · Série ${g.letter} · Jornada ${m.round}.\nHora e campo: confirmar com o clube.${link ? `\n${link}` : ''}`;
      return [
        'BEGIN:VEVENT', `UID:${m.id}@minho11`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(m.date)}`, `DTEND;VALUE=DATE:${nextDay(m.date)}`,
        `SUMMARY:${text(`⚽ ${home}${score}${away}`)}`, `DESCRIPTION:${text(description)}`,
        ...(link ? [`URL:${link}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT',
      ];
    });
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MINHO11//Calendario da equipa//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(`MINHO11 · ${team.name}`)}`, 'X-WR-TIMEZONE:Europe/Lisbon',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H', ...events, 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
