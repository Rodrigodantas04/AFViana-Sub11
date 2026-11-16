/**
 * Writes one match result (score + scorer descriptions) into the workbook.
 *
 * Only the four INPUT cells of the match change (home goals, away goals and the
 * two scorer descriptions). Every formula is kept; the values Excel caches next
 * to the formulas are recalculated with lib/excel-engine.js so that Drive
 * previews, Excel and MINHO11 agree immediately, and the workbook is also
 * flagged for a full recalculation when it is next opened.
 */
import { patchSheetXml, requestFullRecalc, packageBytes, strFromU8, strToU8, WorkbookError } from './xlsx.js';
import { importCompetition, describeScorers } from './competition.js';
import { sameCached, fold } from './excel-engine.js';

const fail = (message, status = 422) => { throw new WorkbookError(message, status); };
export const OWN_GOAL_LABEL = 'Autogolo';
const NAME = /^[\p{L}][\p{L}\p{M} .'’-]{0,58}[\p{L}\p{M}.]$|^[\p{L}]$/u;
const isCount = (v, max = 99) => Number.isInteger(v) && v >= 0 && v <= max;

/** Validates the shape coming from the admin UI. Throws a friendly message. */
export function validateChange(change) {
  if (!change || typeof change !== 'object') fail('Pedido de gravação inválido.', 400);
  if (!/^[a-f0-9]{64}$/.test(change.revision ?? '')) fail('Pedido sem versão da fonte. Recarrega a página.', 400);
  if (!/^[a-f0-9-]{36}$/.test(change.operationId ?? '')) fail('Pedido de gravação inválido.', 400);
  if (!/^m-[a-f0-9]{16}$/.test(change.matchId ?? '')) fail('Jogo inválido.', 400);
  for (const side of ['home', 'away']) {
    const label = side === 'home' ? 'da equipa da casa' : 'da equipa de fora';
    if (!isCount(change[side + 'Goals'])) fail(`Golos ${label}: escreve um número inteiro entre 0 e 99.`, 400);
    const list = change.scorers?.[side];
    if (!Array.isArray(list) || list.length > 10) fail(`Marcadores ${label}: no máximo 10 linhas.`, 400);
    const names = new Set(); let total = 0;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object' || typeof entry.ownGoal !== 'boolean') fail('Linha de marcador inválida.', 400);
      const name = String(entry.name ?? '').replace(/\s+/g, ' ').trim();
      if (!isCount(entry.goals) || entry.goals < 1) fail(`Marcadores ${label}: cada linha precisa de pelo menos 1 golo.`, 400);
      if (!entry.ownGoal && !name) fail(`Marcadores ${label}: falta o nome numa linha. Se não sabes quem marcou, remove a linha.`, 400);
      if (name && !NAME.test(name)) fail(`«${name.slice(0, 40)}»: usa só letras, espaços, apóstrofo, hífen ou ponto (sem números, vírgulas ou parênteses).`, 400);
      if (!entry.ownGoal) {
        if (names.has(fold(name))) fail(`«${name}» aparece duas vezes ${label}. Junta os golos numa só linha.`, 400);
        names.add(fold(name));
      }
      total += entry.goals;
    }
    if (total > change[side + 'Goals']) fail(`Os marcadores ${label} somam ${total} golos, mais do que o resultado (${change[side + 'Goals']}).`, 400);
  }
  return true;
}

/** The text the sheet expects: "Nome (2), Outro, Nome Adversário (PB)". */
export function scorerDescription(list) {
  const tokens = [];
  for (const entry of list) {
    const name = String(entry.name ?? '').replace(/\s+/g, ' ').trim();
    if (entry.ownGoal) for (let i = 0; i < entry.goals; i++) tokens.push(`${name || OWN_GOAL_LABEL} (PB)`);
    else tokens.push(entry.goals === 1 ? name : `${name} (${entry.goals})`);
  }
  if (tokens.length > 10) fail('A célula do Excel só lê 10 marcadores por equipa e jogo. Junta golos do mesmo jogador numa linha.', 400);
  const text = tokens.join(', ');
  // The sheet splits names with a 200-character window; refuse anything it would misread.
  const parsed = describeScorers(text);
  const expected = tokens.length, ok = parsed.events.length === expected && !parsed.issues.length && parsed.events.every((e, i) => e.source === tokens[i]);
  if (!ok) fail('A lista de marcadores é demasiado longa para o Excel a ler corretamente. Encurta os nomes.', 400);
  return text;
}

