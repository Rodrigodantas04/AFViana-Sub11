/**
 * Reads the AFVC "Gomes Ribeiro" two-phase workbook into the MINHO11 model.
 *
 * Inputs (what people type) are read from the sheets; everything derived
 * (standings, scorer rankings) is evaluated with lib/excel-engine.js using the
 * workbook's own formulas, which are checked against known templates first.
 * The cached values Excel stored are compared and any drift is reported.
 */
import { createHash } from 'node:crypto';
import { openPackage, readSheet, asText, WorkbookError } from './xlsx.js';
import { evaluateSeries, evaluateScorerSheet, excelTokens, excelToken, sameCached, fold } from './excel-engine.js';

export const SCHEMA_VERSION = 2;
const fail = (message, status) => { throw new WorkbookError(message, status); };
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : Buffer.from(value)).digest('hex');
export const normalized = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
export const slug = value => normalized(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Python json.dumps(list, ensure_ascii=False) – used by the IDs published before schema 2. */
const pythonJsonList = items => '[' + items.map(v => JSON.stringify(v)).join(', ') + ']';
export const cleanTeamName = name => asText(name).replace(/\s*\(\s*desistiu\s*\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
export const isWithdrawnName = name => /\(\s*desistiu\s*\)/i.test(asText(name));

const PHASE_SHEET = /^([12])\.?ª Fase - Série ([1-6A-F])$/;
const SCORER_SHEETS = { 'fase-1': /^Marcadores 1\.?ª Fase$/, 'fase-2': /^Marcadores 2\.?ª Fase$/, total: /^Marcadores Totais$/ };
export const PHASES = [
  { id: 'fase-1', number: 1, name: '1.ª Fase' },
  { id: 'fase-2', number: 2, name: '2.ª Fase' },
];

// --- formula templates (fail closed when the workbook logic changes) ---------
const seriesTemplates = end => ({
  N: k => `IF(M${k}="",0,COUNTIFS($C$14:$C$${end},M${k},$D$14:$D$${end},"<>")+COUNTIFS($G$14:$G$${end},M${k},$F$14:$F$${end},"<>"))`,
  O: k => `IF(M${k}="",0,SUMPRODUCT(($C$14:$C$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($D$14:$D$${end}>$F$14:$F$${end}))+SUMPRODUCT(($G$14:$G$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($F$14:$F$${end}>$D$14:$D$${end})))`,
  P: k => `IF(M${k}="",0,SUMPRODUCT(($C$14:$C$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($D$14:$D$${end}=$F$14:$F$${end}))+SUMPRODUCT(($G$14:$G$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($F$14:$F$${end}=$D$14:$D$${end})))`,
  Q: k => `IF(M${k}="",0,SUMPRODUCT(($C$14:$C$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($D$14:$D$${end}<$F$14:$F$${end}))+SUMPRODUCT(($G$14:$G$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($F$14:$F$${end}<$D$14:$D$${end})))`,
  R: k => `IF(M${k}="",0,SUMIFS($D$14:$D$${end},$C$14:$C$${end},M${k})+SUMIFS($F$14:$F$${end},$G$14:$G$${end},M${k}))`,
  S: k => `IF(M${k}="",0,SUMIFS($F$14:$F$${end},$C$14:$C$${end},M${k})+SUMIFS($D$14:$D$${end},$G$14:$G$${end},M${k}))`,
  T: k => `R${k}-S${k}`,
  U: k => `O${k}*3+P${k}`,
  V: k => `IF(M${k}="",-1000000000-${k - 6},IF(ISNUMBER(SEARCH("Desistiu",M${k})),-999999999-${k - 6}*0.01,U${k}*1000000+T${k}*1000+R${k}-${k - 6}*0.01))`,
  W: k => `RANK(V${k},$V$6:$V$11)`,
  ...Object.fromEntries([...'BCDEFGHIJ'].map((col, i) => [col, k => `IFERROR(INDEX($${'MNOPQRSTU'[i]}$6:$${'MNOPQRSTU'[i]}$11, MATCH(${k - 5}, $W$6:$W$11, 0)), "")`])),
});

/** Resolve the formula text of a cell, expanding shared formulas by row offset. */
function formulaResolver(sheet) {
  const masters = new Map();
  for (const [address, cell] of sheet.cells) if (cell.sharedIndex !== null && cell.formula) masters.set(cell.sharedIndex, { address, text: cell.formula });
  return address => {
    const cell = sheet.cells.get(address);
    if (!cell?.hasFormula) return null;
    if (cell.formula) return cell.formula;
    const master = masters.get(cell.sharedIndex);
    if (!master) return '';
    const offset = Number(address.match(/\d+$/)[0]) - Number(master.address.match(/\d+$/)[0]);
    // Shift relative row references only (not $-anchored rows, not sheet-quoted text).
    return master.text.replace(/('(?:[^']|'')*'!)?(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, sheetRef, c$, col, r$, row) => `${sheetRef ?? ''}${c$}${col}${r$}${r$ ? row : Number(row) + offset}`);
  };
}

function assertFormula(resolve, sheetName, address, expected) {
  const actual = resolve(address);
  if (actual !== expected) fail(`A fórmula ${sheetName}!${address} não corresponde à lógica conhecida. Importação interrompida para não calcular valores errados.`, 409);
}

function seriesSheetInfo(sheet, phase, key) {
  const title = asText(sheet.get('A2'));
  const letter = phase === 1 ? /\(SÉRIE ([A-F])\)/i.exec(title)?.[1]?.toUpperCase() : key;
  if (!letter) fail(`${sheet.name}: não foi possível identificar a letra da série no título.`);
  const headers = ['Jor.', 'Data', 'Equipa Visitada (Casa)', 'GM', 'vs', 'GF', 'Equipa Visitante (Fora)'];
  if ([...'ABCDEFG'].some((c, i) => asText(sheet.get(c + '13')) !== headers[i])) fail(`${sheet.name}: cabeçalho do programa de jogos diferente do esperado (linha 13).`, 409);
  if ([...'ABCDEFGHIJ'].some((c, i) => asText(sheet.get(c + '5')) !== ['Pos.', 'Equipa', 'J', 'V', 'E', 'D', 'GM', 'GS', 'DF', 'Pts'][i])) fail(`${sheet.name}: cabeçalho da classificação diferente do esperado (linha 5).`, 409);
  const rows = [];
  for (let r = 14; /^J\d+$/.test(asText(sheet.get('A' + r))); r += 2) rows.push(r);
  if (!rows.length) fail(`${sheet.name}: sem jogos.`);
  const end = Number(/\$C\$14:\$C\$(\d+)/.exec(sheet.cells.get('N6')?.formula ?? '')?.[1]);
  if (!end || end < rows.at(-1)) fail(`${sheet.name}: intervalo das fórmulas da classificação inesperado.`, 409);
  return { letter, title, rows, end };
}

function evaluateSeriesSheet(sheet, info) {
  const resolve = formulaResolver(sheet);
  const templates = seriesTemplates(info.end);
  for (let k = 6; k <= 11; k++) for (const [col, template] of Object.entries(templates)) assertFormula(resolve, sheet.name, col + k, template(k));
  const teams = [];
  for (let k = 6; k <= 11; k++) {
    const cell = sheet.cells.get('M' + k);
    if (cell?.hasFormula) fail(`${sheet.name}!M${k} deveria ser uma célula de introdução de equipa.`, 409);
    teams.push(asText(cell?.value).trim() === '' ? '' : asText(cell.value));
  }
  // Game team cells may be formulas IF(Mx="","",Mx) (2.ª fase); evaluate them from the inputs.
  const values = new Map();
  const value = address => {
    if (values.has(address)) return values.get(address);
    const cell = sheet.cells.get(address);
    let v = cell?.value ?? null;
    if (cell?.hasFormula) {
      const f = resolve(address), m = /^IF\((M(\d+))="","",\1\)$/.exec(f ?? '');
      if (!m || Number(m[2]) < 6 || Number(m[2]) > 11) fail(`Fórmula inesperada em ${sheet.name}!${address}.`, 409);
      v = teams[Number(m[2]) - 6];
    }
    if (typeof v === 'string' && v === '' && !cell?.hasFormula) v = null;
    values.set(address, v);
    return v;
  };
  const result = evaluateSeries({ teams, cells: value, lastRow: info.end });
  // 2.ª fase: the game team cells are formulas too; keep their cached text in step with M6:M11.
  for (const row of info.rows) for (const col of ['C', 'G']) if (sheet.cells.get(col + row)?.hasFormula) result.caches.set(col + row, asText(value(col + row)));
  return { ...result, teams, value };
}

function scorerSheetSlots(sheet) {
  const resolve = formulaResolver(sheet);
  const header = ['Pos.', 'Jogador', 'Equipa', 'Golos'];
  if ([...'ABCD'].some((c, i) => asText(sheet.get(c + '4')) !== header[i])) fail(`${sheet.name}: cabeçalho diferente do esperado.`, 409);
  const aux = { G: 'Token_Raw', H: 'Jogador_Raw', I: 'Equipa_Raw', J: 'Golos_Raw', L: 'Key_Raw', M: 'Seq_Unique', N: 'Uniq_Jogador', O: 'Uniq_Equipa', P: 'Uniq_Golos', Q: 'Sort_Key', R: 'Rank_Uniq' };
  for (const [c, label] of Object.entries(aux)) if (asText(sheet.get(c + '4')) !== label) fail(`${sheet.name}: coluna auxiliar ${c} diferente do esperado.`, 409);
  const slots = [];
  for (let r = 5; ; r++) {
    const g = resolve('G' + r);
    if (g === null) break;
    const m = /^TRIM\(MID\(SUBSTITUTE\('((?:[^']|'')+)'!([A-Z]+\d+),",",REPT\(" ",200\)\),\((\d+)-1\)\*200\+1,200\)\)$/.exec(g);
    const i = /^IF\(H(\d+)="","",'((?:[^']|'')+)'!([A-Z]+\d+)\)$/.exec(resolve('I' + r) ?? '');
    if (!m || !i || Number(i[1]) !== r) fail(`${sheet.name}!G${r}/I${r}: fórmula de marcadores inesperada.`, 409);
    slots.push({ row: r, sheet: m[1].replaceAll("''", "'"), cell: m[2], slot: Number(m[3]), teamSheet: i[2].replaceAll("''", "'"), teamCell: i[3] });
  }
  const n = slots.length, last = 4 + n;
  if (!n) fail(`${sheet.name}: sem fórmulas de marcadores.`);
  let rankingRows = 0;
  while (resolve('B' + (5 + rankingRows)) !== null) rankingRows++;
  const expect = {
    H: r => `IF(G${r}="","",TRIM(IF(ISNUMBER(FIND("(",G${r})),LEFT(G${r},FIND("(",G${r})-1),G${r})))`,
    J: r => `IF(H${r}="",0,IF(ISNUMBER(SEARCH("(PB)",G${r})),0,IF(ISNUMBER(FIND("(",G${r})),IFERROR(VALUE(MID(G${r},FIND("(",G${r})+1,FIND(")",G${r})-FIND("(",G${r})-1)),1),1)))`,
    L: r => `IF(AND(H${r}<>"",I${r}<>""),H${r}&"|"&I${r},"")`,
    M: r => `IF(L${r}="",0,IF(COUNTIF($L$5:L${r},L${r})=1,MAX($M$4:M${r - 1})+1,0))`,
    N: r => `IFERROR(INDEX($H$5:$H$${last},MATCH(${r - 4},$M$5:$M$${last},0)),"")`,
    O: r => `IFERROR(INDEX($I$5:$I$${last},MATCH(${r - 4},$M$5:$M$${last},0)),"")`,
    P: r => `IF(N${r}="",0,SUMIFS($J$5:$J$${last},$H$5:$H$${last},N${r},$I$5:$I$${last},O${r}))`,
    Q: r => `IF(N${r}="",-1,P${r}*100000-${r - 5}*0.01)`,
    R: r => `IF(N${r}="","",RANK(Q${r},$Q$5:$Q$${last}))`,
  };
  for (const { row } of slots) for (const [c, t] of Object.entries(expect)) assertFormula(resolve, sheet.name, c + row, t(row));
  for (let p = 1; p <= rankingRows; p++) {
    const r = 4 + p;
    assertFormula(resolve, sheet.name, 'B' + r, `IFERROR(INDEX($N$5:$N$${last},MATCH(${p},$R$5:$R$${last},0)),"")`);
    assertFormula(resolve, sheet.name, 'C' + r, `IFERROR(INDEX($O$5:$O$${last},MATCH(${p},$R$5:$R$${last},0)),"")`);
    assertFormula(resolve, sheet.name, 'D' + r, `IF(B${r}="","",INDEX($P$5:$P$${last},MATCH(${p},$R$5:$R$${last},0)))`);
  }
  return { slots, rankingRows };
}

function parseDate(value, date1904) {
  if (value === null || value === '') return null;
  if (typeof value === 'number') {
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    return new Date(base + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(asText(value).trim());
  if (!m) return undefined;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isFinite(Date.parse(iso + 'T00:00:00Z')) && new Date(iso + 'T00:00:00Z').toISOString().startsWith(iso) ? iso : undefined;
}

const goalCount = v => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Events of one scorer description, as Excel tokenizes it (10 slots). */
export function describeScorers(text) {
  const raw = asText(text);
  const commaTokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const tokens = excelTokens(raw).filter(Boolean);
  const events = [];
  for (const token of tokens) {
    const t = excelToken(token);
    if (!t.name) continue;
    events.push({ name: t.name, goals: t.ownGoal ? 1 : t.goals, ownGoal: t.ownGoal, credited: t.goals, source: token });
  }
  const issues = [];
  if (commaTokens.length > 10) issues.push('Mais de 10 nomes na mesma célula: o Excel só lê os 10 primeiros.');
  if (raw.length - (raw.match(/,/g)?.length ?? 0) > 200 && commaTokens.length > 1) issues.push('Descrição demasiado longa: o Excel pode partir os nomes de forma incorreta.');
  for (const token of commaTokens) {
    if (/\(\s*AG\s*\)/i.test(token)) issues.push(`«${token}»: o Excel conta (AG) como golo do jogador; para autogolo usa (PB).`);
    else if (/\(/.test(token) && !/^[^()]+\(\s*(?:\d+|PB)\s*\)$/i.test(token)) issues.push(`«${token}»: notação não reconhecida.`);
  }
  return { events, issues };
}

/**
 * @returns {{ data, report, context }} data = internal dataset (never served as-is),
 * report = validation report, context = what the writer needs.
 */
export function importCompetition(input, config, { today, legacyIds = true } = {}) {
  const pkg = input?.files && input?.sheets ? input : openPackage(input);
  const sourceHash = input?.files && input?.sheets ? null : sha256(input);
  const issues = [];
  const issue = (level, code, message, where = {}) => issues.push({ level, code, message, ...where });
  const sheetsByPhase = { 1: [], 2: [] };
  const scorerSheetNames = {};
  for (const s of pkg.sheets) {
    const m = PHASE_SHEET.exec(s.name);
    if (m) { sheetsByPhase[m[1]].push({ name: s.name, key: m[2] }); continue; }
    const scorer = Object.entries(SCORER_SHEETS).find(([, re]) => re.test(s.name));
    if (scorer) { scorerSheetNames[scorer[0]] = s.name; continue; }
    issue('info', 'extra_sheet', `Folha adicional preservada mas não importada: ${s.name}.`);
    if (s.state !== 'visible') issue('info', 'hidden_sheet', `Folha oculta: ${s.name}.`);
  }
  if (sheetsByPhase[1].length !== 6) fail('A 1.ª fase deve ter seis séries. Estrutura do Excel diferente da esperada.', 409);
  if (sheetsByPhase[2].length !== 6) fail('A 2.ª fase deve ter seis séries preparadas. Estrutura do Excel diferente da esperada.', 409);
  for (const key of Object.keys(SCORER_SHEETS)) if (!scorerSheetNames[key]) fail(`Falta a folha de marcadores (${key}).`, 409);

  const teams = new Map(), clubs = new Map(), groups = [], matches = [], context = { series: {}, scorerSheets: scorerSheetNames, pkg, caches: new Map(), drift: 0 };
  const clubOf = name => config.clubMappings?.[name] ?? name;
  const ensureTeam = rawName => {
    const name = cleanTeamName(rawName), id = slug(name);
    if (!id) fail(`Nome de equipa inválido: «${rawName}».`);
    if (!teams.has(id)) {
      const clubName = clubOf(name), clubId = slug(clubName);
      if (!clubs.has(clubId)) clubs.set(clubId, { id: clubId, slug: clubId, name: clubName, crestUrl: null, teamIds: [] });
      clubs.get(clubId).teamIds.push(id);
      teams.set(id, { id, name, clubId, withdrawn: false, sourceNames: new Set() });
    }
    const team = teams.get(id);
    team.sourceNames.add(asText(rawName));
    if (isWithdrawnName(rawName)) team.withdrawn = true;
    return team;
  };

  const sheetValues = new Map(); // sheet name -> evaluated cell reader (used by scorer sheets)
  for (const phase of PHASES) {
    const list = sheetsByPhase[phase.number].map(s => {
      const sheet = readSheet(pkg, s.name);
      return { sheet, info: seriesSheetInfo(sheet, phase.number, s.key) };
    }).sort((a, b) => a.info.letter.localeCompare(b.info.letter));
    if (list.map(x => x.info.letter).join('') !== 'ABCDEF') fail(`${phase.name}: as séries devem ser A a F.`, 409);
    for (const { sheet, info } of list) {
      const evaluated = evaluateSeriesSheet(sheet, info);
      const groupId = `${phase.number}${info.letter.toLowerCase()}`;
      const definedTeams = evaluated.teams.filter(Boolean);
      const expected = Number(/-\s*(\d+)\s+EQUIPAS/i.exec(info.title)?.[1] ?? NaN);
      if (Number.isFinite(expected) && expected !== definedTeams.length) issue('warning', 'team_count', `${sheet.name}: o título indica ${expected} equipas mas há ${definedTeams.length} preenchidas.`, { sheet: sheet.name });
      const groupTeams = definedTeams.map(name => ensureTeam(name));
      if (new Set(groupTeams.map(t => t.id)).size !== groupTeams.length) fail(`${sheet.name}: equipa repetida na série.`);
      const notes = [];
      const noteText = /\(([^)]*desist[^)]*)\)\s*$/i.exec(info.title)?.[1];
      if (noteText) notes.push(noteText.replace(/^\w/, c => c.toUpperCase()) + '.');
      const standings = evaluated.aux.map((a, k) => ({ a, k })).filter(({ a }) => a.M !== '').map(({ a }) => ({
        teamId: ensureTeam(a.M).id, position: a.W, played: a.N, wins: a.O, draws: a.P, losses: a.Q, goalsFor: a.R, goalsAgainst: a.S, goalDifference: a.T, points: a.U,
      })).sort((x, y) => x.position - y.position);
      // Positions as the sheet shows them (1..n) — the sheet's ranking key never ties.
      standings.forEach((s, i) => { s.position = i + 1; });
      // Cached-value drift (file saved without recalculation or edited by another tool).
      let drift = 0;
      for (const [address, value] of evaluated.caches) if (!sameCached(value, sheet.cells.get(address)?.value ?? null)) drift++;
      context.caches.set(sheet.name, evaluated.caches); context.drift += drift;
      if (drift) issue('warning', 'stale_cache', `${sheet.name}: ${drift} valores calculados guardados no Excel não coincidem com as fórmulas. O MINHO11 usa os valores recalculados.`, { sheet: sheet.name });
      const group = { id: groupId, phaseId: phase.id, letter: info.letter, name: `Série ${info.letter}`, sourceLabel: phase.number === 1 ? `Série ${/Série (\d)/.exec(sheet.name)?.[1]}` : `Série ${info.letter}`, defined: definedTeams.length >= 2, teamIds: groupTeams.map(t => t.id), standings, notes, pendingFixtures: 0 };
      context.series[groupId] = { sheetName: sheet.name, rows: info.rows, end: info.end, teamSlots: evaluated.teams };
      sheetValues.set(sheet.name, evaluated.value);
      context.sheetCells = context.sheetCells ?? new Map(); context.sheetCells.set(sheet.name, sheet.cells);
      const seen = new Set();
      for (const row of info.rows) {
        const round = Number(asText(sheet.get('A' + row)).slice(1));
        const homeName = asText(evaluated.value('C' + row)), awayName = asText(evaluated.value('G' + row));
        if (!homeName || !awayName) { group.pendingFixtures++; continue; }
        const home = ensureTeam(homeName), away = ensureTeam(awayName);
        if (!group.teamIds.includes(home.id) || !group.teamIds.includes(away.id) || home.id === away.id) fail(`${sheet.name}, linha ${row}: equipas do jogo não pertencem à série.`);
        const rawHome = sheet.cells.get('D' + row)?.value ?? null, rawAway = sheet.cells.get('F' + row)?.value ?? null;
        const homeGoals = rawHome === '' ? null : rawHome, awayGoals = rawAway === '' ? null : rawAway;
        for (const [label, v] of [['casa', homeGoals], ['fora', awayGoals]]) if (v !== null && !goalCount(v)) fail(`${sheet.name}, linha ${row}: golos da ${label} inválidos («${asText(v)}»).`);
        const date = parseDate(sheet.get('B' + row), pkg.date1904);
        if (date === undefined) issue('warning', 'bad_date', `${sheet.name}, linha ${row}: data não reconhecida («${asText(sheet.get('B' + row))}»).`, { sheet: sheet.name, row });
        const legacyPair = [`${info.letter.toLowerCase()}-${home.id}`, `${info.letter.toLowerCase()}-${away.id}`];
        const id = 'm-' + (phase.number === 1 && legacyIds
          ? sha256(pythonJsonList([config.id, info.letter, round, ...legacyPair]))
          : sha256(JSON.stringify([config.id, phase.id, info.letter, round, home.id, away.id]))).slice(0, 16);
        if (seen.has(id) || matches.some(m => m.id === id)) fail(`${sheet.name}, linha ${row}: jogo repetido.`);
        seen.add(id);
        const finished = homeGoals !== null && awayGoals !== null;
        const withdrawn = home.withdrawn || away.withdrawn || isWithdrawnName(homeName) || isWithdrawnName(awayName);
        const status = finished ? 'finished' : (homeGoals === null) !== (awayGoals === null) ? 'incomplete' : withdrawn ? 'withdrawn' : 'scheduled';
        if (status === 'incomplete') issue('warning', 'incomplete_result', `${sheet.name} ${asText(sheet.get('A' + row))}: resultado só com um dos lados preenchido.`, { sheet: sheet.name, row, matchId: id });
        if (finished && date && today && date > today) issue('warning', 'future_result', `${group.name} (${phase.name}) ${asText(sheet.get('A' + row))}: resultado ${homeGoals}–${awayGoals} com data futura (${date}). Valor da fonte preservado; confirmar data ou resultado.`, { sheet: sheet.name, row, matchId: id });
        const sides = {};
        for (const [side, col, team, score] of [['home', 'C', home, homeGoals], ['away', 'G', away, awayGoals]]) {
          const description = asText(sheet.cells.get(col + (row + 1))?.value);
          const { events, issues: notation } = describeScorers(description);
          for (const text of notation) issue('warning', 'scorer_notation', `${sheet.name}!${col}${row + 1}: ${text}`, { sheet: sheet.name, row: row + 1, matchId: id });
          const described = events.reduce((n, e) => n + e.goals, 0);
          const ownGoals = events.filter(e => e.ownGoal).length;
          sides[side] = { description, events, described, ownGoals, missing: score === null ? 0 : Math.max(0, score - described), excess: score === null ? 0 : Math.max(0, described - score) };
          if (score !== null && described < score) issue('info', 'scorers_missing', `${group.name} ${asText(sheet.get('A' + row))} (${date ?? 's/ data'}), ${team.name}: ${score} golos, ${described} identificados.`, { sheet: sheet.name, row: row + 1, matchId: id, missing: score - described });
          if (score !== null && described > score) issue('warning', 'scorers_excess', `${group.name} ${asText(sheet.get('A' + row))}, ${team.name}: marcadores somam ${described} golos mas o resultado indica ${score}.`, { sheet: sheet.name, row: row + 1, matchId: id });
          if (score === null && events.length) issue('warning', 'scorers_without_result', `${sheet.name}!${col}${row + 1}: marcadores num jogo sem resultado.`, { sheet: sheet.name, row: row + 1, matchId: id });
        }
        matches.push({ id, phaseId: phase.id, groupId, round, date: date ?? null, homeId: home.id, awayId: away.id, homeGoals, awayGoals, status, scorers: sides, source: { sheet: sheet.name, row } });
      }
      groups.push(group);
    }
  }

  // Same non-empty description on two different sides is a likely copy/paste.
  const byDescription = new Map();
  for (const m of matches) for (const side of ['home', 'away']) {
    const d = m.scorers[side].description.trim();
    if (d.split(',').length >= 3) byDescription.set(d, [...(byDescription.get(d) ?? []), { m, side }]);
  }
  for (const list of byDescription.values()) if (list.length > 1) {
    const label = list.map(({ m, side }) => `${groups.find(g => g.id === m.groupId).name} J${m.round} (${teams.get(m[side + 'Id']).name})`).join(' e ');
    issue('warning', 'duplicate_description', `Lista de marcadores idêntica em ${label}. Possível cópia; confirmar na ficha de jogo.`, { matchIds: list.map(x => x.m.id) });
  }

  // Automatic scorer tables, evaluated exactly like the sheets.
  const valueAt = (sheetName, address) => { const read = sheetValues.get(sheetName); if (!read) fail(`Tabela de marcadores aponta para uma folha desconhecida: ${sheetName}.`, 409); return read(address); };
  const rankings = {};
  for (const [key, sheetName] of Object.entries(scorerSheetNames)) {
    const sheet = readSheet(pkg, sheetName);
    const { slots, rankingRows } = scorerSheetSlots(sheet);
    const result = evaluateScorerSheet({
      rankingRows,
      slots: slots.map(s => ({ ...s, text: valueAt(s.sheet, s.cell), team: valueAt(s.teamSheet, s.teamCell) })),
    });
    let drift = 0;
    for (const [address, value] of result.caches) if (!sameCached(value, sheet.cells.get(address)?.value ?? null)) drift++;
    context.caches.set(sheetName, result.caches); context.drift += drift; context.sheetCells = context.sheetCells ?? new Map(); context.sheetCells.set(sheetName, sheet.cells);
    if (drift) issue('warning', 'stale_cache', `${sheetName}: ${drift} valores guardados não coincidem com as fórmulas (ficheiro gravado sem recalcular?). O MINHO11 usa os valores recalculados.`, { sheet: sheetName });
    // Coverage: every scorer description cell of real games must be read by this table.
    const covered = new Set(slots.map(s => `${s.sheet}!${s.cell}`));
    for (const m of matches) if (key === 'total' || key === m.phaseId) for (const col of ['C', 'G']) {
      const ref = `${m.source.sheet}!${col}${m.source.row + 1}`;
      if (!covered.has(ref)) issue('warning', 'uncovered_cell', `${ref} não é lida pela tabela «${sheetName}».`);
    }
    const casing = new Map();
    for (let i = 0; i < result.tokens.H.length; i++) {
      const name = result.tokens.H[i], team = result.tokens.I[i];
      if (!name) continue;
      const key2 = fold(name) + '|' + fold(team);
      (casing.get(key2) ?? casing.set(key2, new Set()).get(key2)).add(name);
    }
    if (key === 'total') for (const variants of casing.values()) if (variants.size > 1) issue('info', 'name_variants', `Grafias diferentes juntas pelo Excel: ${[...variants].map(v => `«${v}»`).join(', ')}.`);
    rankings[key] = result.unique.filter(u => u.goals > 0).map(u => {
      const team = teams.get(slug(cleanTeamName(u.team)));
      if (!team) fail(`${sheetName}: equipa desconhecida «${u.team}».`);
      return { id: 's-' + sha256(JSON.stringify([config.id, fold(u.name), team.id])).slice(0, 12), name: u.name, teamId: team.id, goals: u.goals, sheetRank: u.rank };
    }).sort((a, b) => a.sheetRank - b.sheetRank);
    context[`scorer:${key}`] = { sheetName, slots: slots.length, rankingRows };
  }
  // Names that occur for more than one team stay separate records.
  const nameTeams = new Map();
  for (const r of rankings.total) (nameTeams.get(fold(r.name)) ?? nameTeams.set(fold(r.name), new Set()).get(fold(r.name))).add(r.teamId);
  const homonyms = [...nameTeams.values()].filter(s => s.size > 1).length;
  if (homonyms) issue('info', 'homonyms', `${homonyms} nomes aparecem em mais de uma equipa; ficam como registos separados (sem fusão de identidades).`);

  const phases = PHASES.map(p => {
    const phaseGroups = groups.filter(g => g.phaseId === p.id);
    const phaseMatches = matches.filter(m => m.phaseId === p.id);
    const defined = phaseGroups.some(g => g.defined);
    const finished = phaseMatches.filter(m => m.status === 'finished').length;
    return { ...p, groupIds: phaseGroups.map(g => g.id), state: !defined ? 'pending' : finished && finished === phaseMatches.filter(m => m.status !== 'withdrawn').length ? 'finished' : 'running' };
  });
  for (const p of phases) if (p.state === 'pending') issue('info', 'phase_pending', `${p.name} por definir: equipas ainda não preenchidas no Excel.`);

  const played = matches.filter(m => m.status === 'finished');
  const describedGoals = matches.reduce((n, m) => n + (m.status === 'finished' ? m.scorers.home.described + m.scorers.away.described : 0), 0);
  const stats = {
    phases: phases.length, groups: groups.filter(g => g.defined).length, teams: teams.size, activeTeams: [...teams.values()].filter(t => !t.withdrawn).length, clubs: clubs.size,
    matches: matches.length, played: played.length, goals: played.reduce((n, m) => n + m.homeGoals + m.awayGoals, 0), draws: played.filter(m => m.homeGoals === m.awayGoals).length,
    describedGoals, ownGoals: matches.reduce((n, m) => n + m.scorers.home.ownGoals + m.scorers.away.ownGoals, 0),
    unidentifiedGoals: played.reduce((n, m) => n + m.scorers.home.missing + m.scorers.away.missing, 0),
    scorerRecords: rankings.total.length, individualGoals: rankings.total.reduce((n, r) => n + r.goals, 0),
  };
  const competition = Object.fromEntries(Object.entries(config).filter(([k]) => !['source', 'clubMappings', 'drive'].includes(k)));
  const data = {
    schemaVersion: SCHEMA_VERSION, competition, phases, groups,
    teams: [...teams.values()].map(({ sourceNames, ...t }) => t), clubs: [...clubs.values()], matches,
    scorers: { 'fase-1': rankings['fase-1'], 'fase-2': rankings['fase-2'], total: rankings.total },
    stats, sourceHash,
  };
  const report = { sourceHash, sheets: pkg.sheets.map(s => s.name), issues, stats };
  return { data, report, context };
}
