"""One-time, reviewable v1->v2 tracker migration. Refuses an already migrated file.

Use audit-worldbuilder-status.py for all subsequent edits/generation/checks.
"""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'src/critter/WorldBuilder/WorldBuilder/docs/feature-inventory.json'
data = json.loads(PATH.read_text(encoding='utf-8-sig'))
if data['schemaVersion'] != 1:
    raise SystemExit('Already migrated; edit the canonical v2 inventory instead.')
B = 'src/critter/WorldBuilder/WorldBuilder/backend/studio/'
F = 'src/critter/WorldBuilder/WorldBuilder/frontend/'


def evidence(py=(), ui=(), tests=(), extra=()):
    return ([B + x + '.py' for x in py] + [F + x for x in ui],
            [B + x + '.py' for x in tests] + list(extra))


GROUPS = {
 'W': evidence(['models', 'views', 'services', 'organization'], ['Pages.tsx', 'Operations.tsx', 'Collections.tsx'], ['tests', 'test_organization']),
 'K': evidence(['documents', 'services', 'auto_links'], ['RichEditor.tsx', 'EntryEditor.tsx', 'References.tsx', 'ReaderContent.tsx'], ['tests', 'test_auto_links', 'test_input_media']),
 'A': evidence(['models', 'views', 'middleware', 'services', 'documents'], ['App.tsx', 'ReaderContent.tsx'], ['tests', 'test_aina']),
 'M': evidence(['cartography', 'map_guide', 'historical_dates'], ['Maps.tsx', 'MapGuide.tsx', 'MapHistory.tsx', 'MapIcons.ts'], ['test_maps_history', 'test_map_guide', 'test_map_versions', 'test_calendars_icons']),
 'T': evidence(['calendar_engine', 'special_days', 'historical_dates', 'history', 'recurrence'], ['Calendars.tsx', 'History.tsx', 'SpecialDays.tsx', 'Recurrence.tsx'], ['test_calendars_icons', 'test_special_days', 'test_eras_precision', 'test_recurrence', 'test_maps_history']),
 'R': evidence(['graphs', 'relationship_views', 'connection_history', 'graph_exports'], ['GraphViews.tsx', 'AffinityWeb.tsx', 'Connections.tsx', 'SavedGraphs.tsx'], ['test_graphs', 'test_affinity', 'test_connection_history', 'test_saved_graphs']),
 'C': evidence(['campaigns', 'workbench', 'planning', 'continuity', 'session_guide'], ['CampaignWorkbench.tsx', 'CampaignContinuity.tsx', 'CampaignLifecycle.tsx', 'SessionGuide.tsx', 'PlanningEditor.tsx'], ['test_campaigns', 'test_workbench', 'test_continuity', 'test_planning', 'test_session_guide']),
 'S': evidence(['dossiers', 'continuity', 'tools'], ['CharacterDossier.tsx', 'ContinuityEditors.tsx', 'SpecialEditors.tsx'], ['test_dossiers', 'test_continuity', 'tests']),
 'N': evidence(['notebooks', 'checklists'], ['Notebooks.tsx', 'NotebookForms.tsx', 'NoteDesk.tsx', 'ReferenceTray.tsx'], ['test_notebooks', 'test_notes_desk', 'test_notebook_boards']),
 'G': evidence(['tools', 'services', 'views'], ['SpecialEditors.tsx', 'Pages.tsx'], ['tests']),
 'B': evidence(['manuscripts', 'services'], ['ManuscriptRoom.tsx', 'WritingTools.tsx'], ['test_manuscripts'], ['scripts/check-worldbuilder-manuscripts.js']),
 'I': evidence(['services', 'importing', 'graph_exports', 'views'], ['Operations.tsx', 'GraphExportActions.tsx'], ['tests', 'test_saved_graphs', 'test_input_media']),
 'O': evidence(['services', 'models'], [], ['tests', 'test_aina'], ['test/worldbuilder-host.test.js']),
 'E': evidence(['services', 'documents', 'models', 'views'], ['App.tsx', 'EntryEditor.tsx', 'domain.ts'], ['tests', 'test_aina']),
 'P': ([], []), 'X': ([], []),
}
OVERRIDES = {
 'W-02': evidence(['dashboard', 'views'], ['Overview.tsx'], ['test_dashboard'], ['scripts/check-worldbuilder-integration.js']),
 'K-02': evidence(['structured', 'services', 'views'], ['StructuredFields.tsx', 'EntryEditor.tsx'], ['test_structured'], ['scripts/check-worldbuilder-integration.js']),
 'K-05': evidence(['auto_links', 'documents'], ['KnowledgeLinks.tsx', 'WritingTools.tsx'], ['test_auto_links'], ['scripts/check-worldbuilder-knowledge.js', 'scripts/check-worldbuilder-integration.js']),
 'K-07': evidence(['structured', 'notebooks', 'services'], ['StructuredFields.tsx'], ['test_structured'], ['scripts/check-worldbuilder-integration.js']),
 'K-08': evidence(['snippets', 'documents', 'services'], ['Snippets.tsx', 'SnippetNode.ts'], ['test_snippets'], ['scripts/check-worldbuilder-integration.js']),
 'R-07': evidence(['notebooks'], ['NotebookBoard.tsx', 'BoardDrawing.tsx', 'board-export.ts'], ['test_notebook_boards'], ['scripts/check-worldbuilder-knowledge.js', 'scripts/check-worldbuilder-integration.js']),
 'N-03': evidence(['notebooks'], ['NotebookForms.tsx', 'EntryEditor.tsx'], ['test_notebook_boards'], ['scripts/check-worldbuilder-integration.js']),
 'N-04': evidence(['services'], ['ReferenceTray.tsx'], ['tests']),
 'I-07': evidence(['calendar_engine', 'views', 'services'], ['Calendars.tsx', 'SpecialEditors.tsx'], ['test_calendars_icons', 'tests']),
 'O-01': (['src/critter/worldbuilder.js', 'src/critter/WorldBuilder/WorldBuilder/scripts/aina_host.py', 'src/critter/WorldBuilder/WorldBuilder/scripts/launch.py'], ['test/worldbuilder-host.test.js', 'scripts/check-worldbuilder-integration.js']),
 'O-02': ([B + 'services.py', 'src/critter/WorldBuilder/WorldBuilder/scripts/transfer.py', 'src/critter/WorldBuilder/WorldBuilder/scripts/restore.py'], [B + 'tests.py', B + 'test_input_media.py']),
 'O-03': ([B + 'services.py', 'src/critter/WorldBuilder/WorldBuilder/scripts/restore.py'], [B + 'tests.py']),
 'E-04': evidence(['services', 'models'], ['MediaLibrary.tsx'], ['tests', 'test_input_media']),
 'E-05': evidence(['services'], ['EntryEditor.tsx', 'CaptureRecovery.tsx'], ['test_aina', 'test_notes_desk'], ['scripts/check-worldbuilder-integration.js']),
}
ONLINE = set('W-07 W-09 A-02 A-03 A-05 A-07 A-08 A-09 A-10 A-11 M-06 C-01 C-10 S-01 P-01 P-02 P-03 P-04 P-05 P-06 P-07 P-08 P-09 P-10 P-11 P-12 P-13 O-06 E-07'.split())
EXTERNAL = set('K-12 S-04 S-07 S-08 I-02 I-04 I-05 I-06 I-08 X-04'.split())
BOUNDARY = set('X-01 X-02 X-03'.split())
PARTIAL_OVERRIDES = set('T-02 T-03 T-04 B-07'.split())
PASSED = set('W-02 K-02 K-07 K-08 N-03 B-01 B-02 B-04 B-05'.split())
UPDATES = {
 'A-08': 'Per-resource passwords/access codes are not implemented. Local account login is supporting infrastructure, not partial completion of scoped codes, expiry or revocation.',
 'I-07': 'Standalone calendar definition JSON import/export exists and has direct fixtures (T-03 local subset). Table CSV preview/import exists; table export and complete typed/reference round-trip acceptance remain unfinished or unverified.',
 'O-02': 'SQLite/local media and source/build transfer packaging with verified backup/restore tooling exist. Physical network-disconnected core create/edit/search remains unverified. Externally linked image bytes are not bundled and require their hosts.',
 'T-02': 'Supported bounded daily/weekly/monthly/yearly recurrence and celestial cycles are implemented/tested. One-off exceptions, nth-weekday and moon-triggered recurrence are not implemented; the broad recurrence row remains partial.',
 'T-03': 'Standalone calendar definition import/export and local published-reader projection are implemented/tested. Online sharing with independent player access is not implemented; this mixed capability remains partial.',
 'T-04': 'Signed event/era sorting, precision and circa labels are implemented/tested. Relative era-year numbering and quantified confidence policies remain unfinished; a signed-sort fixture alone does not complete the broad row.',
 'B-07': 'HTML/print and text compilation, author/subtitle/local raster cover, contents/internal links and bounded embedded raster images are implemented/tested. Full multimedia scope and standalone structured book-only export are not verified; complete-world archives are a separate backup workflow. Broad book presentation/export remains partial.',
 'N-05': 'General note-to-world-content conversion is not implemented. N-03 task-to-article conversion exists but accepts tasks, so it does not complete this separate note workflow.',
 'X-01': 'External audience/discovery network: not a local software deliverable. Optional local showcase software is tracked separately as P-10.',
 'X-02': 'Human seminars, promotion and freelancer networks are external organizational services, not unfinished application code.',
 'X-03': 'Proprietary/community content availability and licensing are external boundaries. Track permitted named libraries separately; do not count unavailable content as missing generic software.',
 'X-04': 'External provider integration remains unimplemented and unverified. Requires a named API/account workflow; exclude implied payment verification or access grants until tested.',
}
# Existing acceptance is preserved. These explicit scenario overrides repair the
# weakest/mixed criteria; the other rows also receive a family-specific invariant.
CHECKS = {
 'W-02': ['Reorder/hide/resize sections, set limits and pin originals; reload, account switch and managed restart retain layout.', 'Reject a stale two-tab save; archive restore remaps pins and preserves unrelated settings.'],
 'K-02': ['Create all seven supported field types with sections/order and required/GM flags; edit a consumer.', 'Review schema renames/removals/type changes; preserve old/unknown values, original IDs, history and archive references.'],
 'K-05': ['Suggest overlapping names/aliases and require explicit targets for ambiguity while preserving existing formatting/links.', 'Exercise names split across formatting runs and a representative large library before full coverage is claimed.'],
 'K-07': ['Edit and reopen each supported field type alongside prose; a location reference resolves to one original same-world record.', 'Reader outputs exclude private/retired fields and unavailable target IDs; archive/history round trips retain typed data.'],
 'K-08': ['Edit a variable/snippet and refresh live usages; copied insertion stays independent.', 'Test published/revoked source projection, cycle budgets and archive remapping without private source leakage.'],
 'A-08': ['Create a scoped resource code/password, open only its resource, then expire/revoke it.', 'Do not grant account login or unrelated media access; local owner passwords do not satisfy this workflow.'],
 'N-03': ['Convert a task into one linked article while retaining task status/source UUID and navigation in both directions.', 'Stale/repeated activation creates no duplicate or accidental publication.'],
 'N-05': ['Convert a general note into reviewed world content while retaining/recovering the original note.', 'Reject stale/replayed changes and keep publication explicit; task-only conversion does not satisfy general notes.'],
 'T-02': ['Check known phases and supported daily/weekly/monthly/yearly occurrence boundaries and offsets.', 'Add fixtures for one-off exceptions, nth-weekday and moon-triggered rules before advertising the remaining recurrence scope.'],
 'T-03': ['Round-trip a standalone calendar with moons, leap rules and ordered special periods using owner and published-reader settings.', 'Online sharing requires separate reader sessions and revocation; local JSON export alone is not online sharing.'],
 'T-04': ['Create/sort signed and uncertain events/eras and retain precision/circa labels after reload.', 'Test relative era numbering and quantified confidence policies before completing the broader row.'],
 'R-07': ['Edit cards/shapes/strokes, undo/redo, recover drafts and reopen saved original-source geometry.', 'Test grouping and board-only cross-world reference remapping before completing those remaining workflows.'],
 'B-01': ['Create nested chapters/scenes/research folders and move originals without changing UUIDs/prose.', 'Only selected publication nodes reach readers; research stays outside compilation and book word counts.'],
 'B-02': ['Use write, corkboard, read and compilation-review views over the same originals.', 'Corkboard chapter ordering updates compilation; mode switches flush edits and failed saves retain drafts.'],
 'B-03': ['Save goals/stage labels and verify draft/edition totals after moving scenes.', 'Add dated daily writing-history/trend fixtures before completing the statistics scope.'],
 'B-04': ['Search scene prose and open world research beside an unsaved scene without unmounting it.', 'Find/replace preserves formatting and authorized source previews without copying lore or losing draft text.'],
 'B-05': ['Checkpoint prose/metadata/parent/order, edit them and review/restore originals with their IDs.', 'Reject stale restores atomically; retain newer subtrees, access/publication and archive-remapped checkpoints within stated limits.'],
 'B-06': ['Publish an explicit revision/selection and verify subsequent prose/parent drafts cannot change it.', 'Test actual group access, revocation and scheduling separately before claiming restricted/timed releases.'],
 'B-07': ['Export declared HTML/text with metadata/cover, selected nodes, contents links and embedded local raster images; open with HTTP blocked.', 'Declare supported media/formats/limits and test book-only structured export/full multimedia before completing the broad row.'],
 'I-03': ['Exercise documented session-authenticated routes and independent read-only tokens when implemented.', 'Token readers cannot mutate data; foreign/revoked resource/media requests fail consistently.'],
 'I-07': ['Round-trip standalone calendar JSON and table data through each advertised format.', 'Retain typed table values and original references; distinguish calendar exchange from incomplete table CSV export/round trips.'],
 'O-01': ['Start/restart through npm start on supported Windows and retain saved originals.', 'A managed startup failure exits without hanging stdin/threads; direct-launch tooling is documented separately.'],
 'O-02': ['With the physical network disconnected, create/edit/search/reopen core content using uploaded local media.', 'Independently verify transfer/setup/restore; externally linked images remain declared network dependencies.'],
 'O-03': ['Restore a consistent SQLite/media backup into an empty instance; compare IDs/counts and every asset hash.', 'Reject destructive restore into existing data and detect corrupt/missing archives without altering originals.'],
 'E-05': ['Inject failed saves, stale tabs, reload and interruption during editing/capture.', 'Retain unacknowledged drafts and prove acknowledged saves survive the defined interruptions; no full durability certification is inferred.'],
 'E-06': ['Complete core editing/navigation/dialog actions using keyboard only at narrow/desktop widths.', 'Run assistive-technology, focus, contrast and representative load tests before claiming broad accessibility.'],
 'X-01': ['Record the existing external audience/network as outside local software completion.', 'Keep optional local showcase code separate; never claim World Anvil users/discovery were reproduced.'],
 'X-02': ['Record human seminars/promotion/freelancer services as organizational dependencies.', 'Do not count a links page as those services or as a missing local implementation.'],
 'X-03': ['Record each named library source/license/availability before distribution.', 'Unavailable proprietary/community content is an external boundary, not generic editor completion.'],
 'X-04': ['Verify a named provider API/account workflow with authorized credentials/consent.', 'No payment/access integration is verified without actual provider, secret-handling and duplicate/error tests.'],
}
INVARIANTS = {
 'W': 'Create/edit/move the relevant original world resource, reopen after restart and compare IDs, links and exported settings; reject foreign/stale changes.',
 'K': 'Save/reopen representative rich/structured fixtures; preserve original text, unknown fields and references, and exclude private material from reader HTML/JSON.',
 'A': 'Use separate owner/permitted/outsider/revoked sessions and direct URLs; enforce the same rules for APIs, media, exports and navigation.',
 'M': 'Save/reopen map settings and normalized geometry at multiple zooms/sizes; reject invalid/foreign media and exclude private reader layers/targets.',
 'T': 'Use signed/leap/special-period and boundary date fixtures; inverse conversions and each participating module must agree, with reader snapshots filtered.',
 'R': 'Save/rename/reparent the original sources and reopen diagrams/lists/exports; reject cycles/stale writes and remove private endpoints before traversal.',
 'C': 'Prepare/run/save/reopen a representative campaign/session workflow; preserve original source IDs/history, reject stale/replayed transactions and filter GM data.',
 'S': 'Save/render the advertised named character/sheet workflow and deterministic fixtures; preserve source identity and enforce actual ownership/reader boundaries.',
 'N': 'Capture/file/edit/reopen original notes without duplication; reject stale/replayed operations and preserve private organization/prose through recovery/archive.',
 'G': 'Run positive/invalid typed data and deterministic boundary fixtures; preview before replacement and preserve original records on failed import/generation.',
 'B': 'Edit/reorder/compile original manuscript fixtures and reopen them; preserve draft recovery, IDs, structure and published-reader isolation.',
 'P': 'Exercise the named public/social workflow in separate authorized/revoked sessions; publishing must not expose private drafts, media or management controls.',
 'I': 'Name the supported source/target format or external release and round-trip representative fixtures; report unsupported data and preserve originals on failure.',
 'O': 'Use an isolated installation, restart and restore it; verify IDs/counts/hashes and keep source data untouched on failure.',
 'E': 'Exercise the named cross-module workflow and its failure/access cases; record the tested scope instead of inferring platform-wide coverage.',
 'X': 'Name the required external service/source and its actual availability; no local UI stub can satisfy an untested external dependency.',
}

