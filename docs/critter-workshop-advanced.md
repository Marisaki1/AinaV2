# Critter Workshop

Aina's home page is a simple combat screen: load a creature or bestiary, choose an action, select a Discord channel, and send the copyable Avrae command. Avrae continues to handle rolls and live combat state.

## Combat tabs

The main page has separate tabs, with one remembered server/channel shared across them:

- **Actions & abilities**: select an imported creature and executable action, choose the combat name, targets and roll options, then copy or post the preview. Prepared roster names are available in the combat-name suggestions.
- **Initiative & roster**: add named creatures, quantities (including dice quantities), and either let Avrae roll initiative with an optional bonus or enter a fixed initiative value. HP/AC/temporary HP overrides, controllers, groups and notes are optional. Edit or remove prepared rows, save/load named encounters, preview one add command, or build the whole setup. Toggle whether setup starts with `!init begin`. Setup posts separate previews in order; copy and send each line separately to Avrae. **Use in Actions** carries a roster alias into the Actions tab; numbered groups use the first numbered member.
- **Combat controls**: next turn, initiative list, status, start/end combat, HP adjustments, set HP, temporary HP, saving throws, AC/initiative changes and removing a combatant. Type or select a prepared combat name. Controls immediately show their commands. HP change values are remembered separately from set-HP and temporary-HP values.
- **Creature editor & export**: opens the existing full editor for stats, saving throw modifiers, actions, automation and JSON export/copy.

Your active tab, prepared roster, encounter presets, form choices and shared destination survive reloads. Tabs support keyboard arrow navigation and browser Back/Forward. Direct links include `/#actions`, `/#initiative` and `/#combat`. The prepared roster is local preparation; actual rolled initiative, current turns and live HP remain in Avrae. No reading of live combat state or automatic Avrae execution is claimed. A partial batch failure identifies the posted count and retains history only for successful previews; check Discord and preview the remaining roster entries individually.

## Everyday use

1. Run `npm.cmd start` and open **http://127.0.0.1:4317** yourself in your preferred browser. No browser is opened automatically.
2. Click **Load JSON files** for individual CritterDB creatures or whole bestiaries. Multiple files are supported. **Load link** also reads public/shared CritterDB URLs. For pasted JSON, expand the optional import row.
3. Select a creature on the left, then click its action or ability in the middle. The exact command appears immediately on the right. Existing hidden automation names are used when available. A descriptive/passive trait may not be executable in Avrae; the page marks those entries.
4. Set **Name in combat**, optional **Targets** (comma separated), **Discord server**, and **Channel**. Only the selected server's channels are shown. Click **Send to #channel**. Aina posts a copyable preview; you copy and send it to Avrae. Press the preview's ✅ button/reaction to dismiss it, or let it disappear after your matching command.
5. Your server/channel, selected source/creature/action, combat names, targets, roll options, and prefix are saved automatically. Each creature keeps its own action and combat name. Wait for **Choices saved** before closing the page. Recent pending choices are also kept in this browser so they can be recovered after an immediate reload. These choices contain no CritterDB login details. Preferences merge into the latest server workspace without replacing creature data; imports from Discord or another tab are preserved. **Refresh** loads the latest library. The header shows whether Aina is online, and disabled Send controls explain the missing selection or connection.

The basic screen never launches or connects a separate browser. To read a private creature or bestiary through the CritterDB session in your current browser, expand **Paste JSON or load from your signed-in CritterDB tab**, drag **Send to Aina** to your bookmarks bar, open the creature/bestiary on CritterDB in that browser, and click the saved bookmark. It reads through that tab's existing connection and opens the local page to receive the creature data. Passwords, cookies, and session tokens are not transferred. This is an optional read-only import; it does not save edits back to CritterDB. Both pages must be in the same browser profile; allow the import tab if the browser blocks it. JSON files remain the simplest alternative. The bookmark flow was verified in Brave against a local CritterDB fixture; it has not been tested against a live signed-in tab.

**Editor & export** opens the existing full editor at **/advanced**, including JSON copying/export and encounter tools. The authenticated remote editor remains an optional advanced tool; its managed browser is separate from the default import/action/send workflow.

If the page says **Bot offline**, start the full bot with `npm.cmd start`. `npm.cmd run critter` only runs the editor and cannot send Discord messages. Run one mode at a time on the configured port.

For optional authenticated edits saved back to the same online creature from the advanced editor, see [Direct CritterDB editing](critterdb-direct-editing.md). The detailed tools below are at **/advanced**.

## Install and open

From the Aina project directory:

```powershell
npm.cmd install
npm.cmd start
```

Open **http://127.0.0.1:4317** in a browser on the same computer as Aina. The startup console also prints the address. `/critter open` gives the owner the link in Discord. Keep the process running while using the workspace.

