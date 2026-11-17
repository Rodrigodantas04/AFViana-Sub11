/**
 * MINHO11 server: public live data + the results desk API.
 * Runtime-agnostic (Web Request/Response); adapters in netlify/functions and scripts/serve.mjs.
 *
 * Source of truth: the workbook (Drive in production). Storage only holds a cache of the
 * public projection, locks, operation log, sessions and private backups.
 */
import { createHash } from 'node:crypto';
import { importCompetition } from '../lib/competition.js';
import { applyChange, validateChange, OWN_GOAL_LABEL } from '../lib/writer.js';
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
const LIVE_KEY = 'public/live-v2.json', WRITE_LOCK = 'locks/write', REFRESH_LOCK = 'locks/refresh', OPS = 'operations/log', HIDDEN = 'privacy/hidden';
const SUCCESS = { rename: 'Nome corrigido em todos os jogos. O site já mostra o jogador junto.', result: 'Resultado gravado. O site já mostra o novo resultado.', clear: 'Resultado apagado. O jogo voltou a «por realizar».', date: 'Data gravada.', teams: 'Equipas gravadas. Os jogos da série já aparecem no site.' };

export function createApp({ storage, source, env = {}, config, policy, snapshot, crests = {}, colors = {}, refreshSeconds = 60, now = Date.now, log = () => {} }) {
  const today = () => todayLisbon(new Date(now()));
  // The public cache is only reused while the publishing rules and code are the same (a deploy with new
  // colours, crests or policy must rebuild it even if the workbook did not change).
  let deployId = env.DEPLOY_ID ?? env.COMMIT_REF ?? null;
  const projectionVersion = () => sha(JSON.stringify({ policy, crests, colors, config, schema: snapshot.schemaVersion, code: deployId ?? 'local' }));

  async function body(request) {
    const text = await request.text();
    if (text.length > 20_000) throw Object.assign(new Error('Pedido demasiado grande.'), { status: 413 });
    try { return JSON.parse(text); } catch { throw Object.assign(new Error('Pedido inválido.'), { status: 400 }); }
  }

  /** Import + project; persist the public cache. */
  async function rebuild(read) {
    const { data, report } = importCompetition(read.bytes, config, { today: today() });
    const importedAt = new Date(now()).toISOString();
    const hidden = (await storage.get(HIDDEN))?.value ?? [];
    const live = projectDataset(data, { ...policy, excludedScorerIds: [...(policy.excludedScorerIds ?? []), ...hidden] }, { mode: 'public', today: today(), importedAt, rosters: snapshot.rosters ?? [], crests, colors });
    await storage.set(LIVE_KEY, { checkedAt: now(), sourceVersion: read.meta.version, revision: read.revision, projectionVersion: projectionVersion(), data: live });
    return { data, report, live, read };
  }

  /** The public dataset (live when possible) and where it came from: live, cache, snapshot or stale. */
  async function liveDataset(context) {
    const stored = await storage.get(LIVE_KEY);
    const cached = stored && stored.value.projectionVersion === projectionVersion() ? stored : null;
    const age = cached ? now() - cached.value.checkedAt : Infinity;
    if (!source) return { data: stored?.value.data ?? snapshot, state: stored ? 'cache' : 'snapshot' };
    if (age < refreshSeconds * 1000) return { data: cached.value.data, state: 'live' };
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
    if (cached && context?.waitUntil) { context.waitUntil(refresh().catch(error => log('refresh failed', error.message))); return { data: cached.value.data, state: 'live' }; }
    try {
      const fresh = await refresh();
      return { data: fresh ?? cached?.value.data ?? snapshot, state: fresh || cached ? 'live' : 'snapshot' };
    } catch (error) {
      log('refresh failed', error.message);
      return { data: cached?.value.data ?? stored?.value.data ?? snapshot, state: 'stale' };
    }
  }
  async function publicData(context) {
    const { data, state } = await liveDataset(context);
    return json(data, 200, { 'X-MINHO11-Source': state });
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

  function adminView(data, report, read, operations = [], hidden = []) {
    const issuesByMatch = new Map();
    for (const issue of report.issues) for (const id of issue.matchIds ?? (issue.matchId ? [issue.matchId] : [])) (issuesByMatch.get(id) ?? issuesByMatch.set(id, []).get(id)).push({ level: issue.level, code: issue.code, message: issue.message });
    // Last write per match; if the workbook no longer has it, someone saved over it.
    const latest = new Map();
    for (const op of operations) if (op.matchId && op.type !== 'date' && !latest.has(op.matchId)) latest.set(op.matchId, op);
    const lost = [...latest.values()].filter(op => {
      const m = data.matches.find(x => x.id === op.matchId), f = op.summary?.after;
      return m && f && (m.homeGoals !== f.homeGoals || m.awayGoals !== f.awayGoals || m.scorers.home.description !== f.home || m.scorers.away.description !== f.away);
    }).map(op => ({ matchId: op.matchId, savedAt: op.savedAt }));
    const hiddenSet = new Set([...(policy.excludedScorerIds ?? []), ...hidden]);
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
      history: operations.slice(0, 50).filter(op => op.type).map(({ type, savedAt, matchId, groupId, teamId, scorerId, summary }) => ({ type, savedAt, matchId, groupId, teamId, scorerId, before: summary?.before, after: summary?.after })),
      players: playerNames(data),
      scorers: data.scorers.total.map(({ id, name, teamId, goals }) => ({ id, name, teamId, goals, hidden: hiddenSet.has(id) })),
      hiddenOutsideRanking: [...hiddenSet].filter(id => !data.scorers.total.some(s => s.id === id)).length,
    };
  }
  /** Every spelling used in the match sheets, per team (the ranking merges case variants, this does not). */
  function playerNames(data) {
    const byKey = new Map();
    const loose = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    for (const m of data.matches) for (const side of ['home', 'away']) for (const e of m.scorers[side].events) {
      if (e.ownGoal || !e.credited) continue;
      const teamId = m[side + 'Id'], key = teamId + '|' + e.name;
      const entry = byKey.get(key) ?? byKey.set(key, { teamId, name: e.name, goals: 0, matches: 0, loose: loose(e.name) }).get(key);
      entry.goals += e.credited; entry.matches += 1;
    }
    const capitals = name => name.split(' ').filter(w => /^\p{Lu}/u.test(w)).length;
    const list = [...byKey.values()];
    const groups = new Map();
    for (const p of list) (groups.get(p.teamId + '|' + p.loose) ?? groups.set(p.teamId + '|' + p.loose, []).get(p.teamId + '|' + p.loose)).push(p);
    const suggestions = [...groups.values()].filter(g => g.length > 1).map(g => ({ teamId: g[0].teamId, names: g.map(({ name, goals, matches }) => ({ name, goals, matches })), suggested: [...g].sort((a, b) => capitals(b.name) - capitals(a.name) || b.matches - a.matches || b.name.length - a.name.length)[0].name }));
    return { list: list.map(({ loose: _, ...p }) => p), suggestions };
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
    return json(adminView(data, report, read, operations, (await storage.get(HIDDEN))?.value ?? []));
  }

  async function runOperation(request, target) {
    if (!source) return problem('A ligação à fonte ainda não está configurada. Nada foi gravado.', 503);
    const change = { ...await body(request), ...target };
    if (target.groupId) change.type = 'teams';
    else if (target.teamId) change.type = 'rename';
    else if (['teams', 'rename'].includes(change.type)) return problem('Operação inválida para um jogo.', 400);
    try { validateChange(change); } catch (error) { return problem(error.message, error.status ?? 400); }
    const fingerprint = sha(JSON.stringify(change));
    const opKey = `operations/${change.operationId}`;
    const previous = await storage.get(opKey);
    if (previous) {
      if (previous.value.fingerprint !== fingerprint) return problem('Pedido repetido com dados diferentes. Recarrega a página.', 409);
      return json({ ok: true, repeated: true, message: 'Isto já tinha sido gravado.', revision: previous.value.revisionAfter });
    }
    const release = await acquireLease(storage, WRITE_LOCK, 120, now);
    if (!release) return problem('Está outra gravação a decorrer. Espera uns segundos e tenta outra vez.', 409);
    try {
      const read = await source.read();
      if (read.revision !== change.revision) return problem('O Excel foi alterado depois de abrires este ecrã. Os teus dados continuam no formulário: carrega em «Atualizar» e grava de novo.', 409, { 'X-MINHO11-Conflict': 'revision' });
      if (!read.meta.canEdit) return problem('A ligação ao Excel só tem permissão de leitura. Nada foi gravado.', 503);
      let result;
      try { result = applyChange(read.bytes, config, change, { today: today() }); }
      catch (error) { return problem(error.message, error.status ?? 422); }
      // Private recoverable copy before replacing the Drive file (Drive also keeps its own version history).
      await storage.set(`backups/${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${read.revision.slice(0, 12)}.xlsx`, read.bytes);
      const written = await source.write(result.bytes, read);
      const { data, report } = await rebuild(written);
      const entry = { type: change.type, matchId: change.matchId ?? null, groupId: change.groupId ?? null, teamId: change.teamId ?? null, savedAt: new Date(now()).toISOString(), revisionBefore: read.revision, revisionAfter: written.revision, summary: result.summary, fingerprint };
      await storage.set(opKey, entry);
      const operations = [entry, ...((await storage.get(OPS))?.value ?? [])].slice(0, 200);
      await storage.set(OPS, operations);
      return json({ ok: true, message: SUCCESS[change.type], state: adminView(data, report, written, operations, (await storage.get(HIDDEN))?.value ?? []) });
    } finally { await release(); }
  }

  /** "Ocultar nome": applied to the public projection only; the workbook keeps the name and the goals. */
  async function setPrivacy(request) {
    const input = await body(request);
    if (!/^s-[a-f0-9]{12}$/.test(input.scorerId ?? '') || typeof input.hidden !== 'boolean') return problem('Pedido inválido.', 400);
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await storage.get(HIDDEN);
      const list = new Set(current?.value ?? []);
      if (input.hidden) list.add(input.scorerId); else list.delete(input.scorerId);
      const saved = await storage.set(HIDDEN, [...list], current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
      if (saved.modified) {
        const operations = [{ type: input.hidden ? 'hide' : 'show', scorerId: input.scorerId, savedAt: new Date(now()).toISOString() }, ...((await storage.get(OPS))?.value ?? [])].slice(0, 200);
        await storage.set(OPS, operations);
        if (source) { const read = await source.read(); const { data, report } = await rebuild(read); return json({ ok: true, message: input.hidden ? 'Nome ocultado em todo o site.' : 'Nome visível outra vez.', state: adminView(data, report, read, operations, [...list]) }); }
        return json({ ok: true });
      }
    }
    return problem('Não foi possível gravar agora. Tenta outra vez.', 409);
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
    if (match && request.method === 'PUT') return runOperation(request, { matchId: match[1] });
    const renameTeam = /^teams\/([a-z0-9-]{1,80})\/rename$/.exec(path);
    if (renameTeam && request.method === 'PUT') return runOperation(request, { teamId: renameTeam[1] });
    const group = /^groups\/(2[a-f])\/teams$/.exec(path);
    if (group && request.method === 'PUT') return runOperation(request, { groupId: group[1] });
    if (path === 'privacy' && request.method === 'POST') return setPrivacy(request);
    return problem('Pedido não encontrado.', 404);
  }

  return async function handle(request, context = {}) {
    deployId ??= context?.deploy?.id ?? null;
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

