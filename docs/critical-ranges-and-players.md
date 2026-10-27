# Critical ranges, bonuses and player targets

Refresh **http://127.0.0.1:4317** with **Ctrl+F5** after restarting Aina. No extension reload or new browser session is required for these changes.

## Command controls

Select a creature's attack in **Combat** or **Library & editor**:

- **Normal / Crit / No crit** are radio buttons. Normal uses the attack's normal critical rules. Crit requests critical damage on a hit; it does not force an otherwise missed attack to hit. No crit suppresses critical damage using Avrae's `nocrit` argument.
- **Crit from** sets the lowest natural d20 roll that counts as a critical. Enter 19 for 19–20, 18 for 18–20, 15 for 15–20, or any whole number from 1 through 20. This is the natural die, not the modified attack total. The reset arrow uses the creature/attack default again.
- **Extra to hit / Extra damage** stay visible. Use the plus/minus buttons for flat changes; expressions such as `1d4` remain supported. **Add damage die** adds a selected die to the extra damage. Select its damage type from the searchable dropdown. A selected type applies to the entire extra damage expression; leaving it unset preserves any explicit expression types.
- **Reset** clears command bonuses/overrides and restores the inherited critical range. It does not erase the creature's passive trait or your advantage/disadvantage selection.

These modifiers persist for the selected encounter copy. They do not change its base creature stats. Critical and to-hit controls are unavailable on recognized save-only abilities; saving-throw damage does not become an attack critical. Custom automation can deliberately ignore bonus damage using `fixedValue`; Aina does not rewrite those rules to force bonuses through.

Avrae's native critical threshold also affects its natural-hit handling. Setting a broad range is a mechanics change you choose explicitly; no range is applied to existing creatures automatically.

## Save a creature-wide passive critical trait

1. **Edit creature → Abilities → Critical range passive**, or open **Avrae defaults → Critical range · passive trait**. Selecting an existing Critical Range trait opens the same controls.
2. Enable the option and set the minimum. Preset buttons cover 20, 19–20, 18–20 and 15–20; the number field accepts other minima.
3. Click **Preview critical trait changes**. Review affected automation and any manual-coverage warnings.
4. Click **Apply reviewed changes to draft**, then **Save locally**. Pending unreviewed range inputs are retained with the local draft, and must be applied before save/export.
5. **Save to CritterDB** through your existing connected tab, or export the creature/full bestiary as JSON.

The creature gets a readable **Critical Range** passive in its Traits. Recognized explicit attacks receive native AttackModel `criton` values in their hidden Avrae YAML; it is not an unsupported `ieffect2` passive. Multiple named attacks, reactions and legendary attacks are covered when they use recognized attack automation. New generated attacks inherit the configured minimum and expose their own editable minimum field.

Hidden shorthand `name|bonus|damage` attacks are converted to explicit automation only in the reviewed change. Original critical values are tracked for removal. Disable the trait and preview/apply again to restore tracked originals; externally changed thresholds are retained with a warning. Unrelated properties and save-only automation remain intact. Save/backups retain recoverable originals through the existing editor workflow.

**Text-only attacks:** their prose remains unchanged. Aina appends `-criton N` when preparing their recognized attack commands. Outside Aina, append that flag yourself, or deliberately configure explicit attack automation. A descriptive trait by itself cannot change Avrae's text-parser defaults. Unrecognized/invalid automation is flagged rather than silently replaced. Review custom granted attacks/button automations separately; a top-level attack's setting is not a blanket modifier on independently executed effect buttons.

The JSON export contains native automation usable without Aina. After updating CritterDB, update a published collection if necessary, then send `!bestiary update` yourself. Existing Avrae combatants may retain old attacks: test with new copies. Aina posting a preview does not execute it.

## Optional players without CritterDB entries

In **Initiative**, use **Players in this fight** to independently include **Sanae, Shuu, Reisen and Byron**. All start excluded in an empty encounter. Selection is stored with that encounter, including saved presets.

- Enter each selected player's actual initiative in the roster. Players participate in local sorting/drag ordering and appear among the target checkboxes in initiative order.
- Use the exact combatant name used in Avrae; the roster name is editable if it differs from the preset name.
- Uncheck a player, or remove their roster row, when they are absent. No CritterDB creature or invented stats are created for them.
- Selecting a player in Combat provides live save/check command preparation and the existing Manage controls. Their character sheet and actions remain in Avrae; Aina does not infer their modifiers or import their character.

**Setup Commands skips player entries.** Each player joins the real encounter using their own active character (`!i join`), then you enter the resulting initiative in Aina. Adding a local player does not join them to Avrae, create a generic replacement, grant character control, or verify live state. Arrange/removal/HP commands address the names you supply and require those combatants to exist in Avrae. Permissions still apply.

## Verification

`npm.cmd test` runs the local unit suite. `npm.cmd run test:critter:critical-party` runs isolated headless Edge checks against a temporary local fixture, with external traffic blocked. It covers preview/apply/export, critical modes/ranges, bonus controls and persistence, optional players, ordering, targeting, player roll commands, and desktop/mobile/dark layouts. It does not use your Brave profile, real Discord credentials, live creature data or a Discord session.

For live verification, use a duplicate creature: export/import a 19–20 native attack, update Avrae and add a fresh copy, then inspect its attack definition and actual rolls. Add only participating players to Aina, have them join Avrae separately, enter their real initiative and verify a prepared target command manually. No live write or Discord test is performed automatically.

Primary references: [official AttackModel `criton` schema](https://avrae.readthedocs.io/en/stable/automation_ref.html#attackmodel), [attack critical handling](https://github.com/avrae/avrae/blob/master/cogs5e/models/automation/effects/attack.py), [native attack serialization](https://github.com/avrae/avrae/blob/master/cogs5e/models/sheet/attack.py), [attack argument defaults](https://github.com/avrae/avrae/blob/master/cogs5e/utils/actionutils.py), [initiative commands](https://github.com/avrae/avrae/blob/master/cogs5e/initiative/cog.py).
