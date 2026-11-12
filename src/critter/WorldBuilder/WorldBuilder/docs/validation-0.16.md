# Validation record - 0.16.0

5 November 2026. Single-owner Windows browser application. Browser fixtures and restoration checks stay in .preview/qa-data. This increment prioritizes session preparation, notes and visual campaign navigation.

## Session guide

Open Campaigns > campaign > Sessions > Open session guide, or Open session guide in the original session editor. Stable routes use #/sessions/{session UUID}.

Plan & outcomes presents preparation, recap, consequences, rewards, follow-up and original session notes. The previous campaign session's follow-up is visible for planning and can be explicitly appended without replacing existing preparation. Edit session plan & outcomes saves the original session data with a captured expected revision. Status, local date/time, map/pin and linked lore are editable; publishing stays separate. The original document and revision history remain intact.

Session notes groups original records assigned to that session. Write session record creates a private journal, note, milestone, task or quest, retaining campaign/session identity, selected lore and the session's available map/location. Journals/milestones can retain real/in-world dates. Quest/task progress can be updated from the guide. Records belonging to another campaign or assigned to another session do not bleed into this session. Explicitly linked unassigned records within the same campaign can appear too.

Cast & lore shows campaign party plus entries explicitly linked by the session or its records, with portraits and original character-dossier/lore navigation. It does not display every unrelated campaign NPC. Maps & places opens the existing location guide at the associated pin. Previous/next session navigation follows campaign session number, using UUID for ties. Missing pins retain original metadata and show an owner warning; an available map can still open as a whole.

The published reader guide shows published recap/rewards, records, cast and map context. Private records, draft portraits, GM sections, private pins and unavailable neighboring sessions are excluded server-side. Reader identity/context changes hide stale projections. Owner actions and adjacent-session navigation are absent in the reader guide. Separate online player accounts remain later P5 work.

## Corrections verified

- Reader serialization now selects privacy rules by the published content type. Previously, changing a published session/map's draft type to an article could bypass the published type's structured GM-text/pin filtering. Regression tests verify both cases; existing type-specific reader regression suites pass.
- Nested dialogs handle Escape/Tab only in the topmost dialog. Escape from the reader's map inspector leaves the parent preview open.
- New plan forms retain text after conflicts and offer an explicit Reload latest session action. Failed record saves retain input. Unsaved changes prompt before Escape/cancel/app navigation and browser unload. Successful writes followed by refresh failure are reported as saved, preventing a misleading retry of record creation.
- Removing an unavailable linked entry uses a non-submit button inside forms.

## Checks and evidence

- **380 backend tests passed**: all 359 previous tests plus 21 session-guide cases. Coverage includes original identities/no writes, scoped records, linked unassigned quests, party/cast provenance, map/pin deduplication, private records/identities/portraits/plans, published names/membership, hidden campaigns/neighbors, legacy parent/cleared membership, escaped automatic links and opt-out, deleted/foreign/wrong-kind resources, unpublished sessions, real stale-revision rejection, archive remapping, snapshot-type privacy, bounded recent records, removed pins and standalone scope. Evidence: backend/studio/test_session_guide.py and .preview/backend-tests-0.16.txt.
- Actual browser campaign-card/editor navigation, plan save, explicit follow-up append, unchanged reader snapshot/document, private journal/milestone/task creation, retained associations, task progress, dossier navigation, focused map and adjacent sessions: .preview/session-guide-0.16.json.
- Reader browser snapshot/source links, hidden write controls/GM sections/records/identities, published cast/portraits, filtered map pins and nested Escape: .preview/session-reader-0.16.json.
- UI conflict/offline simulations verify retained unsaved text, explicit latest-plan reload and discard guards: .preview/session-errors-0.16.json. The 409/offline responses in this browser check are simulated; actual revision rejection is separately tested against the server.
- All four guide sections fit at 390, 1024 and 1440 pixels; plan-status and record-type dropdown bounds/search focus pass. Evidence: .preview/session-mobile-0.16.json, session-tablet-0.16.json, session-desktop-0.16.json and screenshots.
- Existing 31-route navigation, dossier reader, map reader, affinity reader and explicit-reference workflows: .preview/smoke-0.16.json, dossier-reader-regression-0.16.json, map-reader-regression-0.16.json, affinity-reader-regression-0.16.json and references-regression-0.16.json.
- TypeScript, Prettier, targeted Python checks, no-change migration generation and production build pass. The dropdown AST guard counts **75 searchable locations**. No dependencies or schema migrations were added; schema 0003 remains current.
- Complete backup/checksum/download, restored counts/media, SQLite integrity, existing-destination protection and portable-world roundtrip: .preview/recovery-0.16.json.

Browser harness corrections included existing CSS selectors and a missing hash prefix in an assertion. A stuck isolated Edge test tab was replaced after a failed run left an unsaved form; the final positive reports are authoritative. These are not claimed as application fixes.

## Scope and limits

This is a session guide over existing entries, not multiplayer play, automated combat/XP, a scene-sequencing system or configurable saved GM panes. The existing GM screen/dice remain available from the campaign workspace. Follow-up carryover is an explicit append, not automatic note rewriting. Sessions with duplicate numbers use UUID order; numbering is not a concurrency uniqueness constraint. At most 200 recent records, 100 cast/lore cards and 100 locations are returned, with totals. Same-day record order uses update time. Larger campaigns and broader accessibility/load testing remain unfinished.

The original 139 inventory rows remain 27 verified local acceptance rows, 68 partial and 44 planned. USER-01 and USER-03 remain separately verified; broader visual workflows USER-02 remain partial. Online hosting is not enabled.

## Installation

The verified real backup, previous browser bundle and all-table/media preservation result are recorded in .preview/upgrade-0.16-result.json and [project-tracker.md](project-tracker.md). Real user records are not used as browser fixtures.

Installed at http://127.0.0.1:8767/. Verified real backup: `2026-11-05_23-06-34_c5e30b.wbbackup.zip`; retained previous bundle: `.preview/dist-previous-20261105-230634`. All 22 table counts/content hashes and media hashes match the pre-upgrade baseline, SQLite integrity passes, bootstrap reports 0.16.0 outside the QA workspace, and the installed login page has no browser errors or failed assets. Real baseline: two worlds, three entries, no connections/images. QA restoration retained 260 entries, 425 entry revisions, two images, 41 connections and 52 connection revisions.

Clarification, 6 November 2026: existing resource APIs reject changing an entry module type. The tests that modify current session/map kinds directly simulate inconsistent legacy data; the snapshot-type filtering correction is defensive and does not describe a supported editor type-change path. See validation-0.17.md.
