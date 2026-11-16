/**
 * Configures production secrets WITHOUT showing them on screen or writing them to the repository.
 *
 *   npm run configure:production -- ~/Downloads/chave.json            check Drive, ask password, set Netlify env vars
 *   npm run configure:production -- ~/Downloads/chave.json --check    only check Drive access (read-only)
 *
 * Requires the folder to be linked to the Netlify site first: npx netlify-cli@27.16.1 link
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DriveSource } from '../server/sources.js';
import { importCompetition } from '../lib/competition.js';
import { hashPassword } from '../server/auth.js';

const NETLIFY = ['-y', 'netlify-cli@27.16.1'];
const config = JSON.parse(fs.readFileSync(new URL('../config/competition.json', import.meta.url)));
const [keyPath] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const checkOnly = process.argv.includes('--check');
const stop = message => { console.error(`\n✖ ${message}`); process.exit(1); };

if (!keyPath) stop('Indica o caminho do ficheiro JSON da conta de serviço. Ex.: npm run configure:production -- ~/Downloads/minho11-xxxx.json');
let credentials;
try { credentials = JSON.parse(fs.readFileSync(keyPath.replace(/^~/, process.env.HOME), 'utf8')); } catch { stop('Não consegui ler esse ficheiro JSON.'); }
if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) stop('O ficheiro não é uma chave de conta de serviço Google.');
console.log(`Conta de serviço: ${credentials.client_email}`);

// 1. Prove the site will be able to read AND edit the right file.
const source = new DriveSource({ fileId: config.drive.fileId, credentials });
let meta;
try { meta = await source.meta(); }
catch (error) { stop(`${error.message}\n  → No Google Drive, partilha o ficheiro «AFVC_Torneio_…Completo.xlsx» com ${credentials.client_email} como Editor (e confirma que a Google Drive API está ativa no projeto).`); }
const read = await source.read();
const { data, report } = importCompetition(read.bytes, config, {});
console.log(`✓ Excel lido: «${meta.name}» · ${data.stats.matches} jogos, ${data.stats.played} com resultado, ${data.stats.goals} golos · ${report.issues.filter(i => i.level === 'warning').length} avisos`);
if (!meta.canEdit) stop(`A conta de serviço só tem leitura. Muda a partilha de ${credentials.client_email} para Editor.`);
console.log('✓ Permissão de edição confirmada (nada foi gravado).');
if (checkOnly) process.exit(0);

// The folder must be linked to the Netlify site before anything is stored.
const status = spawnSync('npx', [...NETLIFY, 'status', '--json'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
let linked = null; try { linked = JSON.parse(status.stdout)?.siteData?.['site-name'] ?? null; } catch { /* not linked */ }
if (!linked) stop('Esta pasta ainda não está ligada ao site. Corre «npx netlify-cli@27.16.1 link», escolhe o site minho11, e depois repete este comando.');
console.log(`✓ Pasta ligada ao site Netlify: ${linked}`);

// 2. Shared password for the results desk (never echoed).
/** Reads a secret from the keyboard showing • for each character (Backspace works, Ctrl+C cancels). */
function ask(question) {
  return new Promise(resolve => {
    const input = process.stdin;
    process.stdout.write(question);
    if (!input.isTTY) { let data = ''; input.setEncoding('utf8'); input.on('data', c => { data += c; }); input.on('end', () => resolve(data.split('\n')[0])); return; }
    let value = '';
    input.setRawMode(true); input.resume(); input.setEncoding('utf8');
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { input.setRawMode(false); input.pause(); input.off('data', onData); process.stdout.write('\n'); resolve(value); return; }
        if (char === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (char === '\u007f' || char === '\b') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (char >= ' ') { value += char; process.stdout.write('•'); }
      }
    };
    input.on('data', onData);
  });
}
const password = await ask('Palavra-passe do painel (mín. 10 caracteres): ');
if (password.length < 10) stop('A palavra-passe precisa de pelo menos 10 caracteres.');
if (password !== await ask('Repete a palavra-passe: ')) stop('As palavras-passe não coincidem.');
const values = {
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials),
  ADMIN_PASSWORD_HASH: await hashPassword(password),
  ADMIN_SESSION_SECRET: randomBytes(32).toString('base64url'),
};
const total = Object.entries(values).reduce((n, [k, v]) => n + k.length + v.length, 0);
if (total > 3800) stop('As variáveis excedem o limite de 4 KB das funções Netlify.');

// 3. Store them in Netlify (production context, all scopes: per-scope limits are a paid feature) — values passed as arguments, never printed.
for (const [name, value] of Object.entries(values)) {
  const result = spawnSync('npx', [...NETLIFY, 'env:set', name, value, '--context', 'production', '--secret', '--force'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) stop(`Não foi possível gravar ${name} na Netlify. Confirma que fizeste «npx netlify-cli@27.16.1 login» e «… link» nesta pasta.\n${(result.stderr || '').split('\n').filter(l => !l.includes(value)).slice(-5).join('\n')}`);
  const said = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n').map(l => l.replace(value, '«valor oculto»').trim()).filter(l => l && !l.includes(value.slice(0, 12)));
  console.log(`→ ${name}: ${said.slice(-3).join(' | ') || '(sem resposta do CLI)'}`);
}
// Confirm on Netlify (names only) instead of trusting the CLI exit code.
const listed = spawnSync('npx', [...NETLIFY, 'env:list', '--json', '--context', 'production'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
let names = [];
try { names = Object.keys(JSON.parse(listed.stdout)); } catch { /* handled below */ }
const missing = Object.keys(values).filter(n => !names.includes(n));
if (missing.length) stop(`A Netlify não confirmou: ${missing.join(', ')}. Corre «npx netlify-cli@27.16.1 link», escolhe o site minho11 e repete este comando.`);
console.log('✓ Confirmado na Netlify: as 3 variáveis existem (só nomes verificados).');
console.log('\nFeito. Falta publicar de novo o site para as variáveis entrarem em vigor.');
