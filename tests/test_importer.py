import copy
import importlib.util
import json
import re
import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('importer', ROOT / 'scripts/import_excel.py')
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


class ImporterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads((ROOT / 'config/competition.json').read_text())
        local = ROOT / 'data/source.xlsx'
        if local.exists():
            cls.sheets, cls.date1904 = imp.read_workbook(local)
        else:
            from fixture_workbook import write_fixture
            with tempfile.TemporaryDirectory() as tmp:
                fixture = Path(tmp) / 'anonymized.xlsx'
                write_fixture(ROOT / 'tests/fixtures/workbook.json', fixture)
                cls.sheets, cls.date1904 = imp.read_workbook(fixture)
        cls.data, cls.report = imp.parse_competition(cls.sheets, cls.config, cls.date1904)

    def parse(self, sheets):
        return imp.parse_competition(sheets, self.config, self.date1904)

    def test_supplied_snapshot_all_eight_sheets(self):
        self.assertEqual(len(self.sheets), 8)
        groups = [s['rows'] for name, s in self.sheets.items() if name.startswith('Série')]
        rows = [cells for sheet in groups for cells in sheet.values() if re.fullmatch(r'J\d+', str(cells.get('A', '')))]
        finished = [row for row in rows if isinstance(row.get('E'), (int, float)) and isinstance(row.get('G'), (int, float))]
        self.assertEqual(self.data['stats']['teams'], sum(int(re.search(r'-\s*(\d+)\s+EQUIPAS', sheet[2]['A']).group(1)) for sheet in groups))
        self.assertEqual(self.data['stats']['matches'], len(rows))
        self.assertEqual(self.data['stats']['played'], len(finished))
        self.assertEqual(self.data['stats']['goals'], sum(row['E'] + row['G'] for row in finished))
        self.assertEqual(self.data['stats']['scorerRecords'], sum('B' in c and isinstance(c.get('E'), (int, float)) for c in self.sheets['Melhores Marcadores']['rows'].values()))

    def test_all_required_sheets_are_mandatory(self):
        for name in self.sheets:
            changed = copy.deepcopy(self.sheets)
            del changed[name]
            with self.subTest(name=name), self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_unknown_headers_fail_explicitly(self):
        changed = copy.deepcopy(self.sheets)
        changed['Série 1 (A)']['rows'][14]['C'] = 'Novo formato'
        with self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_missing_standing_cell_does_not_become_zero(self):
        changed = copy.deepcopy(self.sheets)
        del changed['Série 1 (A)']['rows'][6]['C']
        with self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_lost_standing_row_is_detected(self):
        changed = copy.deepcopy(self.sheets)
        del changed['Série 1 (A)']['rows'][6]['A']
        with self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_empty_rows_do_not_change_records(self):
        changed = copy.deepcopy(self.sheets)
        changed['Série 1 (A)']['rows'][1000] = {}
        self.assertEqual(self.parse(changed)[0], self.data)

    def test_half_score_excluded_and_reported(self):
        changed = copy.deepcopy(self.sheets)
        del changed['Série 1 (A)']['rows'][15]['G']
        data, report = self.parse(changed)
        match = next(m for m in data['matches'] if m['sourceSheet'] == 'Série 1 (A)' and m['sourceRow'] == 15)
        self.assertEqual(match['status'], 'incomplete')
        self.assertEqual(data['stats']['played'], self.data['stats']['played'] - 1)
        self.assertTrue(any(w['code'] == 'incomplete_result' for w in report['warnings']))
        self.assertEqual(data['groups'][0]['standings'], self.data['groups'][0]['standings'])

    def test_malformed_and_negative_score_rejected(self):
        for value in ['três', -1, 2.5]:
            changed = copy.deepcopy(self.sheets)
            changed['Série 1 (A)']['rows'][15]['E'] = value
            with self.subTest(value=value), self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_score_correction_preserves_match_id_and_excel_standings(self):
        changed = copy.deepcopy(self.sheets)
        changed['Série 1 (A)']['rows'][15]['E'] += 1
        data, report = self.parse(changed)
        self.assertEqual([m['id'] for m in data['matches']], [m['id'] for m in self.data['matches']])
        self.assertEqual(data['groups'][0]['standings'], self.data['groups'][0]['standings'])
        self.assertTrue(report['standingDifferences'])

    def test_duplicate_match_rejected(self):
        changed = copy.deepcopy(self.sheets)
        changed['Série 1 (A)']['rows'][1000] = changed['Série 1 (A)']['rows'][15]
        with self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_duplicate_team_rejected(self):
        changed = copy.deepcopy(self.sheets)
        changed['Série 1 (A)']['rows'][7]['B'] = changed['Série 1 (A)']['rows'][6]['B']
        with self.assertRaises(imp.ImportFailure): self.parse(changed)

    def test_withdrawal_and_notes_preserved(self):
        team = next(t for t in self.data['teams'] if t['withdrawn'])
        self.assertIn('Raianos', team['name'])
        self.assertTrue(self.data['groups'][-1]['notes'])
        affected = [m for m in self.data['matches'] if team['id'] in (m['homeId'], m['awayId'])]
        self.assertTrue(all(m['status'] == 'withdrawn' for m in affected))

    def test_missing_date_and_explicit_postponement(self):
        changed = copy.deepcopy(self.sheets)
        del changed['Série 1 (A)']['rows'][15]['B']
        changed['Série 1 (A)']['rows'][15]['E'] = 'Adiado'
        data, report = self.parse(changed)
        match = data['matches'][0]
        self.assertIsNone(match['date'])
        self.assertEqual(match['status'], 'postponed')
        self.assertTrue(any(w['code'] == 'missing_date' for w in report['warnings']))

    def test_date_serials_and_invalid_dates(self):
        self.assertEqual(imp.parse_date('10/10/2026'), '2026-10-10')
        self.assertEqual(imp.parse_date(1), '1899-12-31')
        self.assertEqual(imp.parse_date(0, True), '1904-01-01')
        self.assertIsNone(imp.parse_date('31/02/2026'))

    def test_goal_notation_and_own_goals(self):
        parsed = imp.parse_scorers('Pessoa A (2), Pessoa B (PB), Pessoa C')
        self.assertEqual([e['goals'] for e in parsed], [2, 1, 1])
        self.assertTrue(parsed[1]['ownGoal'])
        self.assertTrue(imp.parse_scorers('Pessoa (2) (3)')[0]['ambiguous'])
        self.assertTrue(imp.parse_scorers('Pessoa (0)')[0]['ambiguous'])

    def test_source_formula_errors_are_reported(self):
        expected = sum(str(v) in imp.EXCEL_ERRORS for row in self.sheets['Estatística Geral']['rows'].values() for v in row.values())
        self.assertEqual(sum(w['code'] == 'excel_formula_error' for w in self.report['warnings']), expected)
        self.assertTrue(all(str(s['leader']) not in imp.EXCEL_ERRORS for s in self.data['generalStatistics']))

    def test_private_by_default(self):
        public = imp.public_data(self.data, {'playerRecords': {}})
        self.assertEqual(public['scorers'], [])
        for match in public['matches']:
            self.assertEqual(match['scorers'], {'home': [], 'away': []})
        self.assertNotIn('fingerprint', json.dumps(public))
        for person in self.data['scorers']: self.assertNotIn(person['name'], json.dumps(public, ensure_ascii=False))

    def test_publication_requires_matching_fingerprint_and_reference(self):
        scorer = self.data['scorers'][0]
        valid = {scorer['id']: {'fingerprint': scorer['fingerprint'], 'authorizationReference': 'test-fixture-reference'}}
        public = imp.public_data(self.data, {'playerRecords': valid})
        self.assertEqual([s['id'] for s in public['scorers']], [scorer['id']])
        self.assertTrue(any(e['name'] == scorer['name'] for m in public['matches'] for e in m['scorers']['home'] + m['scorers']['away']))
        valid[scorer['id']]['fingerprint'] = 'outdated'
        self.assertEqual(imp.public_data(self.data, {'playerRecords': valid})['scorers'], [])

    def test_exclusion_overrides_publication(self):
        scorer = self.data['scorers'][0]
        policy = {'playerRecords': {scorer['id']: {'fingerprint': scorer['fingerprint'], 'authorizationReference': 'test'}}, 'excludedRecordIds': [scorer['id']]}
        self.assertEqual(imp.public_data(self.data, policy)['scorers'], [])

    def test_club_and_team_are_separate(self):
        club = next(c for c in self.data['clubs'] if c['id'] == 'ad-barroselas')
        self.assertEqual(len(club['teamIds']), 2)

    def test_bad_workbook_does_not_overwrite_last_good_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'config').mkdir()
            (root / 'data/public').mkdir(parents=True)
            for name in ('competition.json', 'publication.json'):
                (root / 'config' / name).write_text((ROOT / 'config' / name).read_text())
            snapshot = root / 'data/public/competition.json'
            snapshot.write_text('{"lastGood":true}')
            bad = root / 'bad.xlsx'
            bad.write_bytes(b'not a workbook')
            with patch.object(imp, 'ROOT', root), self.assertRaises(imp.ImportFailure): imp.run(bad)
            self.assertEqual(snapshot.read_text(), '{"lastGood":true}')


if __name__ == '__main__': unittest.main()
