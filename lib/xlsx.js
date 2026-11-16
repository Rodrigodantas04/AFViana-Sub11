/**
 * Minimal, dependency-light OpenXML spreadsheet access.
 *
 * Only what MINHO11 needs: read cell values/formulas from worksheet XML and
 * replace specific cells while leaving every other byte of the package intact
 * (styles, conditional formats, shared formulas, other sheets, properties).
 * Works in Node and in Web-standard runtimes (no fs, no Buffer).
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export const MAX_PACKAGE_BYTES = 10_000_000;
export const MAX_EXPANDED_BYTES = 80_000_000;
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export class WorkbookError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new WorkbookError(message, status); };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeXml = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : ENTITIES[e.toLowerCase()]);
export const encodeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function columnNumber(letters) { let n = 0; for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64; return n; }
export function splitAddress(address) {
  const match = /^([A-Z]{1,3})(\d+)$/.exec(address);
  if (!match) fail(`Endereço de célula inválido: ${address}`);
  return { col: match[1], row: Number(match[2]) };
}

/** Text of <t> runs inside a shared string or inline string element. */
function runsText(xml) {
  let text = '';
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>|<(?:[\w.-]+:)?t(?:\s[^>]*)?\/>/g)) text += decodeXml(match[1] ?? '');
  // Phonetic runs (<rPh>) are not part of the visible value.
  return text;
}

export function openPackage(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length > MAX_PACKAGE_BYTES) fail('O ficheiro Excel ultrapassa o limite de 10 MB.', 413);
  let expanded = 0, files;
  try {
    files = unzipSync(bytes, { filter: file => { expanded += file.originalSize; if (expanded > MAX_EXPANDED_BYTES) fail('Excel descomprimido demasiado grande.', 413); return true; } });
  } catch (error) {
    if (error instanceof WorkbookError) throw error;
    fail('O ficheiro não é um XLSX válido.');
  }
  const text = path => { if (!files[path]) fail(`Estrutura Excel incompleta (${path}).`); return strFromU8(files[path]); };
  const workbookXml = text('xl/workbook.xml');
  const rels = {};
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1], target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels[id] = decodeXml(target);
  }
  const sheets = [];
  for (const m of workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const name = decodeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const relId = new RegExp(`\\b(?:[\\w.-]+:)?id="([^"]+)"`).exec(attrs.replace(/\bsheetId="[^"]*"/, ''))?.[1];
    const target = rels[relId];
    if (!name || !target || target.includes('..')) fail('Relação de folha inválida.');
    const state = /\bstate="([^"]+)"/.exec(attrs)?.[1] ?? 'visible';
    sheets.push({ name, path: target.startsWith('/') ? target.slice(1) : 'xl/' + target, state });
  }
  const shared = files['xl/sharedStrings.xml']
    ? [...text('xl/sharedStrings.xml').matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>|<(?:[\w.-]+:)?si\s*\/>/g)].map(m => runsText((m[1] ?? '').replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, '')))
    : [];
  const date1904 = /<(?:[\w.-]+:)?workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbookXml);
  return { files, sheets, shared, workbookXml, date1904, relNs: REL_NS };
}

const CELL = /<((?:[\w.-]+:)?)c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1c>)/g;

/**
 * Parse every <c> of a worksheet. Returns Map(address -> cell).
 * cell = { value, type, formula, sharedIndex, sharedRef, style }
 * value: number | string | boolean | {error} | null (null = truly empty)
 */
export function readSheet(pkg, sheetName) {
  const sheet = pkg.sheets.find(s => s.name === sheetName);
  if (!sheet) fail(`Falta a folha «${sheetName}».`);
  const xml = strFromU8(pkg.files[sheet.path] ?? fail(`Folha em falta no pacote: ${sheetName}`));
  const cells = new Map();
  for (const m of xml.matchAll(CELL)) {
    const attrs = m[2], inner = m[3] ?? '';
    const address = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!address) fail(`Célula sem endereço na folha ${sheetName}.`);
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
    const fMatch = /<(?:[\w.-]+:)?f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?f>)/.exec(inner);
    const vMatch = /<(?:[\w.-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?v>|<(?:[\w.-]+:)?v\s*\/>/.exec(inner);
    const raw = vMatch ? decodeXml(vMatch[1] ?? '') : null;
    let value = null;
    if (type === 's') value = raw === null ? null : pkg.shared[Number(raw)] ?? fail(`Texto inválido em ${sheetName}!${address}.`);
    else if (type === 'inlineStr') value = runsText(/<(?:[\w.-]+:)?is\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?is>/.exec(inner)?.[1] ?? '');
    else if (type === 'str') value = raw ?? '';
    else if (type === 'b') value = raw === null ? null : raw === '1';
    else if (type === 'e') value = { error: raw };
    else if (raw !== null && raw !== '') { const n = Number(raw); value = Number.isFinite(n) ? n : raw; }
    const formula = fMatch ? { text: fMatch[2] !== undefined ? decodeXml(fMatch[2]) : null, attrs: fMatch[1] } : null;
    cells.set(address, {
      value, type,
      formula: formula?.text ?? null,
      hasFormula: Boolean(fMatch),
      sharedIndex: formula ? /\bsi="(\d+)"/.exec(formula.attrs)?.[1] ?? null : null,
      sharedRef: formula ? /\bref="([^"]+)"/.exec(formula.attrs)?.[1] ?? null : null,
      style: /\bs="(\d+)"/.exec(attrs)?.[1] ?? null,
    });
  }
  return { name: sheetName, path: sheet.path, xml, cells, get: address => cells.get(address)?.value ?? null };
}

/** Text value as Excel shows it for comparisons: null/empty cell -> "". */
export const asText = value => value === null || value === undefined ? '' : typeof value === 'object' ? '' : String(value);

