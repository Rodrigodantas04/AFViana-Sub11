import { normalize, teamById, clubById, teamClubPath, groupPath, rankScorers, recentMatches, upcomingMatches, groupStatistics, filterMatches, teamStanding, clubRanking, dateLabel, statusLabels, matchStatus, todayLisbon } from './domain.js';
import { esc, icon, badge, brand, heading, pageHeading, textLink, matchGrid, standings, groupTabs, notes, metric, scorerRows, privateScorers, emptyState, statusPill } from './components.js';

const competitionPath = data => `/competicoes/${data.competition.slug}`;
const selected = (a, b) => a === b ? ' selected' : '';
function groupSelect(data, group = '') {
  return `<label>Série<select name="serie" data-filter><option value="">Todas as séries</option>${data.groups.map(g => `<option value="${g.id}"${selected(g.id, group)}>Série ${g.id}</option>`).join('')}</select></label>`;
}
function searchInput(q, label = 'Procurar equipa', placeholder = 'Nome da equipa…') {
  return `<label class="search-field">${label}<span>${icon('search')}<input type="search" name="q" value="${esc(q)}" placeholder="${esc(placeholder)}" autocomplete="off" data-filter></span></label>`;
}
function formFooter(action) {
  return `<button class="button filter-submit" type="submit">Filtrar</button><a class="reset-link" href="${esc(action)}">Limpar filtros</a>`;
}
function groupCards(data) {
  return `<div class="group-grid">${data.groups.map(g => {
    const stats = groupStatistics(data, g.id), leader = teamById(data, g.standings[0].teamId);
    return `<a class="group-card" href="${groupPath(data, g.id)}"><div class="group-card-top"><span class="eyebrow">Série</span><span class="group-letter">${g.id}</span>${icon('arrow')}</div><p class="muted">${g.teamIds.length} equipas <span class="separator">/</span> ${stats.played} jogos realizados</p><div class="group-leader">${badge(leader.name)}<span><small>1.º classificado</small><strong>${esc(leader.name)}</strong></span><b>${g.standings[0].points}<small>pts</small></b></div></a>`;
  }).join('')}</div>`;
}
function teamGoalRanking(data, limit = 6) {
  const rows = data.groups.flatMap(g => g.standings).sort((a, b) => b.goalsFor - a.goalsFor || a.teamId.localeCompare(b.teamId)).slice(0, limit);
  const max = rows[0]?.goalsFor || 1;
  return `<ol class="team-goal-list">${rows.map(s => {
    const team = teamById(data, s.teamId);
    return `<li><div class="goal-team">${badge(team.name)}<a href="${teamClubPath(data, team.id)}">${esc(team.name)}</a><strong>${s.goalsFor}</strong></div><span class="bar-track"><span style="--bar:${Math.round(s.goalsFor / max * 100)}%"></span></span></li>`;
  }).join('')}</ol>`;
}
function topScorersPreview(data) {
  return data.scorers.length ? `<ol class="scorer-list">${scorerRows(data, rankScorers(data.scorers).slice(0, 5))}</ol>` : privateScorers();
}
function home(data, url) {
  const group = data.groups.find(g => g.id === url.searchParams.get('serie')) ?? data.groups[0];
  const scheduled = upcomingMatches(data).slice(0, 3);
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> Futebol de formação · Alto Minho</p><h1 tabindex="-1">O FUTEBOL<br>COMEÇA <em>AQUI.</em></h1><p class="hero-description">Os jogos, as equipas e os golos da nossa terra.<br>O teu futebol. A tua bancada.</p><div class="hero-actions"><a class="button button-lime" href="${competitionPath(data)}">Explorar a competição ${icon('arrow')}</a><span class="hero-season">${esc(data.competition.category)}<span>${esc(data.competition.season)}</span></span></div><div class="hero-caption"><span>MINHO11</span><span>O futebol começa aqui.</span></div></div><div class="hero-art" aria-hidden="true"><svg class="pitch" viewBox="0 0 430 500"><rect x="35" y="30" width="360" height="440" rx="2"/><path d="M35 250h360M140 30v75h150V30M140 470v-75h150v75M175 30v27h80V30M175 470v-27h80v27"/><circle cx="215" cy="250" r="66"/><circle cx="215" cy="250" r="3"/></svg><span class="hero-eleven">11</span><span class="art-label">DA TERRA.<br>PARA O JOGO.</span><span class="art-coordinate">ALTO MINHO · PORTUGAL</span></div></section>
  <div class="competition-strip"><div>${icon('trophy')}<span><strong>${esc(data.competition.shortName)}</strong><span>${esc(data.competition.category)} · ${esc(data.competition.phase)}</span></span></div>${textLink(competitionPath(data), 'Acompanhar')}</div>
  <section class="metrics" aria-label="A competição em números">${metric(data.stats.teams, 'Equipas inscritas', 'shield', `${data.stats.activeTeams} em prova`)}${metric(data.stats.played, 'Jogos realizados', 'calendar', `${data.stats.matches} jogos no calendário`)}${metric(data.stats.goals, 'Golos marcados', 'ball', 'Resultados registados')}${metric(data.stats.groups, 'Séries', 'trophy', data.competition.season)}</section>
  <section class="section">${heading('O que se joga por cá', 'Últimos resultados', 'Os resultados mais recentes registados na competição.', textLink('/jogos?estado=finished', 'Todos os resultados'))}${matchGrid(data, recentMatches(data, 6))}</section>
  <section class="section home-columns"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">A corrida ao topo</p><h2>Classificação</h2></div><form action="/" class="inline-form">${groupSelect(data, group.id)}<button type="submit" class="sr-only">Selecionar série</button></form></div>${standings(data, group)}<div class="panel-bottom">${textLink(groupPath(data, group.id), `Explorar a Série ${group.id}`)}</div></div><div class="panel scorers-preview"><div class="panel-heading"><div><p class="eyebrow">Cada golo conta</p><h2>Bota de Ouro</h2></div>${icon('trophy', 'accent')}</div>${topScorersPreview(data)}<div class="panel-bottom">${textLink('/marcadores', 'Ver marcadores')}</div></div></section>
  <section class="section">${heading('A próxima jornada', 'Ainda há muito jogo.', 'Jogos agendados a partir de hoje, com data indicada na fonte.', textLink('/jogos?estado=scheduled', 'Ver calendário'))}${scheduled.length ? matchGrid(data, scheduled) : emptyState('Sem próximos jogos confirmados', 'O calendário será atualizado quando houver novas datas.')}</section>
  <section class="section">${heading('Escolhe o teu campo', `${data.groups.length} séries. A mesma paixão.`, '', textLink('/competicoes', 'A competição'))}${groupCards(data)}</section>
  <aside class="manifesto"><span class="eyebrow">Feito para o nosso futebol</span><p>Pequenos campos.<br><strong>Grandes histórias.</strong></p><span>Uma plataforma independente para o futebol de formação do Alto Minho.</span></aside>`;
}
function competition(data) {
  return `${pageHeading(`${data.competition.category} · ${data.competition.season}`, data.competition.name, `${data.competition.phase} · ${data.competition.region}. Resultados, classificações e calendário num só lugar.`)}<div class="page-actions"><a class="button" href="/jogos">${icon('calendar')} Calendário e resultados</a><a class="button button-secondary" href="/estatisticas">${icon('chart')} Estatísticas</a></div><div class="metrics">${metric(data.stats.teams, 'Equipas inscritas', 'shield')}${metric(data.stats.played, 'Jogos realizados', 'calendar')}${metric(data.stats.goals, 'Golos', 'ball')}${metric((data.stats.goals / Math.max(data.stats.played, 1)).toLocaleString('pt-PT', { maximumFractionDigits: 1 }), 'Golos por jogo', 'chart')}</div><section class="section">${heading('Classificações e jogos', 'As séries')}${groupCards(data)}</section><div class="notice">${icon('shield')}<span>Plataforma independente. Os resultados e classificações apresentados são os registados no ficheiro da competição.</span></div>`;
}
function groupView(data, id) {
  const group = data.groups.find(g => g.id === id);
  if (!group) return notFound();
  return `${pageHeading(`${data.competition.shortName} · ${data.competition.category}`, `Série ${id}`, `${group.teamIds.length} equipas. Acompanha a classificação e todos os jogos da série.`)}${groupTabs(data, id)}<section class="panel"><div class="panel-heading"><h2>Classificação</h2><span class="subtle-label">${esc(data.competition.phase)}</span></div>${standings(data, group)}</section>${notes(group)}<section class="section">${heading('Jornada após jornada', 'Resultados da série', '', textLink(`/jogos?serie=${id}`, 'Todos os jogos'))}${matchGrid(data, recentMatches(data).filter(m => m.groupId === id).slice(0, 6))}</section><section class="section">${heading('O que vem a seguir', 'Calendário')}${matchGrid(data, upcomingMatches(data).filter(m => m.groupId === id).slice(0, 6))}</section>`;
}
function games(data, url) {
  const q = url.searchParams.get('q') ?? '', group = url.searchParams.get('serie') ?? '', round = url.searchParams.get('jornada') ?? '', status = url.searchParams.get('estado') ?? '';
  const matches = filterMatches(data, { q, group, round, status });
  return `${pageHeading('Calendário & resultados', 'Cada jogo conta.', 'Encontra a tua equipa, segue a jornada e consulta os detalhes de cada jogo.')}<form class="filter-bar" action="/jogos">${searchInput(q)}${groupSelect(data, group)}<label>Jornada<select name="jornada" data-filter><option value="">Todas as jornadas</option>${[...new Set(data.matches.map(m => m.round))].sort((a, b) => a - b).map(r => `<option value="${r}"${selected(String(r), round)}>Jornada ${r}</option>`).join('')}</select></label><label>Estado<select name="estado" data-filter><option value="">Todos os jogos</option>${Object.entries(statusLabels).map(([k, v]) => `<option value="${k}"${selected(k, status)}>${v}</option>`).join('')}</select></label>${formFooter('/jogos')}</form><p class="result-count" role="status">${matches.length} ${matches.length === 1 ? 'jogo encontrado' : 'jogos encontrados'}</p>${matchGrid(data, matches)}`;
}
export function matchDetails(data, id) {
  const match = data.matches.find(m => m.id === id);
  if (!match) return notFound();
  const home = teamById(data, match.homeId), away = teamById(data, match.awayId);
  const dateNotice = match.status === 'finished' && match.date > todayLisbon() ? `<p class="notice">${icon('calendar')}<span>A fonte já regista um resultado para este jogo, mas a data indicada ainda é futura. Informação por confirmar.</span></p>` : '';
  const events = (side, score) => {
    const published = match.scorers[side], publishedCount = published.reduce((n, s) => n + s.goals, 0);
    return published.length ? `<ul class="goal-events">${published.map(s => `<li>${icon('ball')}<strong>${esc(s.name)}</strong><span>${s.goals} ${s.goals === 1 ? 'golo' : 'golos'}</span></li>`).join('')}</ul>${score > publishedCount ? `<p class="muted">${score - publishedCount} ${score - publishedCount === 1 ? 'golo sem marcador divulgado' : 'golos sem marcadores divulgados'}.</p>` : ''}` : `<p class="muted">${match.status === 'finished' && score === 0 ? 'Sem golos.' : 'Marcadores individuais ainda não disponíveis.'}</p>`;
  };
  return `<a class="back-link" href="/jogos">← Voltar aos jogos</a><header class="match-page-heading"><p class="eyebrow">${esc(data.competition.shortName)} · ${esc(data.competition.category)}</p><h1 class="sr-only" tabindex="-1">${esc(home.name)} contra ${esc(away.name)}</h1><a href="${groupPath(data, match.groupId)}">Série ${match.groupId} · Jornada ${match.round}</a></header><section class="scoreboard"><a class="scoreboard-team" href="${teamClubPath(data, home.id)}">${badge(home.name, true)}<h2>${esc(home.name)}</h2><span>Casa</span></a><div class="scoreboard-score"><strong>${match.homeGoals ?? '–'}<span>:</span>${match.awayGoals ?? '–'}</strong>${statusPill(match)}<p>${dateLabel(match.date, { year: 'numeric' })}</p></div><a class="scoreboard-team" href="${teamClubPath(data, away.id)}">${badge(away.name, true)}<h2>${esc(away.name)}</h2><span>Fora</span></a></section>${dateNotice}<section class="section"><div class="section-heading"><h2>Os golos do jogo</h2></div><div class="two-columns"><div class="panel goal-panel"><h3>${esc(home.name)}</h3>${events('home', match.homeGoals)}</div><div class="panel goal-panel"><h3>${esc(away.name)}</h3>${events('away', match.awayGoals)}</div></div></section><div class="notice">${icon('shield')}<span>Não existem minutos de golo na fonte. Os nomes apresentados dependem das autorizações de publicação.</span></div>`;
}
function scorers(data, url) {
  const group = url.searchParams.get('serie') ?? '', q = url.searchParams.get('q') ?? '';
  const scoped = rankScorers(data.scorers.filter(s => !group || s.groupId === group));
  const ranked = scoped.filter(s => !q || normalize(s.name + ' ' + teamById(data, s.teamId).name).includes(normalize(q)));
  const podium = scoped.slice(0, 3);
  return `${pageHeading('O golo tem protagonistas', 'Bota de Ouro.', 'Cada golo conta uma história. Acompanha as conquistas dos jogadores e das equipas.')}<form class="filter-bar" action="/marcadores">${searchInput(q, 'Procurar jogador ou clube', 'Nome do jogador ou clube…')}${groupSelect(data, group)}${formFooter('/marcadores')}</form>${data.scorers.length ? `<div class="podium">${podium.map((s, index) => `<article class="podium-place podium-${index + 1}"><span class="eyebrow">${s.rank}.º lugar${scoped.filter(p => p.goals === s.goals).length > 1 ? ' · ex aequo' : ''}</span>${icon('trophy')}<strong class="podium-goals">${s.goals}<small>golos</small></strong><h2>${esc(s.name)}</h2><a href="${teamClubPath(data, s.teamId)}">${esc(teamById(data, s.teamId).name)}</a></article>`).join('')}</div><section class="panel"><div class="panel-heading"><h2>Classificação de marcadores</h2><span class="subtle-label">${ranked.length} registos</span></div>${ranked.length ? `<ol class="scorer-list">${scorerRows(data, ranked)}</ol>` : emptyState('Sem resultados', 'Experimenta outro nome ou limpa os filtros.')}</section><p class="muted small">Os totais iguais partilham a mesma posição. A ordem dos nomes em empate é alfabética.</p>` : `<div class="panel privacy-feature">${privateScorers()}</div>`}<section class="section">${heading('O ataque em números', 'As equipas com mais golos', 'Golos registados na classificação da competição.')}<div class="panel goal-ranking">${teamGoalRanking(data, 12)}</div></section>`;
}
function clubs(data, url) {
  const q = url.searchParams.get('q') ?? '', group = url.searchParams.get('serie') ?? '';
  const list = data.clubs.filter(club => normalize(club.name).includes(normalize(q)) && (!group || club.teamIds.some(id => teamById(data, id).groupId === group))).sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  return `${pageHeading('A nossa terra, os nossos clubes', 'Os protagonistas.', 'As equipas que dão vida ao futebol de formação do Alto Minho.')}<form class="filter-bar" action="/clubes">${searchInput(q, 'Procurar clube', 'Nome do clube…')}${groupSelect(data, group)}${formFooter('/clubes')}</form><p class="result-count" role="status">${list.length} clubes encontrados</p>${list.length ? `<div class="club-grid">${list.map(club => `<a class="club-card" href="/clubes/${club.slug}">${badge(club.name, true)}<h2>${esc(club.name)}</h2><p class="muted">${club.teamIds.map(id => `Série ${teamById(data, id).groupId}`).join(' · ')}</p><div>${club.teamIds.length === 1 ? 'Ver equipa' : `Ver ${club.teamIds.length} equipas`} ${icon('arrow')}</div></a>`).join('')}</div>` : emptyState('Nenhum clube encontrado', 'Experimenta outro nome ou limpa os filtros.')}<p class="muted small badge-note">Os símbolos com iniciais identificam os clubes enquanto não estiverem disponíveis emblemas oficiais autorizados.</p>`;
}
function rosterSection(data, team) {
  const roster = data.rosters?.find(r => r.teamId === team.id);
  const cards = (people, kind) => people?.length ? `<div class="people-grid">${people.map(person => `<article class="person-card"><div class="person-portrait">${icon('person')}${person.photoPath ? `<img class="person-image" src="${esc(person.photoPath)}" width="160" height="180" loading="lazy" alt="${esc(person.name)}">` : ''}${person.jerseyNumber != null && kind === 'player' ? `<span class="jersey-number">${person.jerseyNumber}</span>` : ''}</div><div class="person-card-body"><h3>${esc(person.name)}</h3>${person.position || person.role ? `<p>${esc(kind === 'player' ? person.position : person.role)}</p>` : ''}</div></article>`).join('')}</div>` : `<div class="roster-empty">${icon(kind === 'player' ? 'shield' : 'person')}<h3>${kind === 'player' ? 'O plantel está a caminho.' : 'A equipa técnica, em breve.'}</h3><p>${kind === 'player' ? 'Aqui vais poder conhecer todos os jogadores desta equipa.' : 'Os treinadores e a restante equipa técnica vão ter o seu lugar aqui.'}</p></div>`;
  return `<section class="section roster-section" id="plantel-${team.id}">${heading(team.name, 'Quem dá vida à equipa', '')}<div class="panel"><div class="panel-heading"><h2>Plantel</h2><span class="subtle-label">${roster?.players.length ? `${roster.players.length} jogadores${roster.complete ? ' · plantel completo' : ' · registos disponíveis'}` : data.competition.season}</span></div>${cards(roster?.players, 'player')}</div><div class="panel staff-panel"><div class="panel-heading"><h2>Equipa técnica</h2></div>${cards(roster?.staff, 'staff')}</div></section>`;
}
function clubProfile(data, id) {
  const club = clubById(data, id);
  if (!club) return notFound();
  const teams = data.teams.filter(t => t.clubId === id);
  const matches = recentMatches(data).filter(m => teams.some(t => t.id === m.homeId || t.id === m.awayId)).slice(0, 6);
  const fixtures = upcomingMatches(data).filter(m => teams.some(t => t.id === m.homeId || t.id === m.awayId)).slice(0, 6);
  return `<a class="back-link" href="/clubes">← Todos os clubes</a><header class="club-profile-heading">${badge(club.name, true)}<div><p class="eyebrow">Futebol de formação · ${esc(data.competition.season)}</p><h1 tabindex="-1">${esc(club.name)}</h1><p class="muted">${teams.length} ${teams.length === 1 ? 'equipa na competição' : 'equipas na competição'} · ${esc(data.competition.shortName)}</p></div></header>${teams.map(t => {
    const s = teamStanding(data, t);
    return `<section class="panel team-summary"><div class="panel-heading"><div><h2>${esc(t.name)}</h2><p class="muted">Série ${t.groupId} · ${t.withdrawn ? 'Desistiu da prova' : `${s.position}.º classificado`}</p></div>${textLink(groupPath(data, t.groupId), 'Classificação')}</div><dl class="team-stat-grid">${[['Pontos', s.points], ['Jogos', s.played], ['Vitórias', s.wins], ['Empates', s.draws], ['Derrotas', s.losses], ['Golos marcados', s.goalsFor], ['Golos sofridos', s.goalsAgainst], ['Diferença', s.goalDifference]].map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl></section>${rosterSection(data, t)}`;
  }).join('')}<section class="section">${heading('O percurso', 'Últimos resultados')}${matchGrid(data, matches)}</section><section class="section">${heading('Em agenda', 'Próximos jogos')}${matchGrid(data, fixtures)}</section><section class="section panel"><div class="panel-heading"><h2>Marcadores do clube</h2></div>${data.scorers.some(s => teams.some(t => t.id === s.teamId)) ? `<ol class="scorer-list">${scorerRows(data, rankScorers(data.scorers.filter(s => teams.some(t => t.id === s.teamId))))}</ol>` : privateScorers()}</section>`;
}
function statistics(data) {
  const max = Math.max(...data.groups.map(g => groupStatistics(data, g.id).goals), 1);
  const biggest = recentMatches(data).sort((a, b) => b.homeGoals + b.awayGoals - a.homeGoals - a.awayGoals).slice(0, 3);
  return `${pageHeading('O jogo, visto de outra forma', 'Dentro dos números.', 'Estatísticas calculadas a partir dos resultados completos registados no Excel.')}<div class="metrics">${metric(data.stats.goals, 'Golos marcados', 'ball')}${metric(data.stats.played, 'Jogos realizados', 'calendar')}${metric((data.stats.goals / Math.max(data.stats.played, 1)).toLocaleString('pt-PT', { maximumFractionDigits: 2 }), 'Média por jogo', 'chart')}${metric(data.stats.draws, 'Empates', 'shield')}</div><section class="section two-columns"><div class="panel"><div class="panel-heading"><h2>Golos por série</h2></div><div class="comparison-chart" role="img" aria-label="Comparação de golos registados por série">${data.groups.map(g => {
    const s = groupStatistics(data, g.id);
    return `<a href="${groupPath(data, g.id)}"><span>Série ${g.id}<small>${s.played} jogos</small></span><span class="bar-track"><span style="--bar:${Math.round(s.goals / max * 100)}%"></span></span><strong>${s.goals}</strong></a>`;
  }).join('')}</div></div><div class="panel"><div class="panel-heading"><h2>Os ataques em destaque</h2></div>${teamGoalRanking(data)}</div></section><section class="section">${heading('Redes cheias', 'Os jogos com mais golos')}${matchGrid(data, biggest)}</section><section class="section"><div class="panel"><div class="panel-heading"><h2>Golos por clube</h2><span class="subtle-label">Equipas do mesmo clube somadas</span></div><div class="club-goals-table">${clubRanking(data).map(c => `<a href="/clubes/${c.slug}"><span>${badge(c.name)}${esc(c.name)}</span><strong>${c.goals}<small>golos</small></strong></a>`).join('')}</div></div></section>`;
}
export function notFound() {
  return `${pageHeading('404 · Fora de jogo', 'Esta página saiu do campo.', 'A página que procuras não foi encontrada.')}<a class="button" href="/">Voltar ao início ${icon('arrow')}</a>`;
}
export function renderView(data, url) {
  const path = decodeURI(url.pathname).replace(/\/$/, '') || '/';
  if (path === '/') return home(data, url);
  if (path === '/competicoes' || path === competitionPath(data)) return competition(data);
  const groupMatch = path.match(new RegExp(`^${competitionPath(data)}/serie-([a-z])$`));
  if (groupMatch) return groupView(data, groupMatch[1].toUpperCase());
  if (path === '/jogos') return games(data, url);
  if (path.startsWith('/jogos/')) return matchDetails(data, path.slice(7));
  if (path === '/clubes') return clubs(data, url);
  if (path.startsWith('/clubes/')) return clubProfile(data, path.slice(8));
  if (path === '/marcadores') return scorers(data, url);
  if (path === '/estatisticas') return statistics(data);
  return notFound();
}
export function pageTitle(data, path) {
  if (path.startsWith('/jogos/')) { const m = data.matches.find(m => `/jogos/${m.id}` === path); if (m) return `${teamById(data, m.homeId).name} × ${teamById(data, m.awayId).name} · MINHO11`; }
  if (path.startsWith('/clubes/')) { const c = data.clubs.find(c => `/clubes/${c.slug}` === path); if (c) return `${c.name} · MINHO11`; }
  const names = { '/': 'O futebol começa aqui', '/jogos': 'Jogos e resultados', '/clubes': 'Os clubes', '/marcadores': 'Bota de Ouro', '/estatisticas': 'Estatísticas', '/competicoes': 'Competições' };
  return `${names[path] ?? (path.includes('/serie-') ? `Série ${path.slice(-1).toUpperCase()} · Gomes Ribeiro` : data.competition.shortName)} · MINHO11`;
}
export function header(data, path) {
  const links = [['/', 'Início'], ['/competicoes', 'Competições'], ['/jogos', 'Jogos'], ['/clubes', 'Clubes'], ['/marcadores', 'Marcadores']];
  return `<a class="skip-link" href="#conteudo">Saltar para o conteúdo</a><header class="site-header"><div class="header-inner shell">${brand()}<nav class="desktop-nav" aria-label="Navegação principal">${links.map(([href, label]) => `<a href="${href}"${(href === '/' ? path === '/' : path.startsWith(href)) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="header-actions"><span class="season-label">${esc(data.competition.season)}</span><button class="icon-button" type="button" data-search-open aria-label="Procurar equipa">${icon('search')}</button><button class="icon-button" type="button" data-theme-toggle aria-label="Alternar tema claro e escuro">${icon('sun')}</button><button class="icon-button menu-button" type="button" data-menu-toggle aria-label="Abrir navegação" aria-expanded="false" aria-controls="mobile-navigation">${icon('menu')}</button></div></div><nav id="mobile-navigation" class="mobile-navigation shell" aria-label="Navegação móvel" hidden>${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}<a href="/estatisticas">Estatísticas</a></nav></header>`;
}
export function footer(data) {
  return `<footer class="site-footer shell"><div>${brand()}<p>O futebol começa aqui.</p><p class="muted small">Plataforma independente · Alto Minho</p></div><nav aria-label="Navegação do rodapé"><a href="/competicoes">A competição</a><a href="/estatisticas">Estatísticas</a><a href="/marcadores">Marcadores</a></nav><div class="footer-data"><p>${esc(data.competition.shortName)} · ${esc(data.competition.category)}<br>${esc(data.competition.phase)} · ${esc(data.competition.season)}</p><p class="sync-status" id="sync-status" role="status">Dados importados em ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(data.importedAt))}</p><p class="muted small">Atualização após publicação de uma nova versão do Excel.</p></div></footer><dialog id="search-dialog" aria-labelledby="search-title"><form action="/jogos"><div class="dialog-heading"><h2 id="search-title">Encontra a tua equipa.</h2><button type="button" class="icon-button" data-search-close aria-label="Fechar pesquisa">${icon('close')}</button></div><label>Nome da equipa<input type="search" name="q" placeholder="Ex.: Lanheses" required></label><button class="button" type="submit">Pesquisar ${icon('arrow')}</button></form></dialog>`;
}
