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
- **Plain message:** below Saved commands, type into the multiline field and click **Send message**. Aina sends that exact text to the same selected destination: spaces, line breaks, emoji and Markdown are retained. No heading, code-block wrapper, command prefix, footer or preview buttons are added. The message must contain some non-whitespace text and fit Discord's 2000-character limit; invalid input is rejected rather than split or shortened. Mentions remain literal text, with mention notifications disabled. **Clear** discards the draft without posting. The field also clears after confirmed text delivery; failures and uncertain delivery preserve it. New text typed while a send is pending is never cleared by that older send.
- **Recent posts:** expand a record to see its full command and the delivered Discord message link. Queued, Posting, Posted, Failed, Cancelled and uncertain delivery are distinct states.

Custom commands and saved shortcuts post in a copyable code block in the chosen channel. **Copy that command and send it from your own Discord account to run it with Avrae.** Plain messages use their original content directly. Aina's bot post does not invoke Avrae. Owner confirmation is shown separately from delivery; it is not independent Avrae execution verification.

New previews use **Confirm**, **Reaction**, and **Cancel**. Confirm records owner-reported use and removes the preview; Reaction announces `A unit will use their Reaction!` once in the same channel and keeps the preview; Cancel removes it without marking use. New previews remain when you copy/send the matching command. Older existing previews retain their legacy dismissal behavior. See [complete behavior and verification](spellcasting-and-preview-controls.md#confirm--reaction--cancel).

## Optional voice narration

For Groq, put your separate speech API key into `.env` (never into the editor). The Microsoft Edge option needs no API key:

```dotenv
TTS_PROVIDER=groq
GROQ_TTS_API_KEY=your_separate_speech_key
GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
GROQ_TTS_VOICE=autumn
```

The chat key `GROQ_API_KEY` is not used for speech. Other English voices are `hannah`, `diana`, `austin`, `daniel`, and `troy`. Restart Aina and press Ctrl+F5 after configuring or upgrading. Your Groq project must have access to the model; provider errors include guidance for key/access and usage-limit failures. Configuration checks do not verify live access.

1. Join a normal Discord voice channel in the server receiving the text message.
2. In **Plain message**, check **Enable TTS**. It starts unchecked and resets on page reload; saved commands and shortcuts never enable narration.
3. Choose **Speech provider** and **Voice**. The page defaults to **Groq / Autumn**. There are 14 provider adapters: Groq, Edge, Windows installed voices, Piper, Kokoro, eSpeak NG, LocalAI/compatible servers, Gemini, ElevenLabs, Cartesia, Azure, Google Cloud TTS, IBM Watson, and Cloudflare Workers AI. The panel shows free-plan/setup requirements and discovers the selected provider's voices. **Reload voices** refreshes installed/account catalogs. Edge, Windows and local engines work without a Groq key; hosted providers need their own credentials. Select the voice destination, which defaults to the workspace owner's current channel when available. The owner needs channel access and must be in that channel or have Move Members permission. Moving Aina from another voice channel requires Move Members. Aina needs View Channel, Connect, and Speak.
4. Enter your narration and click **Send message**. Aina automatically joins before posting, then speaks after Discord confirms delivery. The **Join voice** button can connect her in advance. This is bot voice playback, not Discord's client-side TTS flag.

For example, `> As the group enters the top of the mountain where Reiko, an ancient silver dragon awaits them.` is posted exactly as written. Leading `>` quote markers are removed from the spoken copy; an inline comparison such as `2 > 1` is preserved.

[Groq Orpheus](https://console.groq.com/docs/text-to-speech/orpheus) supports WAV output with a 200-character request limit. Aina splits longer narration into ordered segments without interleaving other speech; short pauses between segments are possible. The text post still has Discord's 2000-character limit. **Stop speech** cancels current and queued speech for the server; **Leave voice** also disconnects. Aina normally leaves when no humans remain. The same queue and connection are used by `/ttv join`, `/ttv say`, `/ttv status`, `/ttv stop`, and `/ttv leave`.

Provider and voice changes apply to the next submitted message; queued narration keeps its selected provider and voice throughout every segment. Choices remain selected while browsing the workshop and reset on reload. `/ttv` continues using its `.env` defaults. The [complete speech guide](tts.md) has setup commands and credential labels for every provider, including Piper/Kokoro local servers, Windows/eSpeak voices, cloud free quotas, and compatible local engines.

Recent posts shows speech status and the selected voice separately from text delivery. Missing configuration for the selected provider or failed voice preflight prevents the text post when TTS is enabled. If synthesis/playback fails after text was delivered, the text remains Posted, the field clears, and the speech error appears separately. Ambiguous text delivery never starts narration. There is no automatic speech retry or replay after restart; interrupted narration is marked interrupted. Unchecking TTS restores ordinary text-only sending.

## Queue, failures and local data

Requests have durable IDs and previews have Discord nonces. Rapid double-clicks are suppressed; delivery is serialized. A confirmed post has a Discord message ID. An ambiguous transport failure is shown as uncertain and is not automatically resubmitted by the application. Inspect Discord before intentionally posting again.

Plain messages use that same queue and delivery protection. They appear in Recent posts, but are not tracked as dismissible command previews. After updating this feature, restart Aina and press Ctrl+F5 in the editor to load both the backend route and the new field.

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
10. Confirm Enable TTS is initially unchecked. Send a plain message and verify exact formatting with no speech, followed by automatic clearing after delivery. Type a draft and press Clear; verify no post. Enable TTS, verify Groq/Autumn is initially selected, then choose a voice and your voice channel and send the quoted Reiko example above. Verify one text post, automatic voice connection, speech without the quote marker, and completed TTS status with the selected voice.
11. Select Microsoft Edge and Guy and send another narration. Check that the voice choice is retained while polling or switching workshop tabs. Try Stop speech during narration, then Leave voice. Reload and confirm TTS is unchecked and the voice selection starts on Groq/Autumn. If speech fails, check its separate error before deliberately sending again; doing so creates another text post.

Local verification: `npm.cmd test`. Tests use fake Discord clients and localhost fixtures for official bot posting, permission checks, threads, dismissal, durable duplicate protection, ordered queues, cancellation, uncertainty, saved shortcuts, origin guards, and retired account endpoints. No user-account session is authenticated or tested, and no live Discord message is sent by these checks.

`npm.cmd run test:critter:bot-panel` checks the actual UI with an isolated headless Microsoft Edge process and localhost fixtures. It checks double-click suppression, exact plain messages, optional TTS selection and reset, voice controls, filtering, remembered thread selection, shortcut persistence, combat modifiers, and desktop/mobile/dark layouts. It blocks external requests, uses no browser account profile, and opens no visible browser window. Microsoft Edge must be installed at its standard Windows location for this optional check. These fixtures do not verify live Groq synthesis or Discord voice playback.

