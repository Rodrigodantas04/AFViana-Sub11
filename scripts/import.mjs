/**
 * Imports data/source.xlsx (private, never committed) into:
 *   data/internal/competition.json  internal model with source references (private)
 *   data/internal/validation.json   data-quality report (private)
 *   data/internal/live.json         public projection with names per policy (private; local preview)
 *   data/public/competition.json    repository snapshot: no children's names (committed)
 * The previous snapshot is only replaced after the new import validates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCompetition } from '../lib/competition.js';
import { projectDataset } from '../lib/projection.js';
import { loadRosters, publicRosters } from '../lib/rosters.js';
import { todayLisbon } from '../src/domain.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const atomic = (file, value) => {
  const target = path.join(root, file), tmp = target + '.tmp';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, target);
};

export function runImport(source = process.argv[2]) {
  const config = read('config/competition.json'), policy = read('config/publication.json'), crests = read('config/crests.json'), colors = read('config/club-colors.json');
  const file = path.resolve(root, source ?? config.source);
  const today = todayLisbon();
  const { data, report } = importCompetition(fs.readFileSync(file), config, { today });
  const rosterSource = loadRosters(path.join(root, 'data/internal/rosters-source.json'), data.competition, data.teams);
  const rosters = publicRosters(rosterSource, policy, root);
  const previous = fs.existsSync(path.join(root, 'data/public/competition.json')) ? read('data/public/competition.json') : {};
  let repository = projectDataset(data, policy, { mode: 'repository', today, rosters, crests, colors, importedAt: previous.importedAt });
  if (repository.version !== previous.version) repository = projectDataset(data, policy, { mode: 'repository', today, rosters, crests, colors, importedAt: new Date().toISOString() });
  const live = projectDataset(data, policy, { mode: 'public', today, rosters, crests, colors, importedAt: repository.importedAt });
  atomic('data/internal/competition.json', { ...data, importedAt: repository.importedAt });
  atomic('data/internal/validation.json', { ...report, importedAt: repository.importedAt });
  atomic('data/internal/rosters-reviewed.json', rosterSource);
  atomic('data/internal/live.json', live);
  atomic('data/public/competition.json', repository);
  const counts = report.issues.reduce((n, i) => ({ ...n, [i.level]: (n[i.level] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ status: 'ok', stats: data.stats, issues: counts, scorerNames: live.publication.scorerNames, version: repository.version.slice(0, 12) }));
  return { data, report, live, repository };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { runImport(); }
  catch (error) { console.error(JSON.stringify({ status: 'error', message: error.message })); process.exit(1); }
}
