import { validateDataset } from './domain.js';
import { renderView, pageTitle } from './views.js';

let data = null, refreshing = false;
const main = document.getElementById('conteudo');
const sync = document.getElementById('sync-status');
const dialog = document.getElementById('search-dialog');
const mobileNav = document.getElementById('mobile-navigation');
let manualTheme = false;
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
  closeMenu();
  paint({ focusHeading: !filters, preserveFocus: filters });
  if (!filters) scrollTo({ top: 0, behavior: 'instant' }); else scrollTo({ top: previousScroll, behavior: 'instant' });
}

document.addEventListener('click', event => {
  const theme = event.target.closest('[data-theme-toggle]');
  if (theme) { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true); return; }
  if (event.target.closest('[data-search-open]')) { dialog.showModal(); dialog.querySelector('input')?.focus(); return; }
  if (event.target.closest('[data-search-close]') || event.target === dialog) { dialog.close(); return; }
  if (event.target.closest('[data-menu-toggle]')) { mobileNav.hidden = !mobileNav.hidden; document.querySelector('[data-menu-toggle]').setAttribute('aria-expanded', String(!mobileNav.hidden)); return; }
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.hash || !data) return;
  event.preventDefault();
  navigate(url);
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
    sync.textContent = `${changed ? 'Dados atualizados' : 'Sem alterações'} · verificado às ${checked}`;
    sync.title = `Última importação publicada: ${imported}. Verificação de novos dados a cada 45 segundos.`;
    sync.classList.remove('sync-error');
    sync.dataset.state = changed ? 'updated' : 'unchanged';
  } catch (error) {
    sync.textContent = invalid ? 'Nova versão inválida · últimos dados mantidos' : 'Sincronização indisponível · últimos dados mantidos';
    sync.classList.add('sync-error');
    sync.dataset.state = invalid ? 'invalid' : 'unavailable';
    console.warn('MINHO11: sincronização não concluída.', error.message);
  } finally { clearTimeout(timer); refreshing = false; }
}
const oldRoutes = { inicio: '/', jogos: '/jogos', clubes: '/clubes', marcadores: '/marcadores', classificacoes: '/competicoes/gomes-ribeiro-sub11/serie-a' };
if (oldRoutes[location.hash.slice(1)]) history.replaceState(null, '', oldRoutes[location.hash.slice(1)]);
await refreshData();
setInterval(() => { if (!document.hidden) refreshData(); }, 45000);
addEventListener('online', refreshData);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });
