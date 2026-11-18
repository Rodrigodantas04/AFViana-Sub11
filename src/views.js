import { normalize, teamById, clubById, groupById, phaseById, teamClubPath, groupPath, competitionPath, groupLabel, teamGroups, definedGroups, currentPhase, rankScorers, scorersFor, scorerScopes, recentMatches, upcomingMatches, groupStatistics, filterMatches, teamStanding, clubRanking, teamAnalysis, groupAverages, dateLabel, statusLabels, matchStatus, todayLisbon, teamFixtures, daysUntil, pointsRace } from './domain.js';
import { prefs, esc, icon, badge, teamBadge, clubBadge, compareBars, brand, heading, pageHeading, textLink, matchGrid, standings, groupTabs, phaseTabs, notes, metric, scorerRows, privateScorers, emptyState, statusPill, pendingGroup, groupShort, barChart, lineChart, raceChart, radarChart } from './components.js';

/** Per-visitor preferences, set by the browser (app.js). The static build renders without them. */
export { prefs };
import { installHelp } from './install.js';

const selected = (a, b) => a === b ? ' selected' : '';
const number = (value, digits = 1) => value === null || value === undefined || Number.isNaN(value) ? '—' : Number(value).toLocaleString('pt-PT', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const percent = value => value === null ? '—' : `${Math.round(value * 100)}%`;
function groupSelect(data, group = '', phaseId = '') {
  const list = data.groups.filter(g => g.defined && (!phaseId || g.phaseId === phaseId));
  return `<label>Série<select name="serie" data-filter><option value="">Todas as séries</option>${list.map(g => `<option value="${g.id}"${selected(g.id, group)}>${esc(groupLabel(data, g.id))}</option>`).join('')}</select></label>`;
}
function phaseSelect(data, phase = '', { all = 'Todas as fases', values = data.phases.map(p => [p.id, p.name]) } = {}) {
  return `<label>Fase<select name="fase" data-filter>${all ? `<option value="">${esc(all)}</option>` : ''}${values.map(([id, name]) => `<option value="${id}"${selected(id, phase)}>${esc(name)}</option>`).join('')}</select></label>`;
}
function clubSelect(data, slug = '') {
  const clubs = [...data.clubs].sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  return `<label>Clube<select name="clube" data-filter><option value="">Todos os clubes</option>${clubs.map(c => `<option value="${esc(c.slug)}"${selected(c.slug, slug)}>${esc(c.name)}</option>`).join('')}</select></label>`;
}
function searchInput(q, label = 'Procurar equipa', placeholder = 'Nome da equipa…') {
  return `<label class="search-field">${label}<span>${icon('search')}<input type="search" name="q" value="${esc(q)}" placeholder="${esc(placeholder)}" autocomplete="off" data-filter></span></label>`;
}
function formFooter(action) {
  return `<button class="button filter-submit" type="submit">Filtrar</button><a class="reset-link" href="${esc(action)}">Limpar filtros</a>`;
}
function groupCards(data, phaseId) {
  const phase = phaseById(data, phaseId);
  const list = data.groups.filter(g => g.phaseId === phaseId);
  if (!list.some(g => g.defined)) return `<div class="panel">${pendingPhase(data, phase)}</div>`;
  return `<div class="group-grid">${list.map(g => {
    if (!g.defined) return `<div class="group-card group-card-pending"><div class="group-card-top"><span class="eyebrow">Série</span><span class="group-letter">${g.letter}</span></div><p class="muted">Por definir</p></div>`;
    const stats = groupStatistics(data, g.id), leader = teamById(data, g.standings[0].teamId);
    return `<a class="group-card" href="${groupPath(data, g.id)}"><div class="group-card-top"><span class="eyebrow">${esc(phase.name)} · Série</span><span class="group-letter">${g.letter}</span>${icon('arrow')}</div><p class="muted">${g.teamIds.length} equipas <span class="separator">/</span> ${stats.played} jogos realizados</p><div class="group-leader">${teamBadge(data, leader)}<span><small>1.º classificado</small><strong>${esc(leader.name)}</strong></span><b>${g.standings[0].points}<small>pts</small></b></div></a>`;
  }).join('')}</div>`;
}
function pendingPhase(data, phase) {
  return `<div class="pending-state">${icon('clock')}<h3>${esc(phase.name)} por definir</h3><p>As séries da ${esc(phase.name)} estão preparadas, mas as equipas ainda não foram indicadas. Os jogos, classificações e marcadores desta fase aparecem aqui quando forem conhecidos.</p></div>`;
}
function teamGoalRanking(data, limit = 6, phaseId = currentPhase(data).id) {
  const rows = definedGroups(data, phaseId).flatMap(g => g.standings).sort((a, b) => b.goalsFor - a.goalsFor || a.teamId.localeCompare(b.teamId)).slice(0, limit);
  const max = rows[0]?.goalsFor || 1;
  return `<ol class="team-goal-list">${rows.map(s => {
    const team = teamById(data, s.teamId);
    return `<li><div class="goal-team">${teamBadge(data, team)}<a href="${teamClubPath(data, team.id)}">${esc(team.name)}</a><strong>${s.goalsFor}</strong></div><span class="bar-track"><span style="--bar:${Math.round(s.goalsFor / max * 100)}%"></span></span></li>`;
  }).join('')}</ol>`;
}
function topScorersPreview(data) {
  const list = scorersFor(data, 'total');
  return list.length ? `<ol class="scorer-list">${scorerRows(data, rankScorers(list).slice(0, 5))}</ol>` : privateScorers(data);
}
function completenessNote(data) {
  const missing = data.quality?.unidentifiedGoals ?? 0;
  if (!missing) return '';
  return `<p class="muted small">${icon('info')} ${missing} ${missing === 1 ? 'golo ainda não tem' : 'golos ainda não têm'} marcador identificado na fonte. Os rankings contam apenas os golos identificados.</p>`;
}
/** With a followed team: its game first, then the rest of that jornada in its series, then everyone else. Without one, the list as is. */
export function teamFirst(data, list, count) {
  const team = prefs.myTeam ? teamById(data, prefs.myTeam) : null;
  if (!team) return list.slice(0, count);
  const own = list.find(m => m.homeId === team.id || m.awayId === team.id);
  const groupIds = new Set(teamGroups(data, team.id).map(g => g.id));
  const anchor = own ?? list.find(m => groupIds.has(m.groupId));
  const first = anchor ? list.filter(m => m === own || (m.groupId === anchor.groupId && m.round === anchor.round && m.phaseId === anchor.phaseId)) : [];
  if (own) first.sort((a, b) => Number(b === own) - Number(a === own));
  return [...first, ...list.filter(m => !first.includes(m))].slice(0, count);
}
function home(data, url) {
  const phase = currentPhase(data);
  const groups = definedGroups(data, phase.id);
  const group = groups.find(g => g.id === url.searchParams.get('serie')) ?? groups.find(g => prefs.myTeam && g.teamIds.includes(prefs.myTeam)) ?? groups[0];
  const scheduled = teamFirst(data, upcomingMatches(data), 3);
  const n = (value, one, many) => `<span><b>${value}</b> ${value === 1 ? one : many}</span>`;
  return `<header class="home-head"><div><h1 tabindex="-1">${esc(data.competition.shortName)}</h1><p class="muted">${esc(data.competition.category)} · ${esc(data.competition.region)} · ${esc(phase.name)} em curso</p></div>${textLink(competitionPath(data), 'A competição')}</header>
  <p class="home-numbers" aria-label="A competição em números">${n(data.stats.activeTeams, 'equipa', 'equipas')}${n(data.stats.played, 'jogo', 'jogos')}${n(data.stats.goals, 'golo', 'golos')}${n(groups.length, 'série', 'séries')}</p>${myTeamStrip(data)}
  <section class="section">${heading('', 'Últimos resultados', '', textLink('/jogos?estado=finished', 'Todos os resultados'))}${matchGrid(data, teamFirst(data, recentMatches(data), 6))}</section>
  <section class="section home-columns"><div class="panel"><div class="panel-heading"><div><h2>Classificação</h2></div><form action="/" class="inline-form">${groupSelect(data, group?.id, phase.id)}<button type="submit" class="sr-only">Selecionar série</button></form></div>${group ? standings(data, group) : pendingPhase(data, phase)}<div class="panel-bottom">${group ? textLink(groupPath(data, group.id), `Explorar a Série ${group.letter}`) : ''}</div></div><div class="panel scorers-preview"><div class="panel-heading"><div><h2>Bota de Ouro</h2></div>${icon('trophy', 'accent')}</div>${topScorersPreview(data)}<div class="panel-bottom">${textLink('/marcadores', 'Ver marcadores')}</div></div></section>
  <section class="section">${heading('', 'Próximos jogos', '', textLink('/jogos?estado=scheduled', 'Ver calendário'))}${scheduled.length ? matchGrid(data, scheduled) : emptyState('Sem próximos jogos confirmados', 'O calendário será atualizado quando houver novas datas.')}</section>
  <section class="section">${heading('', `Séries · ${phase.name}`, '', textLink(competitionPath(data), 'A competição'))}${groupCards(data, phase.id)}</section>`;
}
function competition(data) {
  return `${pageHeading(`${data.competition.category} · ${data.competition.season}`, data.competition.name, `${data.competition.region}. Duas fases, seis séries em cada uma. Resultados, classificações e calendário num só lugar.`)}<div class="page-actions"><a class="button" href="/jogos">${icon('calendar')} Calendário e resultados</a><a class="button button-secondary" href="/estatisticas">${icon('chart')} Estatísticas</a></div><div class="metrics">${metric(data.stats.activeTeams, 'Equipas em prova', 'shield')}${metric(data.stats.played, 'Jogos realizados', 'calendar')}${metric(data.stats.goals, 'Golos', 'ball')}${metric(number(data.stats.goals / Math.max(data.stats.played, 1)), 'Golos por jogo', 'chart')}</div>${data.phases.map(p => `<section class="section">${heading(p.state === 'pending' ? 'Por definir' : p.state === 'finished' ? 'Concluída' : 'Em curso', p.name, '', p.state === 'pending' ? '' : textLink(`${competitionPath(data)}/${p.id}`, `Ver ${p.name}`))}${groupCards(data, p.id)}</section>`).join('')}<div class="notice">${icon('shield')}<span>Plataforma independente. Resultados e marcadores vêm do ficheiro da competição; as classificações são calculadas com as mesmas fórmulas desse ficheiro.</span></div>`;
}
function phaseView(data, phaseId) {
  const phase = phaseById(data, phaseId);
  if (!phase) return notFound();
  return `<a class="back-link" href="${competitionPath(data)}">← ${esc(data.competition.shortName)}</a>${pageHeading(`${data.competition.shortName} · ${data.competition.category}`, phase.name, phase.state === 'pending' ? 'Séries preparadas, equipas por definir.' : 'Classificações e jogos de cada série.')}${phaseTabs(data, phaseId, p => `${competitionPath(data)}/${p.id}`)}${groupCards(data, phaseId)}`;
}
function groupView(data, id) {
  const group = groupById(data, id);
  if (!group) return notFound();
  const phase = phaseById(data, group.phaseId);
  if (!group.defined) return `${pageHeading(`${data.competition.shortName} · ${phase.name}`, `Série ${group.letter}`, 'Série por definir.')}${groupTabs(data, id)}<div class="panel">${pendingGroup(data, group)}</div>`;
  return `${pageHeading(`${data.competition.shortName} · ${phase.name}`, `Série ${group.letter}`, `${group.teamIds.length} equipas. Acompanha a classificação e todos os jogos da série.`)}${groupTabs(data, id)}<section class="panel"><div class="panel-heading"><h2>Classificação</h2><span class="subtle-label">${esc(phase.name)}</span></div>${standings(data, group)}</section>${notes(group)}<section class="section">${heading('Jornada após jornada', 'Resultados da série', '', `<span class="heading-links">${textLink(`/comparar?fase=${group.phaseId}&a=${group.standings[0].teamId}&b=${group.standings[1]?.teamId ?? ''}`, 'Comparar equipas')}${textLink(`/jogos?serie=${id}`, 'Todos os jogos')}</span>`)}${matchGrid(data, recentMatches(data).filter(m => m.groupId === id).slice(0, 6))}</section><section class="section">${heading('O que vem a seguir', 'Calendário')}${matchGrid(data, upcomingMatches(data).filter(m => m.groupId === id).slice(0, 6))}</section>`;
}
function games(data, url) {
  const q = url.searchParams.get('q') ?? '', group = url.searchParams.get('serie') ?? '', round = url.searchParams.get('jornada') ?? '', status = url.searchParams.get('estado') ?? '', phase = url.searchParams.get('fase') ?? '';
  const matches = filterMatches(data, { q, group, round, status, phase });
  return `${pageHeading('Calendário & resultados', 'Cada jogo conta.', 'Encontra a tua equipa, segue a jornada e consulta os detalhes de cada jogo.')}<form class="filter-bar" action="/jogos">${searchInput(q)}${phaseSelect(data, phase)}${groupSelect(data, group, phase)}<label>Jornada<select name="jornada" data-filter><option value="">Todas as jornadas</option>${[...new Set(data.matches.map(m => m.round))].sort((a, b) => a - b).map(r => `<option value="${r}"${selected(String(r), round)}>Jornada ${r}</option>`).join('')}</select></label><label>Estado<select name="estado" data-filter><option value="">Todos os jogos</option>${Object.entries(statusLabels).map(([k, v]) => `<option value="${k}"${selected(k, status)}>${v}</option>`).join('')}</select></label>${formFooter('/jogos')}</form><p class="result-count" role="status">${matches.length} ${matches.length === 1 ? 'jogo encontrado' : 'jogos encontrados'}</p>${matchGrid(data, matches)}${data.phases.some(p => p.state === 'pending') ? `<p class="muted small">${icon('clock')} Os jogos da ${esc(data.phases.filter(p => p.state === 'pending').map(p => p.name).join(' e '))} aparecem quando as equipas forem definidas.</p>` : ''}`;
}
export function matchDetails(data, id) {
  const match = data.matches.find(m => m.id === id);
  if (!match) return notFound();
  const home = teamById(data, match.homeId), away = teamById(data, match.awayId), group = groupById(data, match.groupId);
  const dateNotice = match.status === 'finished' && match.date > todayLisbon() ? `<p class="notice">${icon('calendar')}<span>A fonte já regista um resultado para este jogo, mas a data indicada ainda é futura. Informação por confirmar.</span></p>` : '';
  const events = (side, score) => {
    const s = match.scoring[side];
    if (match.status !== 'finished') return `<p class="muted">${matchStatus(match) === 'unconfirmed' ? 'Resultado por confirmar.' : 'Jogo por realizar.'}</p>`;
    if (score === 0) return '<p class="muted">Sem golos.</p>';
    const list = s.scorers.length ? `<ul class="goal-events">${s.scorers.map(e => `<li>${icon('ball')}<strong>${e.id ? `<a class="player-link" href="/jogadores/${esc(e.id)}">${esc(e.name)}</a>` : esc(e.name)}</strong><span>${e.goals} ${e.goals === 1 ? 'golo' : 'golos'}</span></li>`).join('')}</ul>` : '';
    const hidden = s.identified - s.scorers.reduce((n, e) => n + e.goals, 0);
    const extra = [
      s.ownGoals ? `<li class="own-goal">${icon('ball')}<strong>Autogolo</strong><span>${s.ownGoals} ${s.ownGoals === 1 ? 'golo' : 'golos'}</span></li>` : '',
      hidden > 0 ? `<li class="hidden-goal">${icon('lock')}<span>${hidden} ${hidden === 1 ? 'golo identificado' : 'golos identificados'}${data.publication.scorerNames === 'redacted' ? ' · nomes a carregar' : ' · nome não publicado'}</span></li>` : '',
      s.missing ? `<li class="missing-goal">${icon('info')}<span>${s.missing} ${s.missing === 1 ? 'golo' : 'golos'} sem marcador identificado na fonte</span></li>` : '',
    ].join('');
    return `${list}${extra ? `<ul class="goal-events goal-events-meta">${extra}</ul>` : ''}`;
  };
  return `<a class="back-link" href="/jogos">← Voltar aos jogos</a><header class="match-page-heading"><p class="eyebrow">${esc(data.competition.shortName)} · ${esc(data.competition.category)}</p><h1 class="sr-only" tabindex="-1">${esc(home.name)} contra ${esc(away.name)}</h1><a href="${groupPath(data, match.groupId)}">${esc(phaseById(data, group.phaseId).name)} · Série ${group.letter} · Jornada ${match.round}</a></header><section class="scoreboard"><a class="scoreboard-team" href="${teamClubPath(data, home.id)}">${teamBadge(data, home, true)}<h2>${esc(home.name)}</h2><span>Casa</span></a><div class="scoreboard-score"><strong>${match.homeGoals ?? '–'}<span>:</span>${match.awayGoals ?? '–'}</strong>${statusPill(match)}<p>${dateLabel(match.date, { year: 'numeric' })}</p></div><a class="scoreboard-team" href="${teamClubPath(data, away.id)}">${teamBadge(data, away, true)}<h2>${esc(away.name)}</h2><span>Fora</span></a></section>${dateNotice}<section class="section"><div class="section-heading"><h2>Os golos do jogo</h2></div><div class="two-columns"><div class="panel goal-panel"><h3>${esc(home.name)}</h3>${events('home', match.homeGoals)}</div><div class="panel goal-panel"><h3>${esc(away.name)}</h3>${events('away', match.awayGoals)}</div></div></section><div class="notice">${icon('shield')}<span>A fonte não tem minutos de golo. Um autogolo conta para a equipa beneficiada, mas não é atribuído a nenhum jogador dessa equipa.</span></div>`;
}
function scorers(data, url) {
  const scope = scorerScopes[url.searchParams.get('fase')] ? url.searchParams.get('fase') : 'total';
  const group = url.searchParams.get('serie') ?? '', q = url.searchParams.get('q') ?? '';
  const club = data.clubs.find(c => c.slug === url.searchParams.get('clube')) ?? null;
  const phaseId = scope === 'total' ? '' : scope;
  const groupTeams = group ? new Set(groupById(data, group)?.teamIds ?? []) : null;
  const scoped = rankScorers(scorersFor(data, scope).filter(s => (!groupTeams || groupTeams.has(s.teamId)) && (!club || teamById(data, s.teamId)?.clubId === club.id)));
  const ranked = scoped.filter(s => !q || normalize(s.name + ' ' + teamById(data, s.teamId).name).includes(normalize(q)));
  const podium = scoped.slice(0, 3);
  const pendingScope = scope !== 'total' && phaseById(data, scope)?.state === 'pending';
  const anyNames = Object.values(data.scorers).some(list => list.length);
  const body = pendingScope ? `<div class="panel">${pendingPhase(data, phaseById(data, scope))}</div>`
    : !anyNames ? `<div class="panel privacy-feature">${privateScorers(data)}</div>`
    : `${podium.length ? `<div class="podium">${podium.map((s, index) => `<article class="podium-place podium-${index + 1}"><span class="eyebrow">${s.rank}.º lugar${s.tied ? ' · ex aequo' : ''}</span>${icon('trophy')}<strong class="podium-goals">${s.goals}<small>golos</small></strong><h2>${esc(s.name)}</h2><a href="${teamClubPath(data, s.teamId)}">${esc(teamById(data, s.teamId).name)}</a></article>`).join('')}</div>` : ''}<section class="panel"><div class="panel-heading"><h2>Classificação de marcadores · ${esc(scorerScopes[scope])}</h2><span class="subtle-label">${ranked.length} ${ranked.length === 1 ? 'jogador' : 'jogadores'}</span></div>${ranked.length ? `<ol class="scorer-list">${scorerRows(data, ranked)}</ol>` : emptyState('Sem resultados', 'Experimenta outro nome ou limpa os filtros.')}</section><p class="muted small">Totais iguais partilham a posição (=); em empate, ordem alfabética. O acumulado soma a 1.ª e a 2.ª fase sem contar golos duas vezes. Cada registo é um nome numa equipa, tal como escrito na ficha: o mesmo nome em equipas diferentes não é juntado.</p>${completenessNote(data)}`;
  return `${pageHeading('O golo tem protagonistas', 'Bota de Ouro.', 'Cada golo conta uma história. Acompanha as conquistas dos jogadores e das equipas.')}<form class="filter-bar" action="/marcadores">${searchInput(q, 'Procurar jogador ou clube', 'Nome do jogador ou clube…')}${phaseSelect(data, scope, { all: '', values: Object.entries(scorerScopes) })}${groupSelect(data, group, phaseId)}${clubSelect(data, club?.slug)}${formFooter('/marcadores')}</form>${body}<section class="section">${heading('O ataque em números', 'As equipas com mais golos', `Golos marcados na ${currentPhase(data).name}, segundo os resultados.`)}<div class="panel goal-ranking">${teamGoalRanking(data, 12)}</div></section>`;
}
function clubs(data, url) {
  const q = url.searchParams.get('q') ?? '', group = url.searchParams.get('serie') ?? '';
  const list = data.clubs.filter(club => normalize(club.name).includes(normalize(q)) && (!group || club.teamIds.some(id => groupById(data, group)?.teamIds.includes(id)))).sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  return `${pageHeading('A nossa terra, os nossos clubes', 'Os protagonistas.', 'As equipas que dão vida ao futebol de formação do Alto Minho.')}<form class="filter-bar" action="/clubes">${searchInput(q, 'Procurar clube', 'Nome do clube…')}${groupSelect(data, group)}${formFooter('/clubes')}</form><p class="result-count" role="status">${list.length} clubes encontrados</p>${list.length ? `<div class="club-grid">${list.map(club => `<a class="club-card" href="/clubes/${club.slug}">${clubBadge(club, true)}<h2>${esc(club.name)}</h2><p class="muted">${club.teamIds.map(id => teamGroups(data, id).map(g => `Série ${g.letter}`).join(' → ')).join(' · ')}</p><div>${club.teamIds.length === 1 ? 'Ver equipa' : `Ver ${club.teamIds.length} equipas`} ${icon('arrow')}</div></a>`).join('')}</div>` : emptyState('Nenhum clube encontrado', 'Experimenta outro nome ou limpa os filtros.')}<p class="muted small badge-note">Os símbolos com iniciais identificam os clubes enquanto não estiverem disponíveis emblemas oficiais autorizados.</p>`;
}
function rosterSection(data, team) {
  const roster = data.rosters?.find(r => r.teamId === team.id);
  const cards = (people, kind) => people?.length ? `<div class="people-grid">${people.map(person => `<article class="person-card"><div class="person-portrait">${icon('person')}${person.photoPath ? `<img class="person-image" src="${esc(person.photoPath)}" width="160" height="180" loading="lazy" alt="${esc(person.name)}">` : ''}${person.jerseyNumber != null && kind === 'player' ? `<span class="jersey-number">${person.jerseyNumber}</span>` : ''}</div><div class="person-card-body"><h3>${esc(person.name)}</h3>${person.position || person.role ? `<p>${esc(kind === 'player' ? person.position : person.role)}</p>` : ''}</div></article>`).join('')}</div>` : `<div class="roster-empty">${icon(kind === 'player' ? 'shield' : 'person')}<h3>${kind === 'player' ? 'O plantel está a caminho.' : 'A equipa técnica, em breve.'}</h3><p>${kind === 'player' ? 'Aqui vais poder conhecer os jogadores desta equipa, quando houver dados autorizados.' : 'Os treinadores e a restante equipa técnica vão ter o seu lugar aqui.'}</p></div>`;
  return `<section class="section roster-section" id="plantel-${team.id}"><div class="panel"><div class="panel-heading"><h2>Plantel</h2><span class="subtle-label">${roster?.players.length ? `${roster.players.length} jogadores${roster.complete ? ' · plantel completo' : ' · registos disponíveis'}` : data.competition.season}</span></div>${cards(roster?.players, 'player')}</div><div class="panel staff-panel"><div class="panel-heading"><h2>Equipa técnica</h2></div>${cards(roster?.staff, 'staff')}</div></section>`;
}
function splitRow(label, s) {
  return `<tr><th scope="row">${label}</th><td>${s.played}</td><td>${s.wins}-${s.draws}-${s.losses}</td><td>${s.goalsFor}</td><td>${s.goalsAgainst}</td><td>${s.played ? number(s.goalsFor / s.played) : '—'}</td><td>${s.played ? number(s.points / s.played) : '—'}</td></tr>`;
}
function teamAnalysisSection(data, team, group, { showScorers = true, showPoints = true } = {}) {
  const a = teamAnalysis(data, team.id, group.phaseId);
  if (!a.all.played) return `<p class="muted">Ainda sem jogos concluídos nesta fase.</p>`;
  const avg = groupAverages(data, group.id);
  const scorers = rankScorers(scorersFor(data, group.phaseId).filter(s => s.teamId === team.id));
  const identified = data.matches.filter(m => m.phaseId === group.phaseId && m.status === 'finished').reduce((n, m) => n + (m.homeId === team.id ? m.scoring.home.identified : m.awayId === team.id ? m.scoring.away.identified : 0), 0);
  const rows = a.timeline.map(t => ({ label: `J${t.round} · ${teamById(data, t.opponentId).name}`, short: `J${t.round}`, gf: t.gf, ga: t.ga }));
  const per = (n, d) => d ? n / d : null;
  return `<div class="analysis">
    <div class="form-strip" aria-label="Forma recente: ${a.form.map(r => ({ V: 'vitória', E: 'empate', D: 'derrota' })[r]).join(', ')}"><span class="eyebrow">Últimos ${a.form.length} jogos</span>${a.form.map(r => `<span class="form-chip form-${r}">${r}</span>`).join('')}</div>
    <dl class="team-stat-grid">${[['Aproveitamento', percent(a.efficiency)], ['Golos/jogo', number(a.all.goalsFor / a.all.played)], ['Sofridos/jogo', number(a.all.goalsAgainst / a.all.played)], ['Sem sofrer', a.cleanSheets], ['Sem marcar', a.blanks], ['Decididos por ≤1 golo', a.closest]].map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="${showPoints ? 'two-columns analysis-charts' : 'analysis-single'}"><div>${barChart({ title: 'Golos marcados e sofridos por jogo', rows, keys: [{ key: 'gf', label: 'Marcados', cls: 'bar-for' }, { key: 'ga', label: 'Sofridos', cls: 'bar-against' }] })}</div>${showPoints ? `<div>${lineChart({ title: 'Pontos acumulados', label: 'pontos', points: a.timeline.map(t => ({ label: `Jornada ${t.round}`, short: `J${t.round}`, value: t.points, detail: `<small class="tip-game">${t.result} ${t.gf}–${t.ga} frente a ${esc(teamById(data, t.opponentId).name)}</small>` })) })}</div>` : ''}</div>
    <div class="two-columns"><div class="table-scroll"><table class="split-table"><caption>Casa e fora</caption><thead><tr><th scope="col"></th><th scope="col">J</th><th scope="col">V-E-D</th><th scope="col">GM</th><th scope="col">GS</th><th scope="col">GM/J</th><th scope="col">Pts/J</th></tr></thead><tbody>${splitRow('Casa', a.home)}${splitRow('Fora', a.away)}${splitRow('Total', a.all)}</tbody></table></div>
    <div class="compare"><h3>Comparação com a Série ${group.letter}</h3><p class="muted small">Por jogo disputado · média das ${avg.teams} equipas com jogos.</p>${compareBars({ label: 'Golos marcados por jogo', a: per(a.all.goalsFor, a.all.played), b: avg.goalsForPerGame, bLabel: 'Média da série' })}${compareBars({ label: 'Golos sofridos por jogo', a: per(a.all.goalsAgainst, a.all.played), b: avg.goalsAgainstPerGame, bLabel: 'Média da série', lowerIsBetter: true })}${compareBars({ label: 'Pontos por jogo', a: per(a.all.points, a.all.played), b: avg.pointsPerGame, bLabel: 'Média da série' })}<a class="text-link compare-link" href="/comparar?a=${team.id}">Comparar com outra equipa ${icon('arrow')}</a>${a.biggestWin ? `<p class="muted small">Maior vitória: ${a.biggestWin.gf}–${a.biggestWin.ga} frente a ${esc(teamById(data, a.biggestWin.opponentId).name)} (J${a.biggestWin.match.round}).</p>` : ''}</div></div>
    ${showScorers ? `<div class="team-scorers"><h3>Quem marcou</h3>${scorers.length ? `<ol class="scorer-list compact">${scorerRows(data, scorers)}</ol>` : `<p class="muted">${data.publication.scorerNames === 'public' ? 'Sem marcadores identificados nesta fase.' : 'Nomes disponíveis nos dados ao vivo.'}</p>`}<p class="muted small">${identified} de ${a.all.goalsFor} golos com marcador identificado${a.all.goalsFor - identified > 0 ? ` (os restantes são autogolos a favor ou golos sem nome na fonte)` : ''}.</p></div>` : ''}
  </div>`;
}
function clubProfile(data, id) {
  const club = clubById(data, id);
  if (!club) return notFound();
  const teams = data.teams.filter(t => t.clubId === id);
  const involved = m => teams.some(t => t.id === m.homeId || t.id === m.awayId);
  const matches = recentMatches(data).filter(involved).slice(0, 6);
  const fixtures = upcomingMatches(data).filter(involved).slice(0, 6);
  return `<a class="back-link" href="/clubes">← Todos os clubes</a><header class="club-profile-heading">${clubBadge(club, true)}<div><p class="eyebrow">Futebol de formação · ${esc(data.competition.season)}</p><h1 tabindex="-1">${esc(club.name)}</h1><p class="muted">${teams.length} ${teams.length === 1 ? 'equipa na competição' : 'equipas na competição — cada uma com a sua série e os seus resultados'} · ${esc(data.competition.shortName)}</p></div></header>${teams.map(t => teamGroups(data, t.id).filter(g => g.defined).reverse().map(g => {
    const s = teamStanding(data, t.id, g.phaseId), phase = phaseById(data, g.phaseId);
    if (!s.played && !t.withdrawn) return `<section class="panel team-summary team-summary-upcoming"><div class="panel-heading"><div><h2>${esc(t.name)}</h2><p class="muted">${esc(phase.name)} · Série ${g.letter} · ainda sem jogos</p></div>${textLink(groupPath(data, g.id), 'Ver série')}</div></section>`;
    return `<section class="panel team-summary"><div class="panel-heading"><div><h2>${esc(t.name)}</h2><p class="muted">${esc(phase.name)} · Série ${g.letter} · ${t.withdrawn ? 'Desistiu da prova' : `${s.position}.º classificado`}</p></div>${textLink(groupPath(data, g.id), 'Classificação')}</div><dl class="team-stat-grid">${[['Pontos', s.points], ['Jogos', s.played], ['Vitórias', s.wins], ['Empates', s.draws], ['Derrotas', s.losses], ['Golos marcados', s.goalsFor], ['Golos sofridos', s.goalsAgainst], ['Diferença', s.goalDifference]].map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>${t.withdrawn ? '' : `<p class="follow-hint"><a class="text-link" href="/minha-equipa?equipa=${t.id}">${icon('shield')} Seguir como a minha equipa</a></p><details class="analysis-details" open><summary>${icon('chart')} Análise da equipa · ${esc(phase.name)}</summary>${teamAnalysisSection(data, t, g)}</details>`}</section>`;
  }).join('') + rosterSection(data, t)).join('')}<section class="section">${heading('O percurso', 'Últimos resultados')}${matchGrid(data, matches)}</section><section class="section">${heading('Em agenda', 'Próximos jogos')}${matchGrid(data, fixtures)}</section>`;
}
function statistics(data) {
  const phase = currentPhase(data), groups = definedGroups(data, phase.id);
  const max = Math.max(...groups.map(g => groupStatistics(data, g.id).goals), 1);
  const biggest = recentMatches(data).sort((a, b) => b.homeGoals + b.awayGoals - a.homeGoals - a.awayGoals).slice(0, 3);
  return `${pageHeading('O jogo, visto de outra forma', 'Dentro dos números.', 'Estatísticas calculadas a partir dos jogos com resultado completo.')}<div class="metrics">${metric(data.stats.goals, 'Golos marcados', 'ball')}${metric(data.stats.played, 'Jogos realizados', 'calendar')}${metric(number(data.stats.goals / Math.max(data.stats.played, 1), 2), 'Média por jogo', 'chart')}${metric(data.stats.draws, 'Empates', 'shield')}</div><section class="section two-columns"><div class="panel"><div class="panel-heading"><h2>Golos por série</h2><span class="subtle-label">${esc(phase.name)}</span></div><div class="comparison-chart" role="img" aria-label="Comparação de golos registados por série">${groups.map(g => {
    const s = groupStatistics(data, g.id);
    return `<a href="${groupPath(data, g.id)}"><span>Série ${g.letter}<small>${s.played} jogos · ${number(s.average)} por jogo</small></span><span class="bar-track"><span style="--bar:${Math.round(s.goals / max * 100)}%"></span></span><strong>${s.goals}</strong></a>`;
  }).join('')}</div></div><div class="panel"><div class="panel-heading"><h2>Os ataques em destaque</h2></div>${teamGoalRanking(data)}</div></section><section class="section">${heading('Redes cheias', 'Os jogos com mais golos')}${matchGrid(data, biggest)}</section><section class="section"><div class="panel"><div class="panel-heading"><h2>Golos por clube</h2><span class="subtle-label">Soma das equipas de cada clube</span></div><p class="muted small">Clubes com equipas A e B somam aqui as duas, que competem em séries diferentes; para a análise competitiva, abre o perfil de cada equipa.</p><div class="club-goals-table">${clubRanking(data).map(c => `<a href="/clubes/${c.slug}"><span>${clubBadge(c)}${esc(c.name)}${c.teamIds.length > 1 ? ` <small>${c.teamIds.length} equipas</small>` : ''}</span><strong>${c.goals}<small>golos</small></strong></a>`).join('')}</div></div></section>${data.quality?.unidentifiedGoals ? `<section class="section"><div class="panel"><div class="panel-heading"><h2>Qualidade dos dados</h2></div><p>${data.stats.goals} golos nos resultados; ${data.stats.describedGoals} descritos nas fichas (${data.stats.ownGoals} autogolos) e ${data.stats.unidentifiedGoals} ainda sem marcador identificado.</p></div></section>` : ''}`;
}
function compareTeams(data, url) {
  const phaseId = data.phases.some(p => p.id === url.searchParams.get('fase')) ? url.searchParams.get('fase') : currentPhase(data).id;
  const groups = definedGroups(data, phaseId);
  const inPhase = new Set(groups.flatMap(g => g.teamIds));
  const pick = key => { const id = url.searchParams.get(key); return id && inPhase.has(id) ? teamById(data, id) : null; };
  const teamA = pick('a'), teamB = pick('b');
  const select = (name, chosen) => `<label>${name === 'a' ? 'Equipa A' : 'Equipa B'}<select name="${name}" data-filter><option value="">Escolhe uma equipa</option>${groups.map(g => `<optgroup label="Série ${g.letter}">${g.teamIds.map(id => `<option value="${id}"${selected(id, chosen?.id ?? '')}>${esc(teamById(data, id).name)}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  const form = `<form class="filter-bar compare-form" action="/comparar">${phaseSelect(data, phaseId, { all: '', values: data.phases.filter(p => p.state !== 'pending').map(p => [p.id, p.name]) })}${select('a', teamA)}${select('b', teamB)}${formFooter('/comparar')}</form>`;
  const head = pageHeading('Frente a frente', 'Comparar equipas.', 'Duas equipas, os mesmos números, por jogo disputado. Só contam jogos concluídos.');
  if (!teamA || !teamB || teamA.id === teamB.id) return `${head}${form}<div class="panel">${emptyState(teamA && teamB ? 'Escolhe duas equipas diferentes' : 'Escolhe duas equipas', 'Usa os seletores acima. Dica: no perfil de cada equipa há um atalho «Comparar com outra equipa».')}</div>`;
  const A = teamAnalysis(data, teamA.id, phaseId), B = teamAnalysis(data, teamB.id, phaseId);
  const gA = groups.find(g => g.teamIds.includes(teamA.id)), gB = groups.find(g => g.teamIds.includes(teamB.id));
  const sA = teamStanding(data, teamA.id, phaseId), sB = teamStanding(data, teamB.id, phaseId);
  const per = (n, d) => d ? n / d : null;
  const side = (team, g, s, an, cls) => `<a class="versus-team ${cls}" href="${teamClubPath(data, team.id)}">${teamBadge(data, team, true)}<h2>${esc(team.name)}</h2><p class="muted">Série ${g.letter} · ${s.position}.º · ${s.points} pts</p><div class="form-strip">${an.form.map(r => `<span class="form-chip form-${r}">${r}</span>`).join('') || '<span class="muted small">sem jogos</span>'}</div></a>`;
  const h2h = data.matches.filter(m => m.phaseId === phaseId && [m.homeId, m.awayId].includes(teamA.id) && [m.homeId, m.awayId].includes(teamB.id));
  const row = (label, a, b, opts = {}) => {
    const aWins = opts.lower ? a < b : a > b, bWins = opts.lower ? b < a : b > a, max = Math.max(a ?? 0, b ?? 0, 0.0001);
    const v = x => Math.round((x ?? 0) / max * 100), fmt = x => `${number(x, opts.digits ?? 1)}${opts.pct ? '%' : ''}`;
    return `<div class="duel-row"><strong class="duel-a ${aWins ? 'win' : ''}">${fmt(a)}</strong><div class="duel-mid"><span>${esc(label)}${opts.lower ? ' <small>(menos é melhor)</small>' : ''}</span><div class="duel-bars" aria-hidden="true"><span class="dbar dbar-a ${aWins ? 'win' : ''}" style="--v:${v(a)}%"></span><span class="dbar dbar-b ${bWins ? 'win' : ''}" style="--v:${v(b)}%"></span></div></div><strong class="duel-b ${bWins ? 'win' : ''}">${fmt(b)}</strong></div>`;
  };
  return `${head}${form}<section class="versus-hero panel">${side(teamA, gA, sA, A, 'team-a')}<span class="versus-x" aria-hidden="true">×</span>${side(teamB, gB, sB, B, 'team-b')}</section>${gA.id !== gB.id ? `<p class="notice">${icon('info')}<span>Séries diferentes: os números são por jogo, mas os adversários não foram os mesmos.</span></p>` : ''}<section class="section panel duel"><div class="panel-heading"><h2>Os números</h2><span class="subtle-label">${A.all.played} e ${B.all.played} jogos</span></div>${row('Pontos por jogo', per(A.all.points, A.all.played), per(B.all.points, B.all.played), { digits: 2 })}${row('Aproveitamento', A.efficiency === null ? null : Math.round(A.efficiency * 100), B.efficiency === null ? null : Math.round(B.efficiency * 100), { digits: 0, pct: true })}${row('Golos marcados por jogo', per(A.all.goalsFor, A.all.played), per(B.all.goalsFor, B.all.played))}${row('Golos sofridos por jogo', per(A.all.goalsAgainst, A.all.played), per(B.all.goalsAgainst, B.all.played), { lower: true })}${row('Jogos sem sofrer', A.cleanSheets, B.cleanSheets, { digits: 0 })}${row('Vitórias', A.all.wins, B.all.wins, { digits: 0 })}</section><section class="section">${heading('Confronto direto', h2h.length ? 'Quando se encontraram' : 'Ainda sem confronto direto', h2h.length ? '' : 'Não há jogos entre estas equipas nesta fase.')}${h2h.length ? matchGrid(data, h2h) : ''}</section>`;
}
function playerProfile(data, id) {
  const back = `<a class="back-link" href="/marcadores">← Bota de Ouro</a>`;
  if (data.publication.scorerNames === 'redacted') return `${back}<div class="panel">${emptyState('A carregar o perfil…', 'Os nomes chegam com os dados ao vivo da competição.')}</div>`;
  const record = scorersFor(data, 'total').find(s => s.id === id);
  if (!record) return `${back}${pageHeading('Jogador', 'Perfil indisponível.', 'Este perfil não existe ou o nome não é publicado.')}`;
  const team = teamById(data, record.teamId), club = clubById(data, team.clubId);
  const ranked = rankScorers(scorersFor(data, 'total')).find(s => s.id === id);
  const games = data.matches.filter(m => m.status === 'finished' && ['home', 'away'].some(side => m[side + 'Id'] === team.id && m.scoring[side].scorers.some(e => e.id === id)))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.round - a.round);
  const teamGoals = data.groups.flatMap(g => g.standings).filter(s => s.teamId === team.id).reduce((n, s) => n + s.goalsFor, 0);
  const byPhase = data.phases.map(p => ({ p, goals: scorersFor(data, p.id).find(s => s.id === id)?.goals ?? 0 })).filter(x => x.p.state !== 'pending');
  const rows = games.map(m => {
    const side = m.homeId === team.id ? 'home' : 'away', other = side === 'home' ? m.awayId : m.homeId;
    const goals = m.scoring[side].scorers.find(e => e.id === id).goals, g = groupById(data, m.groupId);
    const res = m[side + 'Goals'] > m[(side === 'home' ? 'away' : 'home') + 'Goals'] ? 'V' : m.homeGoals === m.awayGoals ? 'E' : 'D';
    return `<li><a href="/jogos/${m.id}"><span class="pg-date">${dateLabel(m.date)}<small>${esc(phaseById(data, m.phaseId).name)} · Série ${g.letter} · J${m.round}</small></span><span class="pg-opp"><small class="pg-where">${side === 'home' ? 'Casa' : 'Fora'}</small>${teamBadge(data, other)}<span>${esc(teamById(data, other).name)}</span></span><span class="pg-score"><span class="form-chip form-${res}">${res}</span> ${m.homeGoals}–${m.awayGoals}</span><strong class="pg-goals">${'⚽'.repeat(Math.min(goals, 5))}<small>${goals} ${goals === 1 ? 'golo' : 'golos'}</small></strong></a></li>`;
  }).join('');
  return `${back}<header class="player-hero">${teamBadge(data, team, true)}<div><p class="eyebrow">${esc(data.competition.category)} · ${esc(data.competition.season)}</p><h1 tabindex="-1">${esc(record.name)}</h1><p class="muted"><a href="/clubes/${club.slug}">${esc(team.name)}</a> · ${ranked.rank}.º na Bota de Ouro${ranked.tied ? ' (empatado)' : ''}</p></div></header><section class="metrics">${metric(record.goals, 'Golos', 'ball', 'Acumulado da competição')}${byPhase.map(x => metric(x.goals, `Golos · ${x.p.name}`, 'trophy')).join('')}${metric(games.length, 'Jogos a marcar', 'calendar')}${metric(teamGoals ? `${Math.round(record.goals / teamGoals * 100)}%` : '—', 'dos golos da equipa', 'chart', `${record.goals} de ${teamGoals}`)}</section><section class="section">${heading('Jogo a jogo', 'Os golos', 'Jogos em que marcou, do mais recente para o mais antigo.')}${games.length ? `<ol class="player-games">${rows}</ol>` : emptyState('Sem jogos', '')}</section><p class="notice">${icon('shield')}<span>Perfil criado a partir das fichas de jogo: só o nome, a equipa e os golos. Sem fotografias nem dados pessoais. <a href="/privacidade">Pedir para retirar</a>.</span></p>`;
}
// --- A minha equipa ------------------------------------------------------------
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const whenLabel = date => { const d = daysUntil(date); return d === null ? 'Data a confirmar' : d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d > 1 ? `Daqui a ${d} dias` : 'Por confirmar'; };
const longDate = date => date ? new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' }).format(new Date(date + 'T12:00:00Z')) : 'Data a confirmar';
function myTeamStrip(data) {
  const team = prefs.myTeam ? teamById(data, prefs.myTeam) : null;
  if (!team) return `<a class="my-team-cta" href="/minha-equipa">${icon('shield')}<span><strong>Segue a tua equipa</strong><small>Próximos jogos, marcadores e números da tua equipa, num só sítio.</small></span>${icon('arrow')}</a>`;
  const next = teamFixtures(data, team.id).upcoming[0];
  const s = [...teamGroups(data, team.id)].reverse().map(g => teamStanding(data, team.id, g.phaseId)).find(x => x?.played);
  const opp = next && teamById(data, next.homeId === team.id ? next.awayId : next.homeId);
  return `<a class="my-team-cta is-following" href="/minha-equipa">${teamBadge(data, team)}<span><small>A tua equipa${s ? ` · ${s.position}.º lugar, ${s.points} pts` : ''}</small><strong>${esc(team.name)}</strong><small>${next ? `Próximo: ${next.homeId === team.id ? 'em casa' : 'fora'} com ${esc(opp.name)} · ${esc(whenLabel(next.date).toLowerCase())}` : 'Sem próximos jogos marcados'}</small></span>${icon('arrow')}</a>`;
}
function teamPicker(data, url) {
  const q = url.searchParams.get('q') ?? '';
  const teams = data.teams.filter(t => !q || normalize(`${t.name} ${clubById(data, t.clubId).name}`).includes(normalize(q))).sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  const where = t => teamGroups(data, t.id).filter(g => g.defined).map(g => `Série ${g.letter}`).join(' → ');
  return `${pageHeading('A minha equipa', 'Qual é a tua equipa?', 'Escolhe uma vez. O MINHO11 lembra-se neste telemóvel e mostra-te logo os próximos jogos, os marcadores e os números da tua equipa.')}<form class="filter-bar picker-search" action="/minha-equipa"><input type="hidden" name="escolher" value="1">${searchInput(q)}</form><p class="result-count" role="status">${plural(teams.length, 'equipa', 'equipas')}</p>${teams.length ? `<ul class="team-pick-grid">${teams.map(t => `<li><a class="team-pick" href="/minha-equipa?equipa=${t.id}" data-follow="${t.id}">${teamBadge(data, t)}<span><strong>${esc(t.name)}</strong><small>${where(t)}${t.withdrawn ? ' · desistiu' : ''}</small></span>${prefs.myTeam === t.id ? '<span class="pick-current">A tua</span>' : icon('arrow')}</a></li>`).join('')}</ul>` : emptyState('Nenhuma equipa encontrada', 'Experimenta outro nome.')}<p class="muted small">A escolha fica guardada só neste aparelho. Não há conta nem registo.</p>`;
}
/** The team's season inside the site, round by round (each round is a Saturday morning), phase by phase. */
function seasonCalendar(data, team, fixtures, today = todayLisbon()) {
  const mine = data.matches.filter(m => m.homeId === team.id || m.awayId === team.id);
  if (!mine.length) return '';
  const nextId = (fixtures.upcoming.find(m => m.date) ?? fixtures.upcoming[0])?.id, period = data.competition.schedule?.period;
  const fmt = date => new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(date + 'T12:00:00Z')).replace(/\./g, '').replace(/^./, c => c.toUpperCase());
  const row = m => {
    const side = m.homeId === team.id ? 'home' : 'away', opp = side === 'home' ? m.awayId : m.homeId, st = matchStatus(m, today), next = m.id === nextId;
    const gf = m[side + 'Goals'], ga = m[(side === 'home' ? 'away' : 'home') + 'Goals'], res = gf > ga ? 'V' : gf === ga ? 'E' : 'D';
    const end = st === 'finished' ? `<span class="cal-result"><span class="form-chip form-${res}">${res}</span><b>${gf}–${ga}</b></span>`
      : st === 'unconfirmed' ? '<span class="cal-tag">Resultado por lançar</span>'
      : `<span class="cal-tag">${next && m.date ? esc(whenLabel(m.date)) : m.date ? esc(period ?? 'Agendado') : 'Data a confirmar'}</span>`;
    return `<li class="cal-row${st === 'finished' || st === 'unconfirmed' ? ' is-past' : ''}${next ? ' is-next' : ''}"><a href="/jogos/${m.id}"><span class="cal-day" aria-label="Jornada ${m.round}"><small>Jorn.</small><b>${m.round}</b></span><span class="cal-main"><small>${next ? '<span class="cal-next">Próximo</span>' : ''}${m.date ? esc(fmt(m.date)) : 'Data a confirmar'} · ${side === 'home' ? 'Casa' : 'Fora'}</small><span class="cal-opp">${teamBadge(data, opp)}<strong>${side === 'home' ? 'vs' : 'em'} ${esc(teamById(data, opp).name)}</strong></span></span>${end}</a></li>`;
  };
  /** Saturdays strictly between two game dates: weekends without a game for this team. */
  const gaps = (from, to) => { const out = []; const d = new Date(from + 'T12:00:00Z'); for (d.setUTCDate(d.getUTCDate() + 7); d.toISOString().slice(0, 10) < to; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10)); return out; };
  const blocks = data.phases.filter(p => mine.some(m => m.phaseId === p.id)).map(phase => {
    const list = mine.filter(m => m.phaseId === phase.id).sort((a, b) => a.round - b.round || (a.date ?? '').localeCompare(b.date ?? ''));
    const g = groupById(data, list[0].groupId), played = list.filter(m => m.status === 'finished').length;
    const rows = list.map((m, k) => { const prev = list[k - 1]; const free = prev?.date && m.date ? gaps(prev.date, m.date) : []; return free.map(d => `<li class="cal-gap">${esc(fmt(d))} · fim de semana sem jogo</li>`).join('') + row(m); }).join('');
    const open = list.some(m => m.status !== 'finished');
    return `<details class="cal-month"${open ? ' open' : ''}><summary><span>${esc(phase.name)} · Série ${g.letter}</span><small>${played}/${list.length} jogadas</small></summary><ol class="cal-list">${rows}</ol></details>`;
  }).join('');
  return `<div class="season-calendar">${blocks}${period ? `<p class="muted small">Cada jornada é ao sábado ${esc(period)}. A hora exata e o campo combinam-se com o clube.</p>` : ''}</div>`;
}
function nextMatchPanel(data, team, match) {
  const isHome = match.homeId === team.id, oppId = isHome ? match.awayId : match.homeId, g = groupById(data, match.groupId);
  const me = teamAnalysis(data, team.id, match.phaseId), them = teamAnalysis(data, oppId, match.phaseId);
  const sMe = teamStanding(data, team.id, match.phaseId), sThem = teamStanding(data, oppId, match.phaseId);
  const before = data.matches.find(m => m.status === 'finished' && m.phaseId === match.phaseId && [m.homeId, m.awayId].includes(team.id) && [m.homeId, m.awayId].includes(oppId));
  const per = (a, k) => a.all.played ? number(a.all[k] / a.all.played) : '—';
  const form = a => a.form.length ? a.form.map(r => `<span class="form-chip form-${r}">${r}</span>`).join('') : '<span class="muted small">sem jogos</span>';
  const side = (id, s, a, label) => `<div class="nm-team">${teamBadge(data, id, true)}<strong>${esc(teamById(data, id).name)}</strong><span class="pg-where">${label}</span><div class="form-strip">${form(a)}</div></div>`;
  const row = (label, a, b) => `<div class="nm-row"><strong>${a}</strong><span>${label}</span><strong>${b}</strong></div>`;
  const home = isHome ? [team.id, sMe, me] : [oppId, sThem, them], away = isHome ? [oppId, sThem, them] : [team.id, sMe, me];
  return `<article class="panel next-match"><div class="nm-when"><p class="eyebrow">Próximo jogo · ${esc(phaseById(data, match.phaseId).name)} · Série ${g.letter} · J${match.round}</p><strong class="nm-countdown">${esc(whenLabel(match.date))}</strong><span class="muted">${esc(longDate(match.date))}${match.date && data.competition.schedule?.period ? ` · ${esc(data.competition.schedule.period)}` : ''}</span></div><div class="nm-teams">${side(home[0], home[1], home[2], 'Casa')}<span class="versus-x" aria-hidden="true">×</span>${side(away[0], away[1], away[2], 'Fora')}</div>${home[1]?.played || away[1]?.played ? `<div class="nm-stats">${row('Lugar na série', home[1]?.played ? `${home[1].position}.º` : '—', away[1]?.played ? `${away[1].position}.º` : '—')}${row('Pontos', home[1]?.points ?? 0, away[1]?.points ?? 0)}${row('Golos marcados por jogo', per(home[2], 'goalsFor'), per(away[2], 'goalsFor'))}${row('Golos sofridos por jogo', per(home[2], 'goalsAgainst'), per(away[2], 'goalsAgainst'))}</div>` : ''}${before ? `<p class="nm-before">${icon('clock')} Já se defrontaram nesta fase: <a href="/jogos/${before.id}">${esc(teamById(data, before.homeId).name)} ${before.homeGoals}–${before.awayGoals} ${esc(teamById(data, before.awayId).name)}</a></p>` : ''}<div class="panel-bottom">${textLink(`/comparar?fase=${match.phaseId}&a=${team.id}&b=${oppId}`, 'Comparar as duas equipas')}${textLink(`/jogos/${match.id}`, 'Ver jogo')}</div></article>`;
}
function insights(data, team, group, fixtures) {
  const s = group.standings.find(x => x.teamId === team.id), a = teamAnalysis(data, team.id, group.phaseId);
  if (!s?.played) return '';
  const list = [], name = id => esc(teamById(data, id).name), leader = group.standings[0];
  if (s.position === 1) { const gap = s.points - (group.standings[1]?.points ?? s.points); list.push(['trophy', gap ? `Lidera a Série ${group.letter} com ${plural(gap, 'ponto', 'pontos')} de vantagem.` : `Lidera a Série ${group.letter}, empatada em pontos com o 2.º.`]); }
  else list.push(['trophy', leader.points === s.points ? `Tem os mesmos pontos que o 1.º (${name(leader.teamId)}); está atrás pelo desempate.` : `Está a ${plural(leader.points - s.points, 'ponto', 'pontos')} do 1.º lugar (${name(leader.teamId)}).`]);
  const active = group.standings.filter(x => x.played && !teamById(data, x.teamId).withdrawn);
  const rate = (x, k) => x[k] / x.played;
  if (active.length > 1 && active.every(x => rate(x, 'goalsFor') <= rate(s, 'goalsFor'))) list.push(['ball', `Melhor ataque da série: ${number(rate(s, 'goalsFor'))} golos por jogo.`]);
  if (active.length > 1 && active.every(x => rate(x, 'goalsAgainst') >= rate(s, 'goalsAgainst'))) { const r = rate(s, 'goalsAgainst'); list.push(['shield', `Defesa menos batida da série: ${number(r)} ${r === 1 ? 'golo sofrido' : 'golos sofridos'} por jogo.`]); }
  const results = a.rows.map(r => r.result).reverse();
  const run = test => { let n = 0; for (const r of results) { if (!test(r)) break; n++; } return n; };
  const wins = run(r => r === 'V'), unbeaten = run(r => r !== 'D');
  if (wins >= 2) list.push(['chart', `${wins} vitórias seguidas.`]);
  else if (unbeaten >= 3) list.push(['chart', `${unbeaten} jogos seguidos sem perder.`]);
  if (a.cleanSheets) list.push(['shield', `${plural(a.cleanSheets, 'jogo', 'jogos')} sem sofrer golos.`]);
  const left = [...fixtures.upcoming, ...fixtures.unconfirmed].filter(m => m.groupId === group.id).length;
  if (left) list.push(['calendar', `Faltam ${plural(left, 'jogo', 'jogos')} nesta fase: ${left * 3} pontos ainda em jogo.${s.position > 1 && s.points + left * 3 >= leader.points ? ' Ainda dá para chegar aos pontos do 1.º.' : ''}`]);
  return `<ul class="insights">${list.map(([i, t]) => `<li>${icon(i)}<span>${t}</span></li>`).join('')}</ul>`;
}
function rivalChips(data, team, group, rivalId) {
  return `<nav class="rival-chips" aria-label="Comparar com"><span class="muted small">Comparar com:</span>${group.teamIds.filter(id => id !== team.id).map(id => `<a href="/minha-equipa?equipa=${team.id}&vs=${id}" data-keep-scroll${id === rivalId ? ' aria-current="true"' : ''}>${teamBadge(data, id)}${esc(teamById(data, id).name)}</a>`).join('')}</nav>`;
}
/** One team's game in a given round of a group, in words: "V 3–1 vs CRC Távora". */
function roundGame(data, teamId, groupId, round) {
  const m = data.matches.find(x => x.groupId === groupId && x.round === round && x.status === 'finished' && (x.homeId === teamId || x.awayId === teamId));
  if (!m) return { text: 'Sem jogo nesta jornada', date: null };
  const home = m.homeId === teamId, gf = home ? m.homeGoals : m.awayGoals, ga = home ? m.awayGoals : m.homeGoals;
  return { text: `${gf > ga ? 'V' : gf === ga ? 'E' : 'D'} ${gf}–${ga} ${home ? 'vs' : 'em'} ${teamById(data, home ? m.awayId : m.homeId).name}`, date: m.date };
}
function raceSection(data, team, group, rivalId) {
  const race = pointsRace(data, group.id);
  if (race.rounds.length < 2) return '';
  const role = id => id === team.id ? 'me' : id === rivalId ? 'rival' : 'other';
  const series = key => race.teams.map(t => ({ label: teamById(data, t.teamId).name, values: t[key], role: role(t.teamId) }));
  const marked = race.teams.filter(t => role(t.teamId) !== 'other').sort((a, b) => (role(a.teamId) === 'me' ? -1 : 1));
  const tips = key => race.rounds.map((round, i) => {
    const games = marked.map(t => ({ t, g: roundGame(data, t.teamId, group.id, round) }));
    const date = games.map(x => x.g.date).find(Boolean);
    return `<strong>Jornada ${round}${date ? ` · ${esc(new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(date + 'T12:00:00Z')))}` : ''}</strong>${games.map(({ t, g }) => `<span class="tip-line"><i class="tip-dot race-key-${role(t.teamId)}"></i>${esc(teamById(data, t.teamId).name)}<b>${key === 'points' ? `${t.points[i]} pts` : `${t.positions[i]}.º`}</b></span><small class="tip-game">${esc(g.text)}</small>`).join('')}`;
  });
  const labels = race.rounds.map(r => `J${r}`);
  return `<div class="race-grid">${raceChart({ title: 'Corrida aos pontos', labels, series: series('points'), tips: tips('points'), unit: 'pontos', yLabel: 'Pontos' })}${raceChart({ title: 'Lugar na série, jornada a jornada', labels, series: series('positions'), tips: tips('positions'), invert: true, max: group.teamIds.length, yLabel: 'Lugar', caption: 'Com os desempates da folha: pontos, diferença de golos, golos marcados. Toca numa jornada para ver esse fim de semana.' })}</div>`;
}
function dnaSection(data, team, group, rivalId) {
  const ids = group.teamIds.filter(id => !teamById(data, id).withdrawn && teamStanding(data, id, group.phaseId)?.played);
  if (!ids.includes(team.id) || ids.length < 3) return '';
  const raw = id => { const a = teamAnalysis(data, id, group.phaseId), p = a.all.played, last = a.rows.slice(-5); return [a.all.goalsFor / p, a.all.goalsAgainst / p, a.all.points / p, last.reduce((n, r) => n + r.points, 0) / (3 * last.length), a.cleanSheets / p]; };
  const table = new Map(ids.map(id => [id, raw(id)]));
  const lowerIsBetter = [false, true, false, false, false];
  const score = values => values.map((v, i) => { const col = [...table.values()].map(r => r[i]), min = Math.min(...col), max = Math.max(...col); if (max === min) return 0.5; const t = (v - min) / (max - min); return lowerIsBetter[i] ? 1 - t : t; });
  const avg = [0, 1, 2, 3, 4].map(i => [...table.values()].reduce((n, r) => n + r[i], 0) / table.size);
  const pct = v => `${Math.round(v * 100)}%`;
  const axes = [{ label: 'Ataque', format: v => `${number(v)} golos/j` }, { label: 'Defesa', format: v => `${number(v)} sofr./j` }, { label: 'Pontos', format: v => `${number(v)} pts/j` }, { label: 'Forma', format: pct }, { label: 'Sem sofrer', format: pct }];
  const series = [{ label: 'Média da série', role: 'avg', raw: avg, score: score(avg) }];
  if (rivalId && table.has(rivalId)) series.push({ label: teamById(data, rivalId).name, role: 'rival', raw: table.get(rivalId), score: score(table.get(rivalId)) });
  series.push({ label: team.name, role: 'me', raw: table.get(team.id), score: score(table.get(team.id)) });
  return radarChart({ title: 'O ADN da equipa', axes, series, caption: 'Cada eixo vai da pior à melhor equipa da série: quanto mais perto da ponta, melhor. Defesa: menos golos sofridos. Forma: pontos nos últimos 5 jogos.' });
}
function teamScorersPanel(data, team) {
  if (data.publication.scorerNames !== 'public') return privateScorers(data);
  const list = rankScorers(scorersFor(data, 'total').filter(s => s.teamId === team.id));
  const overall = new Map(rankScorers(scorersFor(data, 'total')).map(s => [s.id, s]));
  const teamGoals = data.groups.flatMap(g => g.standings).filter(s => s.teamId === team.id).reduce((n, s) => n + s.goalsFor, 0);
  if (!list.length) return `<p class="muted">Ainda sem marcadores identificados.</p>`;
  const max = list[0].goals;
  const row = s => `<li><span class="scorer-rank">${s.rank}.${s.tied ? '<small>=</small>' : ''}</span><div class="share-main"><a class="player-link" href="/jogadores/${esc(s.id)}"><strong>${esc(s.name)}</strong></a><small>${overall.get(s.id).rank}.º na Bota de Ouro · ${teamGoals ? Math.round(s.goals / teamGoals * 100) : 0}% dos golos da equipa</small><span class="share-track" aria-hidden="true"><span style="--v:${(s.goals / max * 100).toFixed(1)}%"></span></span></div><strong class="goal-count">${s.goals}<small>${s.goals === 1 ? 'golo' : 'golos'}</small></strong></li>`;
  const top = list.slice(0, 5), rest = list.slice(5);
  return `<ol class="share-list">${top.map(row).join('')}</ol>${rest.length ? `<details class="more-scorers"><summary>Ver todos (${list.length} jogadores)</summary><ol class="share-list">${rest.map(row).join('')}</ol></details>` : ''}<p class="muted small">Acumulado das duas fases · ${plural(list.reduce((n, s) => n + s.goals, 0), 'golo', 'golos')} com nome, de ${teamGoals} da equipa.</p>`;
}
function myTeam(data, url) {
  const asked = url.searchParams.get('equipa');
  const team = url.searchParams.has('escolher') ? null : teamById(data, asked ?? prefs.myTeam ?? '');
  if (!team) return teamPicker(data, url);
  const club = clubById(data, team.clubId);
  const groups = teamGroups(data, team.id).filter(g => g.defined);
  const statsGroup = [...groups].reverse().find(g => teamStanding(data, team.id, g.phaseId)?.played) ?? groups.at(-1);
  const current = groups.at(-1);
  const fixtures = teamFixtures(data, team.id);
  const following = prefs.myTeam === team.id;
  const s = statsGroup && teamStanding(data, team.id, statsGroup.phaseId);
  const form = statsGroup ? teamAnalysis(data, team.id, statsGroup.phaseId).form : [];
  const others = statsGroup ? statsGroup.standings.filter(x => x.teamId !== team.id) : [];
  const askedRival = url.searchParams.get('vs');
  const rivalId = statsGroup?.teamIds.includes(askedRival) && askedRival !== team.id ? askedRival : (others[0]?.teamId ?? null);
  const where = [current && current !== statsGroup ? `${phaseById(data, current.phaseId).name} · Série ${current.letter}` : null, statsGroup && s?.played ? `${phaseById(data, statsGroup.phaseId).name} · Série ${statsGroup.letter} · ${team.withdrawn ? 'desistiu' : `${s.position}.º lugar · ${s.points} pts`}` : null].filter(Boolean).join(' — ');
  const colors = club.colors ? ` style="--club-1:${club.colors.primary};--club-2:${club.colors.secondary}"` : '';
  const hero = `<header class="my-hero${club.colors ? ' has-colors' : ''}"${colors}>${teamBadge(data, team, true)}<div class="my-hero-text"><p class="eyebrow">${following ? '★ A minha equipa' : 'Equipa'} · ${esc(data.competition.season)}</p><h1 tabindex="-1">${esc(team.name)}</h1><p class="muted">${where ? esc(where) : 'Ainda sem série definida'}</p>${form.length ? `<div class="form-strip" aria-label="Últimos jogos: ${form.map(r => ({ V: 'vitória', E: 'empate', D: 'derrota' })[r]).join(', ')}">${form.map(r => `<span class="form-chip form-${r}">${r}</span>`).join('')}</div>` : ''}</div><div class="my-actions">${following ? `<span class="following-tag">${icon('check')} A tua equipa</span><a class="reset-link" href="/minha-equipa?escolher=1">Mudar de equipa</a>` : `<button type="button" class="button" data-follow="${team.id}">${icon('shield')} Seguir esta equipa</button><a class="reset-link" href="/minha-equipa?escolher=1">Escolher outra</a>`}</div></header>`;
  if (team.withdrawn) return `${hero}<p class="notice">${icon('info')}<span>Esta equipa desistiu da prova. Os jogos já disputados continuam no histórico.</span></p><section class="section">${heading('O percurso', 'Jogos disputados')}${matchGrid(data, fixtures.played)}</section>`;
  const next = fixtures.upcoming[0];
  return `${hero}
  <section class="section my-next">${next ? nextMatchPanel(data, team, next) : `<div class="panel">${emptyState('Sem próximos jogos marcados', 'Quando houver novas datas, aparecem aqui.')}</div>`}${fixtures.unconfirmed.length ? `<p class="notice">${icon('clock')}<span>${plural(fixtures.unconfirmed.length, 'jogo já passou a data e ainda não tem', 'jogos já passaram a data e ainda não têm')} resultado lançado.</span></p>` : ''}</section>
  <section class="section">${heading('Jornada a jornada', 'Calendário da época', `${plural(fixtures.upcoming.length, 'jornada por jogar', 'jornadas por jogar')}. Cada jornada é um fim de semana; as fases já terminadas ficam fechadas.`)}${seasonCalendar(data, team, fixtures)}</section>
  ${statsGroup && s?.played ? `<section class="section">${heading(`${phaseById(data, statsGroup.phaseId).name} · Série ${statsGroup.letter}`, 'Em resumo')}${insights(data, team, statsGroup, fixtures)}</section>
  <section class="section">${heading('Frente a frente', 'Contra quem quiseres', 'Escolhe uma equipa da série para a pôr lado a lado com a tua nos gráficos.')}<div class="panel my-compare">${rivalChips(data, team, statsGroup, rivalId)}${raceSection(data, team, statsGroup, rivalId)}<div class="dna-grid">${dnaSection(data, team, statsGroup, rivalId)}<div class="dna-side"><h3>Os números, lado a lado</h3>${rivalId ? (() => { const A = teamAnalysis(data, team.id, statsGroup.phaseId), B = teamAnalysis(data, rivalId, statsGroup.phaseId), per = (x, k) => x.all.played ? x.all[k] / x.all.played : null, rival = teamById(data, rivalId).name; return `${compareBars({ label: 'Pontos por jogo', a: per(A, 'points'), b: per(B, 'points'), bLabel: rival, digits: 2 })}${compareBars({ label: 'Golos marcados por jogo', a: per(A, 'goalsFor'), b: per(B, 'goalsFor'), bLabel: rival })}${compareBars({ label: 'Golos sofridos por jogo', a: per(A, 'goalsAgainst'), b: per(B, 'goalsAgainst'), bLabel: rival, lowerIsBetter: true })}`; })() : ''}<a class="text-link compare-link" href="/comparar?fase=${statsGroup.phaseId}&a=${team.id}${rivalId ? `&b=${rivalId}` : ''}">Comparação completa ${icon('arrow')}</a></div></div></div></section>` : ''}
  <section class="section">${heading('Cada golo conta', 'Os marcadores da equipa')}<div class="panel team-scorers-panel">${teamScorersPanel(data, team)}</div></section>
  ${statsGroup && s?.played ? `<section class="section">${heading('Dentro dos números', 'A época da equipa')}<div class="panel analysis-details">${teamAnalysisSection(data, team, statsGroup, { showScorers: false, showPoints: false })}</div></section>
  <section class="section"><div class="panel"><div class="panel-heading"><h2>Classificação · Série ${statsGroup.letter}</h2><span class="subtle-label">${esc(phaseById(data, statsGroup.phaseId).name)}</span></div>${standings(data, statsGroup, { highlight: team.id })}</div></section>` : ''}
  <p class="page-actions">${textLink(`/clubes/${club.slug}`, `Perfil do clube · ${club.name}`)}</p>`;
}
export function notFound() {
  return `${pageHeading('404 · Fora de jogo', 'Esta página saiu do campo.', 'A página que procuras não foi encontrada.')}<a class="button" href="/">Voltar ao início ${icon('arrow')}</a>`;
}
/** Routes; legacy one-phase URLs (/competicoes/<slug>/serie-a) still resolve to the 1.ª fase. */
export function routeOf(data, pathname) {
  const path = decodeURI(pathname).replace(/\/$/, '') || '/', base = competitionPath(data);
  const phaseGroup = path.match(new RegExp(`^${base}/(fase-\\d)/serie-([a-f])$`));
  if (phaseGroup) { const g = data.groups.find(x => x.phaseId === phaseGroup[1] && x.letter === phaseGroup[2].toUpperCase()); return g ? { view: 'group', id: g.id } : { view: '404' }; }
  const legacy = path.match(new RegExp(`^${base}/serie-([a-f])$`));
  if (legacy) { const g = data.groups.find(x => x.phaseId === 'fase-1' && x.letter === legacy[1].toUpperCase()); return g ? { view: 'group', id: g.id, legacy: true } : { view: '404' }; }
  const phase = path.match(new RegExp(`^${base}/(fase-\\d)$`));
  if (phase) return { view: 'phase', id: phase[1] };
  return { path };
}
export function renderView(data, url) {
  const route = routeOf(data, url.pathname), path = route.path;
  if (route.view === 'group') return groupView(data, route.id);
  if (route.view === 'phase') return phaseView(data, route.id);
  if (route.view === '404') return notFound();
  if (path === '/') return home(data, url);
  if (path === '/competicoes' || path === competitionPath(data)) return competition(data);
  if (path === '/jogos') return games(data, url);
  if (path.startsWith('/jogos/')) return matchDetails(data, path.slice(7));
  if (path === '/clubes') return clubs(data, url);
  if (path.startsWith('/clubes/')) return clubProfile(data, path.slice(8));
  if (path === '/marcadores') return scorers(data, url);
  if (path === '/estatisticas') return statistics(data);
  if (path === '/privacidade') return privacyPage(data);
  if (path === '/comparar') return compareTeams(data, url);
  if (path === '/minha-equipa') return myTeam(data, url);
  if (path.startsWith('/jogadores/')) return playerProfile(data, path.slice('/jogadores/'.length));
  return notFound();
}
export function pageTitle(data, path) {
  if (path.startsWith('/jogos/')) { const m = data.matches.find(m => `/jogos/${m.id}` === path); if (m) return `${teamById(data, m.homeId).name} × ${teamById(data, m.awayId).name} · MINHO11`; }
  if (path.startsWith('/clubes/')) { const c = data.clubs.find(c => `/clubes/${c.slug}` === path); if (c) return `${c.name} · MINHO11`; }
  if (path.startsWith('/jogadores/')) { const p = (data.scorers?.total ?? []).find(s => `/jogadores/${s.id}` === path); return `${p ? p.name : 'Jogador'} · MINHO11`; }
  const route = routeOf(data, path);
  if (route.view === 'group') return `${groupLabel(data, route.id)} · ${data.competition.shortName} · MINHO11`;
  if (route.view === 'phase') return `${phaseById(data, route.id)?.name ?? ''} · ${data.competition.shortName} · MINHO11`;
  const names = { '/minha-equipa': 'A minha equipa', '/comparar': 'Comparar equipas', '/privacidade': 'Privacidade', '/': 'O futebol começa aqui', '/jogos': 'Jogos e resultados', '/clubes': 'Os clubes', '/marcadores': 'Bota de Ouro', '/estatisticas': 'Estatísticas', '/competicoes': 'Competições' };
  return `${names[path] ?? data.competition.shortName} · MINHO11`;
}
export function header(data, path) {
  const links = [['/', 'Início'], ['/minha-equipa', 'A minha equipa'], ['/competicoes', 'Competições'], ['/jogos', 'Jogos'], ['/clubes', 'Clubes'], ['/marcadores', 'Marcadores']];
  return `<a class="skip-link" href="#conteudo">Saltar para o conteúdo</a><header class="site-header"><div class="header-inner shell">${brand()}<nav class="desktop-nav" aria-label="Navegação principal">${links.map(([href, label]) => `<a href="${href}"${(href === '/' ? path === '/' : path.startsWith(href)) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="header-actions"><span class="season-label">${esc(data.competition.season)}</span><button class="icon-button" type="button" data-search-open aria-label="Procurar equipa">${icon('search')}</button><button class="icon-button" type="button" data-theme-toggle aria-label="Alternar tema claro e escuro">${icon('sun')}</button><button class="icon-button menu-button" type="button" data-menu-toggle aria-label="Abrir navegação" aria-expanded="false" aria-controls="mobile-navigation">${icon('menu')}</button></div></div><nav id="mobile-navigation" class="mobile-navigation shell" aria-label="Navegação móvel" hidden>${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}<a href="/estatisticas">Estatísticas</a></nav></header>`;
}
/** Phone navigation: a bottom tab bar (shown below 700px) with the user's team in the middle. */
export function tabBar(data, path) {
  const team = prefs.myTeam ? teamById(data, prefs.myTeam) : null;
  const today = data.matches.filter(m => m.date === todayLisbon()).length;
  const on = href => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/')) ? ' aria-current="page"' : '';
  const tab = (href, symbol, label, extra = '') => `<a href="${href}"${on(href)}><span class="tab-icon">${symbol}${extra}</span><span class="tab-label">${label}</span></a>`;
  const morePaths = ['/competicoes', '/clubes', '/estatisticas', '/comparar', '/privacidade'];
  return `<nav class="tab-bar" id="tab-bar" aria-label="Navegação rápida">${tab('/', icon('home'), 'Início')}${tab('/jogos', icon('calendar'), 'Jogos', today ? `<b class="tab-count" aria-label="${today} hoje">${today}</b>` : '')}<a class="tab-team" href="/minha-equipa" aria-label="${team ? `A minha equipa: ${esc(team.name)}` : 'Escolher a minha equipa'}"${on('/minha-equipa')}><span class="tab-icon">${team ? teamBadge(data, team) : icon('star')}</span><span class="tab-label">${team ? 'A minha' : 'Favorita'}</span></a>${tab('/marcadores', icon('trophy'), 'Marcadores')}<button type="button" data-more-open aria-haspopup="dialog" aria-controls="more-sheet"${morePaths.some(p => path.startsWith(p)) ? ' class="is-current"' : ''}><span class="tab-icon">${icon('grid')}</span><span class="tab-label">Mais</span></button></nav>`;
}
function moreSheet() {
  const links = [['/competicoes', 'trophy', 'A competição', 'Fases e séries'], ['/clubes', 'shield', 'Clubes', 'Todos os clubes e equipas'], ['/estatisticas', 'chart', 'Estatísticas', 'Os números da prova'], ['/comparar', 'chart', 'Comparar equipas', 'Frente a frente'], ['/privacidade', 'lock', 'Privacidade', 'Como tratamos os nomes']];
  return `<dialog id="more-sheet" class="more-sheet" aria-labelledby="more-title"><div class="sheet-grip" aria-hidden="true"></div><div class="dialog-heading"><h2 id="more-title">Mais</h2><button type="button" class="icon-button" data-more-close aria-label="Fechar">${icon('close')}</button></div><nav class="sheet-links" aria-label="Outras páginas">${links.map(([href, symbol, label, hint]) => `<a href="${href}">${icon(symbol)}<span><strong>${label}</strong><small>${hint}</small></span></a>`).join('')}</nav><button type="button" class="button install-button" data-install hidden>${icon('home')} Instalar a app MINHO11</button><div class="sheet-actions"><button type="button" class="button button-secondary" data-search-open>${icon('search')} Procurar</button><button type="button" class="button button-secondary" data-theme-toggle>${icon('sun')} Mudar tema</button></div></dialog>`;
}
export function footer(data) {
  return `<footer class="site-footer shell"><div>${brand()}<p>O futebol começa aqui.</p><p class="muted small">Plataforma independente · Alto Minho</p></div><nav aria-label="Navegação do rodapé"><a href="/competicoes">A competição</a><a href="/estatisticas">Estatísticas</a><a href="/marcadores">Marcadores</a><a href="/minha-equipa">A minha equipa</a><a href="/comparar">Comparar equipas</a><a href="/privacidade">Privacidade</a><button type="button" class="link-like" data-install hidden>Instalar a app</button></nav><div class="footer-data"><p>${esc(data.competition.shortName)} · ${esc(data.competition.category)}<br>${esc(currentPhase(data).name)} · ${esc(data.competition.season)}</p><p class="sync-status" id="sync-status" role="status">Dados de ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(data.importedAt))}</p><p class="muted small">Atualizado automaticamente quando há resultados novos.</p></div></footer>${moreSheet()}${installHelp('o MINHO11')}<dialog id="search-dialog" aria-labelledby="search-title"><form action="/jogos"><div class="dialog-heading"><h2 id="search-title">Encontra a tua equipa.</h2><button type="button" class="icon-button" data-search-close aria-label="Fechar pesquisa">${icon('close')}</button></div><label>Nome da equipa<input type="search" name="q" placeholder="Ex.: Lanheses" required></label><button class="button" type="submit">Pesquisar ${icon('arrow')}</button></form></dialog>`;
}
export function privacyPage(data) {
  return `${pageHeading('Privacidade', 'Os miúdos primeiro.', 'Como o MINHO11 trata os nomes dos jogadores.')}<div class="panel prose"><p>O MINHO11 mostra apenas o que é necessário para valorizar os golos: o nome tal como aparece na ficha do jogo, a equipa e o número de golos. Não publicamos datas de nascimento, contactos, moradas nem fotografias de crianças sem autorização própria.</p><p>Os nomes não são guardados no repositório público do projeto nem nas páginas estáticas; chegam apenas com os dados ao vivo da competição.</p><p>Um encarregado de educação ou o clube pode pedir a retirada de um nome${data.competition.privacyContact ? ` através de <a href="mailto:${esc(data.competition.privacyContact)}">${esc(data.competition.privacyContact)}</a>` : ' aos responsáveis da plataforma'}. O pedido é aplicado em todo o site (rankings e jogos) sem apagar o resultado da equipa.</p></div>`;
}
