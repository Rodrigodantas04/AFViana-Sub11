import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixtureWorkbook, fixtureConfig } from './fixtures/workbook.mjs';
import { importCompetition } from '../lib/competition.js';
import { projectDataset } from '../lib/projection.js';
import { validateDataset, normalize, rankScorers, matchStatus, upcomingMatches, filterMatches, teamAnalysis, groupAverages } from '../src/domain.js';
import { renderView } from '../src/views.js';
import { esc } from '../src/components.js';

const { data: internal } = importCompetition(buildFixtureWorkbook(), fixtureConfig, { today: '2026-11-16' });
const data = projectDataset(internal, { scorerNames: 'public' }, { mode: 'public', today: '2026-11-16', importedAt: '2026-11-16T10:00:00Z' });
const url = route => new URL(route, 'https://minho11.test');

test('projection satisfies the public contract', () => assert.equal(validateDataset(data), data));
test('accent-insensitive search and combined phase/group/status filters', () => {
  assert.equal(normalize(' ÂNCORA-PRAIA '), 'ancora-praia');
  const games = filterMatches(data, { q: 'vila', phase: 'fase-1', group: '1a', status: 'finished' }, '2026-11-16');
  assert.ok(games.length > 0 && games.every(m => m.groupId === '1a' && m.status === 'finished'));
});
test('a past scheduled game is "por confirmar", never an invented postponement', () => {
  assert.equal(matchStatus({ status: 'scheduled', date: '2026-10-10' }, '2026-11-16'), 'unconfirmed');
  assert.ok(upcomingMatches(data, '2026-11-16').every(m => m.date >= '2026-11-16' && m.status === 'scheduled'));
});
test('scorer ties share a rank with deterministic alphabetical ordering', () => {
  const ranked = rankScorers([{ id: 'a', name: 'B', goals: 8, teamId: 'a' }, { id: 'b', name: 'A', goals: 10, teamId: 'a' }, { id: 'c', name: 'C', goals: 8, teamId: 'b' }, { id: 'd', name: 'D', goals: 7, teamId: 'b' }]);
  assert.deepEqual(ranked.map(s => s.rank), [1, 2, 2, 4]);
  assert.deepEqual(ranked.map(s => s.tied), [false, true, true, false]);
});
test('invalid references and incorrect totals reject a dataset', () => {
  const mutations = [d => d.matches.push(d.matches[0]), d => { d.matches[0].homeId = 'missing'; }, d => { d.matches[0].homeGoals = -1; }, d => { d.stats.goals = 0; }, d => { d.matches[0].groupId = '2a'; }];
  for (const mutate of mutations) { const copy = structuredClone(data); mutate(copy); assert.throws(() => validateDataset(copy)); }
});
test('team analysis uses only finished games and correct home/away denominators', () => {
  const vila = data.teams.find(t => t.name === 'Vila Azul');
  const a = teamAnalysis(data, vila.id, 'fase-1');
  assert.deepEqual([a.all.played, a.home.played, a.away.played, a.all.points], [2, 1, 1, 4]);
  assert.deepEqual(a.timeline.map(t => t.points), [1, 4]);
  assert.equal(groupAverages(data, '1a').teams, 3);
});
test('views: phases, pending phase 2, legacy URL, match goals, escaping', () => {
  assert.match(renderView(data, url('/competicoes/teste-sub11')), /2\.ª Fase por definir/);
  assert.match(renderView(data, url('/competicoes/teste-sub11/serie-a')), /Série A/, 'old one-phase URL still resolves');
  assert.match(renderView(data, url('/competicoes/teste-sub11/fase-2/serie-a')), /Série A por definir/);
  const match = data.matches.find(m => m.scoring.home.ownGoals || m.scoring.away.ownGoals);
  assert.match(renderView(data, url(`/jogos/${match.id}`)), /Autogolo/);
  assert.match(renderView(data, url('/marcadores?fase=fase-2')), /por definir/);
  assert.equal(esc('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  const hostile = structuredClone(data); hostile.teams[0].name = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(renderView(hostile, url('/clubes')), /<img src=x/);
});
test('compare page: two teams side by side, head-to-head, empty state', () => {
  const [a, b] = data.groups.find(g => g.id === '1a').teamIds;
  const html = renderView(data, url(`/comparar?a=${a}&b=${b}`));
  assert.match(html, /Os números/);
  assert.match(html, /Quando se encontraram/);
  assert.match(renderView(data, url('/comparar')), /Escolhe duas equipas/);
});
test('player profile: live names only, hidden or unknown ids show nothing personal', () => {
  const top = data.scorers.total[0];
  const html = renderView(data, url(`/jogadores/${top.id}`));
  assert.match(html, new RegExp(top.name));
  assert.match(html, /Os golos/);
  assert.match(renderView(data, url('/jogadores/s-000000000000')), /Perfil indisponível/);
  const repo = projectDataset(internal, { scorerNames: 'public' }, { mode: 'repository', today: '2026-11-16', importedAt: '2026-11-16T10:00:00Z' });
  assert.doesNotMatch(renderView(repo, url(`/jogadores/${top.id}`)), new RegExp(top.name));
  const hidden = projectDataset(internal, { scorerNames: 'public', excludedScorerIds: [top.id] }, { mode: 'public', today: '2026-11-16', importedAt: '2026-11-16T10:00:00Z' });
  assert.match(renderView(hidden, url(`/jogadores/${top.id}`)), /Perfil indisponível/);
  assert.ok(data.matches.some(m => m.scoring.home.scorers.some(e => e.id === top.id) || m.scoring.away.scorers.some(e => e.id === top.id)), 'goal entries link to the profile id');
});
