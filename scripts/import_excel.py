"""MINHO11 XLSX adapter. Standard library only; source data never served publicly."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import tempfile
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from rosters import load_rosters, public_rosters

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
EXCEL_ERRORS = {'#NAME?', '#REF!', '#VALUE!', '#DIV/0!', '#N/A', '#NUM!', '#NULL!'}


class ImportFailure(ValueError):
    pass


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '')) if not unicodedata.combining(c)).casefold().strip()


def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', normalized(value)).strip('-')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def integer(value, field='número', allow_negative=False):
    if value is None or str(value).strip() == '':
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ImportFailure(f'{field}: valor não numérico ({value!r}).') from exc
    if not number.is_integer() or (number < 0 and not allow_negative):
        raise ImportFailure(f'{field}: inteiro inválido ({value!r}).')
    return int(number)


def read_workbook(path):
    """Read cached OpenXML values, retaining formulas/addresses in the internal audit."""
    try:
        with zipfile.ZipFile(path) as archive:
            if sum(i.file_size for i in archive.infolist()) > 50_000_000:
                raise ImportFailure('Excel demasiado grande (limite descomprimido: 50 MB).')
            shared = []
            if 'xl/sharedStrings.xml' in archive.namelist():
                shared = [''.join(t.text or '' for t in si.findall('.//s:t', NS)) for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
            relationships = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
            workbook = ET.fromstring(archive.read('xl/workbook.xml'))
            props = workbook.find('s:workbookPr', NS)
            date1904 = props is not None and props.attrib.get('date1904') in ('1', 'true')
            sheets = {}
            for sheet in workbook.findall('s:sheets/s:sheet', NS):
                target = relationships[sheet.attrib[REL]]
                target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
                if '..' in target.split('/'):
                    raise ImportFailure('Caminho de folha inválido.')
                rows, formulas = {}, {}
                for row in ET.fromstring(archive.read(target)).findall('s:sheetData/s:row', NS):
                    cells = {}
                    for cell in row.findall('s:c', NS):
                        address = cell.attrib['r']
                        col = re.sub(r'\d', '', address)
                        value_element = cell.find('s:v', NS)
                        value = value_element.text if value_element is not None else None
                        kind = cell.attrib.get('t')
                        if kind == 's' and value is not None:
                            value = shared[int(value)]
                        elif kind == 'inlineStr':
                            value = ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
                        elif value is not None and kind not in ('str', 'e', 'd'):
                            try:
                                value = float(value)
                                if value.is_integer(): value = int(value)
                            except ValueError: pass
                        formula = cell.find('s:f', NS)
                        if formula is not None: formulas[address] = formula.text or ''
                        if value is not None: cells[col] = value
                    if cells: rows[int(row.attrib['r'])] = cells
                sheets[sheet.attrib['name']] = {'rows': rows, 'formulas': formulas}
            return sheets, date1904
    except (zipfile.BadZipFile, KeyError, ET.ParseError, IndexError, OSError) as exc:
        raise ImportFailure(f'Não foi possível ler a estrutura XLSX: {exc}') from exc


def parse_date(value, date1904=False):
    if value is None or value == '': return None
    if isinstance(value, (int, float)):
        return ((datetime(1904, 1, 1) if date1904 else datetime(1899, 12, 30)) + timedelta(days=value)).date().isoformat()
    text = str(value).strip()
    for pattern in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
        try: return datetime.strptime(text, pattern).date().isoformat()
        except ValueError: pass
    return None


def parse_scorers(value):
    """A record represents source notation, never a resolved person identity."""
    if value is None or str(value).strip() == '': return []
    events = []
    for token in re.split(r'[,;\n]+', str(value)):
        token = token.strip()
        if not token: continue
        own = bool(re.search(r'\(\s*(?:PB|AG)\s*\)', token, re.I))
        count = re.search(r'\(\s*(\d+)\s*\)', token)
        name = re.sub(r'\(\s*(?:\d+|PB|AG)\s*\)', '', token, flags=re.I).strip()
        ambiguous = not name or len(re.findall(r'\(\s*\d+\s*\)', token)) > 1 or (count is not None and int(count.group(1)) < 1) or bool(re.search(r'[()\d]', name)) or bool(re.search(r'\b(?:desconhecido|sem nome|autogolo|por identificar)\b', normalized(name)))
        events.append({'name': name, 'goals': int(count.group(1)) if count else 1, 'ownGoal': own, 'ambiguous': ambiguous, 'sourceText': token})
    return events


def parse_competition(sheets, config, date1904=False, audit_date=None):
    warnings = []
    audit_date = audit_date or datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
    def warn(code, message, sheet=None, row=None):
        warnings.append({'code': code, 'message': message, 'sheet': sheet, 'row': row})

    group_sheets = [(name, re.fullmatch(r'Série\s+\d+\s+\(([A-Z])\)', name)) for name in sheets]
    group_sheets = [(name, match.group(1)) for name, match in group_sheets if match]
    if len(group_sheets) != 6 or {g for _, g in group_sheets} != set('ABCDEF'):
        raise ImportFailure('São obrigatórias as seis folhas Série 1 (A) a Série 6 (F).')
    for required in ('Melhores Marcadores', 'Estatística Geral'):
        if required not in sheets: raise ImportFailure(f'Falta a folha {required}.')
    if len(sheets) != 8: warn('extra_sheets', 'Foram encontradas folhas adicionais. Conservadas no relatório interno.')

    teams, clubs, groups, matches, scorers = [], {}, [], [], []
    team_lookup = {}
    for name, letter in group_sheets:
        rows = sheets[name]['rows']
        header = next((r for r, c in rows.items() if c.get('B') == 'Equipa' and c.get('C') == 'J' and c.get('J') == 'Pts'), None)
        match_header = next((r for r, c in rows.items() if c.get('A') == 'Jor.' and c.get('C') == 'Equipa Visitada (Casa)' and c.get('H') == 'Equipa Visitante (Fora)' and c.get('E') == 'GM' and c.get('G') == 'GF'), None)
        if header is None or match_header is None: raise ImportFailure(f'{name}: cabeçalhos desconhecidos. Importação interrompida para evitar interpretações incorretas.')
        group = {'id': letter, 'name': f'Série {letter}', 'sourceSheet': name, 'teamIds': [], 'standings': [], 'notes': []}
        for r, c in rows.items():
            if r < header and isinstance(c.get('A'), str) and c['A'].startswith('Nota:'):
                group['notes'].append(c['A'])
            if not (header < r < match_header and c.get('B') and re.match(r'^\d+', str(c.get('A', '')))): continue
            team_name = str(c['B']).strip()
            clean_name = re.sub(r'\s*\(Desistiu\)\s*', '', team_name, flags=re.I).strip()
            team_id = letter.lower() + '-' + slug(clean_name)
            club_name = config.get('clubMappings', {}).get(clean_name, clean_name)
            club_id = slug(club_name)
            if team_id in [t['id'] for t in teams]: raise ImportFailure(f'{name}: equipa duplicada ({team_name}).')
            clubs.setdefault(club_id, {'id': club_id, 'slug': club_id, 'name': club_name, 'crestUrl': None, 'teamIds': []})
            clubs[club_id]['teamIds'].append(team_id)
            team = {'id': team_id, 'name': clean_name, 'sourceName': team_name, 'clubId': club_id, 'groupId': letter, 'withdrawn': '(desistiu)' in team_name.casefold()}
            teams.append(team)
            team_lookup[(letter, normalized(team_name))] = team_id
            team_lookup[(letter, normalized(clean_name))] = team_id
            group['teamIds'].append(team_id)
            standing = {'teamId': team_id, 'position': int(re.match(r'^\d+', str(c['A'])).group()), 'sourceRow': r}
            for col, key in [('C', 'played'), ('D', 'wins'), ('E', 'draws'), ('F', 'losses'), ('G', 'goalsFor'), ('H', 'goalsAgainst'), ('I', 'goalDifference'), ('J', 'points')]:
                standing[key] = integer(c.get(col), f'{name}!{col}{r}', key == 'goalDifference')
                if standing[key] is None: raise ImportFailure(f'{name}!{col}{r}: classificação incompleta.')
            if standing['played'] != standing['wins'] + standing['draws'] + standing['losses'] or standing['goalDifference'] != standing['goalsFor'] - standing['goalsAgainst']:
                warn('standing_internal', f'{clean_name}: a classificação contém totais inconsistentes.', name, r)
            group['standings'].append(standing)

        for r, c in rows.items():
            if r <= match_header: continue
            if not re.fullmatch(r'J\d+', str(c.get('A', ''))):
                if c.get('C') and c.get('H') and c.get('F') in ('X', 'x'):
                    raise ImportFailure(f'{name}, linha {r}: jogo sem jornada reconhecida.')
                continue
            home = team_lookup.get((letter, normalized(c.get('C'))))
            away = team_lookup.get((letter, normalized(c.get('H'))))
            if not home or not away or home == away: raise ImportFailure(f'{name}, linha {r}: equipas do jogo desconhecidas ou iguais.')
            round_number = int(str(c['A'])[1:])
            match_id = 'm-' + digest([config['id'], letter, round_number, home, away])[:16]
            if any(m['id'] == match_id for m in matches): raise ImportFailure(f'{name}, linha {r}: jogo duplicado.')
            raw_scores = [c.get('E'), c.get('G')]
            text = normalized(' '.join(str(x or '') for x in raw_scores))
            marked = 'postponed' if any(x in text for x in ('adiado', 'adiad')) else 'cancelled' if any(x in text for x in ('cancelado', 'anulado')) else None
            scores = [None, None] if marked else [integer(v, f'{name}, linha {r}: resultado') for v in raw_scores]
            incomplete = (scores[0] is None) != (scores[1] is None)
            if incomplete: warn('incomplete_result', 'Resultado parcial: não contado como jogo realizado.', name, r)
            withdrawn = any(t['withdrawn'] for t in teams if t['id'] in (home, away))
            status = marked or ('incomplete' if incomplete else 'finished' if all(s is not None for s in scores) else 'withdrawn' if withdrawn else 'scheduled')
            date = parse_date(c.get('B'), date1904)
            if date is None: warn('missing_date', 'Data ausente ou não reconhecida.', name, r)
            if status == 'finished' and date and date > audit_date:
                warn('future_result', 'Resultado completo com data futura na fonte. Resultado e data preservados para revisão.', name, r)
            events = {'home': parse_scorers(rows.get(r + 1, {}).get('C')), 'away': parse_scorers(rows.get(r + 1, {}).get('H'))}
            for side, score in zip(('home', 'away'), scores):
                count = sum(e['goals'] for e in events[side])
                if score is not None and count != score:
                    warn('goal_event_total', f'{side}: resultado {score}, golos descritos {count}.', name, r + 1)
                if any(e['ambiguous'] or e['goals'] < 1 for e in events[side]): warn('ambiguous_scorer', 'Notação de marcador ambígua; sem associação automática.', name, r + 1)
                if events[side] and status != 'finished': warn('events_without_result', 'Marcadores presentes num jogo sem resultado completo.', name, r)
            matches.append({'id': match_id, 'groupId': letter, 'round': round_number, 'date': date, 'sourceDate': c.get('B'), 'homeId': home, 'awayId': away, 'homeGoals': scores[0], 'awayGoals': scores[1], 'status': status, 'scorers': events, 'sourceRow': r, 'sourceSheet': name})
        expected_count = re.search(r'-\s*(\d+)\s+EQUIPAS', str(rows.get(2, {}).get('A', '')), re.I)
        if expected_count and int(expected_count.group(1)) != len(group['teamIds']):
            raise ImportFailure(f'{name}: número de equipas diferente do cabeçalho. Verificar a estrutura da classificação.')
        groups.append(group)

    rows = sheets['Melhores Marcadores']['rows']
    header = next((r for r, c in rows.items() if c.get('B') == 'Jogador' and c.get('C') == 'Equipa' and c.get('E') == 'Golos'), None)
    if header is None: raise ImportFailure('Melhores Marcadores: cabeçalhos desconhecidos.')
    for r, c in rows.items():
        if r <= header or not c.get('B'): continue
        group_match = re.search(r'\(([A-F])\)', str(c.get('D', '')))
        team_id = team_lookup.get((group_match.group(1), normalized(c.get('C')))) if group_match else None
        if not team_id: raise ImportFailure(f'Melhores Marcadores, linha {r}: série/equipa desconhecida.')
        goals = integer(c.get('E'), f'Melhores Marcadores!E{r}')
        if goals is None: raise ImportFailure(f'Melhores Marcadores!E{r}: golos em falta.')
        record = {'id': f'scorer-row-{r}', 'name': str(c['B']).strip(), 'teamId': team_id, 'groupId': group_match.group(1), 'goals': goals, 'sourceRow': r, 'sourcePosition': c.get('A')}
        record['fingerprint'] = digest([config['id'], record['name'], team_id, r])
        scorers.append(record)

    counts = Counter((s['teamId'], normalized(s['name'])) for s in scorers)
    event_totals = Counter()
    for match in matches:
        if match['status'] != 'finished': continue
        for side, team_id in [('home', match['homeId']), ('away', match['awayId'])]:
            for event in match['scorers'][side]:
                if not event['ownGoal'] and not event['ambiguous']: event_totals[(team_id, normalized(event['name']))] += event['goals']
    for scorer in scorers:
        key = (scorer['teamId'], normalized(scorer['name']))
        if counts[key] > 1: warn('ambiguous_player', 'Nome repetido na mesma equipa. Os registos mantêm-se separados.', 'Melhores Marcadores', scorer['sourceRow'])
        elif event_totals[key] != scorer['goals']:
            warn('scorer_total', f'Total individual {scorer["goals"]}, eventos associados por nome exato {event_totals[key]}. Sem fusão de identidades.', 'Melhores Marcadores', scorer['sourceRow'])
    known = set(counts)
    for key in event_totals:
        if key not in known: warn('unmatched_event_name', f'Eventos sem correspondência exata na tabela individual da equipa {key[0]}.')

    calculated = {t['id']: dict.fromkeys(('played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points'), 0) for t in teams}
    for match in matches:
        if match['status'] != 'finished': continue
        for team_id, gf, ga in [(match['homeId'], match['homeGoals'], match['awayGoals']), (match['awayId'], match['awayGoals'], match['homeGoals'])]:
            s = calculated[team_id]
            for k, n in [('played', 1), ('wins', int(gf > ga)), ('draws', int(gf == ga)), ('losses', int(gf < ga)), ('goalsFor', gf), ('goalsAgainst', ga), ('goalDifference', gf - ga), ('points', 3 if gf > ga else 1 if gf == ga else 0)]: s[k] += n
    differences = []
    for group in groups:
        for source in group['standings']:
            delta = {k: {'excel': source[k], 'calculated': v} for k, v in calculated[source['teamId']].items() if source[k] != v}
            if delta:
                differences.append({'teamId': source['teamId'], 'fields': delta})
                warn('standing_difference', f'{source["teamId"]}: divergência face aos resultados registados. Classificação Excel preservada.', group['sourceSheet'], source['sourceRow'])

    general_rows = sheets['Estatística Geral']['rows']
    general_header = next((r for r, c in general_rows.items() if c.get('A') == 'Indicador Estatístico'), None)
    if general_header is None: raise ImportFailure('Estatística Geral: estrutura desconhecida.')
    general_end = next((r for r, c in sorted(general_rows.items()) if r > general_header and c.get('A') and 'D' not in c), float('inf'))
    general = []
    for r, cells in general_rows.items():
        for col, value in cells.items():
            if str(value) in EXCEL_ERRORS: warn('excel_formula_error', f'Erro guardado {value}. Valor não publicado.', 'Estatística Geral', r)
        if general_header < r < general_end and cells.get('A') and 'D' in cells:
            value, leader = cells.get('D'), cells.get('E')
            if isinstance(value, (int, float)):
                general.append({'label': cells['A'], 'value': value, 'leader': None if str(leader) in EXCEL_ERRORS else leader})

    finished = [m for m in matches if m['status'] == 'finished']
    stats = {'groups': len(groups), 'teams': len(teams), 'activeTeams': sum(not t['withdrawn'] for t in teams), 'clubs': len(clubs), 'matches': len(matches), 'played': len(finished), 'goals': sum(m['homeGoals'] + m['awayGoals'] for m in finished), 'scorerRecords': len(scorers), 'draws': sum(m['homeGoals'] == m['awayGoals'] for m in finished)}
    data = {'schemaVersion': 1, 'competition': {k: v for k, v in config.items() if k not in ('source', 'clubMappings')}, 'groups': groups, 'teams': teams, 'clubs': list(clubs.values()), 'matches': matches, 'scorers': scorers, 'stats': stats, 'generalStatistics': general}
    report = {'warnings': warnings, 'standingDifferences': differences, 'calculatedStandings': calculated, 'calculationAssumption': '3 pontos por vitória e 1 por empate, apenas para diagnóstico; regras e desempates por confirmar.', 'sheets': {name: {'rows': len(sheet['rows']), 'formulas': len(sheet['formulas'])} for name, sheet in sheets.items()}}
    return data, report


def public_data(internal, policy):
    result = copy.deepcopy(internal)
    approved, excluded = policy.get('playerRecords', {}), set(policy.get('excludedRecordIds', []))
    eligible = {}
    for scorer in internal['scorers']:
        entry = approved.get(scorer['id'], {})
        if scorer['id'] not in excluded and entry.get('fingerprint') == scorer['fingerprint'] and entry.get('authorizationReference'):
            eligible[scorer['id']] = scorer
    result['scorers'] = [{k: s[k] for k in ('id', 'name', 'teamId', 'groupId', 'goals')} for s in eligible.values()]
    # Goal labels require an unambiguous exact team/name authorization. Own-goal names are never inferred.
    all_counts = Counter((s['teamId'], normalized(s['name'])) for s in internal['scorers'])
    visible_names = {(s['teamId'], normalized(s['name'])) for s in eligible.values() if all_counts[(s['teamId'], normalized(s['name']))] == 1}
    for match in result['matches']:
        for side, team_id in [('home', match['homeId']), ('away', match['awayId'])]:
            match['scorers'][side] = [{'name': e['name'], 'goals': e['goals']} for e in match['scorers'][side] if not e['ownGoal'] and not e['ambiguous'] and (team_id, normalized(e['name'])) in visible_names]
        for key in ('sourceDate', 'sourceRow', 'sourceSheet'): match.pop(key, None)
    for team in result['teams']: team.pop('sourceName', None)
    for group in result['groups']:
        group.pop('sourceSheet', None)
        for standing in group['standings']: standing.pop('sourceRow', None)
    result['publication'] = {'individualNamesAvailable': bool(eligible), 'individualRecordsPublished': len(eligible)}
    return result


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as tmp:
        json.dump(value, tmp, ensure_ascii=False, indent=2)
        tmp.write('\n')
    os.replace(tmp.name, path)


def run(source=None):
    config = json.loads((ROOT / 'config/competition.json').read_text())
    policy = json.loads((ROOT / 'config/publication.json').read_text())
    path = Path(source) if source else ROOT / config['source']
    sheets, date1904 = read_workbook(path)
    data, report = parse_competition(sheets, config, date1904)
    roster_source = load_rosters(ROOT / 'data/internal/rosters-source.json', data['competition'], data['teams'])
    public = public_data(data, policy)
    public['rosters'] = public_rosters(roster_source, policy, ROOT)
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    version = digest({'sourceHash': source_hash, 'public': public, 'policy': policy})
    previous_file = ROOT / 'data/public/competition.json'
    previous = json.loads(previous_file.read_text()) if previous_file.exists() else {}
    timestamp = previous.get('importedAt') if previous.get('version') == version else datetime.now(timezone.utc).isoformat()
    public.update({'version': version, 'sourceHash': source_hash, 'importedAt': timestamp})
    data.update({'version': version, 'sourceHash': source_hash, 'importedAt': timestamp})
    report.update({'version': version, 'importedAt': timestamp, 'stats': data['stats']})
    # Validate everything before replacing the last good public snapshot.
    atomic_json(ROOT / 'data/internal/competition.json', data)
    atomic_json(ROOT / 'data/internal/validation.json', report)
    atomic_json(ROOT / 'data/internal/source-cells.json', sheets)
    atomic_json(ROOT / 'data/internal/rosters-reviewed.json', roster_source)
    atomic_json(previous_file, public)
    print(json.dumps({'status': 'ok', 'stats': public['stats'], 'warnings': len(report['warnings']), 'individualRecordsPublished': len(public['scorers']), 'version': version[:12]}, ensure_ascii=False))
    return public, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Importa o Excel sem expor a fonte original.')
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    try: run(args.source)
    except (ImportFailure, json.JSONDecodeError) as exc:
        print(json.dumps({'status': 'error', 'message': str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
