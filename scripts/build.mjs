import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataset } from '../src/domain.js';
import { renderView, pageTitle, header, footer } from '../src/views.js';
import { esc } from '../src/components.js';

const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, 'dist');
const data = validateDataset(JSON.parse(await fs.readFile(path.join(root, 'data/public/competition.json'), 'utf8')));
const routes = ['/', '/competicoes', `/competicoes/${data.competition.slug}`, '/jogos', '/clubes', '/marcadores', '/estatisticas', ...data.groups.map(g => `/competicoes/${data.competition.slug}/serie-${g.id.toLowerCase()}`), ...data.matches.map(m => `/jogos/${m.id}`), ...data.clubs.map(c => `/clubes/${c.slug}`)];
const base = process.env.SITE_URL || process.env.URL || '';
if (base && !/^https?:\/\//.test(base)) throw new Error('SITE_URL deve ser um URL HTTP(S) absoluto.');
const baseUrl = base ? new URL(base).origin : '';
const description = 'Resultados, classificações e protagonistas do futebol de formação do Alto Minho. Torneio Gomes Ribeiro Sub-11.';
await fs.mkdir(output, { recursive: true });
// Build only into the public directory. No copying of the repository or private source.
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, 'assets'), { recursive: true });
await fs.mkdir(path.join(output, 'data'), { recursive: true });
for (const name of ['app.js', 'theme.js', 'views.js', 'components.js', 'domain.js', 'styles.css']) await fs.copyFile(path.join(root, 'src', name), path.join(output, 'assets', name));
await fs.copyFile(path.join(root, 'data/public/competition.json'), path.join(output, 'data/competition.json'));
await fs.copyFile(path.join(root, 'assets/social.png'), path.join(output, 'social.png'));
const photos = new Set((data.rosters ?? []).flatMap(r => [...r.players, ...r.staff]).map(p => p.photoPath).filter(Boolean));
if (photos.size) await fs.mkdir(path.join(output, 'media'), { recursive: true });
for (const photo of photos) {
  if (!/^\/media\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(photo)) throw new Error('Caminho de imagem não autorizado.');
  await fs.copyFile(path.join(root, 'assets', photo), path.join(output, photo));
}
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#c4fa58"/><text x="32" y="47" text-anchor="middle" fill="#142105" font-family="Arial,sans-serif" font-weight="900" font-size="43" letter-spacing="-6">11</text></svg>';
await fs.writeFile(path.join(output, 'favicon.svg'), favicon);
await fs.writeFile(path.join(output, 'social.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b1219"/><rect x="900" width="300" height="630" fill="#c4fa58"/><text x="70" y="130" fill="#c4fa58" font-family="Arial" font-size="32" font-weight="700">MINHO11</text><text x="70" y="310" fill="#fff" font-family="Arial" font-weight="900" font-size="82">O FUTEBOL</text><text x="70" y="410" fill="#c4fa58" font-family="Arial" font-weight="900" font-size="82">COMEÇA AQUI.</text><text x="70" y="550" fill="#a3b3ba" font-family="Arial" font-size="24">Futebol de formação · Alto Minho</text></svg>');
function html(route, is404 = false) {
  const title = is404 ? 'Página não encontrada · MINHO11' : pageTitle(data, route);
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1219"><meta name="description" content="${esc(description)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:locale" content="pt_PT">${baseUrl && !is404 ? `<link rel="canonical" href="${esc(baseUrl + route)}"><meta property="og:url" content="${esc(baseUrl + route)}"><meta property="og:image" content="${esc(baseUrl + '/social.png')}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ''}<title>${esc(title)}</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"><script src="/assets/theme.js"></script><link rel="stylesheet" href="/assets/styles.css"><script type="module" src="/assets/app.js"></script></head><body>${header(data, route)}<main id="conteudo" class="shell">${renderView(data, new URL(route, 'http://minho11.local'))}</main>${footer(data)}<noscript><p class="shell notice">A navegação e os dados publicados estão disponíveis. Ativa JavaScript para alternar o tema, pesquisar sem recarregar e receber novas atualizações.</p></noscript></body></html>`;
}
for (const route of routes) {
  const directory = path.join(output, route);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'index.html'), html(route));
}
await fs.writeFile(path.join(output, '404.html'), html('/404', true));
await fs.writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n${baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : ''}`);
if (baseUrl) await fs.writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(r => `<url><loc>${esc(baseUrl + r)}</loc></url>`).join('')}</urlset>`);
await fs.writeFile(path.join(output, '_headers'), '/data/competition.json\n  Cache-Control: no-cache, no-store, must-revalidate\n/assets/*\n  Cache-Control: public, max-age=0, must-revalidate\n');
console.log(`MINHO11: ${routes.length} páginas pré-renderizadas. Fonte Excel e relatório interno fora de dist/.`);
