# Avrae Combat Traits

This extends the existing local encounter desk and owner-restricted Discord command previews. It does not change any creature until you configure traits, review the proposed utility action, and save locally. Aina has no trusted Avrae combat-state connection: every trait shows **application status unknown**, including after posting a command or dismissing a preview.

Core now provides per-save/skill roll-default checkboxes alongside numerical proficiency modes. Combat uses inherited Normal/Advantage/Disadvantage radio controls. Repeat-save and ongoing-damage effect buttons are described in [the workshop update](workshop-calculations.md); these require clicks at their configured turn boundaries, rather than running automatically when initiative advances.

## Open and configure

From the project directory in PowerShell:

```powershell
npm.cmd install
npm.cmd start
```

Open **http://127.0.0.1:4317** yourself in Brave or your preferred browser. Refresh an already-open page after updating the application. `npm.cmd run critter` runs the same editor without Discord; copying still works. No additional package or sign-in is required for local trait editing. CritterDB sign-in is separate and only needed for its authenticated save/import workflow.

1. Load your CritterDB creature or bestiary in **Library & editor**.
2. Select the creature, then **Combat traits → Add trait**.
3. Enter its existing rule, scope, advantage/disadvantage, and selected abilities/skills. Record a restriction when applicable. Nothing is inferred from your prose or added automatically.
4. **Preview generated automation** shows the old generated action and the full proposed replacement. It appends one utility when there is no previous one. Existing actions and their hidden YAML are preserved.
5. **Save reviewed traits locally** commits the configuration and generated utility together. A durable original/candidate/configuration backup is written under `data/critter/creature-backups`. Failed saves keep the form draft in this browser. **Export trait draft** also works before validation. Refresh/reopen Combat traits to recover a browser draft. Resolve concurrent-change errors before reviewing again.
6. Export the creature or full bestiary JSON, or explicitly save the edited workspace creature through the existing authenticated CritterDB editor at `/advanced`. Update the collection's publication if necessary. Then copy and send `!bestiary update` to Avrae yourself. Bot messages do not execute Avrae commands.
7. Add **new test copies** in **Initiative** and prepare **Setup Commands**. This lists all add-creature commands first, followed by a separate setup for each actual encounter name. Existing Avrae combatants can retain their old action definitions after a bestiary update; do not assume updating the bestiary refreshes them.
8. In **Combat**, select the exact copy. **Combat traits** provides **Prepare setup / replace**, **Prepare effect removal**, and **Inspect combatant effects**. Copy or send each prepared command using the existing remembered destination controls. You still send the copied command to Avrae.

Use **Export workspace backup** to preserve the application configuration. The existing `/advanced` workspace backup import restores it with creature keys and encounters. A creature JSON export contains standard hidden Avrae automation and readable manual instructions, so its supported passives work without Aina. It deliberately contains no custom configuration property that CritterDB must preserve. Reimporting that creature alone preserves the generated action, but cannot reconstruct the original form configuration; restore the workspace backup to edit those settings. The editor refuses to append a second generated utility to such an import.

## Exact scope and activation

| Scope | Generated behavior | Remaining step |
| --- | --- | --- |
| All saves | Explicit six full ability identifiers in `save_adv` / `save_dis`; no death-save claim | Run setup on each combatant |
| Selected saves | Only chosen ability identifiers | Run setup on each combatant |
| Selected skills | Exact camelCase skill identifiers in `check_adv` / `check_dis` | Run setup on each combatant |
| Selected base ability checks | Explicit `adv` / `dis` flags on matching live checks prepared here | Outside Aina, append that flag yourself; no persistent ability-wide effect |
| All checks | Persistent effect for 18 skills plus explicit flags on six base checks | Outside Aina, append the flag to base checks; initiative excluded |
| Any restricted trait | Excluded from the unconditional passive effect | Check the displayed condition for **each matching roll**; outside Aina append the flag only when applicable |
| Initiative | Separate **Initial initiative roll** control in the Initiative add form | `adv` / `dis` appears on `!i madd` before setup; fixed values have no roll modifier |

Base-only checks intentionally do not use `check_adv: [strength]`: Avrae also applies that to Athletics. Dexterity would additionally affect initiative. The official engine cannot express an exact base-only passive scope through these fields. A restriction such as “Strength checks while raging” does not automatically include Athletics in this editor's **base ability checks** scope; configure the corresponding skill too if the actual rule covers it. The interface labels this limitation rather than expanding your mechanics.

