import { normalize, teamById, clubById, groupById, phaseById, teamClubPath, groupPath, competitionPath, groupLabel, teamGroups, definedGroups, currentPhase, rankScorers, scorersFor, scorerScopes, recentMatches, upcomingMatches, groupStatistics, filterMatches, teamStanding, clubRanking, teamAnalysis, groupAverages, dateLabel, statusLabels, matchStatus, todayLisbon } from './domain.js';
import { esc, icon, badge, teamBadge, clubBadge, compareBars, brand, heading, pageHeading, textLink, matchGrid, standings, groupTabs, phaseTabs, notes, metric, scorerRows, privateScorers, emptyState, statusPill, pendingGroup, groupShort, barChart, lineChart } from './components.js';

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
function home(data, url) {
  const phase = currentPhase(data);
  const groups = definedGroups(data, phase.id);
  const group = groups.find(g => g.id === url.searchParams.get('serie')) ?? groups[0];
  const scheduled = upcomingMatches(data).slice(0, 3);
  const pending = data.phases.filter(p => p.state === 'pending');
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> Futebol de formação · Alto Minho</p><h1 tabindex="-1">O FUTEBOL<br>COMEÇA <em>AQUI.</em></h1><p class="hero-description">Os jogos, as equipas e os golos da nossa terra.<br>O teu futebol. A tua bancada.</p><div class="hero-actions"><a class="button button-lime" href="${competitionPath(data)}">Explorar a competição ${icon('arrow')}</a><span class="hero-season">${esc(data.competition.category)}<span>${esc(data.competition.season)}</span></span></div><div class="hero-caption"><span>MINHO11</span><span>O futebol começa aqui.</span></div></div><div class="hero-art" aria-hidden="true"><svg class="pitch" viewBox="0 0 430 500"><rect x="35" y="30" width="360" height="440" rx="2"/><path d="M35 250h360M140 30v75h150V30M140 470v-75h150v75M175 30v27h80V30M175 470v-27h80v27"/><circle cx="215" cy="250" r="66"/><circle cx="215" cy="250" r="3"/></svg><span class="hero-eleven">11</span><span class="art-label">DA TERRA.<br>PARA O JOGO.</span><span class="art-coordinate">ALTO MINHO · PORTUGAL</span></div></section>
  <div class="competition-strip"><div>${icon('trophy')}<span><strong>${esc(data.competition.shortName)}</strong><span>${esc(data.competition.category)} · ${esc(phase.name)} em curso${pending.length ? ` · ${esc(pending.map(p => p.name).join(', '))} por definir` : ''}</span></span></div>${textLink(competitionPath(data), 'Acompanhar')}</div>
  <section class="metrics" aria-label="A competição em números">${metric(data.stats.activeTeams, 'Equipas em prova', 'shield', `${data.stats.teams} inscritas`)}${metric(data.stats.played, 'Jogos realizados', 'calendar', `${data.stats.matches} jogos no calendário`)}${metric(data.stats.goals, 'Golos marcados', 'ball', `${data.stats.individualGoals} com marcador identificado`)}${metric(groups.length, 'Séries', 'trophy', phase.name)}</section>
  <section class="section">${heading('O que se joga por cá', 'Últimos resultados', 'Os resultados mais recentes registados na competição.', textLink('/jogos?estado=finished', 'Todos os resultados'))}${matchGrid(data, recentMatches(data, 6))}</section>
  <section class="section home-columns"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">A corrida ao topo · ${esc(phase.name)}</p><h2>Classificação</h2></div><form action="/" class="inline-form">${groupSelect(data, group?.id, phase.id)}<button type="submit" class="sr-only">Selecionar série</button></form></div>${group ? standings(data, group) : pendingPhase(data, phase)}<div class="panel-bottom">${group ? textLink(groupPath(data, group.id), `Explorar a Série ${group.letter}`) : ''}</div></div><div class="panel scorers-preview"><div class="panel-heading"><div><p class="eyebrow">Cada golo conta</p><h2>Bota de Ouro</h2></div>${icon('trophy', 'accent')}</div>${topScorersPreview(data)}<div class="panel-bottom">${textLink('/marcadores', 'Ver marcadores')}</div></div></section>
  <section class="section">${heading('A próxima jornada', 'Ainda há muito jogo.', 'Jogos agendados a partir de hoje, com data indicada na fonte.', textLink('/jogos?estado=scheduled', 'Ver calendário'))}${scheduled.length ? matchGrid(data, scheduled) : emptyState('Sem próximos jogos confirmados', 'O calendário será atualizado quando houver novas datas.')}</section>
  <section class="section">${heading('Escolhe o teu campo', `${groups.length} séries. A mesma paixão.`, '', textLink(competitionPath(data), 'A competição'))}${groupCards(data, phase.id)}</section>
  <aside class="manifesto"><span class="eyebrow">Feito para o nosso futebol</span><p>Pequenos campos.<br><strong>Grandes histórias.</strong></p><span>Uma plataforma independente para o futebol de formação do Alto Minho.</span></aside>`;
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
  const phaseId = scope === 'total' ? '' : scope;
  const groupTeams = group ? new Set(groupById(data, group)?.teamIds ?? []) : null;
  const scoped = rankScorers(scorersFor(data, scope).filter(s => !groupTeams || groupTeams.has(s.teamId)));
  const ranked = scoped.filter(s => !q || normalize(s.name + ' ' + teamById(data, s.teamId).name).includes(normalize(q)));
  const podium = scoped.slice(0, 3);
  const pendingScope = scope !== 'total' && phaseById(data, scope)?.state === 'pending';
  const anyNames = Object.values(data.scorers).some(list => list.length);
  const body = pendingScope ? `<div class="panel">${pendingPhase(data, phaseById(data, scope))}</div>`
    : !anyNames ? `<div class="panel privacy-feature">${privateScorers(data)}</div>`
    : `${podium.length ? `<div class="podium">${podium.map((s, index) => `<article class="podium-place podium-${index + 1}"><span class="eyebrow">${s.rank}.º lugar${s.tied ? ' · ex aequo' : ''}</span>${icon('trophy')}<strong class="podium-goals">${s.goals}<small>golos</small></strong><h2>${esc(s.name)}</h2><a href="${teamClubPath(data, s.teamId)}">${esc(teamById(data, s.teamId).name)}</a></article>`).join('')}</div>` : ''}<section class="panel"><div class="panel-heading"><h2>Classificação de marcadores · ${esc(scorerScopes[scope])}</h2><span class="subtle-label">${ranked.length} ${ranked.length === 1 ? 'jogador' : 'jogadores'}</span></div>${ranked.length ? `<ol class="scorer-list">${scorerRows(data, ranked)}</ol>` : emptyState('Sem resultados', 'Experimenta outro nome ou limpa os filtros.')}</section><p class="muted small">Totais iguais partilham a posição (=); em empate, ordem alfabética. O acumulado soma a 1.ª e a 2.ª fase sem contar golos duas vezes. Cada registo é um nome numa equipa, tal como escrito na ficha: o mesmo nome em equipas diferentes não é juntado.</p>${completenessNote(data)}`;
  return `${pageHeading('O golo tem protagonistas', 'Bota de Ouro.', 'Cada golo conta uma história. Acompanha as conquistas dos jogadores e das equipas.')}<form class="filter-bar" action="/marcadores">${searchInput(q, 'Procurar jogador ou clube', 'Nome do jogador ou clube…')}${phaseSelect(data, scope, { all: '', values: Object.entries(scorerScopes) })}${groupSelect(data, group, phaseId)}${formFooter('/marcadores')}</form>${body}<section class="section">${heading('O ataque em números', 'As equipas com mais golos', `Golos marcados na ${currentPhase(data).name}, segundo os resultados.`)}<div class="panel goal-ranking">${teamGoalRanking(data, 12)}</div></section>`;
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
function teamAnalysisSection(data, team, group) {
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
    <div class="two-columns analysis-charts"><div>${barChart({ title: 'Golos marcados e sofridos por jogo', rows, keys: [{ key: 'gf', label: 'Marcados', cls: 'bar-for' }, { key: 'ga', label: 'Sofridos', cls: 'bar-against' }] })}</div><div>${lineChart({ title: 'Pontos acumulados', label: 'pontos', points: a.timeline.map(t => ({ label: `J${t.round}`, value: t.points })) })}</div></div>
    <div class="two-columns"><div class="table-scroll"><table class="split-table"><caption>Casa e fora</caption><thead><tr><th scope="col"></th><th scope="col">J</th><th scope="col">V-E-D</th><th scope="col">GM</th><th scope="col">GS</th><th scope="col">GM/J</th><th scope="col">Pts/J</th></tr></thead><tbody>${splitRow('Casa', a.home)}${splitRow('Fora', a.away)}${splitRow('Total', a.all)}</tbody></table></div>
    <div class="compare"><h3>Comparação com a Série ${group.letter}</h3><p class="muted small">Por jogo disputado · média das ${avg.teams} equipas com jogos.</p>${compareBars({ label: 'Golos marcados por jogo', a: per(a.all.goalsFor, a.all.played), b: avg.goalsForPerGame, bLabel: 'Média da série' })}${compareBars({ label: 'Golos sofridos por jogo', a: per(a.all.goalsAgainst, a.all.played), b: avg.goalsAgainstPerGame, bLabel: 'Média da série', lowerIsBetter: true })}${compareBars({ label: 'Pontos por jogo', a: per(a.all.points, a.all.played), b: avg.pointsPerGame, bLabel: 'Média da série' })}<a class="text-link compare-link" href="/comparar?a=${team.id}">Comparar com outra equipa ${icon('arrow')}</a>${a.biggestWin ? `<p class="muted small">Maior vitória: ${a.biggestWin.gf}–${a.biggestWin.ga} frente a ${esc(teamById(data, a.biggestWin.opponentId).name)} (J${a.biggestWin.match.round}).</p>` : ''}</div></div>
    <div class="team-scorers"><h3>Quem marcou</h3>${scorers.length ? `<ol class="scorer-list compact">${scorerRows(data, scorers)}</ol>` : `<p class="muted">${data.publication.scorerNames === 'public' ? 'Sem marcadores identificados nesta fase.' : 'Nomes disponíveis nos dados ao vivo.'}</p>`}<p class="muted small">${identified} de ${a.all.goalsFor} golos com marcador identificado${a.all.goalsFor - identified > 0 ? ` (os restantes são autogolos a favor ou golos sem nome na fonte)` : ''}.</p></div>
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
    return `<section class="panel team-summary"><div class="panel-heading"><div><h2>${esc(t.name)}</h2><p class="muted">${esc(phase.name)} · Série ${g.letter} · ${t.withdrawn ? 'Desistiu da prova' : `${s.position}.º classificado`}</p></div>${textLink(groupPath(data, g.id), 'Classificação')}</div><dl class="team-stat-grid">${[['Pontos', s.points], ['Jogos', s.played], ['Vitórias', s.wins], ['Empates', s.draws], ['Derrotas', s.losses], ['Golos marcados', s.goalsFor], ['Golos sofridos', s.goalsAgainst], ['Diferença', s.goalDifference]].map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>${t.withdrawn ? '' : `<details class="analysis-details" open><summary>${icon('chart')} Análise da equipa · ${esc(phase.name)}</summary>${teamAnalysisSection(data, t, g)}</details>`}</section>`;
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
  const names = { '/comparar': 'Comparar equipas', '/privacidade': 'Privacidade', '/': 'O futebol começa aqui', '/jogos': 'Jogos e resultados', '/clubes': 'Os clubes', '/marcadores': 'Bota de Ouro', '/estatisticas': 'Estatísticas', '/competicoes': 'Competições' };
  return `${names[path] ?? data.competition.shortName} · MINHO11`;
}
export function header(data, path) {
  const links = [['/', 'Início'], ['/competicoes', 'Competições'], ['/jogos', 'Jogos'], ['/clubes', 'Clubes'], ['/marcadores', 'Marcadores']];
  return `<a class="skip-link" href="#conteudo">Saltar para o conteúdo</a><header class="site-header"><div class="header-inner shell">${brand()}<nav class="desktop-nav" aria-label="Navegação principal">${links.map(([href, label]) => `<a href="${href}"${(href === '/' ? path === '/' : path.startsWith(href)) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="header-actions"><span class="season-label">${esc(data.competition.season)}</span><button class="icon-button" type="button" data-search-open aria-label="Procurar equipa">${icon('search')}</button><button class="icon-button" type="button" data-theme-toggle aria-label="Alternar tema claro e escuro">${icon('sun')}</button><button class="icon-button menu-button" type="button" data-menu-toggle aria-label="Abrir navegação" aria-expanded="false" aria-controls="mobile-navigation">${icon('menu')}</button></div></div><nav id="mobile-navigation" class="mobile-navigation shell" aria-label="Navegação móvel" hidden>${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}<a href="/estatisticas">Estatísticas</a></nav></header>`;
}
export function footer(data) {
  return `<footer class="site-footer shell"><div>${brand()}<p>O futebol começa aqui.</p><p class="muted small">Plataforma independente · Alto Minho</p></div><nav aria-label="Navegação do rodapé"><a href="/competicoes">A competição</a><a href="/estatisticas">Estatísticas</a><a href="/marcadores">Marcadores</a><a href="/comparar">Comparar equipas</a><a href="/privacidade">Privacidade</a></nav><div class="footer-data"><p>${esc(data.competition.shortName)} · ${esc(data.competition.category)}<br>${esc(currentPhase(data).name)} · ${esc(data.competition.season)}</p><p class="sync-status" id="sync-status" role="status">Dados de ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(data.importedAt))}</p><p class="muted small">Atualizado automaticamente quando há resultados novos.</p></div></footer><dialog id="search-dialog" aria-labelledby="search-title"><form action="/jogos"><div class="dialog-heading"><h2 id="search-title">Encontra a tua equipa.</h2><button type="button" class="icon-button" data-search-close aria-label="Fechar pesquisa">${icon('close')}</button></div><label>Nome da equipa<input type="search" name="q" placeholder="Ex.: Lanheses" required></label><button class="button" type="submit">Pesquisar ${icon('arrow')}</button></form></dialog>`;
}
export function privacyPage(data) {
  return `${pageHeading('Privacidade', 'Os miúdos primeiro.', 'Como o MINHO11 trata os nomes dos jogadores.')}<div class="panel prose"><p>O MINHO11 mostra apenas o que é necessário para valorizar os golos: o nome tal como aparece na ficha do jogo, a equipa e o número de golos. Não publicamos datas de nascimento, contactos, moradas nem fotografias de crianças sem autorização própria.</p><p>Os nomes não são guardados no repositório público do projeto nem nas páginas estáticas; chegam apenas com os dados ao vivo da competição.</p><p>Um encarregado de educação ou o clube pode pedir a retirada de um nome${data.competition.privacyContact ? ` através de <a href="mailto:${esc(data.competition.privacyContact)}">${esc(data.competition.privacyContact)}</a>` : ' aos responsáveis da plataforma'}. O pedido é aplicado em todo o site (rankings e jogos) sem apagar o resultado da equipa.</p></div>`;
}
