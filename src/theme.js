// Runs before CSS is painted. Storage can be unavailable in private/locked-down browsers.
(() => {
  let theme;
  try { theme = localStorage.getItem('minho11-theme'); } catch { /* Fall back to the system. */ }
  if (!['dark', 'light'].includes(theme)) theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1219' : '#f3f5f0');
})();
