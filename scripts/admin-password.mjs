/**
 * Generates the two server secrets for the results desk without echoing the password.
 *   npm run admin:password            -> prints ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET
 *   npm run admin:password -- --env   -> writes them to .env (git-ignored) for local use
 * Never commit these values; set them in the hosting provider's environment settings.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/auth.js';

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}
const password = process.env.MINHO11_PASSWORD ?? await ask('Palavra-passe partilhada (não aparece no ecrã): ');
if (!process.env.MINHO11_PASSWORD && password !== await ask('Repete a palavra-passe: ')) { console.error('As palavras-passe não coincidem.'); process.exit(1); }
const lines = [`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`, `ADMIN_SESSION_SECRET=${randomBytes(32).toString('base64url')}`];
if (process.argv.includes('--env')) {
  const existing = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n').filter(l => l && !/^ADMIN_(PASSWORD_HASH|SESSION_SECRET)=/.test(l)) : [];
  fs.writeFileSync('.env', [...existing, ...lines].join('\n') + '\n', { mode: 0o600 });
  console.log('Guardado em .env (local, ignorado pelo Git).');
} else console.log(lines.join('\n'));
