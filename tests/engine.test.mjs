import test from 'node:test';
import assert from 'node:assert/strict';
import { excelTokens, excelToken, excelTrim, evaluateScorerSheet, evaluateSeries, criteria } from '../lib/excel-engine.js';

test('tokens follow the sheet formula: 10 slots, TRIM, comma split', () => {
  assert.deepEqual(excelTokens('Ana  Lima (2), Bia').slice(0, 3), ['Ana Lima (2)', 'Bia', '']);
  const eleven = Array.from({ length: 11 }, (_, i) => `N${String.fromCharCode(65 + i)}`).join(', ');
  assert.equal(excelTokens(eleven).filter(Boolean).length, 10, 'the 11th name is not read by the sheet');
  assert.equal(excelTrim('  a   b  '), 'a b');
});

test('token notation: (n) goals, (PB) own goal credited 0, (AG) is NOT an own goal for the sheet', () => {
  assert.deepEqual(excelToken('Ana Lima (2)'), { name: 'Ana Lima', goals: 2, ownGoal: false });
  assert.deepEqual(excelToken('Ana Lima (pb)'), { name: 'Ana Lima', goals: 0, ownGoal: true });
  assert.deepEqual(excelToken('Ana Lima (AG)'), { name: 'Ana Lima', goals: 1, ownGoal: false });
  assert.deepEqual(excelToken('Ana Lima (2'), { name: 'Ana Lima', goals: 1, ownGoal: false });
  assert.deepEqual(excelToken('Ana Lima'), { name: 'Ana Lima', goals: 1, ownGoal: false });
});

test('scorer table: case-insensitive keys, same name in two teams kept apart, ties by first appearance', () => {
  const slots = [
    { text: 'Tó Exemplo, Rui (2)', team: 'Team A' },
    { text: 'tó exemplo', team: 'Team A' },
    { text: 'Rui', team: 'Team B' },
    { text: 'Zé (2), Outro (PB)', team: 'Team B' },
  ].flatMap(s => Array.from({ length: 10 }, (_, i) => ({ ...s, slot: i + 1 })));
  const { unique, ranking } = evaluateScorerSheet({ slots, rankingRows: 10 });
  const byKey = Object.fromEntries(unique.map(u => [`${u.name}|${u.team}`, u.goals]));
  assert.equal(byKey['Tó Exemplo|Team A'], 2);
  assert.equal(byKey['Rui|Team A'], 2);
  assert.equal(byKey['Rui|Team B'], 1);
  assert.equal(byKey['Outro|Team B'], 0, 'own goal listed with 0, never credited');
  assert.deepEqual(ranking.slice(0, 3).map(r => r.B), ['Tó Exemplo', 'Rui', 'Zé'], 'equal totals keep first-appearance order');
});

test('series standings: points, goal difference, goals for, then entry order; withdrawn last; empty slot shows 0', () => {
  const rows = { C14: 'A', D14: 2, F14: 0, G14: 'B', C16: 'C', D16: 1, F16: 1, G16: 'A', C18: 'B', D18: 3, F18: 1, G18: 'C' };
  const result = evaluateSeries({ teams: ['A', 'B', 'C', 'X (Desistiu)', '', ''], cells: a => rows[a] ?? null, lastRow: 18 });
  assert.deepEqual(result.table.slice(0, 6).map(r => r.B), ['A', 'B', 'C', 'X (Desistiu)', 0, 0]);
  assert.deepEqual([result.aux[0].U, result.aux[0].T, result.aux[0].R], [4, 2, 3]);
  assert.equal(result.aux[1].W, 2);
});

test('criteria honour Excel wildcards', () => {
  assert.equal(criteria('Ana*')('ana lima'), true);
  assert.equal(criteria('Ana~*')('Ana*'), true);
  assert.equal(criteria('Ana')('Ana Lima'), false);
});
