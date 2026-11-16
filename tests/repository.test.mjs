import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDataset } from '../src/domain.js';

test('committed snapshot is valid and contains no individual names', () => {
  const data = validateDataset(JSON.parse(fs.readFileSync(new URL('../data/public/competition.json', import.meta.url), 'utf8')));
  assert.equal(data.publication.scorerNames, 'redacted');
  for (const list of Object.values(data.scorers)) assert.equal(list.length, 0);
  for (const m of data.matches) for (const side of ['home', 'away']) assert.equal(m.scoring[side].scorers.length, 0);
});

test('private material is ignored by Git', () => {
  const ignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  for (const entry of ['data/internal/', 'data/*.xlsx', '.env']) assert.ok(ignore.includes(entry), entry);
});
