# WorldBuilder 0.23.0 — note recovery and revision review

12 November 2026. Local installation release; full World Anvil parity remains unfinished.

Delivered: notebook and campaign capture recovery, world-scoped notebook filter
memory for the current browser tab, Clear filters, Ctrl/Cmd+S entry saving, and
read-only revision previews showing historical/current saved prose and changed
fields. Restore remains explicit and creates a new revision. Item stock restoration
keeps its existing special rules.

Validation: TypeScript and searchable-dropdown checks pass; production bundle
build passes. Seven isolated Django account/history tests pass, including anonymous
and other-account denial, missing revisions, private snapshot access for the owner,
and read-only previews. Browser integration covers preview opening, notebook
capture recovery after reload, clearing recovery after creation, keyboard saving,
remembered/reset filters, account isolation and managed startup/shutdown.

Campaign recovery shares the capture recovery helper; its form-specific recovery
has not received a separate end-to-end browser test. Comparisons use current saved
text rather than unsaved editor text. The previous 139-row inventory counts remain
unchanged. A SQLite backup was retained before updating the real installation;
all test writes use isolated databases.

Launch remains npm start from Aina. Restart Aina after this release to load the
updated backend revision endpoint, then refresh the browser. In an entry, open
Revision history, select Preview & compare, review the old version, and return to
history before choosing Restore.
