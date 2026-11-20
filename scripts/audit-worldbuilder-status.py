"""Inventory authored WorldBuilder files and validate/render its delivery tracker.

This reads source, tests and documentation; it never opens account databases,
credentials, transfer archives, dependency sources, or campaign media.
"""
import argparse
import ast
from collections import Counter
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re
import sys

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / 'src/critter/WorldBuilder/WorldBuilder'
DOCS = ROOT / 'docs'
EXCLUDED_DIRS = {'.git', '.venv', 'node_modules', 'dist', '__pycache__', '.npm-cache',
                 '.aina-dependency-repair', '.preview', 'data', 'data-recovered-transfer',
                 'backups', 'transfers', 'media', 'uploads'}
GENERATED = {'status-file-index.json', 'status-audit.md', 'status-audit-results.json'}
TEXT = {'.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html', '.md', '.json', '.cmd', '.txt', '.lock'}
INTEGRATION = [REPO / 'src/critter/worldbuilder.js', REPO / 'src/critter/server.js',
               REPO / 'scripts/check-worldbuilder-integration.js',
               REPO / 'scripts/check-worldbuilder-manuscripts.js',
               REPO / 'scripts/check-worldbuilder-transfer.js',
               REPO / 'scripts/check-worldbuilder-knowledge.js',
               REPO / 'scripts/check-worldbuilder-campaign-ui.js',
               REPO / 'scripts/check-worldbuilder-tables.js',
               REPO / 'scripts/check-worldbuilder-liveblocks.js',
               REPO / 'scripts/check-worldbuilder-research.js',
               REPO / 'scripts/check-worldbuilder-explorer.js',
               REPO / 'scripts/audit-worldbuilder-status.py',
               REPO / 'scripts/repair-worldbuilder-status.py',
               REPO / 'scripts/check-worldbuilder-status.js',
               REPO / 'test/test_worldbuilder_status.py',
               REPO / 'src/critter/public/worldbuilder-ui.js',
               REPO / 'src/critter/public/tab-bridge.js',
               REPO / 'src/critter/public/desk.js',
               REPO / 'src/critter/public/index.html',
               REPO / 'src/critter/public/workshop.css',
               REPO / 'src/critter/public/desk.css',
               REPO / 'test/worldbuilder-host.test.js', REPO / 'package.json']
SCOPES = {'local_core': 'Local application', 'online_later': 'Later online/multi-user work',
          'external_integration': 'Compatibility and external adapters',
          'external_boundary': 'External services/content, outside software completion'}
STATES = {'planned', 'partial', 'implemented', 'external_boundary'}
VERIFICATION = {'not_verified', 'subset_passed', 'passed_local', 'external_dependency'}
ORIGINAL_IDS = {f'{family}-{number:02}' for family, count in {
    'W': 9, 'K': 15, 'A': 11, 'M': 10, 'T': 10, 'R': 7, 'C': 10,
    'S': 8, 'N': 5, 'G': 8, 'B': 7, 'P': 13, 'I': 8, 'O': 6, 'E': 8, 'X': 4,
}.items() for number in range(1, count + 1)}


def category(path):
    if path.name in ('package-lock.json', 'package-lock.before-aina.json', 'requirements.lock'):
        return 'dependency_manifest'
    if path.suffix == '.md' or path.name == 'TRANSFER-README.txt':
        return 'documentation'
    if 'test' in path.name or 'qa' in path.parts or path.name.startswith('verify_'):
        return 'test_or_qa'
    if path.suffix in ('.json', '.cmd', '.lock'):
        return 'configuration_or_launcher'
    return 'application_source'


