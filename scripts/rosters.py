"""Provider boundary for verified squads. No Zerozero HTTP endpoints are guessed.

An authorized adapter will later write data/internal/rosters-source.json.
The build only consumes that normalized cache and applies publication permissions.
"""
import hashlib
import json
import re
from pathlib import Path


def fingerprint(provider, season, team_id, kind, person):
    values = [provider, season, team_id, kind, person['externalId'], person['name']]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode()).hexdigest()


def load_rosters(path, competition, teams):
    if not path.exists():
        return {'provider': None, 'fetchedAt': None, 'teams': []}
    source = json.loads(path.read_text())
    if source.get('schemaVersion') != 1 or source.get('season') != competition['season'] or not isinstance(source.get('teams'), list):
        raise ValueError('Plantéis: esquema ou época desconhecidos.')
    if source.get('provider') not in ('zerozero', 'authorized-club') or not source.get('sourceAuthorizationReference'):
        raise ValueError('Plantéis: fornecedor ou autorização de utilização em falta.')
    known, seen, ids = {t['id'] for t in teams}, set(), set()
    for team in source['teams']:
        if team.get('teamId') not in known or team['teamId'] in seen:
            raise ValueError('Plantéis: equipa desconhecida ou repetida.')
        seen.add(team['teamId'])
        for kind, key in [('player', 'players'), ('staff', 'staff')]:
            if not isinstance(team.get(key), list): raise ValueError(f'Plantéis: lista {key} em falta.')
            for person in team[key]:
                if not isinstance(person.get('externalId'), str) or not person['externalId'] or not isinstance(person.get('name'), str) or not person['name'].strip():
                    raise ValueError('Plantéis: identificação de origem incompleta.')
                person['recordId'] = f'{source["provider"]}:{kind}:{person["externalId"]}:{team["teamId"]}'
                if person['recordId'] in ids: raise ValueError('Plantéis: registo individual repetido.')
                ids.add(person['recordId'])
                person['fingerprint'] = fingerprint(source['provider'], source['season'], team['teamId'], kind, person)
                if person.get('jerseyNumber') is not None and (not isinstance(person['jerseyNumber'], int) or isinstance(person['jerseyNumber'], bool) or not 0 <= person['jerseyNumber'] <= 999):
                    raise ValueError('Plantéis: número de camisola inválido.')
                for field in ('position', 'role'):
                    if person.get(field) is not None and not isinstance(person[field], str): raise ValueError(f'Plantéis: {field} inválido.')
    return source


def public_rosters(source, policy, root):
    approved, excluded = policy.get('rosterRecords', {}), set(policy.get('excludedRosterRecordIds', []))
    public = []
    for team in source['teams']:
        result = {'teamId': team['teamId'], 'players': [], 'staff': [], 'complete': False}
        for key in ('players', 'staff'):
            for person in team[key]:
                authorization = approved.get(person['recordId'], {})
                if person['recordId'] in excluded or authorization.get('fingerprint') != person['fingerprint'] or not authorization.get('authorizationReference'):
                    continue
                record = {'id': person['recordId'], 'name': person['name'], 'position': person.get('position'), 'role': person.get('role'), 'jerseyNumber': person.get('jerseyNumber'), 'photoPath': None}
                photo = person.get('photo') or {}
                local_path = photo.get('localPath', '')
                if re.fullmatch(r'/media/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)', local_path) and photo.get('rightsReference') and authorization.get('photoAuthorizationReference'):
                    file = (root / 'assets' / local_path.lstrip('/')).resolve()
                    media_root = (root / 'assets/media').resolve()
                    if file.is_relative_to(media_root) and file.is_file():
                        expected_hash = Path(local_path).stem
                        if hashlib.sha256(file.read_bytes()).hexdigest() == expected_hash and authorization.get('photoHash') == expected_hash:
                            record['photoPath'] = local_path
                result[key].append(record)
        # Do not claim a full squad when publication filters removed members.
        result['complete'] = bool(team.get('complete')) and len(result['players']) == len(team['players'])
        public.append(result)
    return public
