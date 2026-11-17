/**
 * MINHO11 results desk. The server is the authority: it checks the password,
 * validates every payload, writes the Excel and confirms by reading it back.
 * This page only reports success after that confirmation arrives.
 */
import { setupInstall, installHelp } from './install.js';
const $ = selector => document.querySelector(selector);
document.body.insertAdjacentHTML('beforeend', installHelp('a Gestão do MINHO11'));
setupInstall({ buttons: '#install-app' });
const NAME = /^[\p{L}][\p{L}\p{M} .'’-]{0,58}[\p{L}\p{M}.]$|^[\p{L}]$/u;
const state = { data: null, matchId: null, initial: null, op: null, saving: false, draftKeep: null };
const fold = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('pt-PT').trim();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const show = id => { for (const v of ['#loading', '#login-view', '#desk']) $(v).hidden = v !== id; };

// --- accessible validation: keep aria-invalid in step with :user-invalid -------------
const announcer = Object.assign(document.createElement('div'), { className: 'visually-hidden' });
announcer.setAttribute('aria-live', 'polite');
document.body.append(announcer);
function syncAria(el) {
  if (!el?.matches?.('input')) return;
  const invalid = el.matches(':user-invalid');
  el.setAttribute('aria-invalid', String(invalid));
  const errorId = el.dataset.error;
  if (errorId) {
    const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== errorId);
    if (invalid) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
  }
}
for (const type of ['input', 'change', 'blur', 'invalid']) document.addEventListener(type, event => syncAria(event.target), true);

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/admin/${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let payload = {};
  try { payload = await response.json(); } catch { /* empty */ }
  if (response.status === 401 && path !== 'login') { requireLogin(); }
  return { ok: response.ok, status: response.status, conflict: response.headers.get('X-MINHO11-Conflict'), ...payload };
}

// --- login --------------------------------------------------------------------------
function requireLogin(message = 'A sessão terminou. Entra outra vez — o que escreveste fica guardado.') {
  if (!$('#editor').hidden && isDirty()) state.draftKeep = { matchId: state.matchId, draft: readDraft() };
  $('#logout').hidden = true;
  show('#login-view');
  $('#login-message').textContent = state.data ? message : '';
  $('#password').focus();
}
$('#toggle-password').addEventListener('click', event => {
  const input = $('#password'), visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'Esconder' : 'Mostrar';
  event.currentTarget.setAttribute('aria-pressed', String(visible));
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('#password');
  if (!input.value) { input.reportValidity(); input.focus(); return; }
  const button = $('#login-button');
  button.disabled = true; button.textContent = 'A entrar…'; $('#login-message').textContent = '';
  try {
    const result = await api('login', { method: 'POST', body: { password: input.value } });
    if (!result.ok) { $('#login-message').textContent = result.message ?? 'Não foi possível entrar.'; input.select(); return; }
    input.value = '';
    await loadDesk();
  } catch { $('#login-message').textContent = 'Sem ligação à internet. Tenta outra vez.'; }
  finally { button.disabled = false; button.textContent = 'Entrar'; }
});
$('#logout').addEventListener('click', async () => {
  if (isDirty() && !confirm('Tens alterações por gravar. Sair mesmo assim?')) return;
  await api('logout', { method: 'POST', body: {} }).catch(() => {});
  state.data = null; state.initial = null; $('#editor').hidden = true;
  requireLogin('');
});

// --- desk ---------------------------------------------------------------------------
const teamName = id => state.data.teams.find(t => t.id === id)?.name ?? id;
const groupOf = id => state.data.groups.find(g => g.id === id);
const phaseOf = id => state.data.phases.find(p => p.id === id);
const dateText = iso => iso ? new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(iso + 'T12:00:00Z')) : 'sem data';
const isOpen = m => m.status !== 'finished' && m.status !== 'withdrawn';