function formatNumber(n) {
  if (!Number.isFinite(n)) fail('Valor numérico inválido.');
  return Object.is(n, -0) ? '0' : String(n);
}

/**
 * Replace cells in one worksheet XML.
 * updates: Map(address -> { value, mode }) where mode is
 *   'input'  - literal input cell (refuses to overwrite a formula)
 *   'cache'  - formula cell: only the cached result changes, formula kept
 */
export function patchSheetXml(xml, updates, sheetName = 'folha') {
  const prefix = /<([\w.-]+:)?worksheet\b/.exec(xml)?.[1] ?? '';
  const pending = new Map(updates);
  const valueXml = (value, p) => value === '' ? `<${p}v/>` : `<${p}v>${typeof value === 'number' ? formatNumber(value) : encodeXml(value)}</${p}v>`;
  const setAttr = (attrs, name, val) => {
    const re = new RegExp(`\\s${name}="[^"]*"`);
    if (val === null) return attrs.replace(re, '');
    return re.test(attrs) ? attrs.replace(re, ` ${name}="${val}"`) : attrs + ` ${name}="${val}"`;
  };
  let out = xml.replace(CELL, (whole, p, attrs, inner) => {
    const address = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    const update = address && pending.get(address);
    if (!update) return whole;
    pending.delete(address);
    const body = inner ?? '';
    const formula = /<(?:[\w.-]+:)?f\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:[\w.-]+:)?f>)/.exec(body)?.[0];
    const { value, mode } = update;
    if (mode === 'cache') {
      if (!formula) fail(`Esperava uma fórmula em ${sheetName}!${address}; a estrutura do Excel mudou.`);
      let a = setAttr(attrs, 't', typeof value === 'number' ? null : typeof value === 'boolean' ? 'b' : 'str');
      const v = typeof value === 'boolean' ? `<${p}v>${value ? 1 : 0}</${p}v>` : valueXml(value, p);
      return `<${p}c${a}>${formula}${v}</${p}c>`;
    }
    if (formula) fail(`A célula ${sheetName}!${address} tem uma fórmula e não pode receber um valor.`);
    if (value === null || value === '') return `<${p}c${setAttr(attrs, 't', null)}/>`;
    if (typeof value === 'number') return `<${p}c${setAttr(attrs, 't', null)}><${p}v>${formatNumber(value)}</${p}v></${p}c>`;
    return `<${p}c${setAttr(attrs, 't', 'inlineStr')}><${p}is><${p}t xml:space="preserve">${encodeXml(value)}</${p}t></${p}is></${p}c>`;
  });
  // Input cells that do not exist yet are inserted in their row, in column order.
  for (const [address, update] of pending) {
    if (update.mode === 'cache') fail(`Fórmula esperada em falta: ${sheetName}!${address}.`);
    if (update.value === null || update.value === '') continue;
    const { col, row } = splitAddress(address);
    const cell = typeof update.value === 'number'
      ? `<${prefix}c r="${address}"><${prefix}v>${formatNumber(update.value)}</${prefix}v></${prefix}c>`
      : `<${prefix}c r="${address}" t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${encodeXml(update.value)}</${prefix}t></${prefix}is></${prefix}c>`;
    const rowRe = new RegExp(`<${prefix}row\\b[^>]*\\br="${row}"[^>]*?(?:\\/>|>([\\s\\S]*?)<\\/${prefix}row>)`);
    const rowMatch = rowRe.exec(out);
    if (!rowMatch) fail(`Linha ${row} inexistente em ${sheetName}; a estrutura do Excel mudou.`);
    const rowXml = rowMatch[0];
    let newRow;
    if (rowXml.endsWith('/>')) newRow = rowXml.slice(0, -2) + `>${cell}</${prefix}row>`;
    else {
      const target = columnNumber(col);
      let inserted = false;
      newRow = rowXml.replace(new RegExp(`<${prefix}c\\b[^>]*\\br="([A-Z]+)${row}"`, 'g'), (m, c) => {
        if (!inserted && columnNumber(c) > target) { inserted = true; return cell + m; }
        return m;
      });
      if (!inserted) newRow = newRow.replace(`</${prefix}row>`, `${cell}</${prefix}row>`);
    }
    out = out.slice(0, rowMatch.index) + newRow + out.slice(rowMatch.index + rowXml.length);
  }
  return out;
}

/** Ask spreadsheet applications to recalculate everything when the file is opened. */
export function requestFullRecalc(workbookXml) {
  const prefix = /<([\w.-]+:)?workbook\b/.exec(workbookXml)?.[1] ?? '';
  const existing = /<(?:[\w.-]+:)?calcPr\b([^>]*?)\/>/.exec(workbookXml);
  if (existing) {
    let attrs = existing[1].replace(/\s(fullCalcOnLoad|forceFullCalc)="[^"]*"/g, '');
    return workbookXml.replace(existing[0], `<${prefix}calcPr${attrs} fullCalcOnLoad="1"/>`);
  }
  return workbookXml.replace(new RegExp(`(<${prefix}sheets\\b[\\s\\S]*?<\\/${prefix}sheets>(?:\\s*<${prefix}definedNames\\b[\\s\\S]*?<\\/${prefix}definedNames>)?)`), `$1<${prefix}calcPr fullCalcOnLoad="1"/>`);
}

export function packageBytes(files) {
  // Keep [Content_Types].xml first, as Office writes it; level 6 matches common Office output sizes.
  const ordered = {};
  for (const name of ['[Content_Types].xml', ...Object.keys(files).filter(n => n !== '[Content_Types].xml')]) if (files[name]) ordered[name] = [files[name], { level: 6 }];
  return zipSync(ordered);
}

export { strFromU8, strToU8 };
