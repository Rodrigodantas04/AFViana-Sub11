/** Pure domain operations. Shared by the static renderer and the browser. */
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').trim();
export const teamById = (data, id) => data.teams.find(t => t.id === id);
export const clubById = (data, id) => data.clubs.find(t => t.id === id);
export const groupPath = (data, group) => `/competicoes/${data.competition.slug}/serie-${group.toLowerCase()}`;
export const teamClubPath = (data, id) => `/clubes/${teamById(data, id)?.clubId ?? ''}`;
export function todayLisbon(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = key => parts.find(p => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function matchStatus(match, today = todayLisbon()) {
  if (match.status === 'scheduled' && match.date && match.date < today) return 'unconfirmed';
  return match.status;
}
export const statusLabels = { finished: 'Finalizado', scheduled: 'Agendado', unconfirmed: 'Resultado por confirmar', postponed: 'Adiado', cancelled: 'Cancelado', withdrawn: 'Equipa desistente', incomplete: 'Resultado incompleto' };
export function dateLabel(value, options = {}) {
  if (!value) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', ...options, timeZone: 'Europe/Lisbon' }).format(new Date(value + 'T12:00:00Z'));
}
export function recentMatches(data, count = Infinity) {
  return data.matches.filter(m => m.status === 'finished').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.round - a.round || a.id.localeCompare(b.id)).slice(0, count);
}
export function upcomingMatches(data, today = todayLisbon()) {
  return data.matches.filter(m => m.status === 'scheduled' && m.date && m.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function filterMatches(data, filters = {}, today = todayLisbon()) {
  return data.matches.filter(m => (!filters.group || m.groupId === filters.group) && (!filters.round || m.round === Number(filters.round)) && (!filters.status || matchStatus(m, today) === filters.status) && (!filters.q || normalize(teamById(data, m.homeId)?.name + ' ' + teamById(data, m.awayId)?.name).includes(normalize(filters.q))))
    .sort((a, b) => Number(b.status === 'finished') - Number(a.status === 'finished') || (a.status === 'finished' ? (b.date ?? '').localeCompare(a.date ?? '') : (a.date ?? '9999').localeCompare(b.date ?? '9999')) || a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id));
}
export function rankScorers(scorers) {
  const sorted = [...scorers].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'pt-PT') || a.teamId.localeCompare(b.teamId) || a.id.localeCompare(b.id));
  let rank = 0, previous = null;
  return sorted.map((record, index) => { if (previous !== record.goals) rank = index + 1; previous = record.goals; return { ...record, rank }; });
}
export function groupStatistics(data, groupId) {
  const matches = data.matches.filter(m => m.groupId === groupId && m.status === 'finished');
  const goals = matches.reduce((sum, m) => sum + m.homeGoals + m.awayGoals, 0);
  return { played: matches.length, goals, average: matches.length ? goals / matches.length : null };
}
export function teamStanding(data, team) {
  return data.groups.find(g => g.id === team.groupId)?.standings.find(s => s.teamId === team.id);
}
export function clubRanking(data) {
  return data.clubs.map(club => ({ ...club, goals: club.teamIds.reduce((n, id) => n + (teamStanding(data, teamById(data, id))?.goalsFor ?? 0), 0) })).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'pt-PT'));
}
export function validateDataset(data) {
  const fail = message => { throw new Error(`Dados inválidos: ${message}`); };
  const isCount = n => Number.isInteger(n) && n >= 0;
  const unique = (array, label) => {
    if (!Array.isArray(array)) fail(label);
    const ids = new Set();
    for (const entry of array) { if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(entry.id) || ids.has(entry.id)) fail(`${label}: identificadores`); ids.add(entry.id); }
    return ids;
  };
  if (data?.schemaVersion !== 1 || !data.competition?.slug || !/^[a-z0-9-]+$/.test(data.competition.slug) || !/^[a-f0-9]{64}$/.test(data.version ?? '') || !Number.isFinite(Date.parse(data.importedAt))) fail('metadados');
  const teams = unique(data.teams, 'equipas'), clubs = unique(data.clubs, 'clubes'), groups = unique(data.groups, 'séries');
  unique(data.matches, 'jogos'); unique(data.scorers, 'marcadores');
  for (const t of data.teams) if (typeof t.name !== 'string' || !clubs.has(t.clubId) || !groups.has(t.groupId)) fail('ligação equipa/clube/série');
  for (const c of data.clubs) if (typeof c.name !== 'string' || c.slug !== c.id || !Array.isArray(c.teamIds) || c.teamIds.some(id => !teams.has(id) || teamById(data, id).clubId !== c.id)) fail('clube');
  for (const g of data.groups) {
    if (!Array.isArray(g.notes) || !Array.isArray(g.teamIds) || !Array.isArray(g.standings) || g.standings.length !== g.teamIds.length || new Set(g.teamIds).size !== g.teamIds.length || new Set(g.standings.map(s => s.teamId)).size !== g.teamIds.length) fail('classificação');
    for (const s of g.standings) {
      if (!teams.has(s.teamId) || !g.teamIds.includes(s.teamId) || teamById(data, s.teamId).groupId !== g.id || !Number.isInteger(s.goalDifference)) fail('equipa na classificação');
      for (const key of ['position', 'played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'points']) if (!isCount(s[key])) fail(`classificação: ${key}`);
    }
  }
  for (const m of data.matches) {
    if (!teams.has(m.homeId) || !teams.has(m.awayId) || m.homeId === m.awayId || !groups.has(m.groupId) || !isCount(m.round) || !statusLabels[m.status] || m.status === 'unconfirmed') fail('jogo');
    if (teamById(data, m.homeId).groupId !== m.groupId || teamById(data, m.awayId).groupId !== m.groupId) fail('série do jogo');
    if (m.date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(Date.parse(m.date)))) fail('data do jogo');
    for (const key of ['homeGoals', 'awayGoals']) if (m[key] !== null && !isCount(m[key])) fail('resultado');
    if (m.status === 'finished' && (m.homeGoals === null || m.awayGoals === null)) fail('resultado final incompleto');
    for (const side of ['home', 'away']) if (!Array.isArray(m.scorers?.[side]) || m.scorers[side].some(s => typeof s.name !== 'string' || !isCount(s.goals))) fail('eventos de golo');
  }
  for (const s of data.scorers) if (typeof s.name !== 'string' || !teams.has(s.teamId) || !groups.has(s.groupId) || !isCount(s.goals)) fail('marcador');
  if (!Array.isArray(data.rosters)) fail('plantéis');
  const rosterTeams = new Set();
  for (const roster of data.rosters) {
    if (!teams.has(roster.teamId) || rosterTeams.has(roster.teamId) || !Array.isArray(roster.players) || !Array.isArray(roster.staff) || typeof roster.complete !== 'boolean') fail('plantel');
    rosterTeams.add(roster.teamId);
    const identities = new Set();
    for (const person of [...roster.players, ...roster.staff]) {
      if (typeof person.id !== 'string' || identities.has(person.id) || typeof person.name !== 'string' || !person.name.trim()) fail('registo de plantel');
      if (person.photoPath !== null && !/^\/media\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(person.photoPath)) fail('fotografia de plantel');
      identities.add(person.id);
    }
  }
  const played = data.matches.filter(m => m.status === 'finished');
  const actual = { groups: data.groups.length, teams: data.teams.length, clubs: data.clubs.length, matches: data.matches.length, played: played.length, goals: played.reduce((n, m) => n + m.homeGoals + m.awayGoals, 0) };
  for (const [key, count] of Object.entries(actual)) if (data.stats?.[key] !== count) fail(`total ${key}`);
  if (data.publication?.individualRecordsPublished !== data.scorers.length) fail('publicação individual');
  return data;
}
