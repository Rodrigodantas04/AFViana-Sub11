import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateDataset, normalize, rankScorers, matchStatus, upcomingMatches, filterMatches, teamStanding } from '../src/domain.js';
import { renderView } from '../src/views.js';
import { esc } from '../src/components.js';

const data = JSON.parse(await fs.readFile(new URL('../data/public/competition.json', import.meta.url), 'utf8'));
const url = route => new URL(route, 'https://minho11.test');

test('authoritative snapshot satisfies the public contract', () => assert.equal(validateDataset(data), data));
test('accent-insensitive Portuguese search and combined group/status filters', () => {
  assert.equal(normalize(' ÂNCORA-PRAIA '), 'ancora-praia');
  const games = filterMatches(data, { q: 'ancora', group: 'E', status: 'finished' }, '2026-11-16');
  assert.ok(games.length > 0);
  assert.ok(games.every(m => m.groupId === 'E' && m.status === 'finished'));
});
test('a past scheduled game has unknown result, never an invented postponement', () => {
  assert.equal(matchStatus({ status: 'scheduled', date: '2026-10-10' }, '2026-11-16'), 'unconfirmed');
  assert.equal(matchStatus({ status: 'postponed', date: '2026-10-10' }, '2026-11-16'), 'postponed');
  assert.ok(upcomingMatches(data, '2026-11-16').every(m => m.date >= '2026-11-16' && m.status === 'scheduled'));
});
test('scorer ties share a rank with deterministic alphabetical ordering', () => {
  const ranked = rankScorers([{ id: 'a', name: 'B', goals: 8, teamId: 'a' }, { id: 'b', name: 'A', goals: 10, teamId: 'a' }, { id: 'c', name: 'C', goals: 8, teamId: 'b' }, { id: 'd', name: 'D', goals: 7, teamId: 'c' }]);
  assert.deepEqual(ranked.map(s => s.rank), [1, 2, 2, 4]);
  assert.deepEqual(ranked.map(s => s.name), ['A', 'B', 'C', 'D']);
});
test('invalid/duplicate references and incorrect totals reject a new snapshot', () => {
  const mutations = [d => d.matches.push(d.matches[0]), d => d.matches[0].homeId = 'missing', d => d.matches[0].homeGoals = -1, d => d.stats.goals = 0, d => d.groups[0].standings[1] = d.groups[0].standings[0], d => d.version = 'bad', d => d.publication.individualRecordsPublished = 10];
  for (const mutate of mutations) { const changed = structuredClone(data); mutate(changed); assert.throws(() => validateDataset(changed), /Dados inválidos/); }
});
test('all view types render from real records without dead placeholder links', () => {
  const routes = ['/', '/competicoes', '/competicoes/gomes-ribeiro-sub11/serie-f', '/jogos?serie=B&q=lanheses', `/jogos/${data.matches[0].id}`, '/marcadores', '/clubes', '/clubes/ad-barroselas', '/estatisticas', '/unknown'];
  for (const route of routes) { const html = renderView(data, url(route)); assert.ok(html.length > 200, route); assert.ok(!html.includes('href="#"'), route); assert.ok(!html.includes('onclick='), route); }
});
test('club profile retains independent A and B teams', () => {
  const html = renderView(data, url('/clubes/ad-barroselas'));
  assert.ok(html.includes('AD Barroselas &quot;A&quot;'));
  assert.ok(html.includes('AD Barroselas &quot;B&quot;'));
  for (const team of data.teams.filter(t => t.clubId === 'ad-barroselas')) assert.ok(teamStanding(data, team));
});
test('privacy view has no invented podium when no records are authorized', () => {
  const hidden = structuredClone(data);
  hidden.scorers = [];
  const html = renderView(hidden, url('/marcadores'));
  assert.ok(html.includes('publicação dos seus nomes estiver autorizada'));
  assert.ok(!html.includes('class="podium"'));
});
test('authorized scorer functionality renders podium and filters correctly', () => {
  const visible = structuredClone(data);
  visible.scorers = [{ id: 'test-one', name: '<Jogador teste>', teamId: data.teams[0].id, groupId: 'A', goals: 4 }, { id: 'test-two', name: 'Outro teste', teamId: data.teams[1].id, groupId: 'A', goals: 4 }];
  const html = renderView(visible, url('/marcadores?serie=A&q=jogador'));
  assert.ok(html.includes('class="podium"'));
  assert.ok(html.includes('1.º lugar · ex aequo'));
  assert.ok(html.includes('&lt;Jogador teste&gt;'));
  assert.ok(!html.includes('<Jogador teste>'));
});
test('source strings are escaped before becoming HTML', () => assert.equal(esc('<script>"&'), '&lt;script&gt;&quot;&amp;'));
test('production build contains no workbook, internal report, source cells, or private names', async () => {
  const root = new URL('../dist/', import.meta.url);
  const files = await fs.readdir(root, { recursive: true });
  assert.ok(files.includes('404.html'));
  assert.ok(!files.some(name => /\.xlsx$|validation\.json|source-cells|internal/.test(name)));
  let internal;
  try { internal = JSON.parse(await fs.readFile(new URL('../data/internal/competition.json', import.meta.url), 'utf8')); }
  catch { internal = { scorers: [] }; /* Public CI has no private identities; local integration additionally checks names. */ }
  for (const name of files.filter(name => /\.(html|json)$/.test(name))) {
    const contents = await fs.readFile(new URL(name, root), 'utf8');
    for (const scorer of internal.scorers.filter(s => !data.scorers.some(p => p.name === s.name))) assert.ok(!contents.includes(scorer.name), `Unpublished individual in ${name}`);
  }
});
test('all generated internal links have a real static destination', async () => {
  const root = new URL('../dist/', import.meta.url);
  const files = (await fs.readdir(root, { recursive: true })).filter(p => p.endsWith('.html'));
  const links = new Set();
  for (const file of files) {
    const html = await fs.readFile(new URL(file, root), 'utf8');
    for (const match of html.matchAll(/href="(\/[^"#?]*)(?:\?[^"#]*)?"/g)) links.add(match[1]);
  }
  for (const link of links) {
    const file = path.extname(link) ? '.' + link : '.' + link + '/index.html';
    await assert.doesNotReject(() => fs.access(new URL(file, root)), `Missing destination ${link}`);
  }
});
