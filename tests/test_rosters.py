import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from rosters import load_rosters, public_rosters


class RosterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.path = self.root / 'source.json'
        self.competition = {'season': '2026/2027'}
        self.teams = [{'id': 'test-team'}]
        self.raw = {'schemaVersion': 1, 'provider': 'zerozero', 'season': '2026/2027', 'fetchedAt': '2026-11-16T00:00:00Z', 'sourceAuthorizationReference': 'test-source-rights', 'teams': [{'teamId': 'test-team', 'complete': True, 'players': [{'externalId': 'test-id', 'name': 'Pessoa de teste', 'position': 'Médio', 'jerseyNumber': 8}], 'staff': [{'externalId': 'test-coach', 'name': 'Técnico de teste', 'role': 'Treinador'}]}]}

    def source(self):
        self.path.write_text(json.dumps(self.raw))
        return load_rosters(self.path, self.competition, self.teams)

    def approve(self, source):
        person = source['teams'][0]['players'][0]
        return {'rosterRecords': {person['recordId']: {'fingerprint': person['fingerprint'], 'authorizationReference': 'test-person-permission'}}}

    def test_no_api_calls_or_invented_roster_when_access_is_pending(self):
        source = load_rosters(self.path, self.competition, self.teams)
        self.assertEqual(public_rosters(source, {}, self.root), [])

    def test_requires_confirmed_team_season_and_source_rights(self):
        for mutate in [lambda s: s.update(season='wrong'), lambda s: s.update(sourceAuthorizationReference=''), lambda s: s['teams'][0].update(teamId='unknown')]:
            with self.subTest(mutation=mutate):
                original = copy.deepcopy(self.raw)
                mutate(self.raw)
                with self.assertRaises(ValueError): self.source()
                self.raw = original

    def test_identity_never_resolved_by_name_alone(self):
        self.raw['teams'][0]['players'][0].pop('externalId')
        with self.assertRaises(ValueError): self.source()

    def test_names_and_staff_hidden_by_default(self):
        public = public_rosters(self.source(), {}, self.root)
        self.assertEqual(public[0]['players'], [])
        self.assertEqual(public[0]['staff'], [])
        self.assertFalse(public[0]['complete'])

    def test_authorized_roster_is_renderable_with_fields_and_no_photo(self):
        source = self.source()
        public = public_rosters(source, self.approve(source), self.root)
        player = public[0]['players'][0]
        self.assertEqual(player['jerseyNumber'], 8)
        self.assertEqual(player['position'], 'Médio')
        self.assertIsNone(player['photoPath'])
        self.assertTrue(public[0]['complete'])

    def test_photo_requires_both_person_and_image_rights(self):
        image = b'test-image-fixture'
        sha = hashlib.sha256(image).hexdigest()
        media = self.root / 'assets/media'
        media.mkdir(parents=True)
        (media / f'{sha}.jpg').write_bytes(image)
        self.raw['teams'][0]['players'][0]['photo'] = {'localPath': f'/media/{sha}.jpg', 'rightsReference': 'test-image-license'}
        source = self.source()
        policy = self.approve(source)
        person = source['teams'][0]['players'][0]
        self.assertIsNone(public_rosters(source, policy, self.root)[0]['players'][0]['photoPath'])
        policy['rosterRecords'][person['recordId']].update(photoAuthorizationReference='test-photo-permission', photoHash=sha)
        self.assertEqual(public_rosters(source, policy, self.root)[0]['players'][0]['photoPath'], f'/media/{sha}.jpg')
        (media / f'{sha}.jpg').write_bytes(b'changed-image')
        self.assertIsNone(public_rosters(source, policy, self.root)[0]['players'][0]['photoPath'])

    def test_revocation_and_renamed_records_fail_closed(self):
        source = self.source()
        policy = self.approve(source)
        policy['excludedRosterRecordIds'] = [source['teams'][0]['players'][0]['recordId']]
        self.assertEqual(public_rosters(source, policy, self.root)[0]['players'], [])
        policy.pop('excludedRosterRecordIds')
        self.raw['teams'][0]['players'][0]['name'] = 'Nome corrigido'
        self.assertEqual(public_rosters(self.source(), policy, self.root)[0]['players'], [])

    def test_duplicate_source_ids_rejected(self):
        self.raw['teams'][0]['players'].append(copy.deepcopy(self.raw['teams'][0]['players'][0]))
        with self.assertRaises(ValueError): self.source()
