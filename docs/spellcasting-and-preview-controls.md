# Spellcasting, upcasting, resources and preview controls

## Start

Run `npm.cmd start` in the existing Aina project, open **http://127.0.0.1:4317** yourself, then press **Ctrl+F5**. No new browser profile, extension update or sender credential is needed. The existing CritterDB tab/extension connection is unchanged. There are no new production dependencies.

## Fixed scaling error

The error was in the generated automation: Avrae's restricted expression interpreter cannot evaluate a list literal in `choice in [...]`. It was not solved by changing the command's comparison syntax.

The following command is valid. If it produces the exact List error above, changing its arguments will not repair the stored automation:

```text
!i aoo "Seija Kijin" "Reverse Needle Attack" -t "Tewi" -rr 1 -choice 2
```

Its value is extra points/steps, so this example uses 2 extra points and rolls 8d8 initial piercing damage. Bleeding remains 2d8 and its save is DC 16 in the revised Seija file.

Newly generated automation converts/validates the choice before doing anything. Known old Aina numeric-list guards are repaired when you calculate, save or export a draft. That repair changes only the recognized condition scalar, preserving adjacent YAML, field identities and existing formulas. Unrecognized custom conditions are not rewritten. The revised JSON also contains repaired guards. **Updating the website does not update an Avrae creature already imported or added to combat.**