async function loadDesk({ keepDraft = null } = {}) {
  show('#loading'); $('#loading').innerHTML = '<p class="muted">A ler o Excel da competição…</p>';
  let result;
  try { result = await api('state'); }
  catch { $('#loading').innerHTML = '<p class="banner banner-error">Sem ligação ao servidor. Verifica a internet e recarrega a página.</p>'; return; }
  if (result.status === 401) return;
  if (!result.ok) { $('#loading').innerHTML = ''; $('#loading').append(Object.assign(document.createElement('p'), { className: 'banner banner-error', textContent: result.message })); return; }
  state.data = result;
  $('#logout').hidden = false;
  show('#desk');
  renderAll();
  const restore = keepDraft ?? state.draftKeep;
  state.draftKeep = null;
  if (restore) { openMatch(restore.matchId, { draft: restore.draft }); }
}
function renderBanners() {
  const d = state.data, banner = $('#source-banner');
  banner.className = 'banner' + (d.writable ? '' : ' banner-warning');
  banner.textContent = d.writable
    ? `Ligado ao Excel da competição${d.sourceKind === 'file' ? ' (cópia local de teste)' : ''}. ${d.quality.unidentifiedGoals ? `${d.quality.unidentifiedGoals} golos ainda sem marcador identificado.` : ''}`
    : 'O Excel está ligado só para leitura: podes consultar, mas a gravação está desativada até a permissão de edição ser dada.';
  const lost = $('#lost-banner');
  lost.hidden = !d.lostWrites.length;
  lost.textContent = d.lostWrites.length ? `Atenção: ${d.lostWrites.length === 1 ? 'um resultado gravado aqui já não está' : `${d.lostWrites.length} resultados gravados aqui já não estão`} no Excel (alguém gravou outra versão do ficheiro por cima). Abre ${d.lostWrites.map(l => { const m = d.matches.find(x => x.id === l.matchId); return `${teamName(m.homeId)} – ${teamName(m.awayId)}`; }).join('; ')} e confirma.` : '';
}
function option(value, label, selected) { const o = new Option(label, value); o.selected = selected; return o; }
function renderPicker() {
  const d = state.data, phase = $('#phase'), group = $('#group'), round = $('#round');
  const phases = d.phases.filter(p => d.groups.some(g => g.phaseId === p.id && g.defined));
  const keepPhase = phase.value || phases.at(-1)?.id;
  phase.replaceChildren(...phases.map(p => option(p.id, p.name, p.id === keepPhase)));
  const groups = d.groups.filter(g => g.phaseId === phase.value && g.defined);
  const keepGroup = groups.some(g => g.id === group.value) ? group.value : (groups.find(g => d.matches.some(m => m.groupId === g.id && isOpen(m) && m.date && m.date <= today)) ?? groups[0])?.id;
  group.replaceChildren(...groups.map(g => {
    const open = d.matches.filter(m => m.groupId === g.id && isOpen(m) && m.date && m.date <= today).length;
    return option(g.id, `Série ${g.letter}${open ? ` (${open})` : ''}`, g.id === keepGroup);
  }));
  const rounds = [...new Set(d.matches.filter(m => m.groupId === group.value).map(m => m.round))].sort((a, b) => a - b);
  const keepRound = round.value;
  round.replaceChildren(option('', 'Todas', !keepRound), ...rounds.map(r => option(String(r), `Jornada ${r}`, String(r) === keepRound)));
  renderMatches();
}
function matchButton(m, { showGroup = false } = {}) {
  const li = document.createElement('li'), button = document.createElement('button');
  button.type = 'button'; button.dataset.match = m.id;
  if (m.id === state.matchId) button.setAttribute('aria-current', 'true');
  const missing = m.scorers.home.missing + m.scorers.away.missing;
  const late = isOpen(m) && m.date && m.date <= today;
  button.innerHTML = `<span class="teams"></span><span class="result"></span><span class="meta"></span>`;
  button.querySelector('.teams').textContent = `${teamName(m.homeId)} – ${teamName(m.awayId)}`;
  button.querySelector('.result').textContent = m.status === 'finished' ? `${m.homeGoals}–${m.awayGoals}` : '–';
  const meta = button.querySelector('.meta'), g = groupOf(m.groupId);
  meta.textContent = `${showGroup ? `${phaseOf(m.phaseId).number}.ª F · Série ${g.letter} · ` : ''}J${m.round} · ${dateText(m.date)}`;
  const tag = (text, cls = '') => meta.append(Object.assign(document.createElement('span'), { className: `tag ${cls}`, textContent: text }));
  if (m.status === 'withdrawn') tag('desistência');
  else if (late) tag('por preencher');
  else if (m.status === 'finished' && missing) tag(`${missing} ${missing === 1 ? 'golo sem nome' : 'golos sem nome'}`, 'tag-soft');
  else if (m.status === 'finished') tag('completo', 'tag-ok');
  if (m.issues.some(i => i.level === 'warning')) tag('rever');
  li.append(button);
  return li;
}
function renderMatches() {
  const d = state.data, list = $('#match-list'), onlyOpen = $('#only-open').checked;
  const matches = d.matches.filter(m => m.groupId === $('#group').value && (!$('#round').value || m.round === Number($('#round').value)) && (!onlyOpen || isOpen(m) || m.scorers.home.missing || m.scorers.away.missing))
    .sort((a, b) => a.round - b.round || (a.date ?? '').localeCompare(b.date ?? ''));
  list.replaceChildren(...matches.map(m => matchButton(m)));
  if (!matches.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: onlyOpen ? 'Nenhum jogo por preencher nesta seleção. 🎉' : 'Sem jogos nesta seleção.' }));
  renderToday();
}
const addDays = (iso, days) => new Date(Date.parse(iso + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
function renderToday() {
  const d = state.data, from = addDays(today, -7), list = $('#today-list');
  const recent = d.matches.filter(m => m.date && m.status !== 'withdrawn' && ((m.date >= from && m.date <= addDays(today, 1)) || (isOpen(m) && m.date <= today)))
    .sort((a, b) => Number(isOpen(b) && b.date <= today) - Number(isOpen(a) && a.date <= today) || b.date.localeCompare(a.date) || a.groupId.localeCompare(b.groupId));
  list.replaceChildren(...recent.map(m => matchButton(m, { showGroup: true })));
  if (!recent.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Sem jogos nos últimos dias. Usa «Por série» para abrir qualquer jogo.' }));
}
function renderAll() {
  renderBanners(); renderPicker(); renderPhase2(); renderPrivacy(); renderHistory(); renderPlayers();
}
$('#phase').addEventListener('change', () => { $('#group').value = ''; $('#round').value = ''; renderPicker(); });
$('#group').addEventListener('change', () => { $('#round').value = ''; renderPicker(); });
$('#round').addEventListener('change', renderMatches);
$('#only-open').addEventListener('change', renderMatches);
for (const list of ['#match-list', '#today-list']) $(list).addEventListener('click', event => {
  const id = event.target.closest('[data-match]')?.dataset.match;
  if (!id) return;
  if (id !== state.matchId && isDirty() && !confirm('Tens alterações por gravar neste jogo. Abrir outro e perdê-las?')) return;
  openMatch(id);
});
// --- tabs ---------------------------------------------------------------------------
document.querySelector('.tabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]')?.dataset.tab;
  if (!tab) return;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== tab;
  if (!['today', 'series'].includes(tab) && !isDirty()) { $('#editor').hidden = true; state.matchId = null; state.initial = null; }
});

// --- editor -------------------------------------------------------------------------
const sides = ['home', 'away'];
const block = side => document.querySelector(`.scorer-block[data-side="${side}"]`);
function knownNames(teamId) {
  const names = new Map();
  for (const m of state.data.matches) for (const side of sides) if (m[side + 'Id'] === teamId) for (const e of m.scorers[side].entries) if (!e.ownGoal && e.name) names.set(fold(e.name), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-PT'));
}
function addRow(side, { name = '', goals = 1, ownGoal = false } = {}, focus = false) {
  const rows = block(side).querySelector('.scorer-rows');
  if (rows.children.length >= 10) { setSaveState('error', 'No máximo 10 linhas por equipa (o Excel só lê 10 nomes). Junta os golos do mesmo jogador numa linha.'); return; }
  const row = $('#scorer-row').content.firstElementChild.cloneNode(true);
  const input = row.querySelector('.scorer-name'), id = `n-${crypto.randomUUID()}`;
  input.id = id; row.querySelector('label').htmlFor = id;
  row.querySelector('.error-msg').id = id + '-error'; input.dataset.error = id + '-error';
  input.value = name;
  row.dataset.own = String(ownGoal);
  if (ownGoal) {
    row.classList.add('own');
    row.querySelector('label').textContent = 'Autogolo (jogador adversário, opcional)';
    input.placeholder = 'Autogolo · nome do adversário (opcional)';
  } else {
    row.querySelector('label').textContent = 'Nome do marcador';
    input.placeholder = 'Nome do marcador';
    input.required = true;
  }
  row.querySelector('.count').value = String(goals);
  row.querySelector('.count').textContent = String(goals);
  rows.append(row);
  if (focus) input.focus();
  refresh();
}
const loose = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** Names this team already used, best scorers first (goals in all games of the competition). */
function teamScorers(teamId) {
  const goals = new Map();
  for (const m of state.data.matches) for (const side of sides) if (m[side + 'Id'] === teamId) for (const e of m.scorers[side].entries) if (!e.ownGoal && e.name) {
    const key = fold(e.name), cur = goals.get(key) ?? { name: e.name, goals: 0 };
    cur.goals += e.goals; goals.set(key, cur);
  }
  return [...goals.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'pt-PT'));
}
function renderQuickNames(side, teamId) {
  const box = block(side).querySelector('.quick-names');
  const list = teamScorers(teamId).slice(0, 8);
  box.replaceChildren(...(list.length ? [Object.assign(document.createElement('span'), { className: 'quick-label', textContent: 'Já marcaram:' })] : []), ...list.map(p => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.quick = p.name;
    b.textContent = `+ ${p.name}`; b.title = `${p.goals} ${p.goals === 1 ? 'golo' : 'golos'} na competição`;
    return b;
  }));
}
/** One tap: add the player, or one more goal if already listed. */
function quickAdd(side, name) {
  const rows = [...block(side).querySelectorAll('.scorer-row:not(.own)')];
  const existing = rows.find(r => fold(r.querySelector('.scorer-name').value) === fold(name));
  if (existing) {
    const out = existing.querySelector('.count'), v = Math.min(99, Number(out.value) + 1);
    out.value = String(v); out.textContent = String(v); refresh();
    existing.classList.remove('bump'); void existing.offsetWidth; existing.classList.add('bump');
  } else {
    const empty = rows.find(r => !r.querySelector('.scorer-name').value.trim());
    if (empty) { empty.querySelector('.scorer-name').value = name; refresh(); }
    else addRow(side, { name });
  }
  announcer.textContent = `${name} adicionado.`;
}
function showSuggestions(input) {
  const box = input.parentElement.querySelector('.name-suggest'), side = input.closest('.scorer-block').dataset.side;
  const q = loose(input.value), m = state.data.matches.find(x => x.id === state.matchId);
  if (!q || input.closest('.scorer-row').dataset.own === 'true') { box.hidden = true; return; }
  const matches = teamScorers(m[side + 'Id']).filter(p => loose(p.name).split(' ').some(w => w.startsWith(q)) || loose(p.name).startsWith(q)).filter(p => fold(p.name) !== fold(input.value)).slice(0, 5);
  box.replaceChildren(...matches.map(p => { const b = document.createElement('button'); b.type = 'button'; b.role = 'option'; b.dataset.pick = p.name; b.innerHTML = '<strong></strong><small></small>'; b.querySelector('strong').textContent = p.name; b.querySelector('small').textContent = `${p.goals} ${p.goals === 1 ? 'golo' : 'golos'}`; return b; }));
  box.hidden = !matches.length;
}
function setDatalist(side, teamId) {
  let list = document.getElementById(`names-${side}`);
  if (!list) { list = document.createElement('datalist'); list.id = `names-${side}`; document.body.append(list); }
  list.replaceChildren(...knownNames(teamId).map(n => new Option(n)));
}
function openMatch(id, { draft = null } = {}) {
  const m = state.data.matches.find(x => x.id === id);
  if (!m) return;
  state.matchId = id;
  const g = groupOf(m.groupId), p = phaseOf(m.phaseId);
  $('#editor-context').textContent = `${p.name} · Série ${g.letter} · Jornada ${m.round} · ${dateText(m.date)}`;
  for (const side of sides) {
    const name = teamName(m[side + 'Id']);
    $(`#${side}-name`).textContent = name;
    document.querySelector(`[data-team="${side}"]`).textContent = name;
    setDatalist(side, m[side + 'Id']);
    renderQuickNames(side, m[side + 'Id']);
    block(side).querySelector('.scorer-rows').replaceChildren();
  }
  const issues = $('#match-issues');
  issues.replaceChildren(...m.issues.filter(i => i.level === 'warning').map(i => Object.assign(document.createElement('p'), { className: 'issue', textContent: i.message })));
  const source = draft ?? { homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: { home: m.scorers.home.entries, away: m.scorers.away.entries } };
  $('#home-goals').value = source.homeGoals ?? '';
  $('#away-goals').value = source.awayGoals ?? '';
  for (const side of sides) for (const entry of source.scorers[side]) addRow(side, entry);
  state.initial = JSON.stringify({ homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: { home: m.scorers.home.entries, away: m.scorers.away.entries } });
  state.op = null;
  const editable = state.data.writable && m.status !== 'withdrawn';
  for (const el of $('#editor').querySelectorAll('input, button:not(#close-editor):not(#reload-match)')) el.disabled = !editable;
  $('#match-date').value = m.date ?? '';
  $('#match-date').disabled = !state.data.writable;
  $('#save-date').disabled = !state.data.writable;
  $('#clear-result').hidden = !(m.homeGoals !== null || m.awayGoals !== null || m.scorers.home.entries.length || m.scorers.away.entries.length);
  $('#reload-match').hidden = true;
  $('#editor').hidden = false;
  renderMatches();
  setSaveState('');
  refresh();
  if (draft) {
    const now = m.status === 'finished' ? `${m.homeGoals}–${m.awayGoals}` : 'sem resultado';
    setSaveState('dirty', `Os teus dados foram mantidos. No Excel está agora: ${now}. Revê e grava.`);
  } else if (!editable) setSaveState('error', m.status === 'withdrawn' ? 'Jogo com equipa desistente: não recebe resultado.' : 'Gravação desativada (só leitura).');
  $('#editor').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (editable && !draft) $(m.status === 'finished' ? '#home-goals' : '#home-goals').focus({ preventScroll: true });
}
function readDraft() {
  const goals = id => { const v = $(id).value.trim(); return /^\d{1,2}$/.test(v) ? Number(v) : v === '' ? null : v; };
  return {
    homeGoals: goals('#home-goals'), awayGoals: goals('#away-goals'),
    scorers: Object.fromEntries(sides.map(side => [side, [...block(side).querySelectorAll('.scorer-row')].map(row => ({ name: row.querySelector('.scorer-name').value.replace(/\s+/g, ' ').trim(), goals: Number(row.querySelector('.count').value), ownGoal: row.dataset.own === 'true' }))])),
  };
}
const isDirty = () => Boolean(state.initial) && !$('#editor').hidden && JSON.stringify(readDraft()) !== state.initial;
function refresh() {
  const draft = readDraft();
  for (const side of sides) {
    const score = draft[side + 'Goals'], total = draft.scorers[side].reduce((n, e) => n + e.goals, 0);
    const tally = block(side).querySelector('.tally');
    tally.className = 'tally';
    if (typeof score !== 'number') tally.textContent = total ? `${total} ${total === 1 ? 'golo' : 'golos'} nas linhas.` : '';
    else if (total > score) { tally.className = 'tally over'; tally.textContent = `Os marcadores somam ${total}, mais do que o resultado (${score}).`; }
    else if (score === 0) tally.textContent = 'Sem golos.';
    else if (total === score) { tally.className = 'tally done'; tally.textContent = 'Todos os golos identificados.'; }
    else tally.textContent = `${total} de ${score} golos identificados · ${score - total} por identificar.`;
  }
  if (!state.saving && $('#save-state').dataset.state !== 'error') setSaveState(isDirty() ? 'dirty' : $('#save-state').dataset.state === 'saved' ? 'saved' : '', isDirty() ? 'Alterações por gravar' : undefined);
}
function setSaveState(kind, text) {
  const el = $('#save-state');
  el.dataset.state = kind;
  if (text !== undefined) el.textContent = text;
  else if (!kind) el.textContent = '';
}
$('#editor').addEventListener('input', event => {
  if (event.target.classList.contains('scorer-name')) { validateName(event.target); showSuggestions(event.target); }
  if ($('#save-state').dataset.state === 'error' || $('#save-state').dataset.state === 'saved') setSaveState('');
  refresh();
});
$('#editor').addEventListener('click', event => {
  const quick = event.target.closest('[data-quick]');
  if (quick) { quickAdd(quick.closest('.scorer-block').dataset.side, quick.dataset.quick); return; }
  const pick = event.target.closest('[data-pick]');
  if (pick) {
    const input = pick.closest('.name-field').querySelector('.scorer-name');
    input.value = pick.dataset.pick; validateName(input); pick.parentElement.hidden = true; refresh();
    input.closest('.scorer-row').querySelector('[data-step="1"]').focus();
    return;
  }
  const add = event.target.closest('[data-add]');
  if (add) { addRow(add.closest('.scorer-block').dataset.side, { ownGoal: add.dataset.add === 'own' }, true); return; }
  const step = event.target.closest('[data-step]');
  if (step) {
    const out = step.closest('.stepper').querySelector('.count');
    const value = Math.min(99, Math.max(1, Number(out.value) + Number(step.dataset.step)));
    out.value = String(value); out.textContent = String(value);
    refresh(); return;
  }
  const remove = event.target.closest('.remove');
  if (remove) {
    const row = remove.closest('.scorer-row'), next = row.nextElementSibling ?? row.previousElementSibling;
    const side = row.closest('.scorer-block');
    row.remove();
    (next?.querySelector('.scorer-name') ?? side.querySelector('[data-add="player"]')).focus();
    refresh();
  }
});
// Enter in a name never saves the result: it closes the suggestions and moves on.
$('#editor').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !event.target.classList?.contains('scorer-name')) return;
  event.preventDefault();
  event.target.parentElement.querySelector('.name-suggest').hidden = true;
  event.target.closest('.scorer-row').querySelector('[data-step="1"]').focus();
});
$('#editor').addEventListener('focusout', event => {
  if (event.target.classList?.contains('scorer-name')) setTimeout(() => { if (!event.target.parentElement.contains(document.activeElement)) event.target.parentElement.querySelector('.name-suggest').hidden = true; }, 150);
});
$('#close-editor').addEventListener('click', () => {
  if (isDirty() && !confirm('Fechar sem gravar as alterações?')) return;
  $('#editor').hidden = true; state.matchId = null; state.initial = null; renderMatches();
});

