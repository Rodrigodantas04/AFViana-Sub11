/**
 * Synthetic two-phase workbook with the SAME layout and formula text as the AFVC
 * file, but small and with invented names (the public CI never sees children's data).
 * Cached values are filled by the engine afterwards so the file is self-consistent.
 */
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { importCompetition } from '../../lib/competition.js';
import { patchSheetXml } from '../../lib/xlsx.js';

const esc = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const fixtureConfig = { id: 'teste-sub11-2026-27', slug: 'teste-sub11', name: 'Torneio de Teste', shortName: 'Teste', season: '2026/2027', category: 'Sub-11', region: 'Teste', source: 'n/a' };

const LETTERS = 'ABCDEF';
// Phase 1: 3 teams per series (double round robin = 6 games). Series F has a withdrawn team.
const teamsFor = letter => letter === 'A' ? ['Clube Norte "A"', 'Vila Azul', 'Rio Verde'] : letter === 'B' ? ['Clube Norte "B"', 'Monte Alto', 'Ponte Velha'] : letter === 'F' ? ['Serra FC', 'Lago SC', 'UD Fantasma (Desistiu)'] : [`Equipa ${letter}1`, `Equipa ${letter}2`, `Equipa ${letter}3`];
const PAIRS = [[0, 2], [1, 0], [2, 1], [2, 0], [0, 1], [1, 2]];
// Results for series A (row order): [home, away, homeScorers, awayScorers]
const RESULTS_A = [
  [3, 1, 'Ana Lima (2), Bia Sá', 'Caio Reis'],
  [2, 2, 'Duda Rocha, Eva Paz', 'Ana Lima, Bia Sá'],
  [0, 1, '', 'Fil Mota (PB)'],          // own goal credited to nobody
  [4, 0, 'Gil Neto (3)', 'Ana Lima (PB)'], // inconsistent on purpose: away 0 but a PB token
];

function cell(ref, value, formula) {
  if (formula) return `<c r="${ref}"${typeof value === 'number' ? '' : ' t="str"'}><f>${esc(formula)}</f>${value === '' ? '<v/>' : `<v>${esc(value)}</v>`}</c>`;
  if (value === null || value === undefined || value === '') return '';
  return typeof value === 'number' ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}
