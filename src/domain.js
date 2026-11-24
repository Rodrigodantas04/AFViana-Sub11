/** Pure domain operations. Shared by the static renderer, the browser and the server. */
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-PT').trim();
export const teamById = (data, id) => data.teams.find(t => t.id === id);
export const clubById = (data, id) => data.clubs.find(t => t.id === id);
export const groupById = (data, id) => data.groups.find(g => g.id === id);
export const phaseById = (data, id) => data.phases.find(p => p.id === id);
export const competitionPath = data => `/competicoes/${data.competition.slug}`;
export const groupPath = (data, groupId) => { const g = groupById(data, groupId); return g ? `${competitionPath(data)}/${g.phaseId}/serie-${g.letter.toLowerCase()}` : competitionPath(data); };
export const teamClubPath = (data, id) => `/clubes/${teamById(data, id)?.clubId ?? ''}`;
export const groupLabel = (data, groupId, { short = false } = {}) => {
  const g = groupById(data, groupId), p = g && phaseById(data, g.phaseId);
  if (!g) return '';
  return short ? `${p.number}.ª F · ${g.letter}` : `${p.name} · Série ${g.letter}`;
};
/** Groups a team belongs to, phase by phase (a team keeps one identity across phases). */
export const teamGroups = (data, teamId) => data.groups.filter(g => g.teamIds.includes(teamId));
export const definedGroups = (data, phaseId) => data.groups.filter(g => g.defined && (!phaseId || g.phaseId === phaseId));
/** The phase to feature: the latest one that already has results (a 2.ª fase that is defined but not started yet does not hide the 1.ª). */
export const currentPhase = data => [...data.phases].reverse().find(p => data.matches.some(m => m.phaseId === p.id && m.status === 'finished')) ?? data.phases.find(p => p.state !== 'pending') ?? data.phases[0];

