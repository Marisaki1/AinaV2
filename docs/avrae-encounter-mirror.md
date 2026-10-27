> Archived: this export workflow is no longer part of the main application. Use Initiative and its searchable creature picker to add combatants manually. See [current instructions](critter-workshop.md).

# Avrae encounter mirror and command panel

Avrae remains the combat engine. Aina displays a reviewed, channel-specific snapshot and prepares commands for you to copy and send yourself. Aina does not execute those commands, adjust the snapshot after copying, infer complete encounters from damage messages, or claim command execution from a later snapshot.

The new **Discord initiative** tab is part of the existing local desk. **Combat** remains the prepared-roster command workflow. **Initiative**, creature/bestiary imports and exports, the ability editor, presets, Combat Traits, and optional authenticated CritterDB editing remain available.

## Installation and launch

In PowerShell, from this project directory:

```powershell
npm.cmd install
npm.cmd start
```

Open **http://127.0.0.1:4317** yourself, in Brave or your preferred browser. Refresh an existing tab after updating the files. Nothing opens a browser automatically.

Keep the existing Discord token and application configuration in `.env`. The existing Message Content, Guild Messages, and Guilds intents are used; Message Content must also be enabled for Aina in Discord's Developer Portal. Aina must be in the source server and able to view/send in the selected channel. New bridge messages arrive through the existing Discord bot connection; no Avrae encounter HTTP endpoint is used.

The owner defaults to the existing Discord application's owner. Set `CRITTER_OWNER_ID` in `.env` only if you need to override that owner. This is also required for offline-only use when no connected Discord application can identify its owner. It is a Discord user ID, not a token.

`npm.cmd run critter` runs the same editor without Discord. Manual snapshot imports, review, command preview/copy, history and favorites still work with `CRITTER_OWNER_ID` configured. Automatic collection of Avrae's replies requires the normal online Aina bot. Run only one mode against the same data directory at a time.

The browser and local integration run on the machine hosting Aina. Open that machine's loopback URL. This feature does not provide a public web server, remote account authentication, or an alternative Avrae instance.

## First bridge setup

Use a **disposable test encounter** first. No live encounter was modified while implementing or testing this feature.

1. Open **Discord initiative**. Select the Discord server/channel in the existing top bar, then click **Use selected channel above**. This binds the source by its exact server and channel IDs. It does not send a Discord message.
2. The default source bot ID is the public Avrae application ID, `261302296103747584`. If using another explicitly authorized deployment, set its exact bot ID under **Offline source / bot settings**. Aina never trusts an arbitrary account merely because its display name is Avrae.
3. Click **Download export alias**. Save `ainaexport.txt`.
4. In Discord, **attach that file** to a message containing:

   ```text
   !alias ainaexport
   ```

   Substitute your server's Avrae prefix if it differs. This creates a **personal alias** in your Avrae account; it does not require a server-wide alias or a current character. If that alias name already exists, inspect/back up your old alias before deliberately replacing it. Downloading the file does not install it. Attaching the file to `!ainaexport <nonce>` does not install it either. Wait for Avrae's alias installation confirmation before proceeding. The on-page First-time setup section includes **Copy installation command** and **Check why encounter is not loading**.

5. Click **Refresh from Avrae…** in Aina. It shows an exact one-use command, for example:

   ```text
   !ainaexport 0123456789abcdef0123456789abcdef
   ```

6. **Send the exact displayed command yourself in the configured encounter channel.** The example nonce above is not reusable. Aina posting it would not make Avrae run it.
7. Avrae sends one or more embeds titled `AINA-SNAPSHOT/1`. The export captures one complete snapshot before emitting the parts. Aina collects them without interpreting unrelated Discord messages. The API refresh window is ten minutes; multipart delivery can take up to about twenty seconds.
8. Click **Review incoming snapshot**, check the location, timestamp, added/removed/renamed units and visible values, then **Use this snapshot**. Until you do, the previous displayed encounter remains unchanged.

The alias is generated with your configured owner ID and rejects other invoking users. It reads the official `combat()` alias API; it does not call setters, make rolls, spend resources, or create effects. Avrae's scripting evaluator itself marks an accessed combat for its normal commit process, so “read-only exporter” describes the absence of deliberate combat mutations, not a guarantee that Avrae performs zero database writes internally. Do not issue combat commands concurrently when validating a new bridge installation.

## Daily use and refresh