function sheetXml(rows) {
  const body = Object.keys(rows).map(Number).sort((a, b) => a - b).map(r => `<row r="${r}">${rows[r].join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
function seriesSheet({ phase, letter, number, teams, results = [] }) {
  const rows = {}; const put = (r, c) => (rows[r] ??= []).push(c);
  const end = 14 + (PAIRS.length - 1) * 2;
  put(1, cell('A1', 'TORNEIO DE TESTE'));
  put(2, cell('A2', phase === 1 ? `SÉRIE ${number} (SÉRIE ${letter}) - ${teams.filter(Boolean).length} EQUIPAS${teams.some(t => /Desistiu/.test(t)) ? ' (Desistência do UD Fantasma)' : ''}` : `2.ª FASE - SÉRIE ${letter} (Preencha as equipas nas células amarelas M6:M11)`));
  for (const [i, h] of ['Pos.', 'Equipa', 'J', 'V', 'E', 'D', 'GM', 'GS', 'DF', 'Pts'].entries()) put(5, cell('ABCDEFGHIJ'[i] + 5, h));
  for (let k = 6; k <= 11; k++) {
    const team = teams[k - 6] ?? '';
    put(k, cell('A' + k, `${k - 5}.º`));
    for (const [i, col] of [...'BCDEFGHIJ'].entries()) put(k, cell(col + k, '', `IFERROR(INDEX($${'MNOPQRSTU'[i]}$6:$${'MNOPQRSTU'[i]}$11, MATCH(${k - 5}, $W$6:$W$11, 0)), "")`));
    put(k, cell('M' + k, team));
    const f = {
      N: `IF(M${k}="",0,COUNTIFS($C$14:$C$${end},M${k},$D$14:$D$${end},"<>")+COUNTIFS($G$14:$G$${end},M${k},$F$14:$F$${end},"<>"))`,
      O: `IF(M${k}="",0,SUMPRODUCT(($C$14:$C$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($D$14:$D$${end}>$F$14:$F$${end}))+SUMPRODUCT(($G$14:$G$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($F$14:$F$${end}>$D$14:$D$${end})))`,
      P: `IF(M${k}="",0,SUMPRODUCT(($C$14:$C$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($D$14:$D$${end}=$F$14:$F$${end}))+SUMPRODUCT(($G$14:$G$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($F$14:$F$${end}=$D$14:$D$${end})))`,
      Q: `IF(M${k}="",0,SUMPRODUCT(($C$14:$C$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($D$14:$D$${end}<$F$14:$F$${end}))+SUMPRODUCT(($G$14:$G$${end}=M${k})*ISNUMBER($D$14:$D$${end})*ISNUMBER($F$14:$F$${end})*($F$14:$F$${end}<$D$14:$D$${end})))`,
      R: `IF(M${k}="",0,SUMIFS($D$14:$D$${end},$C$14:$C$${end},M${k})+SUMIFS($F$14:$F$${end},$G$14:$G$${end},M${k}))`,
      S: `IF(M${k}="",0,SUMIFS($F$14:$F$${end},$C$14:$C$${end},M${k})+SUMIFS($D$14:$D$${end},$G$14:$G$${end},M${k}))`,
      T: `R${k}-S${k}`, U: `O${k}*3+P${k}`,
      V: `IF(M${k}="",-1000000000-${k - 6},IF(ISNUMBER(SEARCH("Desistiu",M${k})),-999999999-${k - 6}*0.01,U${k}*1000000+T${k}*1000+R${k}-${k - 6}*0.01))`,
      W: `RANK(V${k},$V$6:$V$11)`,
    };
    for (const [col, formula] of Object.entries(f)) put(k, cell(col + k, 0, formula));
  }
  put(12, cell('A12', 'PROGRAMA DE JOGOS E MARCADORES'));
  for (const [i, h] of ['Jor.', 'Data', 'Equipa Visitada (Casa)', 'GM', 'vs', 'GF', 'Equipa Visitante (Fora)'].entries()) put(13, cell('ABCDEFG'[i] + 13, h));
  PAIRS.forEach(([h, a], i) => {
    const r = 14 + i * 2, res = results[i];
    put(r, cell('A' + r, `J${Math.floor(i / 1) + 1}`));
    if (phase === 1) put(r, cell('B' + r, `${String(3 + i * 7).padStart(2, '0')}/10/2026`));
    if (phase === 1) { put(r, cell('C' + r, teams[h])); put(r, cell('G' + r, teams[a])); }
    else { put(r, cell('C' + r, '', `IF(M${6 + h}="","",M${6 + h})`)); put(r, cell('G' + r, '', `IF(M${6 + a}="","",M${6 + a})`)); }
    if (res) { put(r, cell('D' + r, res[0])); put(r, cell('F' + r, res[1])); }
    put(r, cell('E' + r, 'X'));
    if (res?.[2]) put(r + 1, cell('C' + (r + 1), res[2]));
    put(r + 1, cell('E' + (r + 1), '▲ Marcadores ▲'));
    if (res?.[3]) put(r + 1, cell('G' + (r + 1), res[3]));
    if (!rows[r + 1]) rows[r + 1] = [];
  });
  return sheetXml(rows);
}
function scorerSheet(title, sources, rankingRows = 40) {
  const rows = {}; const put = (r, c) => (rows[r] ??= []).push(c);
  put(1, cell('A1', 'TORNEIO DE TESTE')); put(2, cell('A2', title));
  for (const [c, h] of Object.entries({ A: 'Pos.', B: 'Jogador', C: 'Equipa', D: 'Golos', G: 'Token_Raw', H: 'Jogador_Raw', I: 'Equipa_Raw', J: 'Golos_Raw', L: 'Key_Raw', M: 'Seq_Unique', N: 'Uniq_Jogador', O: 'Uniq_Equipa', P: 'Uniq_Golos', Q: 'Sort_Key', R: 'Rank_Uniq' })) put(4, cell(c + 4, h));
  const slots = sources.flatMap(s => Array.from({ length: 10 }, (_, i) => ({ ...s, k: i + 1 })));
  const last = 4 + slots.length;
  slots.forEach((s, i) => {
    const r = 5 + i, q = `'${s.sheet.replaceAll("'", "''")}'`;
    put(r, cell('G' + r, '', `TRIM(MID(SUBSTITUTE(${q}!${s.cell},",",REPT(" ",200)),(${s.k}-1)*200+1,200))`));
    put(r, cell('H' + r, '', `IF(G${r}="","",TRIM(IF(ISNUMBER(FIND("(",G${r})),LEFT(G${r},FIND("(",G${r})-1),G${r})))`));
    put(r, cell('I' + r, '', `IF(H${r}="","",${q}!${s.team})`));
    put(r, cell('J' + r, 0, `IF(H${r}="",0,IF(ISNUMBER(SEARCH("(PB)",G${r})),0,IF(ISNUMBER(FIND("(",G${r})),IFERROR(VALUE(MID(G${r},FIND("(",G${r})+1,FIND(")",G${r})-FIND("(",G${r})-1)),1),1)))`));
    put(r, cell('L' + r, '', `IF(AND(H${r}<>"",I${r}<>""),H${r}&"|"&I${r},"")`));
    put(r, cell('M' + r, 0, `IF(L${r}="",0,IF(COUNTIF($L$5:L${r},L${r})=1,MAX($M$4:M${r - 1})+1,0))`));
    put(r, cell('N' + r, '', `IFERROR(INDEX($H$5:$H$${last},MATCH(${r - 4},$M$5:$M$${last},0)),"")`));
    put(r, cell('O' + r, '', `IFERROR(INDEX($I$5:$I$${last},MATCH(${r - 4},$M$5:$M$${last},0)),"")`));
    put(r, cell('P' + r, 0, `IF(N${r}="",0,SUMIFS($J$5:$J$${last},$H$5:$H$${last},N${r},$I$5:$I$${last},O${r}))`));
    put(r, cell('Q' + r, -1, `IF(N${r}="",-1,P${r}*100000-${r - 5}*0.01)`));
    put(r, cell('R' + r, '', `IF(N${r}="","",RANK(Q${r},$Q$5:$Q$${last}))`));
  });
  for (let p = 1; p <= rankingRows; p++) {
    const r = 4 + p;
    put(r, cell('A' + r, `${p}.º`));
    put(r, cell('B' + r, '', `IFERROR(INDEX($N$5:$N$${last},MATCH(${p},$R$5:$R$${last},0)),"")`));
    put(r, cell('C' + r, '', `IFERROR(INDEX($O$5:$O$${last},MATCH(${p},$R$5:$R$${last},0)),"")`));
    put(r, cell('D' + r, '', `IF(B${r}="","",INDEX($P$5:$P$${last},MATCH(${p},$R$5:$R$${last},0)))`));
  }
  return sheetXml(rows);
}

export function buildFixtureWorkbook({ consistent = true } = {}) {
  const sheets = [];
  for (const [i, letter] of [...LETTERS].entries()) sheets.push({ name: `${i === 0 ? '1ª' : '1.ª'} Fase - Série ${i + 1}`, xml: seriesSheet({ phase: 1, letter, number: i + 1, teams: teamsFor(letter), results: letter === 'A' ? RESULTS_A : letter === 'B' ? [[1, 1, 'Zé Lobo', 'Rui Dias']] : [] }) });
  const phase1 = sheets.slice(0, 6);
  for (const letter of LETTERS) sheets.push({ name: `2ª Fase - Série ${letter}`, xml: seriesSheet({ phase: 2, letter, teams: [] }) });
  const phase2 = sheets.slice(6, 12);
  const sources = list => list.flatMap(s => PAIRS.flatMap((_, i) => { const r = 14 + i * 2; return [{ sheet: s.name, cell: `C${r + 1}`, team: `C${r}` }, { sheet: s.name, cell: `G${r + 1}`, team: `G${r}` }]; }));
  sheets.splice(6, 0, { name: 'Marcadores 1ª Fase', xml: scorerSheet('MARCADORES 1.ª FASE', sources(phase1)) });
  sheets.push({ name: 'Marcadores 2ª Fase', xml: scorerSheet('MARCADORES 2.ª FASE', sources(phase2)) });
  sheets.push({ name: 'Marcadores Totais', xml: scorerSheet('MARCADORES TOTAIS', sources([...phase1, ...phase2])) });
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    'xl/styles.xml': strToU8('<styleSheet preserved="yes"/>'),
    'docProps/custom.xml': strToU8('<untouched/>'),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml); });
  let bytes = zipSync(files);
  if (!consistent) return bytes;
  // Fill the cached values exactly like Excel would have saved them.
  const { context } = importCompetition(bytes, fixtureConfig, { today: '2026-11-16' });
  for (const [name, caches] of context.caches) {
    const path = context.pkg.sheets.find(s => s.name === name).path;
    files[path] = strToU8(patchSheetXml(strFromU8(files[path]), new Map([...caches].map(([a, v]) => [a, { value: v, mode: 'cache' }])), name));
  }
  return zipSync(files);
}
