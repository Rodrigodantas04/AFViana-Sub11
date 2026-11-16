/**
 * Public projections of the internal dataset.
 *
 * - 'public'     what visitors receive from the live endpoint: scorer names
 *                follow config/publication.json (opt-out list honoured).
 * - 'repository' what is committed to Git and pre-rendered into static HTML:
 *                never contains children's names, only counts.
 * Internal source references (sheet, row, raw descriptions) never leave here.
 */
import { createHash } from 'node:crypto';
import { fold } from './excel-engine.js';
import { validateDataset } from '../src/domain.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');
export const scorerId = (competitionId, name, teamId) => 's-' + sha256(JSON.stringify([competitionId, fold(name), teamId])).slice(0, 12);

function sideScoring(competitionId, teamId, side, showNames, excluded) {
  const credited = new Map();
  for (const e of side.events) {
    if (e.ownGoal || e.credited < 1) continue;
    const key = fold(e.name);
    const entry = credited.get(key) ?? { id: scorerId(competitionId, e.name, teamId), name: e.name, goals: 0 };
    entry.goals += e.credited;
    credited.set(key, entry);
  }
  const list = [...credited.values()];
  return {
    scorers: showNames ? list.filter(s => !excluded.has(s.id)).map(({ name, goals }) => ({ name, goals })) : [],
    identified: list.reduce((n, s) => n + s.goals, 0),
    ownGoals: side.ownGoals,
    missing: side.missing,
  };
}

export function projectDataset(internal, policy = {}, { mode = 'public', importedAt, today, rosters = [] } = {}) {
  const showNames = mode === 'public' && policy.scorerNames === 'public';
  const excluded = new Set(policy.excludedScorerIds ?? []);
  const id = internal.competition.id;
  const matches = internal.matches.map(m => ({
    id: m.id, phaseId: m.phaseId, groupId: m.groupId, round: m.round, date: m.date, homeId: m.homeId, awayId: m.awayId,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals, status: m.status,
    scoring: { home: sideScoring(id, m.homeId, m.scorers.home, showNames, excluded), away: sideScoring(id, m.awayId, m.scorers.away, showNames, excluded) },
  }));
  const rankings = Object.fromEntries(Object.entries(internal.scorers).map(([scope, list]) => [scope, showNames ? list.filter(s => !excluded.has(s.id)).map(({ id: sid, name, teamId, goals }) => ({ id: sid, name, teamId, goals })) : []]));
  const played = matches.filter(m => m.status === 'finished');
  const data = {
    schemaVersion: 2,
    competition: internal.competition,
    phases: internal.phases,
    groups: internal.groups,
    teams: internal.teams,
    clubs: internal.clubs,
    matches,
    scorers: rankings,
    stats: internal.stats,
    quality: {
      unidentifiedGoals: internal.stats.unidentifiedGoals,
      sidesWithMissingScorers: played.reduce((n, m) => n + (m.scoring.home.missing > 0) + (m.scoring.away.missing > 0), 0),
      futureResults: internal.matches.filter(m => m.status === 'finished' && m.date && today && m.date > today).map(m => m.id),
    },
    publication: { scorerNames: mode === 'repository' ? 'redacted' : showNames ? 'public' : 'hidden', excludedRecords: showNames ? excluded.size : 0 },
    rosters,
    sourceHash: internal.sourceHash,
  };
  const version = sha256(JSON.stringify({ ...data, importedAt: undefined }));
  return validateDataset({ ...data, version, importedAt: importedAt ?? new Date().toISOString() });
}