1. Choose a saved location on the left. Different channels have different snapshots, actor/target choices, prefixes, favorites and command history.
2. Inspect initiative order and current-turn highlighting. A group turn highlights its members. Search by combatant/group name or filter current turn, hidden stats or zero HP.
3. Select an actor and an action, or choose another operation in the command panel. Select one or multiple real snapshot targets. Review the complete command.
4. Click **Copy command** and send it to Avrae **in the displayed channel**. For a batch, send each line separately, in order.
5. After Avrae executes your command, click **Refresh from Avrae…**, send the new export command, and review the resulting snapshot. The header's Refresh button does the same while this tab is selected; it does not pretend to fetch Avrae combat state automatically.

Every accepted snapshot shows its export time and age, explicitly marked “may be stale.” The interface polls only Aina's local bridge inbox; that polling does not run an alias or refresh Avrae. It never claims a damage message is enough to reconstruct an encounter.

Renames are reconciled by stable combatant ID. Removed combatants disappear when a complete newer snapshot is accepted. If a previously selected actor or target has disappeared, command generation stops and asks you to select again; it does not substitute another unit. A snapshot reporting `combat() is None` offers an explicit review before clearing only that channel's displayed roster. New combats in the same channel replace the roster through complete snapshots. The public API does not expose a separate stable encounter ID, so the mirror key is the exact server/channel pair, with an invocation ID identifying each export.

Older or equal invocation IDs cannot overwrite newer snapshots or pending candidates. Partial exports cannot update the mirror. Preparing a fresh request invalidates the old request for that channel. Aina restart/reconnect discards incomplete requests/candidates and retains accepted snapshots. Prepare and send a new export command after reconnecting or after an export expires. Commands prepared against a snapshot superseded in another window are rejected by the local server.

## Manual fallback

If Aina was offline, signature verification is unavailable, or automatic collection failed:

1. The exported data is still in the Avrae embeds. Copy **all JSON descriptions** from one `AINA-SNAPSHOT/1` export. Preserve each complete JSON line; do not mix refreshes.
2. In Aina, choose the configured location and open **Paste export messages instead**. Paste those descriptions and click **Import for review**. Previous text-style `Owner: AINA-SNAPSHOT/1 {...}` parts are also supported.
3. Alternatively, use **Import snapshot JSON** for a full exported snapshot JSON file, or a `.txt` file containing the complete copied parts. **Export displayed snapshot** and **Export pending snapshot** provide ordinary snapshot JSON files.
4. Review and accept explicitly. Manual data is labelled **Discord origin unverified**. Its server/channel/exporter IDs must still match your configured source, privacy redaction and schema checks still apply, and it cannot overwrite a newer snapshot.

The manual workflow does not claim arbitrary JSON is authenticated by Avrae. It is an explicit local-owner import. Ordinary user messages containing JSON are never processed as encounter updates. Duplicate, mixed, missing or oversized parts fail visibly rather than assembling a partial roster.

The exporter permits up to twenty parts of 1,500 source characters, within Discord embed-description limits. More than 30,000 characters fails **before sending any part**; no units are silently omitted. For larger encounters this version requires a smaller export/test encounter or a separately produced, explicitly reviewed full snapshot file. It does not offer a hidden full-encounter API.

## Field support and privacy

The bridge deliberately exports a conservative public-data view, even if the configured owner is the DM. Hidden monster details are not unlocked by being Aina's owner. It does not bypass Avrae's privacy choices or copy private stats into public Discord output.

| Field | Exported support | Limits |
| --- | --- | --- |
| Server/channel identity | Exact `ctx.guild.id`, `ctx.channel.id` | Mandatory and matched to configured source |
| Export identity/time | Owner ID, invoking message ID, snapshot timestamp | Message ID orders complete snapshots; no separate encounter ID is invented |
| Encounter name, active state | `combat().name`, or explicit no-active-combat state | Unnamed encounters retain null name |
| Round/current turn | `round_num`, `turn_num`, `current.id` | `turn_num` is Avrae's initiative score, not an invented turn counter; group ID can be current |
| Initiative and groups | Flattened initiative order plus group IDs/names/member IDs and initiative | Preserves API order and group membership |
| Stable combatant identity | `SimpleCombatant.id`, encounter name | UI selection uses ID; command syntax ultimately uses current names |
| Source creature name | `monster_name` for non-hidden units | Hidden or absent source stays hidden/unavailable; never guessed from the encounter alias |
| Controllers | `controller` ID | No ownership of character resources inferred |
| Current/max/temporary HP and AC | Exposed snapshot values for non-hidden units | Hidden stats are redacted before output and again on import; actual zero remains zero |
| Resistances/immunities/vulnerabilities | String representations of exposed resistance entries | Only for non-hidden units; no inferred rules beyond API values |
| Active effects | Public name, duration, remaining rounds, concentration, end-turn timing | Effect descriptions, passive dictionaries, buttons, automation and hidden modifiers are omitted; an effect name alone does not verify its mechanics |
| Action names | Alias API attack-list names for non-hidden units | Names only, no automation code; hidden actions remain withheld. This does not enumerate every character feature/action outside the exposed attack list; you can type a known executable action |
| Spell names | Available spellbook names for non-hidden units | No slots, casts remaining, prepared availability or permissions to spend resources are inferred |
| Conditions/resources | No independent condition/resource model | A descriptive effect is not proof of all mechanical consequences; monster custom counters are not assumed |