function validateName(input) {
  const row = input.closest('.scorer-row'), own = row.dataset.own === 'true', value = input.value.replace(/\s+/g, ' ').trim();
  let message = '';
  if (!value && !own) message = 'Escreve o nome ou remove a linha.';
  else if (value && !NAME.test(value)) message = 'Só letras, espaços, apóstrofo, hífen ou ponto (sem números, vírgulas ou parênteses).';
  else if (value && !own) {
    const side = input.closest('.scorer-block');
    const same = [...side.querySelectorAll('.scorer-row:not(.own) .scorer-name')].filter(other => other !== input && fold(other.value) === fold(value));
    if (same.length) message = 'Este nome já está noutra linha. Junta os golos numa só.';
  }
  input.setCustomValidity(message);
  row.querySelector('.error-msg').textContent = message || 'Só letras, espaços, apóstrofo, hífen ou ponto.';
  return !message;
}
function validateAll() {
  const problems = [];
  for (const id of ['#home-goals', '#away-goals']) {
    const input = $(id);
    input.setCustomValidity(/^\d{1,2}$/.test(input.value.trim()) ? '' : 'Golos: número de 0 a 99.');
    if (!input.checkValidity()) problems.push(input);
  }
  for (const input of $('#editor').querySelectorAll('.scorer-name')) if (!validateName(input)) problems.push(input);
  const draft = readDraft();
  for (const side of sides) {
    const total = draft.scorers[side].reduce((n, e) => n + e.goals, 0);
    if (typeof draft[side + 'Goals'] === 'number' && total > draft[side + 'Goals']) problems.push(block(side).querySelector('[data-add="player"]'));
  }
  return problems;
}
$('#editor').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.saving) return;
  const problems = validateAll();
  for (const input of $('#editor').querySelectorAll('input')) syncAria(input);
  if (problems.length) {
    setSaveState('error', 'Há campos para corrigir antes de gravar.');
    problems[0].focus();
    problems[0].reportValidity?.();
    return;
  }
  const draft = readDraft(), payload = { revision: state.data.revision, homeGoals: draft.homeGoals, awayGoals: draft.awayGoals, scorers: draft.scorers };
  const key = JSON.stringify(payload);
  // Same payload after a lost response => same operation id (the server answers "already saved").
  if (!state.op || state.op.key !== key) state.op = { key, id: crypto.randomUUID() };
  state.saving = true;
  const button = $('#save');
  button.disabled = true; button.textContent = 'A gravar…';
  setSaveState('saving', 'A gravar no Excel e a confirmar…');
  try {
    const result = await api(`matches/${state.matchId}`, { method: 'PUT', body: { ...payload, operationId: state.op.id } });
    if (result.status === 401) return;
    if (result.ok) {
      if (result.state) state.data = result.state;
      else return await loadDesk();
      renderAll();
      const id = state.matchId;
      openMatch(id);
      setSaveState('saved', result.repeated ? 'Este resultado já estava gravado.' : 'Resultado gravado ✓ O site já foi atualizado.');
      announcer.textContent = 'Resultado gravado.';
      return;
    }
    setSaveState('error', result.message ?? 'Não foi possível gravar. Nada foi alterado.');
    if (result.status === 409) $('#reload-match').hidden = false;
  } catch {
    setSaveState('error', 'Sem ligação: não foi possível confirmar a gravação. Os teus dados continuam aqui; carrega outra vez em «Gravar resultado».');
  } finally {
    state.saving = false; button.disabled = !state.data?.writable; button.textContent = 'Gravar resultado';
  }
});
$('#reload-match').addEventListener('click', () => loadDesk({ keepDraft: { matchId: state.matchId, draft: readDraft() } }));
addEventListener('beforeunload', event => { if (isDirty() || state.saving) { event.preventDefault(); event.returnValue = ''; } });

