# Campaign workflow audit - 0.15.0

5 November 2026. Tested in the isolated QA installation, using existing campaign tools and the new character dossier. This is a campaign workflow audit, not a claim that every platform feature is complete or defect-free.

| Workflow | Observed result | Browser evidence in .preview |
| --- | --- | --- |
| Prepare the next session from the GM screen | Session 2 follows session 1; preparation, date, map and pin persist | audit-session-0.15.json |
| Run and record outcomes | Completed session retains recap, consequences, rewards and follow-up; campaign progression shows consequences even without rewards | audit-session-0.15.json |
| Record day-to-day progress | Private journal retains campaign/session identity; quest completion persists | audit-session-0.15.json |
| Inspect a character | Original lore/fields, relationship neighborhood, session appearances, journals, unresolved threads and places are connected | dossier-ui-0.15.json |
| Add progression | Private milestone links the original character and session; existing task is linked without copying | dossier-ui-0.15.json |
| Explore a place | Character dossier opens the existing map guide at its associated pin | dossier-ui-0.15.json |
| Reopen and recover | Trash flushes a pending editor change; restoring retains the latest text and original character/session links; dossier shows it again | audit-recovery-0.15.json |
| Preview published content | Hidden characters/relationships, private records, draft portrait and GM planning are excluded | dossier-reader-0.15.json |

Confirmed corrections: GM-screen quick creation previously always suggested session 1; it now suggests the next number in its campaign. Explicitly clearing campaign membership no longer falls back to an old parent; missing/null legacy membership still does. Character progression keeps same-day records in recording order. Campaign progression now displays consequences from sessions without rewards.

Trash already flushed pending changes correctly; the audit verifies that behavior and does not attribute a new fix to it. The suggested next session number is not a concurrency uniqueness constraint. Reader cache guards hide a previous projection while updated context loads.

Full-backup restoration and portable-world integrity are checked separately in recovery-0.15.json. Backend dossier cases also verify remapped character associations after archive import. Existing source-link, map reader and affinity reader browser regressions pass. See [validation](validation-0.15.md) for scope, limits and installation evidence.
