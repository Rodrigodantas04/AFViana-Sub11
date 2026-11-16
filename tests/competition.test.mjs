import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { buildFixtureWorkbook, fixtureConfig } from './fixtures/workbook.mjs';
import { importCompetition } from '../lib/competition.js';
import { applyResult, scorerDescription } from '../lib/writer.js';
import { projectDataset } from '../lib/projection.js';

const bytes = buildFixtureWorkbook();
const today = '2026-11-16';
const imported = importCompetition(bytes, fixtureConfig, { today });
const { data, report } = imported;
const team = name => data.teams.find(t => t.name === name);

test('reads both phases; phase 2 placeholders never become teams or games', () => {
  assert.deepEqual(data.phases.map(p => [p.id, p.state]), [['fase-1', 'running'], ['fase-2', 'pending']]);
  assert.equal(data.groups.filter(g => g.phaseId === 'fase-2' && g.defined).length, 0);
  assert.equal(data.matches.filter(m => m.phaseId === 'fase-2').length, 0);
  assert.ok(!data.teams.some(t => t.name === '0' || t.name === ''));
  assert.equal(imported.context.drift, 0, 'fixture caches are consistent with the formulas');
});

test('standings follow the sheet formulas', () => {
  const a = data.groups.find(g => g.id === '1a');
  assert.deepEqual(a.standings.map(s => [data.teams.find(t => t.id === s.teamId).name, s.played, s.points, s.goalDifference]),
    [['Vila Azul', 2, 4, 1], ['Clube Norte "A"', 3, 4, -2], ['Rio Verde', 3, 3, 1]]);
});

test('A and B teams of a club stay separate competitors under one club', () => {
  const club = data.clubs.find(c => c.name === 'Clube Norte');
  assert.equal(club.teamIds.length, 2);
  assert.notEqual(team('Clube Norte "A"').id, team('Clube Norte "B"').id);
});

test('withdrawn team is flagged and its open games are not "scheduled"', () => {
  assert.equal(team('UD Fantasma').withdrawn, true);
  assert.ok(data.matches.filter(m => m.groupId === '1f' && [m.homeId, m.awayId].includes(team('UD Fantasma').id)).every(m => m.status === 'withdrawn'));
});

test('scorers: per phase and total without double counting; own goals not credited', () => {
  const total = Object.fromEntries(data.scorers.total.map(s => [s.name, s.goals]));
  assert.deepEqual(total, Object.fromEntries(data.scorers['fase-1'].map(s => [s.name, s.goals])));
  assert.equal(total['Ana Lima'], 3);
  assert.equal(total['Gil Neto'], 3);
  assert.equal(total['Fil Mota'], undefined);
  assert.equal(data.stats.individualGoals, data.scorers.total.reduce((n, s) => n + s.goals, 0));
  assert.ok(report.issues.some(i => i.code === 'scorers_excess'), 'a PB token on a side with 0 goals is reported');
});

test('repository projection has no names; public projection follows policy and opt-out', () => {
  const repo = projectDataset(data, { scorerNames: 'public' }, { mode: 'repository', today, importedAt: '2026-11-16T00:00:00Z' });
  assert.equal(JSON.stringify(repo).includes('Ana Lima'), false);
  assert.equal(repo.publication.scorerNames, 'redacted');
  const live = projectDataset(data, { scorerNames: 'public' }, { mode: 'public', today, importedAt: '2026-11-16T00:00:00Z' });
  assert.ok(JSON.stringify(live).includes('Ana Lima'));
  assert.equal(JSON.stringify(live).includes('"source"'), false, 'no sheet/row references in public data');
  const ana = live.scorers.total.find(s => s.name === 'Ana Lima');
  const hidden = projectDataset(data, { scorerNames: 'public', excludedScorerIds: [ana.id] }, { mode: 'public', today, importedAt: '2026-11-16T00:00:00Z' });
  assert.equal(JSON.stringify(hidden).includes('Ana Lima'), false, 'opt-out removes the name everywhere');
  const m = hidden.matches.find(x => x.scoring.home.identified === 3 && x.homeGoals === 3);
  assert.equal(m.scoring.home.identified, 3, 'counts are kept when a name is withdrawn');
});

const open = data.matches.find(m => m.groupId === '1a' && m.status === 'scheduled');
const change = (extra = {}) => ({ matchId: open.id, revision: data.sourceHash, operationId: crypto.randomUUID(), homeGoals: 2, awayGoals: 1, scorers: { home: [{ name: 'Nova Pessoa', goals: 2, ownGoal: false }], away: [{ name: '', goals: 1, ownGoal: true }] }, ...extra });