// --- confirmations and other operations ---------------------------------------------
function confirmDialog(title, text, okLabel = 'Confirmar') {
  const dialog = $('#confirm');
  $('#confirm-title').textContent = title; $('#confirm-text').textContent = text; $('#confirm-ok').textContent = okLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}
/** Sends one operation; on success replaces the state and re-renders everything. */
async function operation(path, method, body, { button, busy = 'A gravar…' } = {}) {
  if (state.saving) return null;
  state.saving = true;
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = busy; }
  try {
    const result = await api(path, { method, body: { revision: state.data.revision, operationId: crypto.randomUUID(), ...body } });
    if (result.status === 401) return null;
    if (result.ok && result.state) { state.data = result.state; renderAll(); }
    return result;
  } catch { return { ok: false, message: 'Sem ligação: nada foi confirmado. Tenta outra vez.' }; }
  finally { state.saving = false; if (button) { button.disabled = false; button.textContent = label; } }
}
$('#save-date').addEventListener('click', async () => {
  const value = $('#match-date').value, id = state.matchId;
  if (!value) { $('#match-date').focus(); return; }
  if (isDirty()) { setSaveState('error', 'Grava ou desfaz primeiro as alterações do resultado.'); return; }
  const result = await operation(`matches/${id}`, 'PUT', { type: 'date', date: value }, { button: $('#save-date') });
  if (!result) return;
  if (result.ok) { openMatch(id); setSaveState('saved', `Data gravada: ${dateText(value)} ✓`); }
  else { setSaveState('error', result.message); if (result.status === 409) $('#reload-match').hidden = false; }
});
$('#clear-result').addEventListener('click', async () => {
  const m = state.data.matches.find(x => x.id === state.matchId);
  const ok = await confirmDialog('Apagar o resultado?', `${teamName(m.homeId)} ${m.homeGoals ?? '–'}–${m.awayGoals ?? '–'} ${teamName(m.awayId)}. O resultado e os marcadores saem do Excel e do site; o jogo volta a «por realizar». Usa isto só quando o resultado foi lançado no jogo errado.`, 'Apagar resultado');
  if (!ok) return;
  const id = m.id;
  const result = await operation(`matches/${id}`, 'PUT', { type: 'clear' }, { button: $('#clear-result'), busy: 'A apagar…' });
  if (!result) return;
  if (result.ok) { openMatch(id); setSaveState('saved', 'Resultado apagado ✓'); }
  else setSaveState('error', result.message);
});