export function todayLisbon(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = key => parts.find(p => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** A scheduled game whose date has passed without a result is "por confirmar", never "adiado". */
export function matchStatus(match, today = todayLisbon()) {
  if (match.status === 'scheduled' && match.date && match.date < today) return 'unconfirmed';
  return match.status;
}
export const statusLabels = { finished: 'Finalizado', scheduled: 'Agendado', unconfirmed: 'Resultado por confirmar', withdrawn: 'Equipa desistente', incomplete: 'Resultado incompleto' };
export function dateLabel(value, options = {}) {
  if (!value) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', ...options, timeZone: 'Europe/Lisbon' }).format(new Date(value + 'T12:00:00Z'));
}
const byRecent = (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.round - a.round || a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id);
export function recentMatches(data, count = Infinity) {
  return data.matches.filter(m => m.status === 'finished').sort(byRecent).slice(0, count);
}
export function upcomingMatches(data, today = todayLisbon()) {
  return data.matches.filter(m => m.status === 'scheduled' && m.date && m.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id));
}
export function filterMatches(data, filters = {}, today = todayLisbon()) {
  const q = normalize(filters.q);
  return data.matches.filter(m => (!filters.phase || m.phaseId === filters.phase) && (!filters.group || m.groupId === filters.group) && (!filters.round || m.round === Number(filters.round)) && (!filters.status || matchStatus(m, today) === filters.status) && (!q || normalize(teamById(data, m.homeId)?.name + ' ' + teamById(data, m.awayId)?.name).includes(q)))
    .sort((a, b) => Number(b.status === 'finished') - Number(a.status === 'finished') || (a.status === 'finished' ? byRecent(a, b) : (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id)));
}
/** Equal totals share the position (1, 2, 2, 4). Ties are listed alphabetically. */
export function rankScorers(scorers) {
  const sorted = [...scorers].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'pt-PT') || a.teamId.localeCompare(b.teamId) || a.id.localeCompare(b.id));
  let rank = 0, previous = null;
  return sorted.map((record, index) => {
    if (previous !== record.goals) rank = index + 1;
    previous = record.goals;
    return { ...record, rank, tied: sorted.filter(s => s.goals === record.goals).length > 1 };
  });
}
export const scorerScopes = { total: 'Acumulado', 'fase-1': '1.ª Fase', 'fase-2': '2.ª Fase' };
export function scorersFor(data, scope = 'total') { return data.scorers?.[scope] ?? []; }
export function groupStatistics(data, groupId) {
  const matches = data.matches.filter(m => m.groupId === groupId && m.status === 'finished');
  const goals = matches.reduce((sum, m) => sum + m.homeGoals + m.awayGoals, 0);
  return { played: matches.length, goals, average: matches.length ? goals / matches.length : null };
}
export function teamStanding(data, teamId, phaseId) {
  const group = data.groups.find(g => (!phaseId || g.phaseId === phaseId) && g.standings.some(s => s.teamId === teamId));
  return group?.standings.find(s => s.teamId === teamId);
}
/** Facts for one team in one phase, computed only from finished games. */
export function teamAnalysis(data, teamId, phaseId) {
  const games = data.matches.filter(m => m.phaseId === phaseId && m.status === 'finished' && (m.homeId === teamId || m.awayId === teamId))
    .sort((a, b) => a.round - b.round || (a.date ?? '').localeCompare(b.date ?? ''));
  const rows = games.map(m => {
    const home = m.homeId === teamId, gf = home ? m.homeGoals : m.awayGoals, ga = home ? m.awayGoals : m.homeGoals;
    return { match: m, home, gf, ga, result: gf > ga ? 'V' : gf === ga ? 'E' : 'D', points: gf > ga ? 3 : gf === ga ? 1 : 0, opponentId: home ? m.awayId : m.homeId };
  });
  const split = list => ({ played: list.length, wins: list.filter(r => r.result === 'V').length, draws: list.filter(r => r.result === 'E').length, losses: list.filter(r => r.result === 'D').length, goalsFor: list.reduce((n, r) => n + r.gf, 0), goalsAgainst: list.reduce((n, r) => n + r.ga, 0), points: list.reduce((n, r) => n + r.points, 0) });
  let points = 0, gf = 0, ga = 0;
  const timeline = rows.map(r => { points += r.points; gf += r.gf; ga += r.ga; return { round: r.match.round, gf: r.gf, ga: r.ga, points, goalsFor: gf, goalsAgainst: ga, result: r.result, matchId: r.match.id, opponentId: r.opponentId }; });
  const all = split(rows);
  return {
    rows, timeline, all, home: split(rows.filter(r => r.home)), away: split(rows.filter(r => !r.home)),
    form: rows.slice(-5).map(r => r.result),
    cleanSheets: rows.filter(r => r.ga === 0).length, blanks: rows.filter(r => r.gf === 0).length,
    biggestWin: rows.filter(r => r.result === 'V').sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)[0] ?? null,
    closest: rows.filter(r => Math.abs(r.gf - r.ga) <= 1).length,
    efficiency: all.played ? all.points / (all.played * 3) : null,
  };
}
/** Average of a group's teams (same denominators), for comparisons. */
export function groupAverages(data, groupId) {
  const g = groupById(data, groupId), list = g?.standings.filter(s => s.played > 0) ?? [];
  const per = key => list.length ? list.reduce((n, s) => n + s[key] / s.played, 0) / list.length : null;
  return { teams: list.length, goalsForPerGame: per('goalsFor'), goalsAgainstPerGame: per('goalsAgainst'), pointsPerGame: per('points') };
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
  if (data?.schemaVersion !== 2 || !data.competition?.slug || !/^[a-z0-9-]+$/.test(data.competition.slug) || !/^[a-f0-9]{64}$/.test(data.version ?? '') || !Number.isFinite(Date.parse(data.importedAt))) fail('metadados');
  const phases = unique(data.phases, 'fases'), teams = unique(data.teams, 'equipas'), clubs = unique(data.clubs, 'clubes'), groups = unique(data.groups, 'séries');
  unique(data.matches, 'jogos');
  for (const p of data.phases) if (!Number.isInteger(p.number) || typeof p.name !== 'string' || !['pending', 'running', 'finished'].includes(p.state) || !Array.isArray(p.groupIds) || p.groupIds.some(id => !groups.has(id))) fail('fase');
  for (const t of data.teams) if (typeof t.name !== 'string' || !clubs.has(t.clubId) || typeof t.withdrawn !== 'boolean') fail('ligação equipa/clube');
  for (const c of data.clubs) if (typeof c.name !== 'string' || c.slug !== c.id || !Array.isArray(c.teamIds) || c.teamIds.some(id => !teams.has(id) || teamById(data, id).clubId !== c.id)) fail('clube');
  for (const g of data.groups) {
    if (!phases.has(g.phaseId) || !/^[A-F]$/.test(g.letter) || typeof g.defined !== 'boolean' || !Array.isArray(g.notes) || !Array.isArray(g.teamIds) || !Array.isArray(g.standings) || g.standings.length !== g.teamIds.length || new Set(g.teamIds).size !== g.teamIds.length) fail('classificação');
    for (const s of g.standings) {
      if (!teams.has(s.teamId) || !g.teamIds.includes(s.teamId) || !Number.isInteger(s.goalDifference)) fail('equipa na classificação');
      for (const key of ['position', 'played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'points']) if (!isCount(s[key])) fail(`classificação: ${key}`);
    }
  }
  for (const m of data.matches) {
    const g = groupById(data, m.groupId);
    if (!g || g.phaseId !== m.phaseId || !teams.has(m.homeId) || !teams.has(m.awayId) || m.homeId === m.awayId || !g.teamIds.includes(m.homeId) || !g.teamIds.includes(m.awayId) || !isCount(m.round) || !statusLabels[m.status] || m.status === 'unconfirmed') fail('jogo');
    if (m.date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(Date.parse(m.date)))) fail('data do jogo');
    for (const key of ['homeGoals', 'awayGoals']) if (m[key] !== null && !isCount(m[key])) fail('resultado');
    if (m.status === 'finished' && (m.homeGoals === null || m.awayGoals === null)) fail('resultado final incompleto');
    for (const side of ['home', 'away']) {
      const s = m.scoring?.[side];
      if (!s || !Array.isArray(s.scorers) || s.scorers.some(e => typeof e.name !== 'string' || !isCount(e.goals) || e.goals < 1) || !isCount(s.identified) || !isCount(s.ownGoals) || !isCount(s.missing)) fail('golos do jogo');
    }
  }
  if (!data.scorers || typeof data.scorers !== 'object') fail('marcadores');
  for (const scope of Object.keys(scorerScopes)) {
    unique(data.scorers[scope], 'marcadores');
    for (const s of data.scorers[scope]) if (typeof s.name !== 'string' || !teams.has(s.teamId) || !isCount(s.goals) || s.goals < 1) fail('marcador');
  }
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
  const actual = { matches: data.matches.length, played: played.length, goals: played.reduce((n, m) => n + m.homeGoals + m.awayGoals, 0), teams: data.teams.length, clubs: data.clubs.length };
  for (const [key, count] of Object.entries(actual)) if (data.stats?.[key] !== count) fail(`total ${key}`);
  if (!['public', 'hidden', 'redacted'].includes(data.publication?.scorerNames)) fail('publicação individual');
  return data;
}

/** A team's games split for "A minha equipa": what comes next, what is waiting for a result, what was played. */
export function teamFixtures(data, teamId, today = todayLisbon()) {
  const mine = data.matches.filter(m => m.homeId === teamId || m.awayId === teamId);
  return {
    upcoming: mine.filter(m => m.status === 'scheduled' && (!m.date || m.date >= today)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.phaseId.localeCompare(b.phaseId) || a.round - b.round),
    unconfirmed: mine.filter(m => matchStatus(m, today) === 'unconfirmed').sort((a, b) => a.date.localeCompare(b.date)),
    played: mine.filter(m => m.status === 'finished').sort(byRecent),
  };
}
/** Whole days from today to a date (Lisbon calendar days). */
export function daysUntil(date, today = todayLisbon()) {
  return date ? Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000) : null;
}
/**
 * Round-by-round race of a group: cumulative points and table position after each round.
 * Same order as the workbook (points, goal difference, goals scored, sheet order; a withdrawn team last),
 * so the last round matches the official standings.
 */