Fields use explicit `known`, `hidden`, or `unavailable` status. Missing information never becomes zero. Unknown imported properties are discarded from snapshots. Hidden stat fields are forced to `hidden` even if a manually supplied object includes a value. Effect imports keep only the public fields listed above.

Avrae is the source of effective live values. The mirror does not combine them with edited base creature stats or reapply temporary modifiers. The existing CritterDB editor continues to edit its own creature data separately.

## Command behavior

The panel provides:

- Actions, spell casts, source creature lookup, multiple targets, advantage/disadvantage, crit/no-crit, additive hit/damage bonuses, 1–25 repetitions and optional spell level.
- HP adjustments, setting current HP, temporary HP, saves, checks, nonnegative fixed initiative and AC changes.
- Adding a **descriptive** effect with optional duration/reminder, or removing one exact named effect. It never generates a command to remove every effect implicitly. Adding an already-present effect name is blocked because Avrae can replace that effect's mechanics.
- Start combat, next turn, removing a selected unit, adding imported creatures or a saved encounter preset, and ending combat.

Default actions use `!i aoo "actual encounter name" "action"`; casts use `!i rc`. **Current turn** is enabled only when that exact individual is current, producing `!i a` / `!i cast`. A grouped turn uses named-combatant mode to avoid an ambiguous actor. Source actions use `!ma "source name"`; source casting uses `!moncast`, explicitly ignoring live encounter state. Live saves/checks use `!i os` / `!i oc`.

The initiative command parser selects by **name**, not the alias API's stable IDs. Aina resolves selected IDs to current names immediately before generation and blocks ambiguous exact duplicate names, including group/name collisions. Rename duplicates in Avrae and refresh instead of assuming a UUID is a supported command argument. Distinct copies such as `Dragon1` and `Dragon2` remain separate. Targets come from the selected channel's snapshot, are resolved by ID, and are quoted/escaped.

Adding creatures uses canonical names from imported CritterDB data, separate encounter aliases, explicit numeric quantities and optional initiative roll mode/bonus/fixed value/controller. Existing controller presets are offered as input suggestions. A saved encounter preset reuses its existing source and alias settings. All add commands precede generated Combat Traits setup for each named copy. No source data or local snapshot is changed by preparing the batch. Fixed quantities are limited to 1–20 per source so every copy's name is known. Existing snapshot-name collisions block generation.

Save/check advantage already applied as Avrae effects is consumed by the live combat commands. Additional conditional benefits still require an explicit roll-mode choice when applicable; this mirror does not infer a condition from prose. The original Combat Traits editor remains available. A pending or named Aina effect in a snapshot does not establish that its passive fields match the local configuration: application status is not upgraded to verified from a name alone.

**End combat** requires clicking its confirmation button before the command can be prepared. Confirmation is transient, tied to this channel/snapshot, and is not restored from saved choices/favorites. Avrae will still ask for its own confirmation after you send the command. Generating/copying never ends an encounter.

History and favorites use the existing workspace collections, with additional exact channel metadata. History records `generated` or `copied`, never `execution confirmed`. Reusing a mirror favorite resolves its actor and targets against the current snapshot; it does not blindly replay an old alias string. Existing favorites/history remain available in `/advanced`. A successful copy is not evidence that Avrae executed anything, and a subsequent state change alone is not attributed to a particular command.

## Storage and trust boundary

Accepted snapshots and configured locations live in **`data/critter/encounter-mirrors.json`**, with a `.previous` recovery copy. This is separate from mutable library/prepared-roster storage, preventing ordinary workspace saves from overwriting newer mirror data. It is still managed by the existing local Critter service. Browser choices, presets, favorites and command history remain in `workspace.json`. Preserve both files when backing up the whole application; the existing workspace JSON backup by itself does not include the separate mirror cache. Individual accepted/pending snapshots can be exported through the mirror UI and reimported for review.

The local server keeps its loopback/Host/Origin/custom-header checks. The graphical interface trusts access to the host machine. Online source configuration only accepts channels the existing bridge verifies Aina and the configured owner can access. No bot tokens, CritterDB cookies or account credentials are put in the alias, snapshots, downloads, history or messages.