Supported base checks: strength, dexterity, constitution, intelligence, wisdom, charisma. Supported skills: acrobatics, animalHandling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleightOfHand, stealth, survival. Initiative is a separate 25th check key in Avrae and is excluded here.

Conditional choices are not saved as persistent effects or preferences. They reset when the selected roll, creature, combatant, or tab changes, and after copying/posting the command. The normal/advantage/disadvantage selector represents an additional command-time source; “Normal” does not suppress an existing passive. Opposing flags are both retained so Avrae can cancel advantage and disadvantage. Automation outside Aina that asks the combatant to save cannot detect prose restrictions: apply the appropriate command/automation option manually.

## Commands and effect identity

For source `Ancient Silver Dragon` with encounter aliases `Dragon1` and `Dragon2`, setup follows this pattern (the application substitutes its full stable ID):

```text
!i madd "Ancient Silver Dragon" -name "Dragon1" adv
!i madd "Ancient Silver Dragon" -name "Dragon2"
!i aoo "Dragon1" "Aina Setup Traits <id>"
!i aoo "Dragon2" "Aina Setup Traits <id>"
!i os "Dragon1" dex
!i oc "Dragon1" perception
!i re "Dragon1" "Aina Combat Traits <id>"
```

The generated action contains `_v: 2`, a `target: self` node, and `ieffect2` with a stable unique effect name and `stacking: false`. It has no concentration, limited-use counter, action cost, attacks, damage or resources. Repeating setup replaces the same named Aina effect **on that combatant only**. Removal always supplies its full effect name, never a command that removes all effects. If Avrae proposes a differently named effect or combatant, cancel. Do not attach unrelated child effects to Aina's effect: Avrae removes children when replacing/removing their parent. Removing every configuration row still generates an empty replacement effect, permitting old passives to be cleared; the explicit removal command is also available.

The Combat save/check panels default to `!i os` and `!i oc`. Official Avrae handlers retrieve the named live combatant and use its effects in `run_save` / `run_check`. **Source lookup** remains available as `!ms` / `!mc`, using the original bestiary name, and explicitly ignores encounter effect state. Library rolls use source lookup. No applied/verified badge is inferred from these commands or from Discord message delivery.

## Other mechanics audit

“Manual” below means this feature does not generate or enforce it. Existing authored automation remains editable/exportable, and supported Avrae nodes can still execute it. No new powers or resource semantics are generated by this audit.

| Area | Current application support | Avrae capability / remaining work |
| --- | --- | --- |
| Attack advantage/disadvantage and critical damage | Partial: per-command roll control and Normal/Crit/No crit selector | Passive `attack_advantage` exists; no trait form generation for it. Crit/nocrit use command flags and do not alter creature data |
| Attack/damage bonuses | Partial: To-hit bonus and Bonus damage controls generate additive `-b` / `-d` command flags; existing base to-hit/damage editing stays separate | Passive `to_hit_bonus`, `damage_bonus` exist; temporary trait bonuses not generated; do not add a temporary bonus to base stats too |
| Save/check bonuses | Manual | `save_bonus`, `check_bonus` exist; this feature generates only advantage/disadvantage |
| AC/max HP bonuses | Manual temporary effects; existing base overrides remain separate | `ac_value`, `ac_bonus`, `max_hp_value`, `max_hp_bonus` exist; no temporary modifier editor added |
| DC bonuses | Manual | `dc_bonus` exists; structured editing of an existing action's base DC is distinct |
| Temporary resistance/immunity/vulnerability | Manual | Passive resistance lists exist; base creature data is preserved and never rewritten by traits |
| Conditions and mechanical consequences | Manual / existing authored automation | A condition label or descriptive paragraph alone is not proof that attack/save/check, movement or incapacitation consequences are enforced; individual consequences require explicit effects/automation and table adjudication |
| Durations and concentration | Manual / existing authored automation | `ieffect2` supports durations, tick timing, concentration and parenting. Generated unconditional setup has no expiry or concentration; restricted traits use roll choices instead |
| Repeat saving throws | Manual / existing authored automation | Can be authored with supported automation/button effects. This feature does not infer end/start-of-turn saves from prose |
| Recharge | Manual tracking unless existing automation explicitly implements it | A “Recharge” label does not enforce availability |
| Legendary actions/reactions | Partial: existing sections and per-combatant action command selection | Command generation does not spend or reset an action budget, enforce timing, or limit reactions |
| Limited-use resources | Manual / existing authored combatant-specific automation | No character custom counters are assumed to exist on monster combatants; no new counters generated |