// --- 2.ª fase -----------------------------------------------------------------------
function renderPhase2() {
  const d = state.data, box = $('#phase2-groups');
  const phase2 = d.groups.filter(g => g.phaseId === 'fase-2');
  const used = new Map(); for (const g of phase2) for (const id of g.teamIds) used.set(id, g.id);
  const candidates = d.teams.filter(t => !t.withdrawn).sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  box.replaceChildren(...phase2.map(g => {
    const locked = d.matches.some(m => m.groupId === g.id && m.status === 'finished');
    const card = document.createElement('form'); card.className = 'card phase2-card'; card.dataset.group = g.id;
    card.innerHTML = `<h3>Série ${g.letter}${g.defined ? '' : ' <small>por definir</small>'}</h3><ol class="slots"></ol><p class="muted small slot-note"></p><button type="submit" class="primary">Gravar equipas</button><p class="message" role="status"></p>`;
    const slots = card.querySelector('.slots');
    const current = [...g.teamIds]; while (current.length < 6) current.push('');
    current.forEach((teamId, i) => {
      const li = document.createElement('li'), select = document.createElement('select');
      select.name = `slot-${i}`; select.setAttribute('aria-label', `Série ${g.letter}, posição ${i + 1}`);
      select.append(option('', '— vazio —', !teamId), ...candidates.filter(t => !used.has(t.id) || used.get(t.id) === g.id).map(t => option(t.id, t.name, t.id === teamId)));
      select.disabled = locked || !d.writable;
      li.append(select); slots.append(li);
    });
    card.querySelector('.slot-note').textContent = locked ? 'Já tem resultados: as equipas ficam fixas.' : 'Posições vazias ficam como folga (sem jogo).';
    card.querySelector('button').disabled = locked || !d.writable;
    return card;
  }));
}
$('#phase2-groups').addEventListener('submit', async event => {
  event.preventDefault();
  const card = event.target, groupId = card.dataset.group, message = card.querySelector('.message');
  const teams = [...card.querySelectorAll('select')].map(s => s.value);
  const g = groupOf(groupId);
  const ok = await confirmDialog(`Gravar equipas da Série ${g.letter}?`, `${teams.filter(Boolean).map(teamName).join(', ') || 'Nenhuma equipa'}. O Excel gera os jogos a partir desta ordem.`, 'Gravar equipas');
  if (!ok) return;
  const result = await operation(`groups/${groupId}/teams`, 'PUT', { teams }, { button: card.querySelector('button') });
  if (!result) return;
  const fresh = document.querySelector(`.phase2-card[data-group="${groupId}"] .message`);
  (fresh ?? message).textContent = result.ok ? 'Equipas gravadas ✓' : result.message;
});

