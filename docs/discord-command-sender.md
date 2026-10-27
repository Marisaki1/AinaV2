# Posting Avrae commands as Aina

Aina now uses its existing **official Discord bot account** for all command posts. The user-account sender has been removed. There is no Malow connection, account login, token wizard, separate panel password, or automatic user-account reconnect.

## Start and choose the destination

1. From the Aina project folder, run `npm.cmd start`. The existing `DISCORD_TOKEN` setting is Aina's **bot** token; keep your current working bot configuration.
2. Open **http://127.0.0.1:4317** yourself. If Aina was already open, press **Ctrl+F5**.
3. In the **POST AS AINA** bar, open the channel selector. Type to filter by channel, server, or thread name; click the destination. You do not need to type an ID.
4. The destination saves automatically and is shared by **Combat**, **Initiative**, **Library & editor**, and **Commands**.
5. Aina and the configured workspace owner must both have access to the selected destination. For text channels they need View Channel and Send Messages; for threads they need View Channel and Send Messages in Threads. Active accessible threads are included. Archived/locked threads are excluded. Use Refresh after changing permissions or thread membership.

`CRITTER_OWNER_ID` optionally specifies the workspace owner; otherwise Aina resolves the Discord application's owner. Owner-only Discord controls remain owner-only. The editor is bound to 127.0.0.1 and keeps exact Host/Origin/custom-header checks. It trusts access to this local computer, like the existing creature editor; do not expose it as a public service.

`npm.cmd run critter` starts the offline editor. Copying and editing work there, but bot posting requires `npm.cmd start`. Run one mode at a time.

## Prepare and post

- **Combat:** select a combatant, then an action, reaction, legendary action, trait, save or check. Select targets from the roster. Roll mode and critical mode are separate; to-hit and bonus-damage controls are under **To-hit & bonus damage**. Configured modifiers stay expanded.
- **Initiative:** Start Combat, Setup Commands, Remove All, and arrange-order commands remain available. Review each command before posting a batch.
- **Commands:** enter a custom command and click **Post as Aina**, or use a saved shortcut. **+ Add shortcut** saves an editable label and command without sending anything. Filter shortcuts by label or command text; their options menu contains Edit and Remove.
- **Recent posts:** expand a record to see its full command and the delivered Discord message link. Queued, Posting, Posted, Failed, Cancelled and uncertain delivery are distinct states.

Aina posts the command in a copyable code block in the chosen channel. **Copy that command and send it from your own Discord account to run it with Avrae.** Aina's bot post does not invoke Avrae. Owner confirmation is shown separately from delivery; it is not independent Avrae execution verification.

New previews use **Confirm**, **Reaction**, and **Cancel**. Confirm records owner-reported use and removes the preview; Reaction announces `A unit will use their Reaction!` once in the same channel and keeps the preview; Cancel removes it without marking use. New previews remain when you copy/send the matching command. Older existing previews retain their legacy dismissal behavior. See [complete behavior and verification](spellcasting-and-preview-controls.md#confirm--reaction--cancel).

## Queue, failures and local data

Requests have durable IDs and previews have Discord nonces. Rapid double-clicks are suppressed; delivery is serialized. A confirmed post has a Discord message ID. An ambiguous transport failure is shown as uncertain and is not automatically resubmitted by the application. Inspect Discord before intentionally posting again.

**Cancel waiting posts** cancels queued work; it cannot retract an already dispatched message. Restarting Aina cancels queued posts and treats interrupted posts as uncertain. Nothing replays automatically. Setup batches stop at the first failed or uncertain result.

Saved shortcuts remain in the existing workspace file, `data/critter/workspace.json`. New bot delivery records use `data/critter/bot-post-history.json`; prior user-account records in `sender-history.json` remain separate and are never replayed. Creature data, backups and CritterDB's existing-tab connection remain independent.

Old `DISCORD_DUMMY_*`, `DISCORD_AVRAE_BOT_ID`, and `AINA_PANEL_PASSWORD` settings are not read by the posting feature. They may be removed locally if no longer needed. Do not put a user credential into `DISCORD_TOKEN`; that setting remains Aina's official bot token. The old `configure:sender` and finish-setup commands now print a retirement message and do not prompt, write credentials, contact Discord or launch windows.

## Reconnect

If Aina is offline, keep your editor open, start `npm.cmd start`, then click **Refresh**. There is no separate sender sign-in or connection step. After a backend restart, reconnect CritterDB using your installed extension and existing signed-in tab if needed; Aina never opens a new browser for this.

## Manual verification

Use a channel you choose. These are steps for you to perform; implementation checks do not send live messages.

1. Start Aina, refresh the editor, and select the test channel or an accessible thread.
2. In Commands, save a shortcut labelled Test roll with `!r 1d20` (adjust to your actual server prefix). Saving must post nothing.
3. Click Post once. Check that exactly one code-block preview appears, authored by Aina. Recent posts should show Posted only after Discord confirms it.
4. Copy the code-block text and send it yourself. Check Avrae's result in Discord. The preview remains available. Press Reaction to announce it if needed, then Confirm after use; or Cancel to remove the preview without marking use.
5. Rapidly double-click a shortcut. Check one submission. After completion, a later deliberate click is a new post.
6. Change destination, switch to Combat, and post a prepared action. Confirm the same selected destination is used.
7. Refresh the editor and verify destination and shortcuts persist.
8. Test a channel where Aina lacks posting permission. It must not report Posted. An interrupted transport must show uncertain delivery, with no automatic replay.
9. Check an active thread with both users' permissions, and confirm archived/inaccessible threads cannot be posted to.

Local verification: `npm.cmd test`. Tests use fake Discord clients and localhost fixtures for official bot posting, permission checks, threads, dismissal, durable duplicate protection, ordered queues, cancellation, uncertainty, saved shortcuts, origin guards, and retired account endpoints. No user-account session is authenticated or tested, and no live Discord message is sent by these checks.

`npm.cmd run test:critter:bot-panel` checks the actual UI with an isolated headless Microsoft Edge process and localhost fixtures. It checks double-click suppression, filtering, remembered thread selection, shortcut persistence, combat modifiers, and desktop/mobile/dark layouts. It blocks external requests, uses no browser account profile, and opens no visible browser window. Microsoft Edge must be installed at its standard Windows location for this optional check.

