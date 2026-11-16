import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runImport } from './import.mjs';

const workbook = fileURLToPath(new URL('../data/source.xlsx', import.meta.url));
if (fs.existsSync(workbook)) runImport();
else {
  fs.accessSync(new URL('../data/public/competition.json', import.meta.url));
  console.log('MINHO11: Excel local ausente. A compilar o snapshot público versionado (sem nomes), sem nova importação.');
}