`!i aoo` selects an action from the named encounter combatant's stored attacks; it does not reload the creature from CritterDB on each use. An error quoting `choice == '' or choice in [...]` proves the action being executed still contains the legacy guard, even when Aina's local source has been repaired. See [Avrae's off-turn action implementation](https://github.com/avrae/avrae/blob/master/cogs5e/initiative/cog.py).

To move the correction through the separate copies:

1. In Aina, select Seija and review/save the corrected creature to CritterDB, or manually import [the corrected JSON](../exports/Seija_Kijin_CritterDB_Avrae.json). Update publication if the imported Avrae collection uses a published copy.
2. Run `!bestiary update` using the account with that bestiary active.
3. Verify with a newly added test copy. The existing encounter's Seija can still retain her previous attacks. Preserve her current HP, initiative, effects and resources before replacing an existing combatant; do not remove her merely to test the fix.

Local verification on 2026-10-25 found no legacy List guard in either the running Aina library's Seija or the corrected export. The actual restricted interpreter reproduced the old error and passed 55 corrected expression cases. This does not verify the remote CritterDB, published bestiary or live encounter copies, and no live messages or creature writes were performed by that check.

## Creature DC and spell hit

Open **Edit creature → Spellcasting & resources**. The Abilities view also has **Legendary notes / resources** as a shortcut.

1. Enable **Use shared save DC** and enter the creature's base default, such as 16.
2. Optionally enable **Use shared spell hit** and enter its bonus. Hit defaults can be enabled independently of DC defaults.
3. Click **Preview calculated DCs** or switch to Abilities to calculate the draft. **Save locally** retains it. Then save to CritterDB or export JSON.

The DC setting links recognized saving-throw automation, including nested repeat saves and granted repeat actions, to the chosen base. Known upcast increments remain additional to that base. Other formulas become the chosen flat default; choose **Fixed** to preserve an exceptional formula. This applies to recognized save abilities in this creature, so mark a non-spell exception Fixed if it should retain a separate DC. Temporary live Avrae bonuses remain separate and can still alter the final result.

In an ability, choose **Creature default** or **Fixed / directly edited**. Directly editing a DC/hit field or choosing its own ability formula makes that ability an exception. New generated abilities start from the shared values; an explicitly different generated value becomes Fixed. Unknown fields and unrelated automation stay intact. Matching unambiguous visible DC text is kept consistent; review unusual prose separately.

The exported automation carries actual DC/hit values. The editor configuration is retained in a comment within the existing CritterDB legendary-description field and per-ability comments, with workspace backups as recovery. No unsupported custom CritterDB JSON field is required for Avrae execution. If another editor strips those comments, native automation still has its exported values, but the editor's linking/resource definitions may need restoring from a backup.

## Upcasting

Select a scalable action in Combat. The right panel shows **Upcast · extra points**, or a spell-level selector for an ability explicitly configured for level scaling. It also recognizes known imported native scaling without requiring an Aina recipe.

In **Configure ability → Follow-ups, uses & scaling**, configure the maximum extra steps, extra dice, DC increase and whether the UI selects points or spell levels. For level mode, set the base level and keep base + maximum steps at or below 9. The level selector converts its value into the defined extra-step command argument. It does not cast an unrelated spell or consume character slots automatically. Points and slots are spent explicitly through the appropriate tracker/game workflow.

## Legendary description and resources

**Spellcasting & resources** includes the full editable **Legendary actions description / resource notes**. It preserves the source's use of this field for spell points, DC, hit and inventory, regardless of whether the creature has conventional legendary actions.

Add named resources with a maximum, fixed/half/manual short-rest recovery and optional full long-rest reset. The **Add / update readable resource summary** button updates the application's own summary block while retaining your other notes. Free-form rules are not guessed or executed as resource logic.

In Combat select an actual encounter copy and click **Resources**:

- Counts begin **Unknown**. Set the known remaining amount explicitly.
- Spend, restore and apply rest recovery through the named controls. Copies track independently; counts persist locally. The existing per-ability use tracker shares a pool when its name matches.
- Posting or confirming a command does not automatically spend a resource.
- **Copy Avrae note command** optionally prepares a note containing the recorded counts. Sending that command replaces the combatant's current note. It is a manual snapshot, not synchronized Avrae counter state.

Generic character custom counters are not assumed to work for monster combatants. Seija's revised file defines Spell points (12, short rest +3, long rest full), Evil in the Mirror (5, long rest full with short recovery manual), and the two PB-based pools (3 each, reset manual because the source supplies no recharge). Mirror's ambiguous half-recovery wording remains for your ruling; no fixed short-rest amount is invented.

## Compact panels and source selection

The command appears at the top of the right panel. Targets scroll within a bounded list. Bonus controls collapse when unused, and the post/copy controls remain together. Batch previews show shared instructions once, compact per-command copy buttons and a bounded scrolling list. Mobile panels remain in normal page flow.

Changing **Source creature** in the add form always resets **Combat name** to that new creature's name. Enter its desired alias afterwards. Relinking the source of an already-added roster entry remains separate from explicitly renaming its live encounter name.

## Confirm / Reaction / Cancel

New **Post as Aina** previews have three buttons, restricted to the configured workspace owner:

| Button | Result |
| --- | --- |
| Confirm | Records owner-reported use and removes the preview. Recent posts identifies the owner's confirmation; this is not independent Avrae execution verification. |
| Reaction | Posts exactly `A unit will use their Reaction!` in that preview's channel. Keeps the preview available. It does not execute an action or pause Avrae automatically. |
| Cancel | Removes the preview without marking it used. |

New previews remain when you copy or send the matching command, leaving time to use Reaction and Confirm. A Reaction is announced at most once per preview; ambiguous delivery is never automatically retried, including after restart. Mentions are disabled. An action already processing must finish before another button is used.

Older already-posted previews retain their legacy controls. **Cancel waiting posts** in the website still cancels queued submissions; it is separate from Cancel on a delivered preview. Confirmation/cancellation audit entries are retained locally in `data/critter/preview-events.json`.

## Revised Seija JSON

Use [Seija_Kijin_CritterDB_Avrae.json](../exports/Seija_Kijin_CritterDB_Avrae.json). [The previous adjusted export](../exports/Seija_Kijin_before_update.json) is retained for recovery.

- Base/default DC 16, including Reverse Needle's initial and repeat saves; spell hit +8.
- This Side Down resolves damage and failed-save Prone/movement restriction **immediately on casting**, per the latest requested behavior. No Resolve fall utility remains. Upcasting still adds 2d8 and +1 DC per extra point.
- Prone has a short reminder and Stand up button. The next-turn movement restriction remains separate. Movement and incoming Prone attack modifiers by distance are manual; the outgoing attack disadvantage is automated.
- Reverse Needle damages before the save, links Bleeding to caster concentration and retains the granted repeat action. Start-damage/end-save clicks remain manual. Native duration expiry does not schedule damage.
- Reactive reversals, initiative changes, conditional spell-DC reductions and resource spending remain explicit/manual as previously agreed. No expanded critical range or other new power was added.

Load the revised JSON into Aina, review it, and use the existing CritterDB connection to save the intended creature (or import the JSON manually). Update its published collection if applicable, then send `!bestiary update` yourself. Existing encounter copies can retain old automation: verify with a fresh copy before continuing your game. Merely loading this local file does not update CritterDB or Avrae.

The export can be reproduced from the retained previous adjusted file:

```powershell
node scripts/adjust-seija.js exports/Seija_Kijin_before_update.json
```

## Verification

`npm.cmd test` runs the unit suite. `npm.cmd run test:critter:spellcasting` uses isolated headless Edge and a temporary loopback workspace to verify DC/hit defaults, Fixed exceptions, upcasting, resource isolation/persistence, description editing, exports, source-name reset and compact layouts. Discord controls use fake clients to test authorization, confirmation, cancellation, exact announcements, duplicate clicks and ambiguous delivery/restart behavior. No test authenticates a user account, sends live Discord messages or writes a CritterDB creature.

The reported List error was also reproduced with the actual `draconic.SimpleInterpreter` used by Avrae. The revised Seija models and current compiler output are checked with it and `d20==1.1.2`. This is an expression/dice compatibility check, not the full Avrae runtime or a successful live Discord test. Optional reproduction uses an isolated Python environment with Avrae's public draconic package, d20 and PyYAML; set `AINA_AVRAE_PYTHON` to that interpreter and run `npm.cmd run test:avrae:expressions`. Python is not required to run Aina.

Primary references: [automation schema](https://avrae.readthedocs.io/en/stable/automation_ref.html), [Avrae automation evaluator](https://github.com/avrae/avrae/blob/master/aliasing/evaluators.py), [restricted interpreter](https://github.com/avrae/draconic/blob/master/draconic/interpreter.py), [runtime choice/DC handling](https://github.com/avrae/avrae/blob/master/cogs5e/models/automation/runtime.py).
