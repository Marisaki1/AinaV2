# Aina encounter desk

See [Spellcasting, upcasting, resources and preview controls](spellcasting-and-preview-controls.md) for the latest DC defaults, legendary-description editing, resource tracking, compact sidebars, and Discord buttons.

Run `npm.cmd start`, then open **http://127.0.0.1:4317** yourself. No browser is launched automatically. Keep Aina running to send command previews to Discord. `npm.cmd run critter` runs the same local editor without the Discord connection. Run one mode at a time.

The main navigation is **Combat**, **Initiative**, **Library & editor**, and **Commands**. The Commands tab posts through Aina's existing official bot; see [posting instructions](discord-command-sender.md). Add creatures manually from the loaded library. Every dropdown has a type-to-filter popup, including creature sources, channels, damage types, roll modes, bestiaries and editor fields. One remembered searchable channel/thread selector is shared across all tabs. The library has a searchable Source filter with counts, including empty collections. Refresh source fetches current CritterDB creatures and merges additions while retaining local edits; concurrent local/remote edits are reported as conflicts. Light and dark themes are available in the header. Refresh loads changes made through Discord imports or another editor window.

**Combat traits** adds reviewed saving throw/skill passive effects, exact base-check command flags, and conditional choices. See [setup instructions, verified scope, other-mechanics audit and live test checklist](avrae-combat-traits.md). Initial initiative advantage/disadvantage is a separate control beside the add form; Setup Commands places trait setup after creature additions.

Account loading now requires connector **1.0.1**. Reload the unpacked extension once, refresh Aina, and reconnect your existing tab. See [automatic calculations, Core controls, four ability panes, Initiative management and turn-effect instructions](workshop-calculations.md).

## Initiative

1. Load creatures or a bestiary from **Library & editor**, or choose **Load creature files** beside the initiative form.
2. Pick a source, enter its combat name and quantity, and choose **Let Avrae roll** or **Fixed initiative**. A roll bonus, HP/AC override and controller ID are optional. Numeric quantities expand into individually named roster entries so each can have its own order/value. Dice quantities are retained for Avrae to resolve; replace their placeholder names with the actual results before using them as combatants.
3. Use **Start Combat** to preview `!init begin`. **Setup Commands** previews the add commands in roster order. The optional **Include Start Combat** setting is under setup options; it is off by default.
4. Use **Arrange initiative**, drag a row handle, or enter values in the table. Numeric values sort descending. Dragging assigns visible descending fixed values so Avrae can use the same order. The order preview uses individual `!i opt` commands. Send them to Avrae to change an already-running encounter; arranging the local roster alone does not update Discord.
5. **Remove All** offers two explicit choices: preview Avrae removal commands while keeping the roster, or clear the local prepared roster while retaining the creature library. Removing one row only edits the local prepared roster.
6. Named encounters can be saved and reloaded under **Saved encounters & setup options**.

Blank initiative values mean Avrae rolls; their final live order cannot be known by this app until you enter those results. The local roster is preparation, not a live Avrae tracker. Setup and removal batches are separate messages; copy and send each line in order. Partial posting failures report the successful count.

## Combat

The left column contains the prepared roster in initiative order. Select a combatant to see its source data and these separate sections:

- **Actions**
- **Reactions**
- **Legendary** actions
- **Traits**
- **Saves**
- **Checks**

