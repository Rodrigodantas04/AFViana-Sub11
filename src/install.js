/**
 * "Add to home screen" for the public site and the desk. Android/desktop Chrome: the browser's own install prompt.
 * iPhone/iPad (no prompt API): a short help dialog. Nothing shows once the app is already installed.
 */
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupInstall({ buttons = '[data-install]', help = '#install-help' } = {}) {
  let deferred = null;
  const show = on => document.querySelectorAll(buttons).forEach(button => { button.hidden = !on; });
  if (standalone()) { show(false); return; }
  if (ios()) show(true);
  addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event; show(true); });
  addEventListener('appinstalled', () => { deferred = null; show(false); });
  document.addEventListener('click', async event => {
    if (!event.target.closest(buttons)) return;
    document.querySelector('#more-sheet[open]')?.close();
    if (deferred) { deferred.prompt(); const { outcome } = await deferred.userChoice; if (outcome === 'accepted') show(false); deferred = null; return; }
    document.querySelector(help)?.showModal();
  });
  document.addEventListener('click', event => { const dialog = event.target.closest(help); if (dialog && (event.target === dialog || event.target.closest('[data-install-close]'))) dialog.close(); });
}

/** The help dialog for iPhone/iPad, shared by the site and the desk. */
export const installHelp = appName => `<dialog id="install-help" class="install-help" aria-labelledby="install-title"><h2 id="install-title">Instalar ${appName}</h2><ol><li>Toca em <span style="white-space:nowrap"><strong>Partilhar</strong> <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="(quadrado com seta para cima)"><path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5v10h14V11h-1"/></svg></span> no Safari.</li><li>Escolhe <strong>Adicionar ao ecrã principal</strong>.</li><li>Toca em <strong>Adicionar</strong>. O ícone aparece junto das outras apps.</li></ol><button type="button" class="button" data-install-close>Percebi</button></dialog>`;
