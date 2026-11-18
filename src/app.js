import { validateDataset } from './domain.js';
import { renderView, pageTitle, prefs, tabBar } from './views.js';
import { setupInstall } from './install.js';

setupInstall();
// Offline support: network first, last seen pages and data when there is no signal (see sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

let data = null, refreshing = false;
const main = document.getElementById('conteudo');
const sync = document.getElementById('sync-status');
// Stale-data banner under the header: the footer status is easy to miss on a phone at the pitch.
const banner = document.getElementById('data-banner');
const showBanner = text => {
  if (!banner) return;
  const appearing = banner.hidden && !!text;
  banner.textContent = text ?? ''; banner.hidden = !text;
  // Scroll anchoring would push the page down by the banner's height and hide it under the sticky header.
  if (appearing && scrollY <= banner.offsetHeight + 40) scrollTo({ top: 0, behavior: 'instant' });
};
const dialog = document.getElementById('search-dialog');
const mobileNav = document.getElementById('mobile-navigation');
const moreSheet = document.getElementById('more-sheet');
let manualTheme = false;
try { prefs.myTeam = localStorage.getItem('minho11-team'); } catch { /* No saved team: the page asks again. */ }
function follow(teamId) {
  prefs.myTeam = teamId;
  try { localStorage.setItem('minho11-team', teamId); } catch { /* Kept for this visit only. */ }
}
try { manualTheme = ['dark', 'light'].includes(localStorage.getItem('minho11-theme')); } catch { /* System preference remains available. */ }

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0b1219' : '#f3f5f0';
  document.querySelector('[data-theme-toggle]')?.setAttribute('aria-label', `Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`);
  if (persist) { manualTheme = true; try { localStorage.setItem('minho11-theme', theme); } catch { /* Theme still changes for this visit. */ } }
}
applyTheme(document.documentElement.dataset.theme);
matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => { if (!manualTheme) applyTheme(event.matches ? 'light' : 'dark'); });

function closeMenu() {
  mobileNav.hidden = true;
  document.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded', 'false');
}
function paint({ focusHeading = false, preserveFocus = false } = {}) {
  if (!data) return;
  const active = document.activeElement;
  const selection = preserveFocus && active?.name ? { name: active.name, start: active.selectionStart, end: active.selectionEnd } : null;
  main.innerHTML = renderView(data, new URL(location.href));
  document.title = pageTitle(data, location.pathname.replace(/\/$/, '') || '/');
  document.getElementById('tab-bar')?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: tabBar(data, location.pathname.replace(/\/$/, '') || '/') }).content);
  document.querySelectorAll('.desktop-nav a').forEach(link => {
    const selected = link.pathname === '/' ? location.pathname === '/' : location.pathname.startsWith(link.pathname);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (selection) {
    const replacement = [...main.querySelectorAll('[name]')].find(el => el.name === selection.name);
    replacement?.focus({ preventScroll: true });
    if (replacement?.setSelectionRange && selection.start !== null) replacement.setSelectionRange(selection.start, selection.end);
  }
  if (focusHeading) main.querySelector('h1')?.focus({ preventScroll: true });
}
function navigate(url, { replace = false, filters = false } = {}) {
  if (!data) { location.href = url.href; return; }
  const previousScroll = scrollY;
  history[replace ? 'replaceState' : 'pushState']({ minho11: true }, '', url.pathname + url.search + url.hash);
  if (dialog.open) dialog.close();
  if (moreSheet?.open) moreSheet.close();
  closeMenu();
  const update = () => { paint({ focusHeading: !filters, preserveFocus: filters }); if (!filters) scrollTo({ top: 0, behavior: 'instant' }); else scrollTo({ top: previousScroll, behavior: 'instant' }); };
  // Smooth cross-fade between pages where supported; filters update in place without animation.
  if (!filters && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(update);
  else update();
}

document.addEventListener('click', event => {
  // Charts: tap (or click) a round to pin its weekend card; tap elsewhere to close it.
  // Phones: standings always open simple; the detailed view (badges + every column) only on request, never remembered.
  const toggle = event.target.closest('[data-table-toggle]');
  if (toggle) {
    const wrap = toggle.closest('.standings-wrap'), detailed = !wrap.classList.contains('is-detailed');
    wrap.classList.toggle('is-detailed', detailed);
    toggle.setAttribute('aria-pressed', String(detailed));
    toggle.querySelector('span').textContent = detailed ? 'Ver classificação simples' : 'Ver classificação detalhada';
    return;
  }
  const col = event.target.closest('[data-chart-col]');
  document.querySelectorAll('[data-chart-col].is-active').forEach(el => { if (el !== col) el.classList.remove('is-active'); });
  if (col) { col.classList.toggle('is-active'); return; }
  const theme = event.target.closest('[data-theme-toggle]');
  if (theme) { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true); return; }
  if (event.target.closest('[data-more-open]')) { moreSheet.showModal(); return; }
  if (event.target.closest('[data-more-close]') || event.target === moreSheet) { moreSheet.close(); return; }
  if (event.target.closest('[data-search-open]')) { if (moreSheet.open) moreSheet.close(); dialog.showModal(); dialog.querySelector('input')?.focus(); return; }
  if (event.target.closest('[data-search-close]') || event.target === dialog) { dialog.close(); return; }
  if (event.target.closest('[data-menu-toggle]')) { mobileNav.hidden = !mobileNav.hidden; document.querySelector('[data-menu-toggle]').setAttribute('aria-expanded', String(!mobileNav.hidden)); return; }
  const followed = event.target.closest('[data-follow]');
  if (followed && data && !(event.metaKey || event.ctrlKey || event.shiftKey)) { event.preventDefault(); follow(followed.dataset.follow); navigate(new URL('/minha-equipa', location.href), { replace: followed.tagName === 'BUTTON' }); return; }
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.hash || !data) return;
  event.preventDefault();
  const keep = link.hasAttribute('data-keep-scroll');
  navigate(url, { filters: keep });
  if (keep) main.querySelector('[data-keep-scroll][aria-current="true"]')?.focus({ preventScroll: true });
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'get' || !data) return;
  const url = new URL(form.action);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  for (const [key, value] of new FormData(form)) if (value) url.searchParams.set(key, value);
  navigate(url, { filters: form.closest('main') !== null });
});
function filterChanged(event) {
  if (!event.target.matches('[data-filter]') || !data) return;
  const form = event.target.closest('form');
  if (!form) return;
  const url = new URL(form.action);
  for (const [key, value] of new FormData(form)) if (value) url.searchParams.set(key, value);
  navigate(url, { replace: event.type === 'input', filters: true });
}
document.addEventListener('change', filterChanged);
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement && event.target.classList.contains('person-image')) event.target.hidden = true; }, true);
document.addEventListener('input', event => { if (event.target.matches('input[data-filter]')) filterChanged(event); });
addEventListener('popstate', () => { closeMenu(); if (dialog.open) dialog.close(); paint({ focusHeading: true }); });

export async function refreshData() {
  if (refreshing) return;
  refreshing = true;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  let invalid = false;
  try {
    const response = await fetch('/data/competition.json', { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let incoming;
    try { incoming = validateDataset(await response.json()); } catch (error) { invalid = true; throw error; }
    const changed = !data || incoming.version !== data.version;
    data = incoming;
    if (changed) paint({ preserveFocus: true });
    const checked = new Intl.DateTimeFormat('pt-PT', { timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date());
    const imported = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(data.importedAt));
    const sourceState = response.headers.get('X-MINHO11-Source');
    sync.textContent = sourceState === 'offline' ? `Sem rede · últimos dados guardados (${imported})` : sourceState === 'snapshot' ? `Dados publicados em ${imported}` : sourceState === 'stale' ? 'Fonte indisponível · últimos dados mantidos' : `${changed ? 'Dados atualizados' : 'Sem alterações'} · verificado às ${checked}`;
    sync.title = `Última importação publicada: ${imported}. Verificação de novos dados a cada 45 segundos.`;
    sync.classList.remove('sync-error');
    showBanner(sourceState === 'offline' ? `Sem rede. Estás a ver os últimos dados guardados (${imported}).` : sourceState === 'stale' ? `A fonte dos resultados não respondeu. Estás a ver os últimos dados (${imported}).` : '');
    sync.dataset.state = changed ? 'updated' : 'unchanged';
  } catch (error) {
    sync.textContent = invalid ? 'Nova versão inválida · últimos dados mantidos' : 'Sincronização indisponível · últimos dados mantidos';
    sync.classList.add('sync-error');
    showBanner(invalid ? 'Chegaram dados novos com erros. Continuas a ver os anteriores.' : 'Não foi possível atualizar. Os resultados podem não ser os mais recentes.');
    sync.dataset.state = invalid ? 'invalid' : 'unavailable';
    console.warn('MINHO11: sincronização não concluída.', error.message);
  } finally { clearTimeout(timer); refreshing = false; }
}
const oldRoutes = { inicio: '/', jogos: '/jogos', clubes: '/clubes', marcadores: '/marcadores', classificacoes: '/competicoes/gomes-ribeiro-sub11/fase-1/serie-a' };
if (oldRoutes[location.hash.slice(1)]) history.replaceState(null, '', oldRoutes[location.hash.slice(1)]);
await refreshData();
setInterval(() => { if (!document.hidden) refreshData(); }, 45000);
addEventListener('online', refreshData);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });
