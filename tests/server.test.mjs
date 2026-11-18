import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFixtureWorkbook, fixtureConfig } from './fixtures/workbook.mjs';
import { importCompetition } from '../lib/competition.js';
import { projectDataset } from '../lib/projection.js';
import { createApp } from '../server/app.js';
import { MemoryStorage, BlobStorage, acquireLease } from '../server/storage.js';
import { FileSource } from '../server/sources.js';
import { hashPassword } from '../server/auth.js';

const PASSWORD = 'palavra-passe-de-teste';
const ORIGIN = 'https://minho11.test';
async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'minho11-'));
  const file = path.join(dir, 'fonte.xlsx');
  await fs.writeFile(file, buildFixtureWorkbook());
  const { data } = importCompetition(await fs.readFile(file), fixtureConfig, { today: '2026-11-16' });
  const snapshot = projectDataset(data, {}, { mode: 'repository', today: '2026-11-16', importedAt: '2026-11-16T00:00:00Z' });
  const storage = new MemoryStorage();
  const env = { ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD, { iterations: 100_000 }), ADMIN_SESSION_SECRET: 'x'.repeat(40) };
  const app = createApp({ storage, source: new FileSource(file), env, config: fixtureConfig, policy: { scorerNames: 'public' }, snapshot });
  return { app, storage, file, data };
}
const request = (pathname, { method = 'GET', body, cookie, origin = ORIGIN, ip = '1.1.1.1' } = {}) => new Request(ORIGIN + pathname, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), 'x-nf-client-connection-ip': ip }, body: body ? JSON.stringify(body) : undefined });
async function login(app) {
  const response = await app(request('/api/admin/login', { method: 'POST', body: { password: PASSWORD } }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  return cookie.split(';')[0];
}

test('admin requires the password, an own-origin JSON request and a live session', async () => {
  const { app } = await setup();
  assert.equal((await app(request('/api/admin/state'))).status, 401);
  assert.equal((await app(request('/api/admin/login', { method: 'POST', body: { password: PASSWORD }, origin: 'https://evil.example' }))).status, 403);
  assert.equal((await app(request('/api/admin/login', { method: 'POST', body: { password: 'errada' } }))).status, 401);
  const cookie = await login(app);
  assert.equal((await app(request('/api/admin/state', { cookie }))).status, 200);
  assert.equal((await app(request('/api/admin/logout', { method: 'POST', body: {}, cookie }))).status, 200);
  assert.equal((await app(request('/api/admin/state', { cookie }))).status, 401, 'logout revokes the session server-side');
  assert.equal((await app(request('/api/admin/state', { cookie: cookie + 'x' }))).status, 401);
});

test('login attempts are throttled per client', async () => {
  const { app } = await setup();
  for (let i = 0; i < 5; i++) await app(request('/api/admin/login', { method: 'POST', body: { password: 'errada' }, ip: '9.9.9.9' }));
  assert.equal((await app(request('/api/admin/login', { method: 'POST', body: { password: PASSWORD }, ip: '9.9.9.9' }))).status, 429);
  assert.equal((await app(request('/api/admin/login', { method: 'POST', body: { password: PASSWORD }, ip: '8.8.8.8' }))).status, 200);
});

test('saving writes the workbook, confirms, updates the public data and is idempotent', async () => {
  const { app, file, storage } = await setup();
  const cookie = await login(app);
  const state = await (await app(request('/api/admin/state', { cookie }))).json();
  const match = state.matches.find(m => m.status === 'scheduled' && m.groupId === '1a');
  const body = { revision: state.revision, operationId: crypto.randomUUID(), homeGoals: 1, awayGoals: 0, scorers: { home: [{ name: 'Teste Silva', goals: 1, ownGoal: false }], away: [] } };
  const saved = await app(request(`/api/admin/matches/${match.id}`, { method: 'PUT', body, cookie }));
  assert.equal(saved.status, 200, await saved.clone().text());
  const reread = importCompetition(await fs.readFile(file), fixtureConfig, { today: '2026-11-16' }).data.matches.find(m => m.id === match.id);
  assert.deepEqual([reread.homeGoals, reread.awayGoals, reread.scorers.home.description], [1, 0, 'Teste Silva']);
  const live = await (await app(request('/data/competition.json'))).json();
  assert.equal(live.matches.find(m => m.id === match.id).homeGoals, 1);
  assert.ok(live.scorers.total.some(s => s.name === 'Teste Silva'));
  assert.equal(JSON.stringify(live).includes('"source"'), false);
  const again = await app(request(`/api/admin/matches/${match.id}`, { method: 'PUT', body, cookie }));
  assert.equal((await again.json()).repeated, true, 'a retried request is not applied twice');
  const keys = [...storage.map.keys()];
  assert.ok(keys.some(k => k.startsWith('backups/')), 'previous workbook kept as a private backup');
});

test('stale revision, concurrent write and invalid payloads are refused without touching the file', async () => {
  const { app, file, storage } = await setup();
  const cookie = await login(app);
  const state = await (await app(request('/api/admin/state', { cookie }))).json();
  const match = state.matches.find(m => m.status === 'scheduled' && m.groupId === '1a');
  const before = await fs.readFile(file);
  const put = body => app(request(`/api/admin/matches/${match.id}`, { method: 'PUT', body: { revision: state.revision, operationId: crypto.randomUUID(), homeGoals: 1, awayGoals: 0, scorers: { home: [], away: [] }, ...body }, cookie }));
  assert.equal((await put({ revision: 'b'.repeat(64) })).status, 409);
  assert.equal((await put({ homeGoals: 120 })).status, 400);
  assert.equal((await put({ scorers: { home: [{ name: 'A B', goals: 3, ownGoal: false }], away: [] } })).status, 400);
  const release = await acquireLease(storage, 'locks/write', 60);
  assert.equal((await put({})).status, 409, 'another write in progress');
  await release();
  assert.deepEqual(await fs.readFile(file), before);
});

test('public endpoint falls back to the snapshot when there is no source', async () => {
  const { data } = await setup();
  const snapshot = projectDataset(data, {}, { mode: 'repository', today: '2026-11-16', importedAt: '2026-11-16T00:00:00Z' });
  const app = createApp({ storage: new MemoryStorage(), source: null, env: {}, config: fixtureConfig, policy: {}, snapshot });
  const response = await app(request('/data/competition.json'));
  assert.equal(response.headers.get('x-minho11-source'), 'snapshot');
  assert.equal((await app(request('/api/admin/status'))).status, 200);
  assert.equal((await (await app(request('/api/admin/status'))).json()).configured, false);
});

test('2.ª fase teams, date, clear and privacy go through the same protected pipeline and are logged', async () => {
  const { app, data } = await setup();
  const cookie = await login(app);
  let state = await (await app(request('/api/admin/state', { cookie }))).json();
  const ids = state.groups.find(g => g.id === '1a').teamIds;
  const put = (path, body) => app(request(path, { method: 'PUT', body: { revision: state.revision, operationId: crypto.randomUUID(), ...body }, cookie }));
  let r = await put('/api/admin/groups/2a/teams', { teams: [...ids, '', '', ''] });
  assert.equal(r.status, 200, await r.clone().text());
  state = (await r.json()).state;
  assert.equal(state.matches.filter(m => m.groupId === '2a').length, 6);
  const game = state.matches.find(m => m.groupId === '1a' && m.status === 'finished');
  r = await put(`/api/admin/matches/${game.id}`, { type: 'date', date: '2026-12-12' });
  state = (await r.json()).state;
  r = await put(`/api/admin/matches/${game.id}`, { type: 'clear' });
  state = (await r.json()).state;
  assert.equal(state.matches.find(m => m.id === game.id).status, 'scheduled');
  const scorer = state.scorers[0];
  r = await app(request('/api/admin/privacy', { method: 'POST', body: { scorerId: scorer.id, hidden: true }, cookie }));
  state = (await r.json()).state;
  assert.equal(state.scorers.find(s => s.id === scorer.id).hidden, true);
  const live = await (await app(request('/data/competition.json'))).json();
  assert.equal(JSON.stringify(live).includes(scorer.name), false, 'hidden name removed from public data');
  assert.deepEqual(state.history.map(h => h.type), ['hide', 'clear', 'date', 'teams']);
  assert.equal((await app(request('/api/admin/privacy', { method: 'POST', body: { scorerId: scorer.id, hidden: true } }))).status, 401);
  assert.equal((await app(request('/api/admin/groups/1a/teams', { method: 'PUT', body: {}, cookie }))).status, 404, 'only 2.ª fase series can be edited');
});

test('players: spellings are listed per team, suggested and joined through the protected pipeline', async () => {
  const { app } = await setup();
  const cookie = await login(app);
  let state = await (await app(request('/api/admin/state', { cookie }))).json();
  const teamId = state.scorers[0].teamId;
  const put = (path, body) => app(request(path, { method: 'PUT', body: { revision: state.revision, operationId: crypto.randomUUID(), ...body }, cookie }));
  assert.ok(state.players.list.every(p => p.teamId && p.name && p.goals > 0));
  const name = state.players.list.find(p => p.teamId === teamId).name;
  const r = await put(`/api/admin/teams/${teamId}/rename`, { from: [name], to: name + ' Júnior' });
  assert.equal(r.status, 200, await r.clone().text());
  state = (await r.json()).state;
  assert.ok(state.players.list.some(p => p.name === name + ' Júnior'));
  assert.equal(state.history[0].type, 'rename');
  assert.equal((await app(request(`/api/admin/teams/${teamId}/rename`, { method: 'PUT', body: { from: [name], to: 'X' } }))).status, 401);
});


test('Netlify Blobs: a fresh store on every operation, and the public site survives a broken store', async () => {
  // Warm instances used to keep the first request's store; its token expired (18/11/2026) and every request failed with 401.
  let opened = 0;
  const memory = new Map();
  const fake = { async getWithMetadata(key) { return memory.has(key) ? { data: memory.get(key), etag: 'e' } : null; }, async setJSON(key, value) { memory.set(key, value); return { modified: true, etag: 'e' }; }, async set() { return { modified: true }; }, async delete(key) { memory.delete(key); } };
  const blobs = new BlobStorage(() => { opened++; return fake; });
  await blobs.set('a', { x: 1 }); await blobs.get('a'); await blobs.get('b');
  assert.equal(opened, 3, 'getStore em cada operação');

  const { data } = await setup();
  const snapshot = projectDataset(data, {}, { mode: 'repository', today: '2026-11-16', importedAt: '2026-11-16T00:00:00Z' });
  const broken = { async get() { throw Object.assign(new Error('Failed to decode token: Token expired'), { status: 401 }); }, async set() { throw new Error('down'); }, async delete() {} };
  const app = createApp({ storage: broken, source: null, env: {}, config: fixtureConfig, policy: {}, snapshot, log: () => {} });
  const response = await app(request('/data/competition.json'));
  assert.equal(response.status, 200, 'nunca 401 no site público');
  assert.equal(response.headers.get('x-minho11-source'), 'stale');
});