test('writer: changes only inputs + caches, keeps formulas and other parts, re-reads clean', () => {
  const result = applyResult(bytes, fixtureConfig, change(), { today });
  const before = unzipSync(bytes), after = unzipSync(result.bytes);
  const changed = Object.keys(before).filter(k => strFromU8(before[k]) !== strFromU8(after[k]));
  assert.deepEqual(changed.sort(), ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet15.xml', 'xl/worksheets/sheet7.xml'].sort());
  const formulas = x => strFromU8(x).match(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/g).join();
  for (const k of changed.filter(k => k.includes('worksheets'))) assert.equal(formulas(before[k]), formulas(after[k]), `${k}: formulas preserved`);
  assert.match(strFromU8(after['xl/workbook.xml']), /fullCalcOnLoad="1"/);
  assert.equal(result.match.scorers.home.description, 'Nova Pessoa (2)');
  assert.equal(result.match.scorers.away.description, 'Autogolo (PB)');
  assert.equal(result.data.scorers.total.find(s => s.name === 'Nova Pessoa').goals, 2);
  assert.equal(importCompetition(result.bytes, fixtureConfig, { today }).context.drift, 0);
});

test('writer refuses stale revisions, impossible totals and unsafe names', () => {
  assert.throws(() => applyResult(bytes, fixtureConfig, change({ revision: 'a'.repeat(64) }), { today }), e => e.status === 409);
  assert.throws(() => applyResult(bytes, fixtureConfig, change({ homeGoals: 1 }), { today }), /somam 2 golos/);
  assert.throws(() => applyResult(bytes, fixtureConfig, change({ homeGoals: -1 }), { today }), /0 e 99/);
  assert.throws(() => applyResult(bytes, fixtureConfig, change({ homeGoals: 1.5 }), { today }), /0 e 99/);
  for (const name of ['=HYPERLINK("x")', 'Ana, Bia', 'Ana (3)', '']) assert.throws(() => applyResult(bytes, fixtureConfig, change({ scorers: { home: [{ name, goals: 1, ownGoal: false }], away: [] } }), { today }));
  assert.throws(() => applyResult(bytes, fixtureConfig, change({ scorers: { home: [{ name: 'Ana', goals: 1, ownGoal: false }, { name: 'ana', goals: 1, ownGoal: false }], away: [] } }), { today }), /duas vezes/);
  const withdrawn = data.matches.find(m => m.status === 'withdrawn');
  assert.throws(() => applyResult(bytes, fixtureConfig, change({ matchId: withdrawn.id }), { today }), /desistente/);
});

test('writer: re-saving the same result is a no-op on values', () => {
  const finished = data.matches.find(m => m.groupId === '1a' && m.status === 'finished');
  const result = applyResult(bytes, fixtureConfig, change({ matchId: finished.id, homeGoals: finished.homeGoals, awayGoals: finished.awayGoals, scorers: Object.fromEntries(['home', 'away'].map(s => [s, finished.scorers[s].events.map(e => ({ name: e.name, goals: e.ownGoal ? 1 : e.credited, ownGoal: e.ownGoal }))])) }), { today });
  assert.equal(result.changedCells, 4);
});

test('description stays readable by the sheet (10 names max)', () => {
  assert.throws(() => scorerDescription(Array.from({ length: 11 }, (_, i) => ({ name: `Nome ${String.fromCharCode(65 + i)}`, goals: 1, ownGoal: false }))), /10 marcadores/);
});

import { applyChange } from '../lib/writer.js';
import { crestPaths } from '../lib/projection.js';
const op = (b, extra) => applyChange(b, fixtureConfig, { revision: importCompetition(b, fixtureConfig, { today }).data.sourceHash, operationId: crypto.randomUUID(), ...extra }, { today });

test('writer: 2.ª fase teams create that series games; refused when a team is already used or results exist', () => {
  const ids = data.groups.find(g => g.id === '1a').teamIds;
  const r = op(bytes, { type: 'teams', groupId: '2a', teams: [...ids, '', '', ''] });
  assert.deepEqual(r.data.groups.find(g => g.id === '2a').teamIds, ids);
  assert.equal(r.data.matches.filter(m => m.groupId === '2a').length, 6);
  assert.equal(r.data.phases.find(p => p.id === 'fase-2').state, 'running');
  assert.equal(importCompetition(r.bytes, fixtureConfig, { today }).context.drift, 0, 'game team formula caches refreshed too');
  assert.throws(() => op(r.bytes, { type: 'teams', groupId: '2b', teams: [ids[0], data.groups.find(g => g.id === '1b').teamIds[0], '', '', '', ''] }), /já está na Série A/);
  const game = r.data.matches.find(m => m.groupId === '2a');
  const played = op(r.bytes, { type: 'result', matchId: game.id, homeGoals: 1, awayGoals: 0, scorers: { home: [], away: [] } });
  assert.throws(() => op(played.bytes, { type: 'teams', groupId: '2a', teams: [ids[1], ids[0], ids[2], '', '', ''] }), /já tem resultados/);
  assert.throws(() => op(bytes, { type: 'teams', groupId: '2a', teams: [team('UD Fantasma').id, ids[0], '', '', '', ''] }), /desistiu/);
});

test('writer: date change and clearing a result keep everything else intact', () => {
  const finished = data.matches.find(m => m.groupId === '1a' && m.status === 'finished');
  const dated = op(bytes, { type: 'date', matchId: finished.id, date: '2026-12-05' });
  assert.equal(dated.match.date, '2026-12-05');
  assert.equal(dated.match.homeGoals, finished.homeGoals);
  const cleared = op(bytes, { type: 'clear', matchId: finished.id });
  assert.equal(cleared.match.status, 'scheduled');
  assert.equal(cleared.match.scorers.home.description, '');
  assert.ok(cleared.data.groups.find(g => g.id === '1a').standings.every(s => s.played <= 3));
  assert.throws(() => op(cleared.bytes, { type: 'clear', matchId: finished.id }), /não tem resultado/);
  assert.throws(() => op(bytes, { type: 'date', matchId: finished.id, date: '2030-01-01' }), /época/);
});

test('crests need a registered file, source and authorisation', () => {
  assert.deepEqual(crestPaths({ clubs: { a: { file: 'assets/crests/a.svg', source: 'clube', authorizationReference: 'ok 2026-11' }, b: { file: 'assets/crests/b.svg' }, c: { file: '../x.svg', source: 's', authorizationReference: 'r' } } }), { a: '/media/crests/a.svg' });
  const live = projectDataset(data, {}, { mode: 'public', today, importedAt: '2026-11-16T00:00:00Z', crests: { clubs: { 'clube-norte': { file: 'assets/crests/clube-norte.png', source: 'clube', authorizationReference: 'ok' } } } });
  assert.equal(live.clubs.find(c => c.id === 'clube-norte').crestUrl, '/media/crests/clube-norte.png');
});

test('writer: rename joins spellings of one child in every game of that team only', () => {
  const norte = team('Clube Norte "A"');
  // Make a second spelling first, as a typo in another game would.
  const game = data.matches.find(m => m.groupId === '1a' && m.status === 'scheduled' && [m.homeId, m.awayId].includes(norte.id));
  const side = game.homeId === norte.id ? 'home' : 'away';
  const typo = op(bytes, { type: 'result', matchId: game.id, homeGoals: 1, awayGoals: 1, scorers: { home: [{ name: side === 'home' ? 'ana lima' : 'Outro Nome', goals: 1, ownGoal: false }], away: [{ name: side === 'away' ? 'ana lima' : 'Outro Nome', goals: 1, ownGoal: false }] } });
  const before = typo.data.scorers.total.find(s => s.teamId === norte.id && s.name.toLowerCase() === 'ana lima').goals;
  const r = op(typo.bytes, { type: 'rename', teamId: norte.id, from: ['ana lima', 'Ana Lima'], to: 'Ana Lima' });
  const after = r.data.matches.flatMap(m => ['home', 'away'].filter(s => m[s + 'Id'] === norte.id).map(s => m.scorers[s].description)).join(' | ');
  assert.doesNotMatch(after, /ana lima/, 'no lowercase spelling left');
  assert.equal(r.data.scorers.total.find(s => s.teamId === norte.id && s.name === 'Ana Lima').goals, before);
  assert.equal(importCompetition(r.bytes, fixtureConfig, { today }).context.drift, 0);
  assert.throws(() => op(r.bytes, { type: 'rename', teamId: norte.id, from: ['Ninguém Aqui'], to: 'X Y' }), /Não encontrei/);
  assert.throws(() => op(r.bytes, { type: 'rename', teamId: norte.id, from: ['Ana Lima'], to: 'Ana (2)' }), /só pode ter letras/);
});
