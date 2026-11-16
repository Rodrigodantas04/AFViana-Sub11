import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let hasWorkbook = false;
try { await fs.access(new URL('../data/source.xlsx', import.meta.url)); hasWorkbook = true; } catch { /* Public clones use the published snapshot. */ }
if (hasWorkbook) {
  const imported = spawnSync(process.env.PYTHON || 'python3', ['scripts/import_excel.py'], { cwd: root, stdio: 'inherit' });
  if (imported.error) throw imported.error;
  if (imported.status !== 0) process.exit(imported.status || 1);
} else {
  await fs.access(new URL('../data/public/competition.json', import.meta.url));
  console.log('MINHO11: Excel local ausente. A compilar o snapshot público validado e versionado, sem executar uma nova importação.');
}
