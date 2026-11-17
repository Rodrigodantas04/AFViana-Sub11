import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixtureWorkbook, fixtureConfig } from './fixtures/workbook.mjs';
import { importCompetition } from '../lib/competition.js';
import { projectDataset } from '../lib/projection.js';
import { validateDataset, normalize, rankScorers, matchStatus, upcomingMatches, filterMatches, teamAnalysis, groupAverages, pointsRace, teamFixtures, daysUntil } from '../src/domain.js';
import { renderView, prefs } from '../src/views.js';
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
import { clubColors } from '../lib/projection.js';
import { badgeInk, badge } from '../src/components.js';
test('club colours: only valid, reliable entries; initials always legible', () => {
  assert.deepEqual(clubColors({ clubs: { a: { primary: '#1F7A3A', secondary: '#ffffff', confidence: 'high' }, b: { primary: '#111111', secondary: '#222222', confidence: 'low' }, c: { primary: 'green', secondary: '#fff', confidence: 'high' } } }), { a: { primary: '#1f7a3a', secondary: '#ffffff' } });
  assert.equal(badgeInk({ primary: '#1f7a3a', secondary: '#ffffff' }), '#ffffff');
  assert.equal(badgeInk({ primary: '#f2c200', secondary: '#ffffff' }), '#111111', 'white on yellow is not legible');
  assert.equal(badgeInk({ primary: '#1f4e9e', secondary: '#f2c200' }), '#f2c200');
  assert.match(badge('Neves FC', false, null, { primary: '#1f7a3a', secondary: '#ffffff' }), /--club-1:#1f7a3a/);
});

test('points race: the last round matches the official standings of every group', () => {
  for (const g of data.groups.filter(x => x.defined)) {
    const race = pointsRace(data, g.id);
    if (!race.rounds.length) continue;
    for (const t of race.teams) {
      const official = g.standings.find(s => s.teamId === t.teamId);
      assert.equal(t.points.at(-1), official.points, `${g.id} ${t.teamId} pontos`);
      assert.equal(t.positions.at(-1), official.position, `${g.id} ${t.teamId} lugar`);
      assert.ok(t.points.every((v, i) => i === 0 || v >= t.points[i - 1]), 'pontos nunca descem');
    }
  }
});

test('team fixtures: next games in date order, past games without result apart, countdown in days', () => {
  const team = data.groups.find(g => g.id === '1a').teamIds[0];
  const fx = teamFixtures(data, team, '2026-11-16');
  assert.ok(fx.upcoming.every(m => m.status === 'scheduled' && (!m.date || m.date >= '2026-11-16')));
  assert.deepEqual(fx.upcoming.map(m => m.date ?? '9999'), fx.upcoming.map(m => m.date ?? '9999').toSorted());
  assert.ok(fx.unconfirmed.every(m => m.date < '2026-11-16' && m.status === 'scheduled'));
  assert.ok(fx.played.every(m => m.status === 'finished'));
  assert.equal(daysUntil('2026-11-21', '2026-11-16'), 5);
  assert.equal(daysUntil(null), null);
});

test('my team: picker without a choice, full page with next game, charts, rival and highlighted table', () => {
  const g = data.groups.find(x => x.id === '1a'), [me, rival] = g.teamIds;
  prefs.myTeam = null;
  assert.match(renderView(data, url('/minha-equipa')), /Qual é a tua equipa\?/);
  const html = renderView(data, url(`/minha-equipa?equipa=${me}&vs=${rival}`));
  assert.match(html, /Seguir esta equipa/);
  assert.match(html, /Corrida aos pontos/);
  assert.match(html, /O ADN da equipa/);
  assert.match(html, new RegExp(`vs=${rival}" data-keep-scroll aria-current="true"`));
  assert.match(html, /class="[^"]*my-row[^"]*" aria-current="true"/);
  assert.match(html, /Calendário da época/);
  const games = data.matches.filter(m => m.date && (m.homeId === me || m.awayId === me));
  assert.equal((html.match(/class="cal-row[^"]*"><a href="\/jogos\//g) ?? []).length, games.length, 'um sábado por jogo com data');
  assert.doesNotMatch(html, /webcal|\.ics|calendar\.google/, 'nada de calendários externos');
  prefs.myTeam = me;
  const saved = renderView(data, url('/minha-equipa'));
  assert.match(saved, /A tua equipa/);
  assert.match(renderView(data, url('/minha-equipa?escolher=1')), /Qual é a tua equipa\?/);
  assert.match(renderView(data, url('/')), /A tua equipa/);
  prefs.myTeam = null;
  assert.match(renderView(data, url('/')), /Segue a tua equipa/);
});

