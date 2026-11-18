import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataset, groupPath } from '../src/domain.js';
import { renderView, pageTitle, header, footer, tabBar } from '../src/views.js';
import { esc } from '../src/components.js';

const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, 'dist');
// Static HTML is always rendered from the repository snapshot, which has no children's names.
const data = validateDataset(JSON.parse(await fs.readFile(path.join(root, 'data/public/competition.json'), 'utf8')));
const livePath = path.join(root, 'data/internal/live.json');
const liveData = await fs.readFile(livePath, 'utf8').then(text => validateDataset(JSON.parse(text)) && text).catch(() => null);
const base = `/competicoes/${data.competition.slug}`;
const routes = ['/', '/minha-equipa', '/competicoes', base, '/jogos', '/clubes', '/marcadores', '/estatisticas', '/privacidade', '/comparar', ...data.phases.map(p => `${base}/${p.id}`), ...data.groups.map(g => groupPath(data, g.id)), ...data.matches.map(m => `/jogos/${m.id}`), ...data.clubs.map(c => `/clubes/${c.slug}`)];
const siteUrl = process.env.SITE_URL || process.env.URL || '';
if (siteUrl && !/^https?:\/\//.test(siteUrl)) throw new Error('SITE_URL deve ser um URL HTTP(S) absoluto.');
const baseUrl = siteUrl ? new URL(siteUrl).origin : '';
const description = 'Resultados, classificações e protagonistas do futebol de formação do Alto Minho. Torneio Gomes Ribeiro Sub-11.';
await fs.mkdir(output, { recursive: true });
// Build only into the public directory. No copying of the repository or private source.
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, 'assets'), { recursive: true });
await fs.mkdir(path.join(output, 'data'), { recursive: true });
for (const name of ['app.js', 'theme.js', 'views.js', 'components.js', 'domain.js', 'install.js', 'styles.css']) await fs.copyFile(path.join(root, 'src', name), path.join(output, 'assets', name));
// Installable app (PWA): icons, one manifest for the site and one for the desk, and the offline-first worker.
await fs.cp(path.join(root, 'assets/app'), path.join(output, 'app'), { recursive: true });
await fs.copyFile(path.join(root, 'src/sw.js'), path.join(output, 'sw.js'));
const icons = prefix => [{ src: `/app/${prefix}192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `/app/${prefix}512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: `/app/${prefix}maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
await fs.writeFile(path.join(output, 'manifest.webmanifest'), JSON.stringify({ id: '/', name: 'MINHO11 · O futebol começa aqui', short_name: 'MINHO11', description: 'Resultados, classificações e marcadores do futebol de formação do Alto Minho.', lang: 'pt-PT', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', background_color: '#0b1219', theme_color: '#0b1219', icons: icons('icon-'), shortcuts: [['A minha equipa', '/minha-equipa'], ['Jogos', '/jogos'], ['Marcadores', '/marcadores'], ['Classificações', '/competicoes']].map(([name, url]) => ({ name, url, icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] })) }, null, 2));
for (const name of ['admin.js', 'admin.css']) await fs.copyFile(path.join(root, 'src', name), path.join(output, 'assets', name));
await fs.mkdir(path.join(output, 'admin'), { recursive: true });
await fs.copyFile(path.join(root, 'src/admin.html'), path.join(output, 'admin/index.html'));
await fs.writeFile(path.join(output, 'admin/manifest.webmanifest'), JSON.stringify({ id: '/admin/', name: 'MINHO11 Gestão', short_name: 'Gestão M11', description: 'Lançar resultados e marcadores do MINHO11.', lang: 'pt-PT', start_url: '/admin/', scope: '/admin/', display: 'standalone', orientation: 'portrait', background_color: '#0b1219', theme_color: '#0b1219', icons: icons('admin-') }, null, 2));
// Local previews may use the private live projection (dist/ is never committed); deployments serve it from the server.
if (liveData && !process.env.NETLIFY) await fs.writeFile(path.join(output, 'data/competition.json'), liveData);
else await fs.copyFile(path.join(root, 'data/public/competition.json'), path.join(output, 'data/competition.json'));
await fs.copyFile(path.join(root, 'assets/social.png'), path.join(output, 'social.png'));
// Club crests: only registered files with source + authorisation (see config/crests.json).
const crestConfig = JSON.parse(await fs.readFile(path.join(root, 'config/crests.json'), 'utf8'));
for (const club of data.clubs.filter(c => c.crestUrl)) {
  const entry = crestConfig.clubs[club.id];
  if (!entry || `/media/crests/${path.basename(entry.file)}` !== club.crestUrl) throw new Error(`Emblema sem registo: ${club.id}`);
  await fs.mkdir(path.join(output, 'media/crests'), { recursive: true });
  await fs.copyFile(path.join(root, entry.file), path.join(output, club.crestUrl));
}
const photos = new Set((data.rosters ?? []).flatMap(r => [...r.players, ...r.staff]).map(p => p.photoPath).filter(Boolean));
if (photos.size) await fs.mkdir(path.join(output, 'media'), { recursive: true });
for (const photo of photos) {
  if (!/^\/media\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(photo)) throw new Error('Caminho de imagem não autorizado.');
  await fs.copyFile(path.join(root, 'assets', photo), path.join(output, photo));
}
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1219"/><g transform="translate(10 5) scale(1.571)"><path fill="#c4fa58" d="M0 0h28v25.74L14 33 0 25.74Z"/><path fill="#142105" d="M10.55 6.1h3.58v17h-3.58V11.2l-3.01 2.72V8.48ZM18.37 6.1h3.58v17h-3.58V11.2l-3.01 2.72V8.48Z"/></g></svg>';
await fs.writeFile(path.join(output, 'favicon.svg'), favicon);
await fs.writeFile(path.join(output, 'social.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b1219"/><rect x="900" width="300" height="630" fill="#c4fa58"/><text x="70" y="130" fill="#c4fa58" font-family="Arial" font-size="32" font-weight="700">MINHO11</text><text x="70" y="310" fill="#fff" font-family="Arial" font-weight="900" font-size="82">O FUTEBOL</text><text x="70" y="410" fill="#c4fa58" font-family="Arial" font-weight="900" font-size="82">COMEÇA AQUI.</text><text x="70" y="550" fill="#a3b3ba" font-family="Arial" font-size="24">Futebol de formação · Alto Minho</text></svg>');
function html(route, is404 = false) {
  const title = is404 ? 'Página não encontrada · MINHO11' : pageTitle(data, route);
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="text-scale" content="scale"><meta name="theme-color" content="#0b1219"><meta name="description" content="${esc(description)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:locale" content="pt_PT">${baseUrl && !is404 ? `<link rel="canonical" href="${esc(baseUrl + route)}"><meta property="og:url" content="${esc(baseUrl + route)}"><meta property="og:image" content="${esc(baseUrl + '/social.png')}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ''}<title>${esc(title)}</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/app/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="MINHO11"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><script src="/assets/theme.js"></script><link rel="stylesheet" href="/assets/styles.css"><script type="module" src="/assets/app.js"></script></head><body>${header(data, route)}<div id="data-banner" class="data-banner shell" role="status" hidden></div><main id="conteudo" class="shell">${renderView(data, new URL(route, 'http://minho11.local'))}</main>${footer(data)}${tabBar(data, route)}<noscript><p class="shell notice">A navegação e os dados publicados estão disponíveis. Ativa JavaScript para alternar o tema, pesquisar sem recarregar e receber novas atualizações.</p></noscript></body></html>`;
}
for (const route of routes) {
  const directory = path.join(output, route);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'index.html'), html(route));
}
await fs.writeFile(path.join(output, '404.html'), html('/404', true));
// Player profiles exist only with live data: one generic, non-indexed shell for every /jogadores/<id>.
await fs.mkdir(path.join(output, 'jogadores'), { recursive: true });
await fs.writeFile(path.join(output, 'jogadores/index.html'), html('/jogadores/-').replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="robots" content="noindex, nofollow">'));
await fs.writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /jogadores/\n${baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : ''}`);
if (baseUrl) await fs.writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(r => `<url><loc>${esc(baseUrl + r)}</loc></url>`).join('')}</urlset>`);
await fs.writeFile(path.join(output, '_redirects'), data.groups.filter(g => g.phaseId === 'fase-1').map(g => `${base}/serie-${g.letter.toLowerCase()} ${groupPath(data, g.id)} 301`).join('\n') + '\n/jogadores/*  /jogadores/index.html  200\n');
await fs.writeFile(path.join(output, '_headers'), '/jogadores/*\n  X-Robots-Tag: noindex, nofollow\n/manifest.webmanifest\n  Content-Type: application/manifest+json\n/admin/manifest.webmanifest\n  Content-Type: application/manifest+json\n/sw.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: /\n/data/competition.json\n  Cache-Control: no-cache, no-store, must-revalidate\n/assets/*\n  Cache-Control: public, max-age=0, must-revalidate\n');
console.log(`MINHO11: ${routes.length} páginas pré-renderizadas. Fonte Excel e relatório interno fora de dist/.`);
