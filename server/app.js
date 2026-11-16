/**
 * MINHO11 server: public live data + the results desk API.
 * Runtime-agnostic (Web Request/Response); adapters in netlify/functions and scripts/serve.mjs.
 *
 * Source of truth: the workbook (Drive in production). Storage only holds a cache of the
 * public projection, locks, operation log, sessions and private backups.
 */
import { createHash } from 'node:crypto';
import { importCompetition } from '../lib/competition.js';
import { applyResult, validateChange, OWN_GOAL_LABEL } from '../lib/writer.js';
import { projectDataset } from '../lib/projection.js';
import { todayLisbon } from '../src/domain.js';
import { authConfigured, verifyPassword, issueToken, readToken, sessionCookie, sameOrigin } from './auth.js';
import { acquireLease } from './storage.js';

const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const problem = (message, status, extra) => json({ message }, status, extra);
const sha = text => createHash('sha256').update(text).digest('hex');
const LIVE_KEY = 'public/live-v2.json', WRITE_LOCK = 'locks/write', REFRESH_LOCK = 'locks/refresh', OPS = 'operations/log';

export function createApp({ storage, source, env = {}, config, policy, snapshot, refreshSeconds = 60, now = Date.now, log = () => {} }) {
  const today = () => todayLisbon(new Date(now()));

  async function body(request) {
    const text = await request.text();
    if (text.length > 20_000) throw Object.assign(new Error('Pedido demasiado grande.'), { status: 413 });
    try { return JSON.parse(text); } catch { throw Object.assign(new Error('Pedido inválido.'), { status: 400 }); }
  }

  /** Import + project; persist the public cache. */
  async function rebuild(read) {
    const { data, report } = importCompetition(read.bytes, config, { today: today() });
    const importedAt = new Date(now()).toISOString();
    const live = projectDataset(data, policy, { mode: 'public', today: today(), importedAt, rosters: snapshot.rosters ?? [] });
    await storage.set(LIVE_KEY, { checkedAt: now(), sourceVersion: read.meta.version, revision: read.revision, data: live });
    return { data, report, live, read };
  }

  async function publicData(context) {
    const cached = await storage.get(LIVE_KEY);
    const age = cached ? now() - cached.value.checkedAt : Infinity;
    if (!source) return json(cached?.value.data ?? snapshot, 200, { 'X-MINHO11-Source': cached ? 'cache' : 'snapshot' });
    if (age < refreshSeconds * 1000) return json(cached.value.data, 200, { 'X-MINHO11-Source': 'live' });
    const refresh = async () => {
      const release = await acquireLease(storage, REFRESH_LOCK, 60, now);
      if (!release) return null;
      try {
        const meta = await source.meta();
        if (cached && meta.version === cached.value.sourceVersion) {
          await storage.set(LIVE_KEY, { ...cached.value, checkedAt: now() });
          return cached.value.data;
        }
        return (await rebuild(await source.read())).live;
      } finally { await release(); }
    };
    // Serve the last good copy immediately when we have one; refresh in the background if possible.
    if (cached && context?.waitUntil) { context.waitUntil(refresh().catch(error => log('refresh failed', error.message))); return json(cached.value.data, 200, { 'X-MINHO11-Source': 'live' }); }
    try {
      const fresh = await refresh();
      return json(fresh ?? cached?.value.data ?? snapshot, 200, { 'X-MINHO11-Source': fresh || cached ? 'live' : 'snapshot' });
    } catch (error) {
      log('refresh failed', error.message);
      return json(cached?.value.data ?? snapshot, 200, { 'X-MINHO11-Source': 'stale' });
    }
  }

  // --- admin ----------------------------------------------------------------
  async function session(request) {
    const claims = readToken(request, env, now());
    if (!claims) return null;
    const record = await storage.get(`sessions/${claims.sid}`);
    return record && record.value.exp === claims.exp ? claims : null;
  }

  async function login(request) {
    if (!authConfigured(env)) return problem('O acesso de gestão ainda não foi configurado.', 503);
    const ip = request.headers.get('x-nf-client-connection-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
    const key = `throttle/${sha(ip + env.ADMIN_SESSION_SECRET).slice(0, 32)}`;
    const record = (await storage.get(key))?.value ?? { count: 0, until: 0 };
    if (record.until > now() && record.count >= 5) return problem('Demasiadas tentativas. Espera 15 minutos e tenta outra vez.', 429, { 'Retry-After': '900' });
    const input = await body(request);
    if (!await verifyPassword(input.password, env.ADMIN_PASSWORD_HASH)) {
      await storage.set(key, { count: record.until > now() ? record.count + 1 : 1, until: now() + 15 * 60_000 });
      return problem('Palavra-passe incorreta.', 401);
    }
    await storage.delete(key);
    const { token, claims } = issueToken(env, now());
    await storage.set(`sessions/${claims.sid}`, claims);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
  }

  function adminView(data, report, read, operations = []) {
    const issuesByMatch = new Map();
    for (const issue of report.issues) for (const id of issue.matchIds ?? (issue.matchId ? [issue.matchId] : [])) (issuesByMatch.get(id) ?? issuesByMatch.set(id, []).get(id)).push({ level: issue.level, code: issue.code, message: issue.message });
    const lost = operations.filter(op => {
      const m = data.matches.find(x => x.id === op.matchId);
      return m && op.revisionAfter && op.final && (m.homeGoals !== op.final.homeGoals || m.awayGoals !== op.final.awayGoals || m.scorers.home.description !== op.final.home || m.scorers.away.description !== op.final.away);
    }).map(op => ({ matchId: op.matchId, savedAt: op.savedAt }));
    return {
      revision: read.revision,
      writable: Boolean(read.meta.canEdit),
      sourceKind: source.kind,
      checkedAt: new Date(now()).toISOString(),
      competition: data.competition,
      phases: data.phases, teams: data.teams.map(({ id, name, withdrawn }) => ({ id, name, withdrawn })),
      groups: data.groups.map(({ id, phaseId, letter, defined, teamIds }) => ({ id, phaseId, letter, defined, teamIds })),
      matches: data.matches.map(m => ({
        id: m.id, phaseId: m.phaseId, groupId: m.groupId, round: m.round, date: m.date, homeId: m.homeId, awayId: m.awayId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, status: m.status,
        scorers: Object.fromEntries(['home', 'away'].map(side => [side, {
          entries: groupEntries(m.scorers[side].events), missing: m.scorers[side].missing, excess: m.scorers[side].excess,
        }])),
        issues: issuesByMatch.get(m.id) ?? [],
      })),
      quality: { unidentifiedGoals: data.stats.unidentifiedGoals, warnings: report.issues.filter(i => i.level === 'warning' && !i.matchId && !i.matchIds).map(i => i.message) },
      lostWrites: lost,
    };
  }
  /** Same notation the writer produces: one entry per credited name, own goals by name. */
  function groupEntries(events) {
    const entries = [];
    for (const e of events) {
      const name = e.ownGoal && e.name === OWN_GOAL_LABEL ? '' : e.name;
      const existing = entries.find(x => x.ownGoal === e.ownGoal && x.name.toLowerCase() === name.toLowerCase());
      if (existing) existing.goals += e.ownGoal ? 1 : e.credited;
      else entries.push({ name, goals: e.ownGoal ? 1 : e.credited, ownGoal: e.ownGoal });
    }
    return entries;
  }

  async function adminState() {
    if (!source) return problem('A ligação à fonte ainda não está configurada no servidor. Nenhum resultado pode ser gravado.', 503);
    const read = await source.read();
    const { data, report } = await rebuild(read);
    const operations = (await storage.get(OPS))?.value ?? [];
    return json(adminView(data, report, read, operations));
  }

  async function saveMatch(request, matchId) {
    if (!source) return problem('A ligação à fonte ainda não está configurada. Nada foi gravado.', 503);
    const change = { ...await body(request), matchId };
    try { validateChange(change); } catch (error) { return problem(error.message, error.status ?? 400); }
    const fingerprint = sha(JSON.stringify(change));
    const opKey = `operations/${change.operationId}`;
    const previous = await storage.get(opKey);
    if (previous) {
      if (previous.value.fingerprint !== fingerprint) return problem('Pedido repetido com dados diferentes. Recarrega a página.', 409);
      return json({ ok: true, repeated: true, message: 'Este resultado já tinha sido gravado.', revision: previous.value.revisionAfter });
    }
    const release = await acquireLease(storage, WRITE_LOCK, 120, now);
    if (!release) return problem('Está outra gravação a decorrer. Espera uns segundos e carrega outra vez em «Gravar resultado».', 409);
    try {
      const read = await source.read();
      if (read.revision !== change.revision) return problem('O Excel foi alterado depois de abrires este jogo. Os teus dados continuam no formulário: carrega em «Atualizar jogo» e grava de novo.', 409, { 'X-MINHO11-Conflict': 'revision' });
      if (!read.meta.canEdit) return problem('A ligação ao Excel só tem permissão de leitura. Nada foi gravado.', 503);
      let result;
      try { result = applyResult(read.bytes, config, change, { today: today() }); }
      catch (error) { return problem(error.message, error.status ?? 422); }
      // Private recoverable copy before replacing the Drive file (Drive also keeps its own version history).
      await storage.set(`backups/${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${read.revision.slice(0, 12)}.xlsx`, read.bytes);
      const written = await source.write(result.bytes, read);
      const { data, report } = await rebuild(written);
      const saved = data.matches.find(m => m.id === matchId);
      const final = { homeGoals: saved.homeGoals, awayGoals: saved.awayGoals, home: saved.scorers.home.description, away: saved.scorers.away.description };
      const entry = { matchId, savedAt: new Date(now()).toISOString(), revisionBefore: read.revision, revisionAfter: written.revision, final, fingerprint };
      await storage.set(opKey, entry);
      const history = (await storage.get(OPS))?.value ?? [];
      const operations = [entry, ...history.filter(op => op.matchId !== matchId)].slice(0, 100);
      await storage.set(OPS, operations);
      return json({ ok: true, message: 'Resultado gravado. O site já mostra o novo resultado.', state: adminView(data, report, written, operations) });
    } finally { await release(); }
  }

  async function admin(request, path) {
    if (request.method !== 'GET' && !sameOrigin(request)) return problem('Origem do pedido inválida.', 403);
    if (path === 'login' && request.method === 'POST') return login(request);
    if (path === 'status' && request.method === 'GET') {
      const claims = await session(request);
      return json({ configured: authConfigured(env), authenticated: Boolean(claims), sourceConfigured: Boolean(source) });
    }
    const claims = await session(request);
    if (!claims) return problem('A sessão terminou. Entra outra vez com a palavra-passe.', 401);
    if (path === 'logout' && request.method === 'POST') { await storage.delete(`sessions/${claims.sid}`); return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', { clear: true }) }); }
    if (path === 'state' && request.method === 'GET') return adminState();
    const match = /^matches\/(m-[a-f0-9]{16})$/.exec(path);
    if (match && request.method === 'PUT') return saveMatch(request, match[1]);
    return problem('Pedido não encontrado.', 404);
  }

  return async function handle(request, context = {}) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/admin/')) return await admin(request, url.pathname.slice('/api/admin/'.length));
      if (url.pathname === '/data/competition.json' && ['GET', 'HEAD'].includes(request.method)) return await publicData(context);
      return problem('Pedido não encontrado.', 404);
    } catch (error) {
      log('request failed', error.message);
      const status = error.status && error.status < 600 ? error.status : 503;
      const message = status === 409 || status === 413 || status === 400 ? error.message : 'Não foi possível concluir o pedido. Os dados que escreveste continuam no formulário. Tenta outra vez.';
      return problem(message, status);
    }
  };
}