Schema and implementation references, checked 2026-10-23:

- [Official automation reference](https://avrae.readthedocs.io/en/stable/automation_ref.html#ieffect): `ieffect2`, targeting, passive fields, stacking, duration, concentration, interactions.
- [Official passive parser](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/effects/passive.py): save/check identifier matching, **both** fields' `all` shortcuts. Check `all` expands to every `SKILL_NAMES` key, including initiative; this implementation does not use it.
- [Official constants](https://github.com/avrae/avrae/blob/nightly/utils/constants.py): 25 check keys, skill-to-ability mapping, six saves.
- [Check effect handler](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/utils.py) and [save/check execution](https://github.com/avrae/avrae/blob/nightly/cogs5e/utils/checkutils.py): base-ability check effects broaden to related skills; live combatants read passive effects.
- [Initiative commands](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/cog.py): `madd` initial roll flags, `aoo`, `os`, `oc`, named effect removal. [Combatant effect replacement](https://github.com/avrae/avrae/blob/nightly/cogs5e/initiative/combatant.py).
- [CritterDB hidden-block importer](https://github.com/avrae/avrae/blob/nightly/cogs5e/models/homebrew/bestiary.py), [pinned dependencies](https://github.com/avrae/avrae/blob/nightly/requirements.txt), and [automation-common v4.4.0 schema](https://github.com/avrae/automation-common/blob/v4.4.0/automation_common/validation/models.py). Export validation includes the required `_v: 2` action field.

## Verification status and live checklist

Passed locally: selected saves/skills, disadvantage, exact identifiers, all-check coverage, conditional exclusions, per-copy command generation, removal/replacement generation, existing YAML/stat/unknown-field preservation, JSON round trips, failed-save recovery, concurrent-edit rejection, durable originals, and browser UI integration. Existing desk tests also pass.

The generated populated and empty actions pass the **official automation-common 4.4.0 AttackModel validator with pydantic 1.10.19** in an isolated Python environment. `scripts/verify-avrae-traits.py` also exercises extracted official save/check, passive parser, Skill dice-expression, argument cancellation, and combatant effect replacement functions against minimal local context adapters. This verifies the source code paths and resulting dice expressions; it does not run a deployed Avrae bot.

**Not performed:** a real authenticated CritterDB import/save of the generated traits, or actual Discord/Avrae execution. No real creature was modified and no live test messages were posted for this feature. Deployment/version differences still require the following test in your own disposable encounter:

1. Duplicate a creature. Configure Dexterity-save advantage, Perception advantage, Wisdom-save disadvantage, and a conditional spell-save trait. Export/update CritterDB/publication and manually send `!bestiary update`.
2. Start a disposable encounter. Add two differently named copies using Setup Commands, then run setup **only on Copy1**. Check `!i status "Copy1"` and `"Copy2"` as DM/controller to inspect the exact named effect.
3. Run `!i os "Copy1" dex`, `!i oc "Copy1" perception`, and `!i os "Copy1" wis`. Expect `2d20kh1`, `2d20kh1`, and `2d20kl1`, respectively, assuming no other sources. The equivalent Copy2 rolls should stay normal. Inspect the dice expression, not whether the random result happens to be high.
4. Run setup twice on Copy1. Check there is exactly one Aina effect, with unrelated effects intact. Remove it using the prepared named command. Verify rolls return to the original behavior. Reapply and check again. Then setup Copy2 separately.
5. Test the conditional trait on an otherwise unmodified save: without choosing “Against spells,” the preview has no extra flag; with the choice it does. Send both commands and inspect results. Check an unrelated skill never receives the condition. Test both scopes of an all-check trait and initial initiative advantage separately.
6. Compare the exported original hidden YAML and unrelated data with the source backup. Restore the test configuration from a workspace backup. Interrupt the local connection during a trait save and reopen the draft; refresh/review any conflict before retrying.

These Discord steps require you to send the commands to Avrae. Aina posting a command, or you clicking its ✅ dismiss control, cannot establish successful application.

Local checks:

```powershell
npm.cmd test
npm.cmd run test:critter:traits
npm.cmd run test:critter:desk
```

The optional official-source harness is for development only. Supply the referenced source files in a directory and the fixtures produced by `test:critter:traits`; it does not fetch or execute remote code automatically:

```powershell
<isolated-python> scripts/verify-avrae-traits.py <official-source-directory> "$env:TEMP/aina-traits-generated-actions.json"
```