const comparable = m => JSON.stringify([m.homeGoals, m.awayGoals, m.scorers.home.description, m.scorers.away.description, m.homeId, m.awayId, m.date]);

/**
 * @returns {{ bytes: Uint8Array, data, report, changedCells: number, match }}
 */
export function applyResult(bytes, config, change, options = {}) {
  validateChange(change);
  const base = importCompetition(bytes, config, options);
  if (base.data.sourceHash !== change.revision) fail('O Excel foi alterado depois de abrires este jogo. Os teus dados continuam no formulário: recarrega o jogo e grava de novo.', 409);
  const match = base.data.matches.find(m => m.id === change.matchId);
  if (!match) fail('Jogo não encontrado na fonte.', 404);
  if (match.status === 'withdrawn') fail('Este jogo envolve uma equipa desistente e não pode receber resultado aqui.', 422);
  const descriptions = { home: scorerDescription(change.scorers.home), away: scorerDescription(change.scorers.away) };
  const { sheet: sheetName, row } = match.source;
  const pkg = base.context.pkg, files = { ...pkg.files };
  const sheetPath = pkg.sheets.find(s => s.name === sheetName).path;
  const inputs = new Map([
    ['D' + row, { value: change.homeGoals, mode: 'input' }],
    ['F' + row, { value: change.awayGoals, mode: 'input' }],
    ['C' + (row + 1), { value: descriptions.home || null, mode: 'input' }],
    ['G' + (row + 1), { value: descriptions.away || null, mode: 'input' }],
  ]);
  files[sheetPath] = strToU8(patchSheetXml(strFromU8(files[sheetPath]), inputs, sheetName));
  const middle = importCompetition({ ...pkg, files }, config, options);
  let changedCells = inputs.size;
  for (const [name, caches] of middle.context.caches) {
    const cells = middle.context.sheetCells.get(name), updates = new Map();
    for (const [address, value] of caches) if (!sameCached(value, cells.get(address)?.value ?? null)) updates.set(address, { value, mode: 'cache' });
    if (!updates.size) continue;
    const path = pkg.sheets.find(s => s.name === name).path;
    files[path] = strToU8(patchSheetXml(strFromU8(files[path]), updates, name));
    changedCells += updates.size;
  }
  files['xl/workbook.xml'] = strToU8(requestFullRecalc(strFromU8(files['xl/workbook.xml'])));
  const output = packageBytes(files);
  // Read our own output back before anyone uploads it.
  const verified = importCompetition(output, config, options);
  if (verified.context.drift) fail('Verificação interna falhou: os valores calculados não ficaram coerentes. Nada foi gravado.', 500);
  const saved = verified.data.matches.find(m => m.id === change.matchId);
  if (!saved || saved.homeGoals !== change.homeGoals || saved.awayGoals !== change.awayGoals || saved.scorers.home.description !== descriptions.home || saved.scorers.away.description !== descriptions.away) fail('Verificação interna falhou: o resultado relido não coincide. Nada foi gravado.', 500);
  const before = new Map(base.data.matches.map(m => [m.id, comparable(m)]));
  for (const m of verified.data.matches) if (m.id !== change.matchId && before.get(m.id) !== comparable(m)) fail('Verificação interna falhou: outro jogo seria alterado. Nada foi gravado.', 500);
  if (verified.data.matches.length !== base.data.matches.length) fail('Verificação interna falhou: número de jogos alterado. Nada foi gravado.', 500);
  return { bytes: output, data: verified.data, report: verified.report, changedCells, match: saved };
}
