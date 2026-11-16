/**
 * Provider boundary for verified squads. No Zerozero endpoint is guessed.
 * An authorised adapter will later write data/internal/rosters-source.json;
 * the build only consumes that normalised cache and applies publication permissions.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha256 = value => createHash('sha256').update(value).digest('hex');
export const rosterFingerprint = (provider, season, teamId, kind, person) => sha256(JSON.stringify([provider, season, teamId, kind, person.externalId, person.name]));

export function loadRosters(file, competition, teams) {
  if (!fs.existsSync(file)) return { provider: null, fetchedAt: null, teams: [] };
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (source.schemaVersion !== 1 || source.season !== competition.season || !Array.isArray(source.teams)) throw new Error('Plantéis: esquema ou época desconhecidos.');
  if (!['zerozero', 'authorized-club'].includes(source.provider) || !source.sourceAuthorizationReference) throw new Error('Plantéis: fornecedor ou autorização de utilização em falta.');
  const known = new Set(teams.map(t => t.id)), seen = new Set(), ids = new Set();
  for (const team of source.teams) {
    if (!known.has(team.teamId) || seen.has(team.teamId)) throw new Error('Plantéis: equipa desconhecida ou repetida.');
    seen.add(team.teamId);
    for (const [kind, key] of [['player', 'players'], ['staff', 'staff']]) {
      if (!Array.isArray(team[key])) throw new Error(`Plantéis: lista ${key} em falta.`);
      for (const person of team[key]) {
        if (typeof person.externalId !== 'string' || !person.externalId || typeof person.name !== 'string' || !person.name.trim()) throw new Error('Plantéis: identificação de origem incompleta.');
        person.recordId = `${source.provider}:${kind}:${person.externalId}:${team.teamId}`;
        if (ids.has(person.recordId)) throw new Error('Plantéis: registo individual repetido.');
        ids.add(person.recordId);
        person.fingerprint = rosterFingerprint(source.provider, source.season, team.teamId, kind, person);
        if (person.jerseyNumber != null && (!Number.isInteger(person.jerseyNumber) || person.jerseyNumber < 0 || person.jerseyNumber > 999)) throw new Error('Plantéis: número de camisola inválido.');
        for (const field of ['position', 'role']) if (person[field] != null && typeof person[field] !== 'string') throw new Error(`Plantéis: ${field} inválido.`);
      }
    }
  }
  return source;
}

export function publicRosters(source, policy, root) {
  const approved = policy.rosterRecords ?? {}, excluded = new Set(policy.excludedRosterRecordIds ?? []);
  return source.teams.map(team => {
    const result = { teamId: team.teamId, players: [], staff: [], complete: false };
    for (const key of ['players', 'staff']) for (const person of team[key]) {
      const authorization = approved[person.recordId] ?? {};
      if (excluded.has(person.recordId) || authorization.fingerprint !== person.fingerprint || !authorization.authorizationReference) continue;
      const record = { id: person.recordId, name: person.name, position: person.position ?? null, role: person.role ?? null, jerseyNumber: person.jerseyNumber ?? null, photoPath: null };
      const photo = person.photo ?? {}, local = photo.localPath ?? '';
      if (/^\/media\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/.test(local) && photo.rightsReference && authorization.photoAuthorizationReference) {
        const mediaRoot = path.resolve(root, 'assets/media'), file = path.resolve(root, 'assets', local.slice(1));
        const expected = path.basename(local).split('.')[0];
        if (file.startsWith(mediaRoot + path.sep) && fs.existsSync(file) && sha256(fs.readFileSync(file)) === expected && authorization.photoHash === expected) record.photoPath = local;
      }
      result[key].push(record);
    }
    // Do not claim a full squad when publication filters removed members.
    result.complete = Boolean(team.complete) && result.players.length === team.players.length;
    return result;
  });
}