legacy = collections.Counter(row['status'] for row in data['features'])
changes = []
for row in data['features']:
    identity = row['id']; old = row['status']; family = identity.split('-')[0]
    row['legacyStatus'] = old
    row['originalAcceptance'] = row['acceptance']
    row['acceptanceChecks'] = CHECKS.get(identity, [row['acceptance'], INVARIANTS[family]])
    row['scope'] = 'external_boundary' if identity in BOUNDARY else 'external_integration' if identity in EXTERNAL else 'online_later' if identity in ONLINE else 'local_core'
    row['status'] = 'external_boundary' if identity in BOUNDARY else 'planned' if identity == 'A-08' else 'partial' if identity in PARTIAL_OVERRIDES else 'implemented' if old == 'verified' else old
    code, tests = OVERRIDES.get(identity, GROUPS[family])
    row['codeEvidence'] = code if row['status'] in ('implemented', 'partial') else []
    row['testEvidence'] = tests if row['status'] in ('implemented', 'partial') else []
    row['supportingEvidence'] = code if row['status'] == 'planned' else []
    if identity in UPDATES:
        row['deliveryNotes'] = UPDATES[identity]
    elif row['status'] == 'planned':
        row['deliveryNotes'] = 'No feature-specific implementation identified in the audited WorldBuilder scope. Shared infrastructure is not completion. See concrete acceptance checks and dependencies.'
    state = 'external_dependency' if row['scope'] == 'external_boundary' else 'not_verified' if row['status'] == 'planned' else 'passed_local' if identity in PASSED else 'subset_passed'
    row['verificationStatus'] = {
        'status': state, 'lastReviewedOn': '2026-11-13',
        'coverage': 'Bounded local acceptance has directly matching backend/browser tests; supported limits remain explicit.' if state == 'passed_local' else 'Related test assertions pass; broad row/UI/deployment acceptance is not fully established.' if state == 'subset_passed' else 'No feature-specific successful workflow claimed.' if state == 'not_verified' else 'External availability/licensing or human service; no local completion claim.',
    }
    row['confidence'] = {'level': 'high' if identity in PASSED or identity in BOUNDARY or identity in ('A-08', 'I-07', 'O-02', 'N-05') else 'medium',
        'reason': 'Direct source/test evidence for the bounded classification.' if identity in PASSED else 'Static source/registry and test inventory support the classification; broad absence/completeness claims remain limited.'}
    row['priority'] = 'external_decision' if row['scope'] == 'external_boundary' else 'named_compatibility_fixture' if row['scope'] == 'external_integration' else 'after_local_foundations' if row['scope'] == 'online_later' else 'local_later' if identity.startswith(('T-', 'G-', 'S-', 'B-')) else 'local_now'
    row['dependsOn'] = []
    if row['scope'] == 'online_later': row['dependsOn'] = [key for key in ('A-01', 'O-06') if key != identity]
    if identity == 'O-06': row['dependsOn'] = ['A-01', 'O-03']
    if row['scope'] == 'external_integration': row['dependsOn'] = ['O-03']
    if identity in ('K-14', 'N-05'): row['dependsOn'] = ['O-05', 'O-03']
    if identity == 'E-07': row['dependsOn'] = ['A-01', 'A-02', 'O-06']
    if identity == 'A-03': row['dependsOn'] = ['A-01', 'A-02', 'O-06']
    if identity in ('P-05', 'P-06', 'P-07', 'P-08'): row['dependsOn'] = ['A-03', 'O-06']
    if old == 'verified' and row['status'] == 'partial': changes.append({'id': identity, 'change': 'Broad acceptance corrected from verified to partial', 'reason': row['deliveryNotes']})
    if identity == 'A-08': changes.append({'id': identity, 'change': 'Account login no longer counted as resource-code implementation', 'reason': row['deliveryNotes']})
    row.pop('acceptance', None)
    row['implementationIntent'] = row.pop('implementation')
    if 'verification' in row:
        row['historicalValidationReport'] = row.pop('verification')
