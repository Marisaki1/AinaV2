# Workshop calculations, turn effects and compact controls

See [Critical ranges, bonuses and player targets](critical-ranges-and-players.md) for the compact command controls, passive critical minimum and optional party roster.

For separate Stand up/ending buttons, configurable damage order, existing-ability configuration, explicit after-roll follow-ups and per-copy local resources, see [Custom abilities, effect buttons and follow-ups](ability-followups.md).

## Activate the account-loading fix

The installed unpacked connector must reload once:

1. In your existing Brave window, open `brave://extensions`.
2. Find **Aina · CritterDB connection** and click its **Reload** icon. The updated version is **1.0.1**. Keep Developer mode enabled.
3. Refresh the Aina page with **Ctrl+F5**. Keep your existing signed-in CritterDB tab open.
4. Choose **Library & editor → Load → From CritterDB → Connect existing tab**, select the tab if asked, paste the bestiary URL, and load it.

No new browser or profile is opened. An older connector now gives a reload instruction instead of silently returning an empty bestiary.

The bug was an `_ainaFresh` cache-busting query parameter. CritterDB copies query parameters into its creature search filter, which made that request match no creatures. The connector now uses cache settings/headers without adding a search parameter. See the [official collection controller](https://github.com/haswellr/CritterDB/blob/master/server/controllers/bestiaries.js).

If an old empty account load and a populated link import both exist, account refresh selects the populated collection, retains its keys and local edits, and preserves the other local copy. No remote creature is deleted or changed by loading. Backups are retained before merging changes.

## Core and Defense

Ability modifiers use `floor((score - 10) / 2)`. Changing a score updates computed saves, skills, AC and average HP. A score change only changes its modifier when it crosses the relevant threshold.

**AC defaults to Base + DEX.** For an imported AC of 22 and DEX 20 (+5), the base starts at 17, preserving AC 22. Changing DEX to 22 (+6) then gives AC 23.

Defense offers radio choices:

- Base + DEX.
- Base + capped DEX, with an editable cap.
- Fixed AC.
- Base + DEX + another selected ability.

Changing the formula initially preserves the current AC by adjusting its editable base. Choose the base/cap/ability explicitly for the desired mechanic. Temporary encounter AC belongs in Initiative management or an effect, separately from the creature's base AC.

Proficiency can remain Custom PB or be calculated from challenge rating. Imported PB stays custom until you select the CR formula. Average HP uses hit-die averages plus the CON modifier for each hit die.

Save and skill rows display their calculated total. Proficient, Half, and Expert are mutually exclusive. Unchecking the selected mode uses the ability modifier alone. Half adds `floor(PB / 2)`; Expert adds `2 × PB`. Custom totals override automatic calculation. Imported explicit nonproficient totals remain Custom until changed deliberately.

Add save/skill selects an unused entry. Once all entries exist, Add is disabled. The preview includes ability modifiers, saving throws, skills, AC, average HP, base initiative, proficiency and base passive Perception.

Per-row Advantage and Disadvantage configure unconditional roll defaults, separately from numerical proficiency. All-save/check defaults and restricted traits remain available through the additional defaults/traits controls. Changed generated automation must be reviewed before committing; pressing Save without a current review opens that review first, and a second Save confirms it.

## Actions and roll selection

Combat and the editor's Abilities view display four independently searchable, scrollable panes: Actions, Reactions, Legendary actions, and Traits. Selecting an entry opens its shared detail panel.

Recognized numerical attack bonuses and save DCs offer **Automatic stat formulas**. Linking is explicit: select the ability and any extra bonus. The formula uses ability modifier + PB, plus 8 for a DC. Unlinked fields and existing damage expressions remain as authored. A unique visible attack/DC number matching the original automation value is updated alongside the linked field; ambiguous prose remains for manual review.

Normal / Advantage / Disadvantage radios inherit the configured default of the selected save/skill or recognized attack automation. Each per-roll choice is remembered independently. Restricted benefits still require an explicit condition choice. Normal explicitly selected uses opposing adv/dis flags to cancel advantage sources; opposing live effects may also cancel your chosen source. The application does not claim effects are active in Avrae.

Run the generated Setup Traits utility separately for each encounter copy after importing the updated bestiary. Local command flags cover editor-triggered rolls; the setup effect is still needed for benefits to affect other automation, such as a save forced by an incoming attack. Application status remains unknown without a verified live state connection.

## Bleeding, ongoing damage and repeat saves

**Bleeding** is a configurable custom condition label. It has no invented default damage or ending rule. The same ongoing controls work with other debuffs.

In an ability generator:

1. Enable the temporary effect and choose its name, condition reminder, duration and ending rule.
2. Under **Ongoing damage & repeat saves**, optionally enable recurring damage, enter its amount/dice, and select its damage type.
3. Select Start of turn or End of turn for that damage.
4. Optionally enable a repeat save, select its ability and DC, and choose its own Start/End timing.
5. Choose whether success removes this effect. Duration expiration timing is a separate setting.
6. Preview the generated automation, add the ability to the draft, then save/export it.

These generate **Avrae effect buttons**, with damage applied to the affected combatant and repeat saves rolled by that combatant. A successful configured save removes only the triggering effect. A separate End this effect button supports manual ending rules.

**The buttons must be clicked at the chosen turn boundary.** Advancing initiative does not automatically execute damage or saves. Each click executes the configured automation; click only when the rule calls for it. No turn-monitoring bot or alias was introduced. The UI and exported descriptions state this manual step. Avrae's effect `end` field controls duration ticks, not automatic damage/save execution. See [IEffect and ButtonInteraction](https://avrae.readthedocs.io/en/stable/automation_ref.html#ieffect).

## Initiative management

Each roster row has a compact **Manage** dialog. Select damage, healing, set current/maximum/temp HP, heal to max, set/adjust AC, encounter damage defenses, remove a named effect, notes or status. The selected copy's actual encounter name is used.

Damage here is **already-resolved HP damage**; it does not evaluate attacks, saves or resistance. Temporary HP sets the amount rather than stacking. Encounter defenses last until changed; use an ability effect when a timed defense is needed.

Copy or Post as Aina prepares the command. Execute the copy from your own Discord account. The dialog does not pretend the live state changed, and it never changes the source creature's base stats.

## Preservation and verification

Formula modes and proficiency choices live in `workspace.creatureCalculations` and workspace backups. CritterDB exports contain real AC/save/skill totals and usable hidden automation, not unsupported custom JSON fields. Half/expertise totals export as explicit nonproficient totals so CritterDB/Avrae can use them without the editor.

Original and candidate data, calculation settings and trait settings are retained before saving. Concurrent formula changes are rejected. A remotely changed explicit AC or modifier is reconciled when refreshing an untouched creature. Unsaved drafts retain formula settings and roll defaults across reloads. Delayed calculations cannot overwrite newer typing.

Run `npm.cmd test` and `npm.cmd run test:critter:workshop`. The latter uses an isolated **headless Microsoft Edge** process, no visible Brave window, and loopback fixtures with external requests blocked. It checks account import counts, unused saves, formulas, proficiency, previews, default radios, all four panes, linked DC preservation, Bleeding/repeat-save YAML, export, Initiative HP/AC commands, duplicate posting protection, mobile layout, and draft recovery.

These local checks do **not** prove a live CritterDB load/save or an Avrae execution. After reloading the connector, verify your bestiary count yourself. Test generated effects on a duplicate creature and test combatants: import/update it, run the action, click damage/save at their configured times, confirm the named copy's HP/save/effect removal in Avrae, and confirm unrelated effects survive. No live Discord test message or live creature write was sent as part of this change.

