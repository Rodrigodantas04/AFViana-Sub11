/**
 * Shared-password access for the results desk.
 * - Password stored only as "pbkdf2-sha256$<iterations>$<salt>$<hash>" (env ADMIN_PASSWORD_HASH).
 * - Sessions: HMAC-signed token in an HttpOnly, Secure, SameSite=Strict cookie, 8 h,
 *   plus a server-side record so "Sair" really revokes it.
 */
import { pbkdf2, randomBytes, timingSafeEqual, createHmac, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);
export const SESSION_SECONDS = 8 * 60 * 60;
export const COOKIE = 'minho11_admin';
const b64 = buffer => Buffer.from(buffer).toString('base64url');

export async function hashPassword(password, { iterations = 600_000, salt = randomBytes(16) } = {}) {
  if (typeof password !== 'string' || password.length < 10) throw new Error('A palavra-passe deve ter pelo menos 10 caracteres.');
  const hash = await derive(password.normalize('NFC'), salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || password.length > 200 || typeof stored !== 'string') return false;
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !/^\d+$/.test(iterations) || Number(iterations) < 100_000 || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password.normalize('NFC'), Buffer.from(salt, 'base64url'), Number(iterations), expected.length, 'sha256');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const authConfigured = env => typeof env.ADMIN_PASSWORD_HASH === 'string' && env.ADMIN_PASSWORD_HASH.startsWith('pbkdf2-sha256$') && typeof env.ADMIN_SESSION_SECRET === 'string' && env.ADMIN_SESSION_SECRET.length >= 32;

const sign = (secret, payload) => b64(createHmac('sha256', secret).update(payload).digest());

export function issueToken(env, now = Date.now()) {
  const claims = { sid: randomUUID(), exp: Math.floor(now / 1000) + SESSION_SECONDS };
  const payload = b64(JSON.stringify(claims));
  return { token: `${payload}.${sign(env.ADMIN_SESSION_SECRET, payload)}`, claims };
}

/** Returns the claims of a valid, unexpired, correctly signed token (revocation is checked by the caller). */
export function readToken(request, env, now = Date.now()) {
  if (!authConfigured(env)) return null;
  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [payload, signature, ...rest] = token.split('.');
  if (rest.length || !payload || !signature) return null;
  const expected = Buffer.from(sign(env.ADMIN_SESSION_SECRET, payload)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(now / 1000);
    if (typeof claims.sid !== 'string' || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds || claims.exp > nowSeconds + SESSION_SECONDS) return null;
    return claims;
  } catch { return null; }
}

export const sessionCookie = (token, { clear = false } = {}) => `${COOKIE}=${clear ? '' : token}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${clear ? 0 : SESSION_SECONDS}`;

/** State-changing requests must come from our own page (Origin) and be JSON. */
export function sameOrigin(request) {
  const origin = request.headers.get('origin'), url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const expected = new Set([url.origin, forwardedHost ? `https://${forwardedHost}` : null].filter(Boolean));
  return Boolean(origin) && expected.has(origin) && (request.headers.get('content-type') ?? '').split(';')[0].trim() === 'application/json';
}
