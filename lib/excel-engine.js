/**
 * Excel-equivalent evaluation of the formulas used by the AFVC "Gomes Ribeiro"
 * workbook (two phases, automatic scorer tables).
 *
 * The workbook is the source of truth. Platform figures (standings, scorer
 * rankings) are calculated here with the SAME semantics as the sheet formulas,
 * including their quirks, and the writer uses these results to refresh the
 * cached values stored next to each formula. tests/excel-engine.test.mjs and
 * `npm run verify:source` prove that recomputing an untouched workbook
 * reproduces every cached value Excel saved.
 *
 * Only formulas whose text matches the expected templates are evaluated; any
 * other formula makes the reader fail closed (see assertTemplates).
 */
import { asText, WorkbookError } from './xlsx.js';

// --- Excel primitives -------------------------------------------------------

/** Excel TRIM: strips ASCII spaces at both ends and collapses inner runs. */
export const excelTrim = text => asText(text).replace(/ +/g, ' ').replace(/^ | $/g, '');
/** Case-insensitive text comparison used by =, COUNTIF(S), SUMIFS, MATCH. Accents still matter. */
export const fold = text => asText(text).toLowerCase();

/** Criteria matcher for COUNTIF/SUMIFS with a text criterion (equality, wildcards * ? ~). */
export function criteria(value) {
  const text = asText(value);
  if (/^(?:<>|<=|>=|=|<|>)/.test(text)) throw new WorkbookError(`Critério Excel não suportado: «${text}». Revê os nomes no Excel.`);
  if (!/[*?~]/.test(text)) { const f = fold(text); return cell => typeof cell === 'string' && fold(cell) === f; }
  let source = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '~' && i + 1 < text.length && '*?~'.includes(text[i + 1])) { source += '\\' + text[++i]; continue; }
    source += c === '*' ? '[\\s\\S]*' : c === '?' ? '[\\s\\S]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const re = new RegExp(`^${source}$`, 'i');
  return cell => typeof cell === 'string' && re.test(cell);
}

/** TRIM(MID(SUBSTITUTE(text,",",REPT(" ",200)),(k-1)*200+1,200)) for k = 1..slots. */
export function excelTokens(text, slots = 10) {
  const spread = asText(text).replaceAll(',', ' '.repeat(200));
  return Array.from({ length: slots }, (_, i) => excelTrim(spread.slice(i * 200, i * 200 + 200)));
}

/** Token -> { name (Jogador_Raw), goals (Golos_Raw), ownGoal } exactly as the hidden columns compute. */
export function excelToken(token) {
  if (token === '') return { name: '', goals: 0, ownGoal: false };
  const open = token.indexOf('(');
  const name = excelTrim(open >= 0 ? token.slice(0, open) : token);
  if (name === '') return { name: '', goals: 0, ownGoal: false };
  const ownGoal = token.toLowerCase().includes('(pb)');
  if (ownGoal) return { name, goals: 0, ownGoal };
  if (open < 0) return { name, goals: 1, ownGoal };
  const close = token.indexOf(')');
  const inside = close >= 0 && close - open - 1 >= 0 ? token.slice(open + 1, close) : null;
  // VALUE() of an integer-looking text; anything else hits IFERROR(...,1).
  const goals = inside !== null && /^ *\d+ *$/.test(inside) ? Number(inside) : 1;
  return { name, goals, ownGoal };
}

// --- Series sheet (standings) ----------------------------------------------

/**
 * Evaluate one series sheet.
 * input: { teams: [6 x text|''] (M6:M11), games: [{row, home, away, homeGoals, awayGoals}] (values incl. formulas), rangeEnd }
 * returns { aux: rows M..W, table: rows B..J (position order), caches: Map(address -> value) }
 */
export function evaluateSeries({ teams, cells, firstRow = 14, lastRow }) {
  const value = (col, row) => cells(col + row);
  const rows = []; for (let r = firstRow; r <= lastRow; r++) rows.push(r);
  const aux = teams.map((team, k) => {
    const M = asText(team);
    if (M === '') return { M, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: -1000000000 - k };
    const match = criteria(M), isNum = v => typeof v === 'number';
    let N = 0, O = 0, P = 0, Q = 0, R = 0, S = 0;
    const eq = v => typeof v === 'string' && fold(v) === fold(M);
    for (const r of rows) {
      const C = value('C', r), D = value('D', r), F = value('F', r), G = value('G', r);
      const nonEmpty = v => v !== null && v !== undefined; // COUNTIFS "<>"
      if (match(C) && nonEmpty(D)) N++;
      if (match(G) && nonEmpty(F)) N++;
      if (isNum(D) && isNum(F)) {
        if (eq(C)) { O += D > F; P += D === F; Q += D < F; }
        if (eq(G)) { O += F > D; P += F === D; Q += F < D; }
      }
      if (match(C)) { if (isNum(D)) R += D; if (isNum(F)) S += F; }
      if (match(G)) { if (isNum(F)) R += F; if (isNum(D)) S += D; }
    }
    const T = R - S, U = O * 3 + P;
    const V = M.toLowerCase().includes('desistiu') ? -999999999 - k * 0.01 : U * 1000000 + T * 1000 + R - k * 0.01;
    return { M, N, O, P, Q, R, S, T, U, V };
  });
  for (const a of aux) a.W = 1 + aux.filter(b => b.V > a.V).length;
  const table = aux.map((_, i) => {
    const hit = aux.find(a => a.W === i + 1);
    if (!hit) return { B: '', C: '', D: '', E: '', F: '', G: '', H: '', I: '', J: '' };
    // INDEX() of an empty input cell returns 0, which is why placeholders show "0".
    return { B: hit.M === '' ? 0 : hit.M, C: hit.N, D: hit.O, E: hit.P, F: hit.Q, G: hit.R, H: hit.S, I: hit.T, J: hit.U };
  });
  const caches = new Map();
  aux.forEach((a, k) => { for (const col of 'NOPQRSTUVW') caches.set(col + (6 + k), a[col]); });
  table.forEach((t, i) => { for (const col of 'BCDEFGHIJ') caches.set(col + (6 + i), t[col]); });
  return { aux, table, caches };
}

