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
import readline from 'node:readline';
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

// 2. Shared password for the results desk (never echoed).
function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}
const password = await ask('Palavra-passe do painel (mín. 10 caracteres, não aparece): ');
if (password !== await ask('Repete a palavra-passe: ')) stop('As palavras-passe não coincidem.');
const values = {
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials),
  ADMIN_PASSWORD_HASH: await hashPassword(password),
  ADMIN_SESSION_SECRET: randomBytes(32).toString('base64url'),
};
const total = Object.entries(values).reduce((n, [k, v]) => n + k.length + v.length, 0);
if (total > 3800) stop('As variáveis excedem o limite de 4 KB das funções Netlify.');

// 3. Store them in Netlify (functions scope, production) — values passed as arguments, never printed.
for (const [name, value] of Object.entries(values)) {
  const result = spawnSync('npx', [...NETLIFY, 'env:set', name, value, '--context', 'production', '--scope', 'functions', '--secret', '--force'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) stop(`Não foi possível gravar ${name} na Netlify. Confirma que fizeste «npx netlify-cli@27.16.1 login» e «… link» nesta pasta.\n${(result.stderr || '').split('\n').filter(l => !l.includes(value)).slice(-5).join('\n')}`);
  console.log(`✓ ${name} configurada na Netlify`);
}
console.log('\nFeito. Falta só publicar de novo o site (Deploys → Trigger deploy, ou npx netlify-cli@27.16.1 deploy --build --prod).');
