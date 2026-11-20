# WorldBuilder 0.24.0 — capture, find and navigate

12 November 2026. This release extends the existing note-taking workflows.

Delivered together:

- Quick note from any page in the top bar, with Ctrl/Cmd+Shift+N.
- Recently edited notes menu and a notebook shortcut.
- Ctrl/Cmd+Enter submits notebook and campaign capture forms.
- Clickable heading outline in rich editors.
- Case-insensitive in-note find, previous/next, and selected match navigation.
- Live word count and approximate reading time.
- Copy current draft prose and download it as plain text.
- Visible application version in the footer.

Validation: searchable-dropdown/TypeScript checks and production build pass.
The isolated headless browser integration passes text search and heading
navigation, global capture/quick-submit/recent notes, keyboard save, revision
preview, recovery after reload, filter memory/reset, account isolation, and
managed startup/shutdown/restart. Clipboard permission failures produce a visible
message; clipboard and download interactions have not received separate browser
acceptance tests. Campaign-specific quick-submit shares the form behavior but
was not separately exercised in that browser run.

Find matches within individual text runs; phrases crossing formatting boundaries
are not currently found. Plain-text export intentionally has no rich formatting,
media or structured fields; use the existing world archive for complete backups.
Capture follows the existing save-before-navigation guard. Existing UUIDs,
accounts and world schemas stay intact. Real data was backed up before release;
browser tests use an isolated installation.

Start with npm start from Aina. Restart once and refresh the WorldBuilder tab to
load version 0.24.0. Global Quick note is in the top bar. In any rich entry,
Outline and Find in note appear above the editor. No other service needs launching.