def scan():
    files, excluded, errors = [], Counter(), []
    candidates = []
    for directory, dirs, names in os.walk(ROOT, followlinks=False):
        base = Path(directory)
        for name in list(dirs):
            if name in EXCLUDED_DIRS or name.startswith('data-') or (base / name).is_symlink():
                dirs.remove(name)
                excluded[name if name in EXCLUDED_DIRS else 'private_or_linked_directory'] += 1
        for name in names:
            path = base / name
            if name in GENERATED or name.startswith('.env') or name == '.secret-key' or path.is_symlink():
                excluded['generated_report_or_sensitive_file'] += 1
            elif path.suffix.lower() in TEXT:
                candidates.append(path)
            else:
                excluded['binary_or_non_source_file'] += 1
    candidates.extend(p for p in INTEGRATION if p.exists())
    for path in sorted(set(candidates)):
        try:
            raw = path.read_bytes()
            text = raw.decode('utf-8-sig')
            item = {'path': path.relative_to(REPO).as_posix(), 'category': category(path),
                    'bytes': len(raw), 'lines': len(text.splitlines()),
                    'sha256': hashlib.sha256(raw).hexdigest()}
            if path.suffix == '.py':
                tree = ast.parse(text)
                item['definitions'] = [{'name': node.name, 'line': node.lineno}
                    for node in ast.walk(tree) if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))]
                item['testCases'] = sum(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_') for node in ast.walk(tree))
                item['analysis'] = 'Python syntax/definitions indexed; semantic claims require linked tests/review'
            elif path.suffix in ('.tsx', '.ts', '.js', '.mjs', '.cjs'):
                item['definitions'] = [{'name': match.group(1), 'line': text[:match.start()].count('\n') + 1}
                    for match in re.finditer(r'(?:export\s+)?(?:async\s+)?function\s+(\w+)', text)]
                item['analysis'] = 'Full text indexed for symbols; not a substitute for TypeScript/browser tests'
            elif path.suffix == '.md':
                item['headings'] = re.findall(r'^#{1,4}\s+(.+)', text, flags=re.M)
                item['analysis'] = 'Documentation indexed; historical assertions are not fresh test results'
            else:
                item['analysis'] = 'Authored file/manifest indexed; no runtime behavior inferred'
            files.append(item)
        except (OSError, UnicodeError, SyntaxError) as error:
            errors.append({'path': path.relative_to(REPO).as_posix(), 'error': type(error).__name__})
    return {'schemaVersion': 1, 'scope': 'All non-sensitive authored WorldBuilder files plus listed Aina integration files',
            'method': 'Every included text file read and indexed; Python syntax parsed; symbols/headings inventoried. No claim of line-by-line semantic review of every file.',
            'excludedDirectoryCounts': dict(sorted(excluded.items())),
            'countsByCategory': dict(sorted(Counter(row['category'] for row in files).items())),
            'files': files, 'errors': errors}


def application_fingerprint(index):
    prefix = 'src/critter/WorldBuilder/WorldBuilder/'
    paths = {path.relative_to(REPO).as_posix() for path in INTEGRATION
             if path.name not in ('audit-worldbuilder-status.py', 'repair-worldbuilder-status.py',
                                  'check-worldbuilder-status.js', 'test_worldbuilder_status.py', 'package.json')}
    selected = [(row['path'], row['sha256']) for row in index['files']
                if row['path'] in paths or row['path'].startswith(prefix + 'backend/')
                or row['path'].startswith(prefix + 'frontend/')
                or row['path'].startswith(prefix + 'scripts/')
                or row['path'] in {prefix + name for name in ('package.json', 'package-lock.json', 'requirements.lock', 'vite.config.ts', 'tsconfig.json')}]
    return hashlib.sha256(json.dumps(sorted(selected), separators=(',', ':')).encode()).hexdigest()


def validate(data, index):
    errors = []
    features = data['features']
    identities = {row['id'] for row in features}
    if len(features) != 139 or identities != ORIGINAL_IDS:
        errors.append('Retain exactly 139 distinct original feature IDs.')
    if data.get('schemaVersion') != 2:
        errors.append('Use the v2 implementation/verification-separated schema.')
    indexed = {row['path'] for row in index['files']}
    for row in features:
        prefix = row['id'] + ': '
        if row.get('status') not in STATES:
            errors.append(prefix + 'Separate implementation from verification; invalid delivery state.')
        if row.get('scope') not in SCOPES:
            errors.append(prefix + 'Missing scope classification.')
        if not row.get('acceptanceChecks') or len(row['acceptanceChecks']) < 2:
            errors.append(prefix + 'Add concrete functional and preservation/access acceptance checks.')
        verification = row.get('verificationStatus', {})
        if verification.get('status') not in VERIFICATION or not verification.get('coverage'):
            errors.append(prefix + 'Missing verification scope/coverage.')
        if row['status'] == 'implemented' and not row.get('codeEvidence'):
            errors.append(prefix + 'Implemented delivery needs source evidence.')
        if verification.get('status') in ('passed_local', 'subset_passed') and not row.get('testEvidence'):
            errors.append(prefix + 'A passing claim needs related tests.')
        if verification.get('status') == 'passed_local' and row['status'] != 'implemented':
            errors.append(prefix + 'Full bounded acceptance cannot be passed while its delivery remains incomplete.')
        if row.get('confidence', {}).get('level') not in ('high', 'medium', 'low') or not row.get('confidence', {}).get('reason'):
            errors.append(prefix + 'Record confidence and its reason.')
        if row['scope'] == 'external_boundary' and row['status'] != 'external_boundary':
            errors.append(prefix + 'Do not count an external service as an unfinished software implementation.')
        for key in ('codeEvidence', 'testEvidence', 'supportingEvidence'):
            for path in row.get(key, []):
                if path not in indexed:
                    errors.append(prefix + 'Evidence is absent from the authored file index: ' + path)
        for dependency in row.get('dependsOn', []):
            if dependency not in identities or dependency == row['id']:
                errors.append(prefix + 'Invalid dependency: ' + dependency)
    if dict(Counter(row['status'] for row in features)) != data.get('implementationCounts'):
        errors.append('Implementation counts are stale.')
    if dict(Counter(row['verificationStatus']['status'] for row in features)) != data.get('verificationCounts'):
        errors.append('Verification counts are stale.')
    if dict(Counter(row['scope'] for row in features)) != data.get('scopeCounts'):
        errors.append('Scope counts are stale.')
    adjacency = {row['id']: row.get('dependsOn', []) for row in features}
    def walk(identity, stack, done):
        if identity in stack:
            errors.append('Dependency cycle: ' + ' -> '.join([*stack, identity]));return
        if identity in done:return
        for child in adjacency.get(identity, []):walk(child, [*stack, identity], done)
        done.add(identity)
    done = set()
    for identity in identities:walk(identity, [], done)
    for error in index['errors']:
        errors.append('Unable to index: ' + error['path'] + ' (' + error['error'] + ')')
    results_path = DOCS / 'status-audit-results.json'
    if results_path.exists():
        results = json.loads(results_path.read_text(encoding='utf-8'))
        if results.get('applicationFingerprint') != application_fingerprint(index):
            errors.append('Runtime/test sources changed since recorded audit runs. Rerun relevant checks and update the evidence; do not refresh a pass claim automatically.')
        definitions = sum(row.get('testCases', 0) for row in index['files'] if '/backend/studio/' in row['path'])
        if results.get('backendTestCount') != definitions:
            errors.append('Recorded backend test count differs from current source definitions.')
        if any(run.get('exitCode') != 0 for run in results.get('runs', [])):
            errors.append('A recorded audit run is not passing; revise verification coverage.')
    else:
        errors.append('Missing status-audit-results.json; do not claim fresh verification without recorded outcomes.')
    return errors


def safe(text):
    return str(text).replace('|', '/').replace('\n', ' ')


def status_markdown(data):
    reviewed = date.fromisoformat(data['reviewedOn']).strftime('%d %B %Y').lstrip('0')
    lines = ['# WorldBuilder implementation status', '',
        f'Reviewed {reviewed} against the authored files and tests indexed in [status-file-index.json](status-file-index.json).', '',
        '**Implementation and verification are separate. No row count is a completion percentage.**', '',
        'The original 139 IDs are retained. `implemented` means the stated, bounded delivery exists; it does not mean complete World Anvil parity. `partial` identifies working subsets with unfinished scope. `planned` identifies missing feature-specific delivery. External services are tracked separately.', '',
        '| Scope | Rows |', '| --- | ---: |']
    for key, label in SCOPES.items():lines.append(f'| {label} | {data["scopeCounts"].get(key, 0)} |')
    lines += ['', '| Delivery state | Rows |', '| --- | ---: |']
    for key in sorted(STATES):lines.append(f'| {key} | {data["implementationCounts"].get(key, 0)} |')
    lines += ['', '| Verification coverage | Rows |', '| --- | ---: |']
    for key in sorted(VERIFICATION):lines.append(f'| {key} | {data["verificationCounts"].get(key, 0)} |')
    lines += ['', '## How to read the evidence', '',
        '- `passed_local`: the explicitly bounded local acceptance workflow has matching direct tests and current local evidence. It does not certify broader capability or all devices.',
        '- `subset_passed`: related tests pass, but some promised behavior, UI coverage, deployment coverage or broader acceptance remains unverified.',
        '- `not_verified`: no feature-specific successful workflow is claimed. Supporting infrastructure is not feature completion.',
        '- `external_dependency`: requires an external service, licensed content or a separately tested adapter; it is not local software completion.',
        '- Code/test file paths and concrete acceptance checks are recorded per row in [feature-inventory.json](feature-inventory.json). A referenced test file is evidence for its assertions, not every feature in its area.',
        '- Historical validation reports remain historical. See [status-audit.md](status-audit.md) and [status-audit-results.json](status-audit-results.json) for the current audit runs, confidence and limits.', '',
        '## Current priority', '',
        'Finish the local knowledge/campaign workflows first: notes and conversions, maps/navigation, visual organization, search, recovery and accessibility. Online deployment, player grants and collaboration follow the local foundations. Compatibility adapters require named fixtures. External communities and proprietary catalogues cannot be treated as ordinary missing code.', '',
        'Local login already exists. It does not implement player memberships, co-author roles or per-resource access codes. Local reader previews/exports do not provide online player access.', '',
        'Known limits include cross-world notebooks/transfers, advanced map workflows, specialized table columns/general generator scripting, daily writing trends, interruption/load and assistive-technology coverage. The project is not platform-complete.', '',
        '## Per-feature status', '']
    for scope, label in SCOPES.items():
        lines += ['### ' + label, '', '| ID | Capability | Delivery | Verification | Delivered scope / remaining work |', '| --- | --- | --- | --- | --- |']
        for row in data['features']:
            if row['scope'] == scope:
                lines.append('| ' + ' | '.join(safe(v) for v in (row['id'], row['capability'], row['status'], row['verificationStatus']['status'], row['deliveryNotes'])) + ' |')
        lines += ['']
    lines += ['## Maintenance', '',
        'Edit feature-inventory.json, retain original IDs/legacy evidence, and link concrete source/tests. Run the audit generator after documentation edits, then its check mode. The checker rejects missing evidence, stale counts, dependency cycles and delivery/verification conflation.', '',
        '```powershell', 'npm run docs:worldbuilder:generate', 'npm run docs:worldbuilder:check', '```', '',
        'Runtime/browser regression commands and installation instructions remain in [validation-1.0.md](validation-1.0.md) and README.md. The status audit changes documentation/tooling only; it does not write owner data or enable hosting.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--scan-only', action='store_true')
    args = parser.parse_args()
    data = json.loads((DOCS / 'feature-inventory.json').read_text(encoding='utf-8-sig'))
    if args.scan_only:
        index = scan()
        (DOCS / 'status-file-index.json').write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(json.dumps({'files': len(index['files']), 'categories': index['countsByCategory'], 'errors': index['errors']}))
        return int(bool(index['errors']))
    expected = status_markdown(data)
    if not args.check:
        (DOCS / 'implementation-status.md').write_text(expected, encoding='utf-8')
    index = scan()
    errors = validate(data, index)
    serialized = json.dumps(index, indent=2, ensure_ascii=False) + '\n'
    if args.check:
        if (DOCS / 'implementation-status.md').read_text(encoding='utf-8') != expected:
            errors.append('implementation-status.md is stale; regenerate it.')
        if (DOCS / 'status-file-index.json').read_text(encoding='utf-8') != serialized:
            errors.append('Authored files changed since the status-file index; regenerate it.')
    else:
        (DOCS / 'status-file-index.json').write_text(serialized, encoding='utf-8')
    if errors:
        print('\n'.join(errors), file=sys.stderr);return 1
    print(f'{len(data["features"])} feature IDs; {len(index["files"])} authored files indexed; implementation/verification/scope counts and evidence links agree.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