export function pointsRace(data, groupId) {
  const g = groupById(data, groupId);
  if (!g?.defined) return { rounds: [], teams: [] };
  const games = data.matches.filter(m => m.groupId === groupId && m.status === 'finished');
  const last = games.reduce((n, m) => Math.max(n, m.round), 0);
  const rounds = Array.from({ length: last }, (_, i) => i + 1);
  const totals = new Map(g.teamIds.map(id => [id, { points: 0, gf: 0, ga: 0 }]));
  const out = new Map(g.teamIds.map(id => [id, { teamId: id, points: [], positions: [] }]));
  const withdrawn = id => Number(teamById(data, id).withdrawn);
  for (const round of rounds) {
    for (const m of games.filter(x => x.round === round)) {
      const h = totals.get(m.homeId), a = totals.get(m.awayId);
      h.gf += m.homeGoals; h.ga += m.awayGoals; a.gf += m.awayGoals; a.ga += m.homeGoals;
      if (m.homeGoals > m.awayGoals) h.points += 3; else if (m.homeGoals < m.awayGoals) a.points += 3; else { h.points += 1; a.points += 1; }
    }
    const order = [...g.teamIds].sort((x, y) => {
      const a = totals.get(x), b = totals.get(y);
      return withdrawn(x) - withdrawn(y) || b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || g.teamIds.indexOf(x) - g.teamIds.indexOf(y);
    });
    for (const id of g.teamIds) { out.get(id).points.push(totals.get(id).points); out.get(id).positions.push(order.indexOf(id) + 1); }
  }
  return { rounds, teams: [...out.values()] };
}