for identity in sorted(BOUNDARY): changes.append({'id': identity, 'change': 'Outside software backlog, retained as an external boundary', 'reason': UPDATES[identity]})
data['schemaVersion'] = 2
data['reviewedOn'] = data['implementationReviewedOn'] = '2026-11-13'
data['legacyCountsBeforeAudit'] = dict(legacy)
data['implementationCounts'] = dict(collections.Counter(row['status'] for row in data['features']))
data['verificationCounts'] = dict(collections.Counter(row['verificationStatus']['status'] for row in data['features']))
data['scopeCounts'] = dict(collections.Counter(row['scope'] for row in data['features']))
data['status'] = 'audited-local-foundation-implementation-and-verification-separated'
data['statusLegend'] = {'planned': 'No feature-specific delivery identified; supporting code is not this feature.', 'partial': 'Some promised behavior exists; named gaps remain.', 'implemented': 'The bounded delivery exists; verification is separate.', 'external_boundary': 'External audience, human service or content availability/licensing; outside software completion.'}
data['verificationLegend'] = {'passed_local': 'Matching current local workflow evidence for bounded acceptance.', 'subset_passed': 'Related tests pass without full broad-feature/deployment acceptance.', 'not_verified': 'No feature-specific successful workflow claimed.', 'external_dependency': 'External availability/service prerequisite, not local software verification.'}
data['scopeLegend'] = {'local_core': 'Single-owner local work; priority is separate.', 'online_later': 'Mixed/online capabilities requiring later hosting, memberships or public surfaces; owner subsets remain listed.', 'external_integration': 'Named compatibility/licensing/API fixtures required; generic primitives are not adapters.', 'external_boundary': 'Cannot be completed merely by writing this local application.'}
data['countPolicy'] = 'Rows are not equally weighted tasks or a completion percentage. Exclude external_boundary from software backlog counts. Implementation and verification remain separate.'
data['auditChanges'] = changes
data['verificationRecord'] = 'status-audit.md'
data['historicalPhaseCounts'] = data.pop('phaseCounts')
data['phasePolicy'] = 'Original P1-P6 retained for traceability; scope, priority and dependencies drive current delivery.'
for row in data['userRequirements']:
    row['legacyStatus'] = row.pop('status')
    row['status'] = 'implemented' if row['legacyStatus'] == 'verified' else row['legacyStatus']
    row['verificationStatus'] = {'status': 'subset_passed', 'coverage': 'Current tests cover related behavior; historical reports retain their original scope.'}
    if row['id'] == 'USER-01':
        row['deliveryNotes'] = 'The current AST guard reports 105 SearchableSelect locations and rejects native selects outside the shared component. This is source coverage; keyboard/layout tests cover representative controls, not every device/control combination.'
        row['verification'] = 'status-audit.md'
    if 'verification' in row:
        row['historicalValidationReport'] = row.pop('verification')
PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({'delivery': data['implementationCounts'], 'verification': data['verificationCounts'], 'scope': data['scopeCounts'], 'corrections': len(changes)}, indent=2))
