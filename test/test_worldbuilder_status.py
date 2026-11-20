"""Pure tracker invariants. No Django, network, accounts, or database writes."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('status_audit', ROOT / 'scripts/audit-worldbuilder-status.py')
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class StatusAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inventory = json.loads((AUDIT.DOCS / 'feature-inventory.json').read_text(encoding='utf-8'))
        cls.index = AUDIT.scan()

    def setUp(self):
        self.data = copy.deepcopy(self.inventory)

    def messages(self):
        return '\n'.join(AUDIT.validate(self.data, self.index))

    def row(self, identity='W-02'):
        return next(row for row in self.data['features'] if row['id'] == identity)

    def test_current_inventory_and_evidence_agree(self):
        self.assertEqual(self.messages(), '')
        self.assertEqual(len(self.data['features']), 139)

    def test_verified_is_not_an_implementation_state(self):
        self.row()['status'] = 'verified'
        self.assertIn('Separate implementation from verification', self.messages())

    def test_stale_counts_fail(self):
        self.data['scopeCounts']['local_core'] += 1
        self.assertIn('Scope counts are stale', self.messages())
        self.data['implementationCounts']['partial'] += 1
        self.assertIn('Implementation counts are stale', self.messages())

    def test_duplicate_original_id_fails(self):
        self.data['features'][-1]['id'] = 'W-02'
        self.assertIn('139 distinct original feature IDs', self.messages())

    def test_missing_evidence_path_fails(self):
        self.row()['codeEvidence'] = ['does-not-exist.py']
        self.assertIn('absent from the authored file index', self.messages())

    def test_pass_claim_requires_tests(self):
        self.row()['testEvidence'] = []
        self.assertIn('passing claim needs related tests', self.messages())

    def test_external_service_is_not_software_backlog(self):
        self.row('X-01')['status'] = 'planned'
        self.assertIn('Do not count an external service', self.messages())

    def test_acceptance_needs_function_and_safety_cases(self):
        self.row()['acceptanceChecks'] = ['A button exists.']
        self.assertIn('concrete functional and preservation/access', self.messages())

    def test_dependency_cycles_fail(self):
        self.row('W-02')['dependsOn'] = ['W-03']
        self.row('W-03')['dependsOn'] = ['W-02']
        self.assertIn('Dependency cycle', self.messages())

    def test_unknown_dependency_fails(self):
        self.row()['dependsOn'] = ['UNKNOWN-01']
        self.assertIn('Invalid dependency', self.messages())

    def test_nonoriginal_id_fails_even_when_row_count_matches(self):
        self.row('W-02')['id'] = 'W-99'
        self.assertIn('139 distinct original feature IDs', self.messages())

    def test_confidence_needs_level_and_reason(self):
        self.row()['confidence'] = {'level': 'certain'}
        self.assertIn('Record confidence and its reason', self.messages())

    def test_partial_delivery_cannot_claim_full_acceptance(self):
        self.row()['status'] = 'partial'
        self.assertIn('Full bounded acceptance cannot be passed', self.messages())

    def test_generated_summary_is_deterministic_and_separates_counts(self):
        first = AUDIT.status_markdown(self.data)
        self.assertEqual(first, AUDIT.status_markdown(copy.deepcopy(self.data)))
        self.assertIn('No row count is a completion percentage', first)
        self.assertIn('Verification coverage', first)
        self.assertNotIn('40 verified local acceptance rows', first)

    def test_runtime_change_invalidates_recorded_test_snapshot(self):
        changed = copy.deepcopy(self.index)
        source = next(row for row in changed['files'] if row['path'].endswith('/backend/studio/services.py'))
        source['sha256'] = '0' * 64
        self.assertIn('Runtime/test sources changed', '\n'.join(AUDIT.validate(self.data, changed)))

    def test_backend_definition_count_cannot_drift_from_run_record(self):
        changed = copy.deepcopy(self.index)
        source = next(row for row in changed['files'] if row['path'].endswith('/backend/studio/tests.py'))
        source['testCases'] += 1
        self.assertIn('Recorded backend test count differs', '\n'.join(AUDIT.validate(self.data, changed)))


if __name__ == '__main__':
    unittest.main()