Click an ability title to read it and prepare its command. The named combatant is used for action commands. Combat saves/checks default to the live alias, e.g. `!i os "TewiCombat" dex` and `!i oc "TewiCombat" dexterity`, so Avrae reads its encounter effects. **Source lookup** still prepares `!ms "Tewi Inaba" dex` and `!mc "Tewi Inaba" dex` using the original source name and ignoring encounter effects. Library rolls use source lookup. See [Avrae command syntax](https://avrae.io/commands).

The action command panel includes **Critical damage → Normal / Crit / No crit**, **To-hit bonus**, and **Bonus damage**. For example, `+2` or `1d4` adds to hit, and `1d6[fire]` adds damage. These prepare `crit` / `nocrit`, `-b`, and `-d` using [Avrae's official automation arguments](https://github.com/avrae/avrae/blob/nightly/cogs5e/utils/help_constants.py). Crit still rolls to hit; No crit disables critical damage. Avrae applies these flags where the selected action's automation supports them. The controls remember each combatant's settings and also work for source actions in the library. **Reset modifiers** restores a normal roll and clears critical/hit/damage modifiers. Creature base stats, descriptions and hidden automation are unchanged; save/check commands do not inherit these attack modifiers.

The right column contains targets, advantage/disadvantage, optional repetitions, command preview, Copy and Send. Aina posts a copyable command to the selected channel; you send it to Avrae yourself. Aina does not make Avrae execute a bot message. Press ✅ on the preview, or send its exact matching command, to dismiss the preview. Only the configured owner can dismiss it.

## Editing creature information

Choose **Edit creature** beside a selected combatant, or choose **Edit** beside an ability. The same editor is available from **Library & editor**.

- **Flavor, Race, Core, Defense, Abilities, Challenge** follow the CritterDB creation workflow, with a readable stat block beside the forms. Flavor edits name/image/description; Race edits type, size, speed, alignment, senses and languages; Core edits scores, proficiency, saves and skills; Defense edits AC, hit dice and selectable permanent defenses; Challenge edits CR, XP and legendary resources. Unknown properties are retained.
- **Avrae defaults** exposes all/selected save and check advantage/disadvantage, plus selected skills. Preview the generated utility here or with **Review changes**, then **Save locally**. Base-only checks use command flags to avoid affecting associated skills or initiative. Existing conditional configurations stay separate and are preserved. See [exact trait coverage](avrae-combat-traits.md).
- **Abilities** contains Traits, Actions, Reactions and Legendary actions. Add an entry with **Add Actions** (or the corresponding section), preview its generated automation, and add it to the creature draft. Existing entries expose attack bonus, separate damage components with type dropdowns, save DC/ability, effect durations, existing defense lists and passive bonuses. Move up/down and Remove from draft are explicit ordering/removal operations.
- Existing hidden YAML is patched at the edited scalar values. Shared damage variables, success/failure branches, comments, action ordering and unknown fields are preserved. Root executable names and original automation remain available for explicit editing.
- Recognized conventional/2024 rules text also exposes attack bonus, each damage component's dice/type/average, and target saves. Simple dice changes update the corresponding displayed average. This changes existing rules text; it does not invent missing condition automation or guarantee Avrae's text parser recognizes every entry.
- With hidden automation, rules wording and automation are separate. Correct the description when needed; changing a roll does not silently rewrite the rest of the prose. New automation is generated only from the settings you explicitly choose in the ability builder. Existing hidden automation is preserved unless you edit its fields or code.
- **Raw JSON** handles properties outside the forms. Creature IDs and collection membership must remain unchanged.

**Save locally** commits to the local library. A popup confirms the local save. **Save action locally** commits the current creature/action edits and confirms them separately from adding an ability to a draft. **Save to CritterDB** retains local edits first, then shows the account connection status. Connect the existing signed-in CritterDB tab through the local extension, review differences, then explicitly save. No separate browser is opened. A concurrent creature edit is rejected instead of overwritten. Failed saves keep the draft in this browser, and reopening the editor recovers it. Before a successful local creature update, original/candidate data is retained under `data/critter/creature-backups/`. The normal workspace also retains `workspace.json.previous`. Keep the machine's data directory private.

## Creating creatures, bestiaries and abilities

In **Library & editor**, choose **New ? Bestiary** to create an empty named collection, or **New ? Creature** and select its destination bestiary (or an individual file). **Edit / export bestiaries** edits collection name/description and retains IDs and unknown metadata. Add a new creature or copy an existing library creature into that bestiary; a copy receives a new local identity and omits the original remote IDs. The original is preserved.

In the creature editor, **Abilities ? + Add** in the relevant pane opens the generator. Available types are attack roll, target saving throw, direct damage, grant effect, roll dice, and rules only. Configure mechanics that your creature actually has:

- Dice count, any positive die size and flat bonus; add multiple components for simultaneous damage types.
- Select a fixed damage type, or **Choose at command time** with allowed types checked. In Combat, **Ability damage type** generates `-choice "cold"` (for example). The Discord initiative panel also offers an optional damage choice. Alternative types do not generate other spell mechanics such as exploding dice.
- For saves, choose ability/DC and optional half damage on success. One shared damage roll feeds full/half results. Effects apply on failure only. Attack effects apply on hit.
- **Apply a temporary effect** grants selected resistance, immunity, vulnerability, save/skill advantage/disadvantage, attack advantage/disadvantage, and optional attack/damage/save/check/AC/max HP/DC bonuses. Select caster/self or selected targets. Duration accepts rounds, minutes or hours, converted to Avrae rounds; blank means indefinite. Concentration and start/end ticking are explicit.
- **Roll dice only** supports expressions such as `1d2`, `2d17` and `6d100+3` without applying combat damage bonuses.
- Condition labels are reminders. Only explicitly selected passive mechanics are generated. Resolve other consequences, restrictions, repeat saves, recharge and monster resource usage manually. Existing raw automation remains editable for unsupported graphs; generic character counters are not assumed to work for monsters.

Preview before adding. **Save locally** commits the draft locally; **Review changes** shows original and pending values. The generated YAML is exported inside standard hidden Avrae blocks and works without editor-specific custom JSON fields. Its structure is checked against [Avrae's official automation schema](https://avrae.readthedocs.io/en/stable/automation_ref.html); the newly authored actions have not been executed in a live Discord encounter.

## Add combatants manually

Open **Initiative**, click **Source creature**, type a creature or bestiary name into the dropdown filter, then select a result. Enter its actual **Combat name**, quantity, and rolled or fixed initiative, then click **Add to roster**. For an already-running Avrae encounter, use the exact names already in Discord; adding a local row does not add or change a live combatant. **Setup Commands** prepares add commands when you want to create new Avrae combatants.

Switch to **Combat** and select a roster entry to use its library creature's attacks, traits, reactions and legendary actions. Targets are checkboxes in roster initiative order. **Add combatants** above the combat roster returns to the source picker. The original source name stays separate from each encounter alias. Existing prepared rows and saved encounters are retained.

All single-choice dropdowns use the same search popup. Filter text matches names and available bestiary/group descriptions, ignores accents and case, and never changes your selection by itself. Click a result or press Enter; arrow keys navigate; Escape closes without changing the value. Disabled choices remain disabled. Selections continue using the existing saved preferences. This includes dropdowns created inside creature/ability dialogs and the older advanced editor.

The Avrae encounter-export setup and review screen have been removed from the main app. Old `#mirror` links go to Initiative, and Aina no longer listens for export fragments. No alias installation or snapshot export is needed. Existing JSON creature/bestiary export, account saving, editing and command sending remain available.

## Creature and bestiary JSON

The editor and library expose **Export creature JSON** and **Export full bestiary JSON**. The library also has clipboard equivalents.

- Creature export contains only the selected creature, including its corrected data and existing automation.
- If it belongs to an imported bestiary, full bestiary export retains the entire source collection, metadata and every other creature.
- If it was imported as a standalone creature, bestiary export gathers all loaded creatures into a new bestiary container.
- Exporting from an open editor includes its current valid edits, even before committing to the local library. Invalid edits must be corrected first.

These are CritterDB JSON files, not Aina workspace backups. Import/copy them into CritterDB manually, then update Avrae's bestiary as appropriate. Published collections may need their publication refreshed, and monsters already in an Avrae encounter may retain older data.

## Loading

**Load JSON files** accepts individual creatures and whole bestiaries, including multiple files. **Load a CritterDB link or paste JSON** offers public/shared URLs and pasted data. Files/requests are limited to 20 MB.

For private sources in your current browser, drag **Send to Aina** to the bookmarks bar and use it while viewing the creature/bestiary on CritterDB in that browser. It uses that tab's own connection and transfers creature data only; passwords/cookies/tokens stay there. This optional read-only import uses no separate authentication browser. JSON import remains available if a browser blocks the bookmark/import tab. Live current-tab import remains unverified; its cross-origin handshake was checked with a local fixture.

**Open from CritterDB** accepts a creature or whole bestiary URL. Install the local Brave connector once, then choose **Connect existing tab**. Multiple existing CritterDB tabs appear in a searchable picker. Load your collection into this same library; existing local collection edits are retained on reload. **Save to CritterDB** reviews and saves an individual member back to its original ID and collection, with original backups, conflict checks and reload verification. **Verify last save** performs a read-only comparison after an uncertain save. See [connection setup and verification](critterdb-direct-editing.md).

**Clear...** beside the Library heading opens a confirmation for one creature, one loaded file/bestiary or the whole library. It does not delete remote CritterDB creatures, Discord messages or the prepared roster. A full workspace backup is retained under `data/critter/library-backups/` before removal; the dialog can download a backup too. Restore a downloaded/saved backup under **Bestiary tools & backups ? Restore backup**. Conflicting library changes block clearing.

The older complete workshop remains at `/advanced` for its additional tools. Its [reference](critter-workshop-advanced.md) describes that older interface. The existing-tab connection also supports the older creature editor; see [direct editing and live verification status](critterdb-direct-editing.md).

## Verification

`npm.cmd test` checks model ordering, `!ms`/`!mc`, scalar/text edits, preservation, exports, conflicts, persistence and Discord preview permissions. `npm.cmd run test:critter:desk` checks the main screen in headless Brave using temporary data and simulated Discord, including real drag events, presets, ordered roster/ability sections, saving throw commands, editing both hidden automation and 2024 text, exports and failed-save recovery. It never sends a live Discord message or edits live CritterDB data. The original provided dragon JSON is only read and remains unchanged.

Automation structures follow the [Avrae automation reference](https://avrae.readthedocs.io/en/stable/automation_ref.html). Local tests do not prove live Avrae execution of every creature's automation.

`npm.cmd run test:critter:authoring` covers creature/bestiary creation, eight editor sections, defenses/defaults, multi-component damage and choices, arbitrary dice, timed self/target effects, existing effect edits, preserved data/export, channel retrieval, source linking and target checkboxes in headless Brave. `scripts/verify-avrae-authoring.py` optionally checks the generated actions using official automation-common 4.4.0, Avrae Draconic and d20 1.1.2 in an isolated Python environment. These are local tests, not live CritterDB imports or Discord execution.

`npm.cmd run test:critter:direct` tests the main editor's action/save popups, same-entry CritterDB link/review/save, persistence verification, preservation, conflicts, expired-session recovery and local library clearing with backups. These use a local authenticated-transport fixture; no new live account writes are claimed.

`npm.cmd run test:critter:manual` checks real filtered dropdown interaction, manual roster selection and source abilities, duplicate creature names/bestiary hints, channel persistence, damage selection, keyboard/Escape, disabled/dynamic options, mobile popup bounds and absence of encounter-export requests.
