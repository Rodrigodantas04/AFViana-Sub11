import { dateLabel, matchStatus, statusLabels, teamById, teamClubPath, groupPath, groupById, phaseById } from './domain.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function icon(name, cls = '') {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4M12 14v6m-4 1h8"/>',
    shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6 5-4Zm0 0V3m5 8 4-1m-6 7 2 3M9 17l-2 3m0-9-4-1"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', chart: '<path d="M4 3v18h17M8 16v-5m5 5V6m5 10V9"/>', check: '<path d="m5 12 4 4L19 6"/>', home: '<path d="m3 10 9-7 9 7M5 9v12h14V9m-10 12v-7h6v7"/>', person: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>'
  };
  return `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.ball}</svg>`;
}
/** Club crest when an authorised file exists; otherwise initials. Decorative (the name is always next to it). */
export function badge(name, large = false, crest = null) {
  if (crest) return `<span class="badge badge-crest ${large ? 'badge-large' : ''}" aria-hidden="true"><img src="${esc(crest)}" alt="" width="${large ? 72 : 36}" height="${large ? 72 : 36}" loading="lazy" decoding="async"></span>`;
  const words = String(name).replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words.slice(0, 3).map(w => w[0]).join('') : words[0]?.slice(0, 3) ?? 'M11').toUpperCase();
  let hue = 0; for (const c of String(name)) hue = (hue * 31 + c.codePointAt(0)) % 360;
  return `<span class="badge ${large ? 'badge-large' : ''}" style="--badge-hue:${hue}" aria-hidden="true"><span>${esc(initials)}</span></span>`;
}
export const clubBadge = (club, large = false) => badge(club.name, large, club.crestUrl);
export function teamBadge(data, teamOrId, large = false) {
  const team = typeof teamOrId === 'string' ? teamById(data, teamOrId) : teamOrId;
  const club = data.clubs.find(c => c.id === team?.clubId);
  return badge(team?.name ?? '', large, club?.crestUrl);
}
export const brand = () => `<a class="brand" href="/" aria-label="MINHO11 — início"><span class="brand-mark">${icon('ball')}</span><span>MINHO<span class="brand-number">11</span></span></a>`;
export function heading(eyebrow, title, description = '', action = '') {
  return `<div class="section-heading"><div>${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2>${esc(title)}</h2>${description ? `<p class="muted">${esc(description)}</p>` : ''}</div>${action}</div>`;
}
export function pageHeading(eyebrow, title, description = '') {
  return `<header class="page-heading"><p class="eyebrow">${esc(eyebrow)}</p><h1 tabindex="-1">${esc(title)}</h1><p class="muted">${esc(description)}</p></header>`;
}
export const textLink = (href, label) => `<a class="text-link" href="${esc(href)}">${esc(label)} ${icon('arrow')}</a>`;
export function statusPill(match) {
  const status = matchStatus(match);
  return `<span class="pill ${status === 'finished' ? 'pill-final' : ''}">${esc(statusLabels[status])}</span>`;
}
export function groupShort(data, groupId) {
  const g = groupById(data, groupId), p = g && phaseById(data, g.phaseId);
  return g ? `${p.number}.ª Fase <span class="separator">/</span> Série ${g.letter}` : '';
}
export function matchCard(data, match) {
  const home = teamById(data, match.homeId), away = teamById(data, match.awayId);
  const g = groupById(data, match.groupId);
  return `<a class="match-card" href="/jogos/${match.id}" aria-label="${esc(home.name)} ${match.homeGoals ?? 'contra'} ${esc(away.name)} ${match.awayGoals ?? ''}, Série ${g?.letter}, ${esc(statusLabels[matchStatus(match)])}">
    <div class="match-meta"><span>${groupShort(data, match.groupId)} <span class="separator">/</span> J${match.round}</span>${statusPill(match)}</div>
    <div class="match-team">${teamBadge(data, home)}<span>${esc(home.name)}</span><strong>${match.homeGoals ?? '–'}</strong></div>
    <div class="match-team">${teamBadge(data, away)}<span>${esc(away.name)}</span><strong>${match.awayGoals ?? '–'}</strong></div>
    <div class="match-footer"><span>${icon('calendar')}${dateLabel(match.date)}</span><span>Ver jogo ${icon('arrow')}</span></div>
  </a>`;
}
export function matchGrid(data, matches) {
  return matches.length ? `<div class="match-grid">${matches.map(m => matchCard(data, m)).join('')}</div>` : emptyState('Sem jogos para mostrar', 'Experimenta outra série ou limpa os filtros.');
}
export function emptyState(title, description = '', link = '') {
  return `<div class="empty-state">${icon('search')}<h3>${esc(title)}</h3><p>${esc(description)}</p>${link}</div>`;
}
export function standings(data, group) {
  if (!group.defined) return pendingGroup(data, group);
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Classificação da Série ${group.letter}"><table class="standings"><caption class="sr-only">Série ${group.letter}, ${esc(phaseById(data, group.phaseId).name)}: classificação calculada com as fórmulas do Excel</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Equipa</th>${[['J', 'Jogos'], ['V', 'Vitórias'], ['E', 'Empates'], ['D', 'Derrotas'], ['GM', 'Golos marcados'], ['GS', 'Golos sofridos'], ['DG', 'Diferença de golos'], ['Pts', 'Pontos']].map(([s, l], i) => `<th scope="col" class="${i > 0 && i < 7 ? 'secondary-stat' : ''}"><abbr title="${l}">${s}</abbr></th>`).join('')}</tr></thead><tbody>${group.standings.map(s => {
    const team = teamById(data, s.teamId);
    return `<tr class="${s.position === 1 ? 'leader-row' : ''} ${team.withdrawn ? 'withdrawn-row' : ''}"><td><span class="position">${s.position}</span></td><th scope="row"><a class="table-team" href="${teamClubPath(data, s.teamId)}">${teamBadge(data, team)}<span>${esc(team.name)}${team.withdrawn ? '<small>Desistiu da prova</small>' : ''}</span></a></th>${['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points'].map((k, i) => `<td class="${i > 0 && i < 7 ? 'secondary-stat' : ''} ${k === 'points' ? 'points' : ''}">${k === 'goalDifference' && s[k] > 0 ? '+' : ''}${s[k]}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div><p class="table-footnote">Ordem da folha: pontos, diferença de golos, golos marcados e, por fim, ordem de inscrição. <span class="mobile-hint">Mais estatísticas no perfil de cada clube.</span></p>`;
}
export function pendingGroup(data, group) {
  return `<div class="pending-state">${icon('clock')}<h3>Série ${esc(group.letter)} por definir</h3><p>As equipas da ${esc(phaseById(data, group.phaseId).name)} ainda não foram indicadas. Os jogos e a classificação aparecem aqui assim que forem definidas.</p></div>`;
}
export function groupTabs(data, active) {
  const current = groupById(data, active);
  return `<nav class="group-tabs" aria-label="Selecionar série">${data.groups.filter(g => g.phaseId === current?.phaseId).map(g => `<a href="${groupPath(data, g.id)}" ${g.id === active ? 'aria-current="page"' : ''}>Série ${g.letter}</a>`).join('')}</nav>`;
}
export function phaseTabs(data, activePhase, hrefFor) {
  return `<nav class="group-tabs phase-tabs" aria-label="Selecionar fase">${data.phases.map(p => `<a href="${esc(hrefFor(p))}" ${p.id === activePhase ? 'aria-current="page"' : ''}>${esc(p.name)}${p.state === 'pending' ? ' <small>por definir</small>' : ''}</a>`).join('')}</nav>`;
}
export function notes(group) {
  return group.notes.map(note => `<p class="notice">${icon('shield')}<span>${esc(note)}</span></p>`).join('');
}
export function metric(value, label, symbol = 'ball', caption = '') {
  return `<div class="metric"><span class="metric-label">${icon(symbol)}${esc(label)}</span><strong>${esc(value)}</strong>${caption ? `<small>${esc(caption)}</small>` : ''}</div>`;
}
export function scorerRows(data, scorers) {
  return scorers.map(s => `<li class="scorer-row"><span class="scorer-rank" title="${s.tied ? 'Posição partilhada' : ''}">${s.rank}.${s.tied ? '<small>=</small>' : ''}</span>${teamBadge(data, s.teamId)}<div><strong>${esc(s.name)}</strong><a href="${teamClubPath(data, s.teamId)}">${esc(teamById(data, s.teamId).name)}</a></div><strong class="goal-count">${s.goals}<small>${s.goals === 1 ? 'golo' : 'golos'}</small></strong></li>`).join('');
}
export function privateScorers(data) {
  const mode = data?.publication?.scorerNames;
  const text = mode === 'redacted'
    ? 'Os nomes dos marcadores chegam com os dados ao vivo. Se esta mensagem continuar, atualiza a página.'
    : 'Os marcadores individuais estão ocultos nesta publicação.';
  return `<div class="privacy-state">${icon('lock')}<p class="eyebrow">Bota de Ouro</p><h3>O golo tem protagonistas.</h3><p>${text}</p><span class="subtle-label">${data?.stats ? `${data.stats.individualGoals} golos com marcador identificado` : ''}</span></div>`;
}
/** Accessible bar chart in HTML/CSS: bars scale with the container, text keeps its real size. */
export function barChart({ title, rows, keys }) {
  if (!rows.length) return '';
  const top = Math.max(...rows.flatMap(r => keys.map(k => r[k.key])), 1);
  const cols = rows.map(r => `<div class="bc-col"><div class="bc-bars">${keys.map(k => `<span class="bc-bar ${k.cls}" style="--h:${(r[k.key] / top * 100).toFixed(1)}%" title="${esc(r.label)}: ${r[k.key]} ${esc(k.label.toLowerCase())}"><b>${r[k.key]}</b></span>`).join('')}</div><span class="bc-label">${esc(r.short ?? r.label)}</span></div>`).join('');
  return `<figure class="chart"><figcaption>${esc(title)} <span class="chart-legend">${keys.map(k => `<span class="legend-item ${k.cls}">${esc(k.label)}</span>`).join('')}</span></figcaption><div class="bar-chart" role="img" aria-label="${esc(title)}: ${rows.map(r => `${r.label} ${keys.map(k => `${r[k.key]} ${k.label.toLowerCase()}`).join(', ')}`).join('; ')}" style="--cols:${rows.length}">${cols}</div><details class="chart-data"><summary>Ver dados</summary><table><thead><tr><th scope="col">Jogo</th>${keys.map(k => `<th scope="col">${esc(k.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${esc(r.label)}</th>${keys.map(k => `<td>${r[k.key]}</td>`).join('')}</tr>`).join('')}</tbody></table></details></figure>`;
}
/** Cumulative line: the line is a stretchable SVG; points and labels are HTML so text never scales. */
export function lineChart({ title, points, label }) {
  if (points.length < 2) return '';
  const top = Math.max(...points.map(p => p.value), 1);
  const pos = points.map((p, i) => ({ ...p, x: i / (points.length - 1) * 100, y: p.value / top * 100 }));
  const line = pos.map(p => `${p.x.toFixed(2)},${(100 - p.y).toFixed(2)}`).join(' ');
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption><div class="line-chart" role="img" aria-label="${esc(title)}: ${points.map(p => `${p.label} ${p.value}`).join(', ')}"><div class="lc-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon class="area" points="0,100 ${line} 100,100"/><polyline class="line" points="${line}"/></svg>${pos.map(p => `<span class="lc-dot" style="--x:${p.x.toFixed(2)}%;--y:${p.y.toFixed(2)}%" title="${esc(p.label)}: ${p.value} ${esc(label)}"><b>${p.value}</b></span>`).join('')}</div><div class="lc-labels">${pos.map(p => `<span style="--x:${p.x.toFixed(2)}%">${esc(p.short ?? p.label)}</span>`).join('')}</div></div></figure>`;
}
/** Two horizontal bars: this team vs a reference (series average or another team). */
export function compareBars({ label, a, b, aLabel, bLabel, digits = 1, lowerIsBetter = false }) {
  const fmt = v => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-PT', { maximumFractionDigits: digits });
  const max = Math.max(a ?? 0, b ?? 0, 0.0001);
  const better = a === null || b === null ? '' : (lowerIsBetter ? a < b : a > b) ? 'is-better' : a === b ? '' : 'is-worse';
  return `<div class="compare-row ${better}"><div class="compare-head"><span>${esc(label)}</span><strong>${fmt(a)}</strong></div><div class="compare-bars" aria-hidden="true"><span class="cbar cbar-a" style="--v:${Math.round((a ?? 0) / max * 100)}%"></span><span class="cbar cbar-b" style="--v:${Math.round((b ?? 0) / max * 100)}%"></span></div><small>${esc(bLabel)}: ${fmt(b)}${aLabel ? '' : ''}</small></div>`;
}