To edit without Discord, AI credentials, or internet access:

```powershell
npm.cmd run critter
```

Run one mode at a time; both use the same saved workspace and default port. If port 4317 is occupied, stop the old process or set `CRITTER_PORT=4318` in `.env` and use the new address. The regular Aina startup keeps the editor running if Discord authentication or command registration fails.

Optional `.env` settings:

```dotenv
CRITTER_OWNER_ID=your_actual_discord_user_id
CRITTER_PORT=4317
```

Leave `CRITTER_OWNER_ID` unset to use the Discord application owner (the team owner for team applications). It must be a real Discord user ID if you set it. To find your ID, enable Discord Developer Mode, right-click your account, and choose Copy User ID. Restart Aina after changing environment settings.

The server binds to `127.0.0.1`, validates the host and request origin, and requires a custom header on API requests. The browser interface trusts access to the local computer; it is not a remotely hosted multiuser application. Discord imports and preview dismissal are restricted to the owner. The server never returns the Discord token or Groq API key to the browser.

## Import, edit, and export

1. Choose **Import CritterDB JSON** and select one or several files. A file can contain a single creature object with `name` and `stats`, or a collection object with a `creatures` array. Imports are validated as a group; an invalid file leaves the workspace unchanged. The upload/workspace limit is 20 MB.
2. Alternatively, use **`/critter import file:<attachment>`** in Discord. Only the configured owner can import. Press **Refresh** in the browser to load this externally saved change. Separate browser windows detect conflicting saves rather than silently overwriting one another.
3. Search or select a creature. Edit its identity, stats, hit dice, abilities, saving throws, custom skill totals, resistances, senses, languages, CR/XP, flavor/image URL, and legendary resources. List fields use one entry per line. Average HP follows the CritterDB importer’s hit dice and Constitution calculation.
4. Switch among traits, actions, reactions, and legendary actions. Readable HTML source, text-only rules preview, and existing hidden automation source have separate panes. The source’s executable action name may differ from the visible title. A real YAML parser inspects named automation, including YAML lists and the importer’s simple `name|bonus|damage` shorthand.
5. **Save creature** commits the edits. **JSON** exposes the whole creature for properties outside the forms; invalid JSON is rejected without replacing the last valid creature. Unknown properties survive unrelated form edits.
6. **Export creature** downloads a single creature. **Copy creature JSON** copies that same JSON to the clipboard. **Export source file** and **Copy source JSON** include the entire source bestiary when applicable, including its collection information and all other creatures. In Settings, each source file also has Export and Copy JSON buttons. Clipboard copying includes a selectable-text fallback. Save your edits before exporting or copying, then use the corresponding creature/bestiary JSON import option to manually update CritterDB.

Creature **Saving throws** changes the creature’s own saving throw modifiers. An action that makes its targets roll saving throws is edited in that action’s hidden automation source: its save ability, DC, success/failure effects, and damage. These are separate settings. For the supplied Ancient Silver Dragon, Cold Breath’s DC 24 Constitution save and one shared `15d8[cold]` roll stay intact when editing unrelated stats; Perception remains an explicit +16 custom total unless you change it.

Duplicating a creature makes a new standalone source file and removes its top-level `_id`, `id`, `bestiaryId`, `publishedBestiaryId`, and `__v` fields. This keeps the copy from reusing the original record’s identity; CritterDB can assign a new identity on import. Other fields and mechanics are retained. Rename a creature using the name field. Delete operations require confirmation; Undo can restore them within the current session.

Description-only edits preserve all existing hidden `<avrae hidden>…</avrae>` blocks. If you edit a block itself, its source changes only as entered. Imported HTML never executes in the rules preview. YAML parsing and the presence of automation are **not** an Avrae execution guarantee. The UI warns about missing/unrecognized source, 2024 attack wording, and descriptive recharge/condition/resource text. It does not invent mechanics, enforce recharge, or build new automation automatically.

Explicit skill/save totals remain explicit. For example, `{ "name": "Perception", "proficient": false, "value": 16 }` is preserved. The current Avrae importer derives ability modifier + proficiency for `proficient: true`; use **Custom total** to export an explicit value. The dragon’s printed initiative trait is not treated as an imported initiative field.

For the manual export workflow, import edited JSON into CritterDB, update your bestiary in Avrae, and test against an updated combatant. The separate authenticated connection can save an individual linked creature directly after review. Aina does not refresh Avrae automatically.

## Prepare an encounter

Choose an imported creature and configure its encounter name, controller, quantity, fixed initiative **or** initiative bonus, AC, HP, temporary HP, group, and notes. Source names remain separate from encounter names.

Multiple copies use `#` in their display name (`Cultist#`); the UI adds it when needed and rejects conflicting names. Dice quantities such as `1d4` are supported. Their actual combatant names are determined when Avrae executes the add command; enter resulting names manually as targets when necessary. No controller IDs are invented. Save real IDs or mentions as controller presets in Settings.

