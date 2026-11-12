# Continuation audit - 0.7.0

Reviewed 5 November 2026 against the existing source, release records and canonical inventory. This is a continuation audit of the documented scope, not a claim that all World Anvil features are complete.

All **139 requirement IDs** are unique and accounted for. Every recorded evidence file resolves. Current coverage is **24 verified local acceptance rows, 71 partial and 44 planned**. T-03 advances to verified local acceptance after standalone definition interchange and saved reader calendar checks; online hosting remains P5. No implementation TODO/FIXME/stub markers were found in the application source. Prior release validation documents remain intact.

| Area reviewed | Evidence and result |
| --- | --- |
| Earlier authoring, collections, family/hierarchy and saved graphs | Full 175-test regression suite passes, including prior 148 tests. Existing 31-route browser smoke suite passes. Prior specialized visual/offline graph evidence remains in validation 0.5/0.6; it was not all rerun as a new acceptance claim. |
| Calendar gaps | Added offset leap rules, skip/restore exceptions, weekday reset modes, multiple cycles, inverse conversion and independent file interchange. Existing legacy interval arithmetic remains identical. |
| Cross-module date omission | Replaced the old 1001-day limits consistently in preview, event, historical map and browser inputs. Increased only computed unspecified-calendar slots, preserving stored year/month/day fields. Long leap dates now work across calendar, event and dated map APIs. |
| Historical preservation and privacy | Changed calendar rules leave recorded dates listed with warnings. Saved reader definitions remain independent of drafts. Private calendar exports are unavailable; arbitrary top-level and nested month metadata is excluded. Private map icons are absent from reader projections. |
| Map icon gap | Twelve fixed symbols and local raster icons save, render, retain sizes and survive dated scenes/portable remapping. Raw marker HTML remains rejected and explicitly unfinished in M-05. |
| Recovery | Complete backup/download/checksum/restore and portable-world checks pass, including new calendar settings and icon references. Real-data upgrade uses a separate verified backup and all-table/media comparisons. |
| Future hosting requirement | Tracker and inventory retain separate player accounts, memberships, per-player/group grants, revocation, protected direct/API/media/export access and owner audience simulation. Network hosting remains disabled. |

Outstanding calendar scope includes recurring events/festivals, independent eras, uncertain date precision, intercalary/non-month days and alternate year-zero policies. Other earlier partial requirements remain visible in the inventory: independent connection editing/history, configurable embeds/layouts, writing review/release/compilation, full sheet and generator design, dictionaries/rules catalogues, public themes/community/collaboration and broad accessibility/load testing. Nothing in this release promotes those items to complete.

Machine-readable audit evidence: `.preview/inventory-audit-0.7.json`. Detailed new acceptance and installation evidence: [validation-0.7.md](validation-0.7.md).
