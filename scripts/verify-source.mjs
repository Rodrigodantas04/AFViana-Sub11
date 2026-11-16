/**
 * Local-only check of the REAL workbook (data/source.xlsx, never committed):
 *  1. every formula matches the known templates;
 *  2. recomputing all formulas reproduces every cached value Excel saved (drift = 0);
 *  3. a write round-trip on an in-memory copy keeps formulas/styles and re-reads clean.
 * The real file is never modified.
 */
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { importCompetition } from '../lib/competition.js';
import { applyResult } from '../lib/writer.js';
import { todayLisbon } from '../src/domain.js';

const config = JSON.parse(fs.readFileSync(new URL('../config/competition.json', import.meta.url)));
const file = process.argv[2] ?? new URL('../data/source.xlsx', import.meta.url);
const bytes = fs.readFileSync(file), today = todayLisbon();
const started = Date.now();
const { data, report, context } = importCompetition(bytes, config, { today });
const cached = [...context.caches.values()].reduce((n, m) => n + m.size, 0);
console.log(`Leitura: ${Date.now() - started} ms · ${report.sheets.length} folhas · ${cached} valores calculados comparados · divergências: ${context.drift}`);
console.log('Totais:', JSON.stringify(data.stats));
for (const phase of data.phases) console.log(`${phase.name}: ${phase.state}`);
for (const group of data.groups.filter(g => g.defined)) {
  const ms = data.matches.filter(m => m.groupId === group.id), done = ms.filter(m => m.status === 'finished');
  console.log(`  ${group.name} (${group.sourceLabel}): ${ms.length} jogos, ${done.length} com resultado, ${done.reduce((n, m) => n + m.homeGoals + m.awayGoals, 0)} golos`);
}
for (const issue of report.issues.filter(i => i.level === 'warning')) console.log('AVISO', issue.message);
const open = data.matches.find(m => m.status === 'scheduled');
if (open) {
  const t = Date.now();
  const result = applyResult(bytes, config, { matchId: open.id, revision: data.sourceHash, operationId: crypto.randomUUID(), homeGoals: 1, awayGoals: 0, scorers: { home: [{ name: 'Verificação Interna', goals: 1, ownGoal: false }], away: [] } }, { today });
  const a = unzipSync(bytes), b = unzipSync(result.bytes);
  const changed = Object.keys(a).filter(k => strFromU8(a[k]) !== strFromU8(b[k]));
  const formulas = x => (strFromU8(x).match(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/g) ?? []).join();
  const styles = x => (strFromU8(x).match(/ s="\d+"/g) ?? []).join();
  const intact = changed.filter(k => k.includes('worksheets')).every(k => formulas(a[k]) === formulas(b[k]) && styles(a[k]) === styles(b[k]));
  console.log(`Ensaio de gravação em memória: ${Date.now() - t} ms · ${result.changedCells} células · partes alteradas: ${changed.join(', ')} · fórmulas e estilos intactos: ${intact}`);
  if (!intact) process.exitCode = 1;
}
if (context.drift) process.exitCode = 1;