Automatic collection requires the exact configured bot ID and channel, a locally prepared nonce, a matching observed owner invocation when available, a complete consistent batch and an Avrae-verified invocation context for the owner/channel/freshness window. Webhook messages and unrelated JSON/messages are ignored. **Avrae's signature attests invocation context, not the JSON payload.** Aina does not call the payload cryptographically signed. Snapshot review remains required for that reason, and manual imports are expressly unverified. No partial or unreviewed batch directly overwrites the displayed encounter.

## Verification and official references

Tested locally:

- The exporter executes in Avrae's actual Draconic interpreter with fixture encounter objects. It captures groups/IDs, zero HP/THP and public effect timing; the private fixture raises if any hidden stat is read. No mutation, roll or resource APIs are used by the exporter.
- Local Discord-shaped bridge events exercise configured sources/nonces, verified-context fixtures, multipart reconstruction, bad context rejection and required review.
- Browser tests cover alias download, source configuration, pending review, group highlighting, public/hidden/zero values, correct actor/targets and escaped names, crit/bonuses, copy without state mutation, history/favorites, explicit end confirmation, two channels, manually refreshed renamed/removed units and narrow layout.
- Schema/API tests cover malformed/incomplete/mixed imports, stale/out-of-order updates, rejected stale command drafts, reconnect persistence and exact numeric Discord snowflake parsing.
- Existing creature/ability/editor command tests still pass; the source creature remains byte-for-byte equivalent in mirror fixture tests.

**Not tested against real Discord/Avrae:** installing/running this alias in your account, the live signature-verification response for your export, or refreshing after an actual user-issued combat command. No live encounter was changed. Fixture signatures are not real Avrae signatures. The local proof does not establish that your deployed Avrae version/account permissions behave identically.

For the live acceptance test, create your own disposable encounter, add two distinctly named test copies and one group, and run the steps under First bridge setup. Run one harmless test HP adjustment yourself, export again, and confirm only that channel's reviewed snapshot changes. Test zero HP/THP, a hidden combatant, a rename/removal, copying without executing, and a second independent channel. Do not use an important live encounter for write testing.

```powershell
npm.cmd test
npm.cmd run test:critter:mirror
npm.cmd run test:critter:desk
```

The optional `scripts/check-avrae-export.py` proof requires an isolated Python environment with the official `avrae/draconic` interpreter; Python is not a runtime requirement for Aina or the bridge. Example after installing that development dependency:

```powershell
<isolated-python> scripts/check-avrae-export.py "$env:TEMP/aina-mirror-proof.json"
```

Verified primary references (2026-10-23):

- [Official aliasing API](https://avrae.readthedocs.io/en/stable/aliasing/api.html): `combat()`, context IDs, `dump_json`, `signature` and the documented signature-verification endpoint. That endpoint verifies signatures; it is not an arbitrary encounter-read API.
- [Official combat alias implementation](https://github.com/avrae/avrae/blob/nightly/aliasing/api/combat.py) and [statblock wrappers](https://github.com/avrae/avrae/blob/nightly/aliasing/api/statblock.py): actual exposed fields and limitations.
- [Alias management and multiline](https://github.com/avrae/avrae/blob/nightly/cogsmisc/customization.py): personal alias file uploads, twenty commands, one-second spacing. [Embed transport](https://github.com/avrae/avrae/blob/nightly/cogs5e/pbpUtils.py).
- [Signature construction/verification](https://github.com/avrae/avrae/blob/nightly/aliasing/api/functions.py) and [normal scripting commit behavior](https://github.com/avrae/avrae/blob/nightly/aliasing/evaluators.py).
- [Initiative command handlers](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/cog.py), [combatant name selectors](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/combat.py), [public effect/status rendering](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/combatant.py), and [automation flags](https://github.com/avrae/avrae/blob/nightly/cogs5e/utils/help_constants.py).

## Diagnose a silent export

Click **Check why encounter is not loading**. Aina reads the last 100 messages in the configured channel, checks for owner installation/export commands and recent Avrae messages, and displays a related Avrae reply when available. A missing recent installation is a diagnostic clue, not proof that the alias has never been installed. The check requires Read Message History and sends no Discord messages. If you attached `ainaexport.txt` to `!ainaexport <nonce>`, instead attach it to `!alias ainaexport` first. Then request a fresh nonce in Aina and send its new export command.

Exporter transport fix (2026-10-24): Avrae's argument parser preserves backslashes differently from JSON decoding. The listener now recovers the legacy doubled-backslash fragments and the downloadable exporter uses percent-encoded payload chunks inside a single-quoted argument. Quote, backslash and percent preservation are covered by regression tests. Complete manual recovery candidates remain available for explicit review across a restart for one hour; partial live exports still require a fresh request.
