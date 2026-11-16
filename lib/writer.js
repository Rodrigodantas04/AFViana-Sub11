/**
 * Changes INPUT cells of the workbook and refreshes the cached values of every
 * formula that depends on them. Formulas, styles and all other package parts
 * are kept; the workbook is flagged for full recalculation; the result is read
 * back and checked before anyone uploads it.
 *
 * Operations (change.type):
 *   result  matchId, homeGoals, awayGoals, scorers{home,away}   score + scorer descriptions
 *   clear   matchId                                              remove a result entered by mistake
 *   date    matchId, date (YYYY-MM-DD)                           game date (column B)
 *   teams   groupId, teams[6] (team ids or '')                   2.ª fase teams in M6:M11
 */
import { patchSheetXml, requestFullRecalc, packageBytes, strFromU8, strToU8, WorkbookError } from './xlsx.js';
import { importCompetition, describeScorers } from './competition.js';
import { sameCached, fold } from './excel-engine.js';

const fail = (message, status = 422) => { throw new WorkbookError(message, status); };
export const OWN_GOAL_LABEL = 'Autogolo';
const NAME = /^[\p{L}][\p{L}\p{M} .'’-]{0,58}[\p{L}\p{M}.]$|^[\p{L}]$/u;
const isCount = (v, max = 99) => Number.isInteger(v) && v >= 0 && v <= max;
export const OPERATIONS = ['result', 'clear', 'date', 'teams'];

function validateScorers(change) {
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
}

/** Validates the shape coming from the admin UI. Throws a friendly message. */
export function validateChange(change) {
  if (!change || typeof change !== 'object') fail('Pedido de gravação inválido.', 400);
  change.type ??= 'result';
  if (!OPERATIONS.includes(change.type)) fail('Operação desconhecida.', 400);
  if (!/^[a-f0-9]{64}$/.test(change.revision ?? '')) fail('Pedido sem versão da fonte. Recarrega a página.', 400);
  if (!/^[a-f0-9-]{36}$/.test(change.operationId ?? '')) fail('Pedido de gravação inválido.', 400);
  if (change.type === 'teams') {
    if (!/^2[a-f]$/.test(change.groupId ?? '')) fail('Só as séries da 2.ª fase recebem equipas aqui.', 400);
    if (!Array.isArray(change.teams) || change.teams.length !== 6 || change.teams.some(t => typeof t !== 'string' || (t && !/^[a-z0-9-]{1,80}$/.test(t)))) fail('Lista de equipas inválida.', 400);
    return true;
  }
  if (!/^m-[a-f0-9]{16}$/.test(change.matchId ?? '')) fail('Jogo inválido.', 400);
  if (change.type === 'result') validateScorers(change);
  if (change.type === 'date') {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(change.date ?? '') && new Date(change.date + 'T00:00:00Z').toISOString().startsWith(change.date);
    if (!ok || change.date < '2026-08-01' || change.date > '2027-07-31') fail('Data inválida (tem de estar dentro da época 2026/2027).', 400);
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
  const ok = parsed.events.length === tokens.length && !parsed.issues.length && parsed.events.every((e, i) => e.source === tokens[i]);
  if (!ok) fail('A lista de marcadores é demasiado longa para o Excel a ler corretamente. Encurta os nomes.', 400);
  return text;
}

const comparable = m => JSON.stringify([m.homeGoals, m.awayGoals, m.scorers.home.description, m.scorers.away.description, m.homeId, m.awayId, m.date]);
const ddmmyyyy = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Which input cells an operation writes, plus what must be true after re-reading. */
function plan(base, change) {
  const { data, context } = base;
  if (change.type === 'teams') {
    const group = data.groups.find(g => g.id === change.groupId);
    if (!group) fail('Série não encontrada.', 404);
    if (data.matches.some(m => m.groupId === group.id && m.status === 'finished')) fail('Esta série já tem resultados: mudar as equipas trocaria os jogos. Corrige no Excel com cuidado.', 409);
    const chosen = change.teams.filter(Boolean);
    if (chosen.length < 2) fail('Escolhe pelo menos duas equipas.', 400);
    if (new Set(chosen).size !== chosen.length) fail('A mesma equipa aparece duas vezes.', 400);
    const names = change.teams.map(id => {
      if (!id) return '';
      const team = data.teams.find(t => t.id === id);
      if (!team) fail('Equipa desconhecida.', 400);
      if (team.withdrawn) fail(`${team.name} desistiu da prova.`, 400);
      const elsewhere = data.groups.find(g => g.phaseId === group.phaseId && g.id !== group.id && g.teamIds.includes(id));
      if (elsewhere) fail(`${team.name} já está na Série ${elsewhere.letter} desta fase.`, 400);
      return team.name;
    });
    const sheet = context.series[group.id].sheetName;
    return {
      sheet, inputs: new Map(names.map((name, i) => [`M${6 + i}`, { value: name || null, mode: 'input' }])),
      check: verified => {
        const g = verified.data.groups.find(x => x.id === group.id);
        const expected = change.teams.filter(Boolean);
        if (JSON.stringify(g.teamIds) !== JSON.stringify(expected)) fail('Verificação interna falhou: equipas relidas diferentes. Nada foi gravado.', 500);
      },
      untouched: () => true,
      summary: { groupId: group.id, before: group.teamIds, after: change.teams.filter(Boolean) },
    };
  }
  const match = data.matches.find(m => m.id === change.matchId);
  if (!match) fail('Jogo não encontrado na fonte.', 404);
  const { sheet, row } = match.source;
  const before = { homeGoals: match.homeGoals, awayGoals: match.awayGoals, home: match.scorers.home.description, away: match.scorers.away.description, date: match.date };
  if (change.type === 'date') {
    return {
      sheet, inputs: new Map([['B' + row, { value: ddmmyyyy(change.date), mode: 'input' }]]),
      check: verified => { if (verified.data.matches.find(m => m.id === match.id)?.date !== change.date) fail('Verificação interna falhou: data relida diferente. Nada foi gravado.', 500); },
      summary: { matchId: match.id, before, after: { ...before, date: change.date } },
    };
  }
  if (match.status === 'withdrawn') fail('Este jogo envolve uma equipa desistente e não recebe resultado.', 422);
  if (change.type === 'clear') {
    if (match.homeGoals === null && match.awayGoals === null && !match.scorers.home.description && !match.scorers.away.description) fail('Este jogo não tem resultado para apagar.', 409);
    return {
      sheet, inputs: new Map([['D' + row, { value: null, mode: 'input' }], ['F' + row, { value: null, mode: 'input' }], ['C' + (row + 1), { value: null, mode: 'input' }], ['G' + (row + 1), { value: null, mode: 'input' }]]),
      check: verified => { const m = verified.data.matches.find(x => x.id === match.id); if (m.homeGoals !== null || m.awayGoals !== null || m.scorers.home.description || m.scorers.away.description) fail('Verificação interna falhou: o resultado não ficou apagado. Nada foi gravado.', 500); },
      summary: { matchId: match.id, before, after: { ...before, homeGoals: null, awayGoals: null, home: '', away: '' } },
    };
  }
  const descriptions = { home: scorerDescription(change.scorers.home), away: scorerDescription(change.scorers.away) };
  return {
    sheet,
    inputs: new Map([['D' + row, { value: change.homeGoals, mode: 'input' }], ['F' + row, { value: change.awayGoals, mode: 'input' }], ['C' + (row + 1), { value: descriptions.home || null, mode: 'input' }], ['G' + (row + 1), { value: descriptions.away || null, mode: 'input' }]]),
    check: verified => {
      const saved = verified.data.matches.find(m => m.id === match.id);
      if (!saved || saved.homeGoals !== change.homeGoals || saved.awayGoals !== change.awayGoals || saved.scorers.home.description !== descriptions.home || saved.scorers.away.description !== descriptions.away) fail('Verificação interna falhou: o resultado relido não coincide. Nada foi gravado.', 500);
    },
    summary: { matchId: match.id, before, after: { ...before, homeGoals: change.homeGoals, awayGoals: change.awayGoals, home: descriptions.home, away: descriptions.away } },
  };
}

/**
 * @returns {{ bytes: Uint8Array, data, report, changedCells: number, summary, match }}
 */
export function applyChange(bytes, config, change, options = {}) {
  validateChange(change);
  const base = importCompetition(bytes, config, options);
  if (base.data.sourceHash !== change.revision) fail('O Excel foi alterado depois de abrires este ecrã. Os teus dados continuam no formulário: atualiza e grava de novo.', 409);
  const step = plan(base, change);
  const pkg = base.context.pkg, files = { ...pkg.files };
  const sheetPath = pkg.sheets.find(s => s.name === step.sheet).path;
  files[sheetPath] = strToU8(patchSheetXml(strFromU8(files[sheetPath]), step.inputs, step.sheet));
  const middle = importCompetition({ ...pkg, files }, config, options);
  let changedCells = step.inputs.size;
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
  step.check(verified);
  const target = change.type === 'teams' ? null : change.matchId;
  const before = new Map(base.data.matches.map(m => [m.id, comparable(m)]));
  if (change.type !== 'teams') {
    for (const m of verified.data.matches) if (m.id !== target && before.get(m.id) !== comparable(m)) fail('Verificação interna falhou: outro jogo seria alterado. Nada foi gravado.', 500);
    if (verified.data.matches.length !== base.data.matches.length) fail('Verificação interna falhou: número de jogos alterado. Nada foi gravado.', 500);
  } else {
    // Only games of the chosen 2.ª fase series may appear; nothing else changes.
    for (const m of verified.data.matches) if (m.groupId !== change.groupId && before.get(m.id) !== comparable(m)) fail('Verificação interna falhou: jogos de outra série seriam alterados. Nada foi gravado.', 500);
  }
  return { bytes: output, data: verified.data, report: verified.report, changedCells, summary: step.summary, match: target ? verified.data.matches.find(m => m.id === target) : null };
}

/** Backwards-compatible name for a result change. */
export const applyResult = (bytes, config, change, options) => applyChange(bytes, config, { type: 'result', ...change }, options);