// --- privacy ------------------------------------------------------------------------
function renderPrivacy() {
  const d = state.data, q = fold($('#privacy-search').value), list = $('#privacy-list');
  const rows = d.scorers.filter(s => !q || fold(`${s.name} ${teamName(s.teamId)}`).includes(q)).sort((a, b) => Number(b.hidden) - Number(a.hidden) || a.name.localeCompare(b.name, 'pt-PT')).slice(0, 60);
  list.replaceChildren(...rows.map(s => {
    const li = document.createElement('li'); li.className = s.hidden ? 'is-hidden' : '';
    li.innerHTML = `<span class="who"><strong></strong><small></small></span><button type="button" class="ghost small"></button>`;
    li.querySelector('strong').textContent = s.name;
    li.querySelector('small').textContent = `${teamName(s.teamId)} · ${s.goals} ${s.goals === 1 ? 'golo' : 'golos'}${s.hidden ? ' · oculto no site' : ''}`;
    const button = li.querySelector('button'); button.dataset.scorer = s.id; button.dataset.hide = String(!s.hidden);
    button.textContent = s.hidden ? 'Mostrar' : 'Ocultar nome';
    return li;
  }));
  if (!rows.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: q ? 'Nenhum nome encontrado.' : 'Ainda não há marcadores.' }));
}
$('#privacy-search').addEventListener('input', renderPrivacy);
$('#privacy-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-scorer]');
  if (!button) return;
  const hide = button.dataset.hide === 'true';
  const s = state.data.scorers.find(x => x.id === button.dataset.scorer);
  if (hide && !await confirmDialog(`Ocultar «${s.name}»?`, `O nome deixa de aparecer em todo o site (rankings e jogos). Os golos continuam a contar para ${teamName(s.teamId)}.`, 'Ocultar nome')) return;
  const result = await operation('privacy', 'POST', { scorerId: s.id, hidden: hide }, { button, busy: '…' });
  if (result && !result.ok) announcer.textContent = result.message;
});

