# Custom abilities, effect buttons and follow-ups

The revised Seija export now resolves This Side Down immediately, as requested. Shared DCs, explicit upcasting and creature resources are documented in [the current update guide](spellcasting-and-preview-controls.md).

These controls extend the existing editor. They do not change imported creatures automatically. Your live CritterDB creatures are not changed automatically; an updated Seija JSON is provided separately for review.

## Open and edit an ability

1. Run `npm.cmd start`, open **http://127.0.0.1:4317** in your existing browser, and refresh with **Ctrl+F5** after an update.
2. In **Library & editor**, load/select the creature, choose **Edit creature → Abilities**, then select its action, reaction, legendary action or trait.
3. Click **Configure ability**. Generated abilities reopen their configuration. For other abilities the builder starts from their name/readable rules, without guessing their automation.
4. Click **Preview**, compare the existing and proposed source, then accept the replacement. Cancel leaves the original unchanged.
5. Save locally. Use **Save to CritterDB** through your connected existing CritterDB tab, or export the creature/full bestiary as JSON. Saving locally alone does not update CritterDB or Avrae.

Only the selected entry's name/description are replaced. Unknown entry properties, other entries, creature ID and unrelated fields are retained. Formula links for the replaced entry are cleared so an old formula cannot rewrite its new automation. The source editor remains available.

## Separate conditions and clickable endings

Enable a temporary effect. Use **Add separate effect** to configure up to six named effects with independent passive modifiers, durations, damage/save buttons and ending buttons.

For Prone, select its condition reminder, then **Use “Stand up” button**. Configure its required cost/rule explicitly. The Avrae effect button removes only that named effect and its configured modifiers. It does not spend movement, an action or a reaction. A condition label alone does not implement all its mechanics; configure supported passives and record the remaining rules.

Keep Prone and Bleeding separate when standing should remove only Prone. Another effect can have a **Mark used** button for an “until used” ending. No automatic trigger detection is claimed.

For ongoing damage/repeat saves, choose dice, damage type, save ability/DC, timing and removal rule per effect. **Start/End of turn** labels tell the player when to click. Buttons do not fire automatically on initiative advancement. If damage and a save share a timing, click in the order required by the ability. Duration expiry timing and **tick on caster's turn** only control the duration clock.

Buttons appear on Avrae's applied encounter effects after importing the updated creature and actually executing its ability. These are Avrae interaction buttons, not Discord emoji reactions attached by Aina.

## Damage order, scaling and concentration

- Saving-throw abilities can deal damage **before the save**, with the save controlling only effects, or use the damage-after-save / half-on-success flow. Before-save damage is dealt once regardless of the save result.
- **Follow-ups, uses & scaling** configures extra dice and DC per extra step. Choose the extra steps in Combat; the command contains `-choice N`. N is extra steps, not total spell-point cost. Base cost plus steps is suggested in the local use tracker and must be spent explicitly.
- Numeric scaling and selectable damage types share Avrae's `-choice` argument and cannot be combined in one generated ability. Scaling damage requires one explicit damage component.
- Target concentration effects use a concentration anchor on the caster. Ending it removes linked child effects. Reapplying the same generated concentration ability replaces its anchor. It does not accumulate targets across repeated casts while retaining one original concentration; that rule needs a separately reviewed custom workflow. Independent non-concentration effects remain separate.

## Explicit follow-ups after a roll

In the builder, open **Follow-ups, uses & scaling** and record the operation, restriction and rules. In **Combat**, select the ability and click **Follow-up / uses**.