// --- Scorer sheets ------------------------------------------------------------

/**
 * Evaluate an automatic scorer sheet.
 * slots: [{ row, text (scorer description cell value), slot (1..10), team (team cell value) }] in sheet order (rows 5..)
 * rankingRows: number of visible ranking rows (B5:D604 -> 600)
 */
export function evaluateScorerSheet({ slots, rankingRows, firstRow = 5 }) {
  const n = slots.length;
  const G = new Array(n), H = new Array(n), I = new Array(n), J = new Array(n), L = new Array(n), M = new Array(n);
  const tokenCache = new Map();
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    let tokens = tokenCache.get(s.text);
    if (!tokens) { tokens = excelTokens(s.text); tokenCache.set(s.text, tokens); }
    G[i] = tokens[s.slot - 1];
    const t = excelToken(G[i]);
    H[i] = G[i] === '' ? '' : t.name;
    I[i] = H[i] === '' ? '' : asText(s.team);
    J[i] = H[i] === '' ? 0 : t.goals;
    L[i] = H[i] !== '' && I[i] !== '' ? H[i] + '|' + I[i] : '';
  }
  // Seq_Unique: first occurrence (COUNTIF, case-insensitive) gets MAX(above)+1.
  const seen = new Set(); let max = 0;
  const wildcard = L.some(v => /[*?~]/.test(v));
  for (let i = 0; i < n; i++) {
    if (L[i] === '') { M[i] = 0; continue; }
    let first;
    if (!wildcard) { const key = fold(L[i]); first = !seen.has(key); seen.add(key); }
    else { const match = criteria(L[i]); first = L.slice(0, i + 1).filter(match).length === 1; }
    M[i] = first ? ++max : 0;
  }
  const firstIndexOfSeq = new Map(); M.forEach((m, i) => { if (m > 0 && !firstIndexOfSeq.has(m)) firstIndexOfSeq.set(m, i); });
  // SUMIFS(J, H, N, I, O)
  const sums = new Map();
  const simple = !H.some(v => /[*?~]/.test(v)) && !I.some(v => /[*?~]/.test(v));
  if (simple) for (let i = 0; i < n; i++) if (H[i] !== '' || I[i] !== '') { const key = fold(H[i]) + '\u0000' + fold(I[i]); sums.set(key, (sums.get(key) ?? 0) + J[i]); }
  const sumifs = (name, team) => {
    if (simple) return sums.get(fold(name) + '\u0000' + fold(team)) ?? 0;
    const a = criteria(name), b = criteria(team); let total = 0;
    for (let i = 0; i < n; i++) if (a(H[i]) && b(I[i])) total += J[i];
    return total;
  };
  const N = new Array(n), O = new Array(n), P = new Array(n), Q = new Array(n), R = new Array(n);
  for (let k = 1; k <= n; k++) {
    const i = k - 1, hit = firstIndexOfSeq.get(k);
    N[i] = hit === undefined ? '' : H[hit];
    O[i] = hit === undefined ? '' : I[hit];
    P[i] = N[i] === '' ? 0 : sumifs(N[i], O[i]);
    Q[i] = N[i] === '' ? -1 : P[i] * 100000 - (k - 1) * 0.01;
  }
  const sortedQ = Q.slice().sort((a, b) => b - a);
  const greater = q => { let lo = 0, hi = sortedQ.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedQ[mid] > q) lo = mid + 1; else hi = mid; } return lo; };
  for (let i = 0; i < n; i++) R[i] = N[i] === '' ? '' : 1 + greater(Q[i]);
  const byRank = new Map(); R.forEach((r, i) => { if (r !== '' && !byRank.has(r)) byRank.set(r, i); });
  const ranking = [];
  for (let pos = 1; pos <= rankingRows; pos++) {
    const i = byRank.get(pos);
    ranking.push(i === undefined ? { B: '', C: '', D: '' } : { B: N[i], C: O[i], D: N[i] === '' ? '' : P[i] });
  }
  const caches = new Map();
  for (let i = 0; i < n; i++) {
    const r = firstRow + i;
    caches.set('G' + r, G[i]); caches.set('H' + r, H[i]); caches.set('I' + r, I[i]); caches.set('J' + r, J[i]);
    caches.set('L' + r, L[i]); caches.set('M' + r, M[i]); caches.set('N' + r, N[i]); caches.set('O' + r, O[i]);
    caches.set('P' + r, P[i]); caches.set('Q' + r, Q[i]); caches.set('R' + r, R[i]);
  }
  ranking.forEach((x, p) => { const r = firstRow + p; caches.set('B' + r, x.B); caches.set('C' + r, x.C); caches.set('D' + r, x.D); });
  const unique = [];
  for (let k = 1; k <= max; k++) { const i = k - 1; unique.push({ seq: k, name: N[i], team: O[i], goals: P[i], rank: R[i] }); }
  return { caches, unique, ranking, tokens: { G, H, I, J } };
}

/** Cached value equality with Excel's stored representation (17 significant digits). */
export function sameCached(expected, stored) {
  if (typeof expected === 'number') return typeof stored === 'number' && (expected === stored || Math.abs(expected - stored) <= Math.abs(expected) * 1e-15);
  if (expected === '') return stored === '' || stored === null;
  return typeof stored === 'string' && stored === expected;
}