Save, load, duplicate, or delete encounter presets. **Build setup commands** prepares `!init begin` followed by the creature add commands. Each line is a separate command: copy and send each one in order.

The prepared roster is local preparation data. It is not synchronized with Avrae’s live state. The app does not infer HP, target distances, turns, or resources from Avrae responses.

## Generate and post commands

In **Command desk**, choose a mode and select or type the exact action/spell name. Imported executable names are searchable. All four ability sections are inspected. Choose one or more targets, normal/advantage/disadvantage, bonuses, repeat count, and spell level where relevant. Advanced arguments are available for additional Avrae options; the common controls remain authoritative to prevent contradictory settings.

Actor scopes are labeled in the interface:

| Mode | Actor |
| --- | --- |
| `!ma`, `!moncast` | Source bestiary creature, not a particular live monster instance |
| `!i a`, `!i cast` | Combatant whose turn it currently is |
| `!i aoo`, `!i rc` | Named encounter combatant acting off turn |
| `!cast` | Your active player character |

Other modes cover encounter start/end, adding a DungeonMaster, list/status/next/remove, fixed initiative and AC options, HP query/change/set, temporary HP, and named combatant saving throws. The prefix is configurable in Settings. Quotes and backslashes in names are escaped; control characters and conflicting roll choices are rejected.

Always click **Preview command** after changing the controls. The preview is what Copy, Favorite, Queue, and Post use. Copy has a selectable-text fallback if clipboard access is unavailable. Queues, favorites, and the last 200 generated/posted command entries are saved locally. Reusing an entry loads its editable actor/target settings when available. Setup sequences remain previews of their individual lines.

Choose the destination channel, then **Post to channel**. Available channels are server text/announcement channels where both the owner and Aina have View Channel and Send Messages. Aina posts a code block, a ✅ button, and a ✅ reaction when permitted. Mentions in generated previews do not ping anyone. Batches post at most 50 previews at once; partial failures are reported, and successful previews remain tracked.

The preview is removed when either:

- The owner sends that exact command in the same channel (leading/trailing whitespace is ignored).
- The owner clicks **✅ I copied it — dismiss**.
- The owner reacts ✅ to that preview.

Identical pending previews are consumed one at a time. The bot deletes only its own tracked preview. Pending previews persist across restarts, so they can still be dismissed after restarting Aina. Other members cannot dismiss them. The native code-block Copy checkmark does not notify Aina and cannot trigger deletion. Sending a matching command confirms submission, not Avrae success.

Aina needs Send Messages and View Channel to post; Read Message History is needed to fetch older previews, and Add Reactions is needed to add its initial ✅. The button works if adding a reaction is not permitted. The existing Message Content and Guild Message Reactions intents must remain enabled in the code, with Message Content enabled in the Developer Portal.

## Persistence and backups

Primary data lives in `data/critter/workspace.json`, not browser storage. Each save retains the preceding file as `workspace.json.previous`. Pending Discord previews are tracked separately in `data/critter/pending.json`. These paths are ignored by Git.

**Export workspace backup** includes imported JSON, encounter presets, controllers, command preferences, history, favorites, and the queue. It is explicitly marked `aina-critter-workspace` version 1. It is **not** a CritterDB import file. Restoring a backup replaces the current local workspace after confirmation; invalid backups are rejected. Bot configuration and credentials are not included.

Undo keeps the last 30 workspace changes in the current browser session. Use exported backups across sessions or computers. Removing a source file leaves encounter references visible but requires you to choose a new source before generating setup commands.

## Verification

```powershell
npm.cmd test
npm.cmd run test:critter:browser
```

The browser check uses installed Microsoft Edge in headless mode, a temporary workspace, and a simulated Discord transport. It does not connect to real Discord channels. It exercises imports, data-preserving edits, raw JSON validation, encounter setup, action generation, channel selection/posting, preview cleanup, export, reload, and mobile width. The unit/integration tests also cover YAML parsing, quoting, controllers, quantities, initiative, command modes, backups, save conflicts, API origin checks, buttons, and reactions.

Live Avrae execution and real Discord interaction behavior still require a final test in your server. Local JSON/YAML validity does not establish successful rolls or permissions in Discord.

References checked during implementation: [Avrae command list](https://avrae.io/commands/), [initiative command implementation](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/cog.py), [automation flags](https://github.com/avrae/avrae/blob/nightly/cogs5e/utils/help_constants.py), [CritterDB importer](https://github.com/avrae/avrae/blob/nightly/cogs5e/models/homebrew/bestiary.py), and [CritterDB creature schema](https://github.com/haswellr/CritterDB/blob/master/server/models/creature.js).