- **Adjust a recorded total:** enter the original total, signed adjustment and optional DC/AC. The panel evaluates the result locally. Natural 1/20 or automatic results require a DM decision.
- **Reverse a recorded outcome:** explicitly select the old success/failure. This records the opposite result; it does not edit the original Discord roll.
- **Reroll a live save/check:** choose an initiative combatant, ability/skill, roll mode, optional adjustment and DC. This prepares `!i os` / `!i oc` using its encounter state.
- **Reroll an attack die only:** enter the total to-hit modifier. This prepares a plain dice roll, avoiding a second attack/damage application. Include relevant live bonuses yourself.
- **Roll extra dice:** explicitly roll when the original ability's trigger/cap permits. There is no automatic exploding-die chain or damage application.
- **Swap initiative:** choose two roster combatants, verify actual values and eligibility/range/CR restrictions, then confirm. Two relative `!i opt ... -p` commands are prepared. Changing either target/value clears confirmation. Avrae may reject moving the current combatant. This is not atomic: check the first result before executing the second. Update Aina's local roster to match afterwards.

Amanojaku Nature can have an explicit disadvantaged attack-die reroll; Evil in the Mirror can evaluate its stated subtraction; Overturning All Under Heaven can record an outcome reversal. These do not intercept Avrae, undo damage/conditions, refund resources, decide timing eligibility or override DM rulings. No default mechanic is added to creatures.

**Post as Aina** delivers a copyable preview through the existing official bot. You copy/send it to invoke Avrae. Recorded-total/outcome reports have Copy only. Posting does not mean execution; Avrae application status remains unknown.

## Local use trackers

Configure a named pool, fixed/PB/ability-modifier maximum, minimum maximum, cost, and manual/turn/rest reset rule. Short-rest recovery can be fixed or half the maximum rounded up.

The tracker starts **not initialized**. Select the actual encounter copy and enter its known remaining uses. Spend/reset/recover only through explicit buttons. Copies have separate counts; abilities with the same pool name share that copy's pool. Keep maximum/reset settings consistent for shared pools. These are persistent local records, not Avrae custom counters. Posting, advancing initiative or resting elsewhere does not update them. Failed abilities do not refund uses automatically.

## Preservation and portable output

Generated automation uses standard hidden `<avrae hidden>` YAML and can execute without Aina. An HTML comment stores an optional editor recipe, including follow-up/tracker settings; runtime automation does not depend on custom CritterDB JSON fields or that comment. Workspace backups and JSON exports retain the configuration.

If an external editor strips the comment or source changes invalidate it, Aina does not apply stale settings. Configure ability falls back to explicit replacement review. Keep workspace backups for full editor configuration recovery. Direct CritterDB saves retain existing backup, conflict and reload-verification checks.

## Verification and your live checklist

Local tests cover generated structures, YAML/JSON round trips, independent removal, concentration ownership, damage order, scaling, follow-ups, initiative deltas and resource arithmetic. The isolated headless UI fixture covers review/cancel/export, multiple copies, persistence, mocked posting, and desktop/mobile layout with external requests blocked. **These are not authenticated Discord/Avrae or CritterDB write tests.** No live creature was modified or test command sent.

For your own end-to-end check, use a duplicate creature:

1. Configure separate Prone/Stand up and Bleeding effects. Review/save/export; confirm unrelated entries and hidden automation remain.
2. Import/save the duplicate in CritterDB. Update its published collection if needed, then send `!bestiary update` yourself. Existing encounter copies may retain old data; use fresh test copies.
3. Add two copies in Avrae and execute the updated ability. Confirm effects appear on the intended target.
4. Click Stand up. Confirm only Prone and its configured modifiers disappear; resolve the recorded movement cost manually.
5. At the configured timing, click Bleeding damage/save buttons. Check damage/type and successful removal of only Bleeding.
6. Check concentration ending and repeated application against the stated recast limitation.
7. Test a live save/check follow-up and inspect Avrae's actual result. Resolve special outcomes and previously applied consequences manually.
8. Initialize different local counts for both copies, spend one, reload Aina, and verify independence. This verifies local persistence only.

References: [official automation schema](https://avrae.readthedocs.io/en/stable/automation_ref.html), [effect implementation](https://github.com/avrae/avrae/blob/master/cogs5e/models/automation/effects/ieffect.py), [live checks/saves](https://github.com/avrae/avrae/blob/master/cogs5e/utils/checkutils.py), [initiative commands](https://github.com/avrae/avrae/blob/master/cogs5e/initiative/cog.py).