// --- players (spellings) -------------------------------------------------------------
const DISMISSED_KEY = 'minho11-admin-dismissed';
const dismissed = () => { try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')); } catch { return new Set(); } };
const suggestionKey = sg => sg.teamId + ':' + sg.names.map(n => n.name).sort().join('|');
function renderPlayers() {
  const d = state.data, box = $('#name-suggestions'), select = $('#players-team');
  const hidden = dismissed();
  const suggestions = d.players.suggestions.filter(sg => !hidden.has(suggestionKey(sg)));
  box.replaceChildren(...suggestions.map(sg => {
    const card = document.createElement('div'); card.className = 'card suggestion'; card.dataset.key = suggestionKey(sg);
    card.innerHTML = '<p class="eyebrow">Possível mesmo jogador</p><strong class="sg-team"></strong><ul class="sg-names"></ul><div class="row-actions"><button type="button" class="primary sg-merge"></button><button type="button" class="ghost small sg-dismiss">Não são o mesmo</button></div>';
    card.querySelector('.sg-team').textContent = teamName(sg.teamId);
    card.querySelector('.sg-names').replaceChildren(...sg.names.map(n => Object.assign(document.createElement('li'), { textContent: `«${n.name}» · ${n.goals} ${n.goals === 1 ? 'golo' : 'golos'} em ${n.matches} ${n.matches === 1 ? 'jogo' : 'jogos'}` })));
    const merge = card.querySelector('.sg-merge'); merge.textContent = `Juntar como «${sg.suggested}»`;
    merge.dataset.team = sg.teamId; merge.dataset.names = JSON.stringify(sg.names.map(n => n.name)); merge.dataset.suggested = sg.suggested;
    return card;
  }));
  const teams = [...new Set(d.players.list.map(p => p.teamId))].sort((a, b) => teamName(a).localeCompare(teamName(b), 'pt-PT'));
  const keep = teams.includes(select.value) ? select.value : suggestions[0]?.teamId ?? teams[0];
  select.replaceChildren(...teams.map(id => option(id, teamName(id), id === keep)));
  renderPlayerList();
}
function renderPlayerList() {
  const d = state.data, teamId = $('#players-team').value, list = $('#players-list');
  const rows = d.players.list.filter(p => p.teamId === teamId).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'pt-PT'));
  list.replaceChildren(...rows.map(p => {
    const li = document.createElement('li');
    li.innerHTML = '<label class="pick"><input type="checkbox"><span class="who"><strong></strong><small></small></span></label><button type="button" class="ghost small fix-name">Corrigir</button>';
    li.querySelector('input').value = p.name;
    li.querySelector('strong').textContent = p.name;
    li.querySelector('small').textContent = `${p.goals} ${p.goals === 1 ? 'golo' : 'golos'} · ${p.matches} ${p.matches === 1 ? 'jogo' : 'jogos'}`;
    li.querySelector('.fix-name').dataset.name = p.name;
    return li;
  }));
  if (!rows.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Esta equipa ainda não tem marcadores identificados.' }));
  updateMergeButton();
}
function updateMergeButton() {
  const n = $('#players-list').querySelectorAll('input:checked').length;
  $('#merge-players').disabled = n < 2 || !state.data.writable;
  $('#players-state').textContent = n ? `${n} ${n === 1 ? 'nome selecionado' : 'nomes selecionados'}` : 'Seleciona dois ou mais nomes do mesmo jogador para os juntar.';
}
async function askRename(teamId, names, suggested) {
  const dialog = $('#rename-dialog'), input = $('#rename-to');
  $('#rename-title').textContent = names.length > 1 ? 'Juntar nomes' : 'Corrigir nome';
  $('#rename-text').textContent = `${teamName(teamId)}: ${names.map(n => `«${n}»`).join(' + ')}. O nome fica corrigido em todos os jogos do Excel; os golos e os resultados não mudam.`;
  input.value = suggested; input.setCustomValidity('');
  dialog.returnValue = ''; dialog.showModal(); input.select();
  const ok = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
  if (!ok) return;
  const to = input.value.replace(/\s+/g, ' ').trim();
  if (!NAME.test(to)) { announcer.textContent = 'Nome inválido.'; return askRename(teamId, names, to); }
  if (names.length === 1 && names[0] === to) return;
  $('#players-state').textContent = 'A gravar no Excel e a confirmar…';
  const result = await operation(`teams/${teamId}/rename`, 'PUT', { from: names, to }, { button: $('#merge-players'), busy: 'A gravar…' });
  if (!result) return;
  $('#players-team').value = teamId; renderPlayerList();
  $('#players-state').textContent = result.ok ? `${result.message} ✓` : result.message;
}
$('#players-team').addEventListener('change', renderPlayerList);
$('#players-list').addEventListener('change', updateMergeButton);
$('#players-list').addEventListener('click', event => {
  const fix = event.target.closest('.fix-name');
  if (fix) askRename($('#players-team').value, [fix.dataset.name], fix.dataset.name);
});
$('#merge-players').addEventListener('click', () => {
  const names = [...$('#players-list').querySelectorAll('input:checked')].map(i => i.value);
  const best = state.data.players.list.filter(p => p.teamId === $('#players-team').value && names.includes(p.name)).sort((a, b) => b.matches - a.matches)[0]?.name ?? names[0];
  askRename($('#players-team').value, names, best);
});
$('#name-suggestions').addEventListener('click', event => {
  const merge = event.target.closest('.sg-merge');
  if (merge) { askRename(merge.dataset.team, JSON.parse(merge.dataset.names), merge.dataset.suggested); return; }
  const dismiss = event.target.closest('.sg-dismiss');
  if (dismiss) {
    const set = dismissed(); set.add(dismiss.closest('.suggestion').dataset.key);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set])); } catch { /* only this visit */ }
    renderPlayers();
  }
});

// --- history ------------------------------------------------------------------------
const LABELS = { rename: 'Nomes juntados', result: 'Resultado', clear: 'Resultado apagado', date: 'Data', teams: 'Equipas da 2.ª fase', hide: 'Nome ocultado', show: 'Nome visível' };
function renderHistory() {
  const d = state.data, list = $('#history-list');
  const when = iso => new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }).format(new Date(iso));
  const score = x => x && x.homeGoals !== null && x.homeGoals !== undefined ? `${x.homeGoals}–${x.awayGoals}` : 'sem resultado';
  list.replaceChildren(...d.history.map(h => {
    const li = document.createElement('li');
    const m = h.matchId && d.matches.find(x => x.id === h.matchId);
    let detail = '';
    if (m) detail = `${teamName(m.homeId)} – ${teamName(m.awayId)} · ${h.type === 'date' ? `${dateText(h.before?.date)} → ${dateText(h.after?.date)}` : `${score(h.before)} → ${score(h.after)}`}`;
    else if (h.scorerId) { const sc = d.scorers.find(x => x.id === h.scorerId); detail = sc ? `${sc.name} · ${teamName(sc.teamId)}` : 'registo sem golos atuais'; }
    else if (h.type === 'rename') detail = `${teamName(h.teamId)}: ${(h.before ?? []).join(' + ')} → ${h.after}`;
    else if (h.groupId) detail = `Série ${groupOf(h.groupId)?.letter}: ${(h.after ?? []).map(teamName).join(', ')}`;
    li.innerHTML = '<time></time><strong></strong><span></span>';
    li.querySelector('time').textContent = when(h.savedAt);
    li.querySelector('strong').textContent = LABELS[h.type] ?? h.type;
    li.querySelector('span').textContent = detail;
    return li;
  }));
  if (!d.history.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Ainda não houve alterações feitas pelo painel.' }));
}

// --- start --------------------------------------------------------------------------
(async () => {
  try {
    const status = await api('status');
    if (!status.configured) { $('#loading').innerHTML = '<div class="card"><h1>Gestão ainda não ativada</h1><p class="muted">A palavra-passe de gestão ainda não foi configurada no servidor.</p></div>'; return; }
    if (!status.authenticated) { requireLogin(''); return; }
    await loadDesk();
  } catch { $('#loading').innerHTML = '<p class="banner banner-error">Sem ligação ao servidor. Recarrega a página.</p>'; }
})();
