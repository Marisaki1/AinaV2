# CritterDB and Avrae creature authoring standard

Maintained for Aina. Last reviewed: **2026-10-26**.

Use this document for every future creature creation or revision. Its purpose is
to produce an editable CritterDB creature with usable native Avrae automation,
while preserving the user's mechanics. It is a project convention and checklist,
not a claim that every possible rule can be automated.

This is the **single canonical creature-authoring guide**. Deliver creature data
as JSON. Do not create a Markdown stat block, per-creature guide, or receipt
unless the user explicitly asks for one. Existing application setup documents
are not additional creature-authoring standards. This document contains the
required workflow and checks; they must not depend on reading a creature guide.

The corrected [Seija export](../exports/Seija_Kijin_CritterDB_Avrae.json) is the
reference for structure, explicit manual fallbacks, concentration links, and
working restricted expressions. Her DC 16, spell points, damage, powers, and
timing are specific to Seija; never copy them into another creature by default.

## Contents

1. [Required workflow](#1-required-workflow)
2. [File shapes and identity](#2-file-shapes-and-identity)
3. [Stats and calculations](#3-stats-and-calculations)
4. [Readable rules and hidden automation](#4-readable-rules-and-hidden-automation)
5. [Executable action patterns](#5-executable-action-patterns)
6. [Choices and upcasting](#6-choices-and-upcasting)
7. [Effects, conditions, and follow-up buttons](#7-effects-conditions-and-follow-up-buttons)
8. [Passive traits and roll defaults](#8-passive-traits-and-roll-defaults)
9. [Critical hits and command modifiers](#9-critical-hits-and-command-modifiers)
10. [Spellcasting and resources](#10-spellcasting-and-resources)
11. [Preservation and export](#11-preservation-and-export)
12. [Validation and delivery](#12-validation-and-delivery)
13. [Updating the copy Avrae actually uses](#13-updating-the-copy-avrae-actually-uses)
14. [Implementation map and references](#14-implementation-map-and-references)

## 1. Required workflow

Before generating JSON:

1. Read the supplied creature/export and the user's latest corrections. Record
   source filename, creature ID, bestiary ID, and the sections being changed.
2. **Ask focused follow-up questions before implementing the creature.** Bundle
   only unresolved details. Ask about missing save abilities, success/failure
   results, activation/cost, scope, stacking, timing clocks, source identity and
   desired output when these affect the implementation. Do not ask the user to
   repeat answers already given. Do not silently select mechanics or substitute
   a manual reminder for an ability the user expects to function.
3. Extract a rules contract for each ability: activation, cost, range/area,
   targets, attack/save/check, damage order, types, success/failure outcomes,
   duration, concentration, stacking, ending rules, and resource recovery.
4. Wait for answers before implementing dependent mechanics. Read-only research,
   source inspection, backups and guide maintenance can continue. Never treat
   elapsed time as approval. Apply later corrections to the current rules
   contract; do not keep an older timing rule after it has been changed.
5. Classify each component as **native automation**, **explicit click/command**,
   or **manual rule**. A supported damage roll does not make its spatial trigger,
   timing, or resource spending automatic. If a requested automatic mechanic is
   unsupported, explain the exact gap and ask before adopting a different
   workflow. Preserve a rule while discussing it, rather than shipping missing
   automation as completed work.
6. Prepare a recoverable original and a candidate. Change the smallest necessary
   part. Review both readable rules and executable automation.
7. Validate using section 12. Deliver the requested format and the actual update
   steps in section 13. State which tests really ran.

For a brand-new creature, establish missing base mechanics with the user. A
request to automate an existing creature is not permission to add abilities.
Examples below demonstrate encoding only; they do not grant these rules to a
user's creature.

### Questions to resolve before implementation

| Topic | Concrete question when unresolved |
| --- | --- |
| Identity | Is this an update to the supplied record, or a new creature using it as a template? Do not silently remove or reuse database IDs. |
| Activation | What activates this ability, and does it cost an action, bonus action, reaction, resource, or nothing? |
| Targeting | Self, allies, enemies, or every creature? What range, area and exceptions apply? |
| Saving throw | Which ability/DC? What happens on failure and on success? |
| Timing | Whose start/end of turn, and current versus next turn? Does this correction apply to this ability, all blessings, or every power? |
| Conditions | Which standard condition, and any explicitly modified consequences? Which installed condition implementation is available, if the user refers to one? |
| Recurrence | Does the target repeat a save? When? Does success end only this effect? Is the total duration measured from the initial application? |
| Damage | Dice, type, bonus, before/after save, half on success, shared versus per-target roll? |
| Stacking | Can different sources coexist, replace, refresh or extend? What must survive removal? |
| Interface | Keep the original command name, or is an explicitly named boosted variant acceptable? Never silently rename an attack to work around a limitation. |

The user does not need to answer every row for every creature. Ask only the
questions the supplied data and existing conversation do not already settle.

## 2. File shapes and identity

### Single-creature JSON

The portable creature is an object with `name`, `flavor`, and `stats`. A minimal
starting shape accepted by Aina is below. These are illustrative placeholder
stats, not a completed or balanced creature. Fill them from the user's rules.

```json
{
  "name": "Example creature",
  "flavor": {
    "faction": "",
    "environment": "",
    "description": "",
    "nameIsProper": false,
    "imageUrl": ""
  },
  "stats": {
    "size": "Medium",
    "race": "",
    "alignment": "",
    "armorType": "",
    "armorClass": 10,
    "numHitDie": 1,
    "hitDieSize": 8,
    "speed": "30 ft.",
    "abilityScores": {
      "strength": 10,
      "dexterity": 10,
      "constitution": 10,
      "intelligence": 10,
      "wisdom": 10,
      "charisma": 10
    },
    "proficiencyBonus": 2,
    "savingThrows": [],
    "skills": [],
    "damageVulnerabilities": [],
    "damageResistances": [],
    "damageImmunities": [],
    "conditionImmunities": [],
    "senses": [],
    "languages": [],
    "challengeRating": 0,
    "experiencePoints": 0,
    "additionalAbilities": [],
    "actions": [],
    "reactions": [],
    "legendaryActions": [],
    "legendaryActionsPerRound": 0,
    "legendaryActionsDescription": ""
  }
}
```

Keep numeric stats as numbers and flags as booleans. Empty collections are `[]`,
not strings. `speed`, senses, languages, armor labels, and descriptions retain
their source text. Do not create a custom top-level `automation` property and
expect CritterDB or Avrae to execute it.

### Bestiary JSON and workspace backups

Aina recognizes a bestiary by its `creatures` array. A minimal empty envelope is:

```json
{
  "name": "Example bestiary",
  "description": "",
  "creatures": []
}
```

Place complete creature objects in that array. When editing an actual bestiary,
retain its entire original envelope, metadata, membership, and creature order;
the minimal example is not a substitute for its schema or permissions. Prefer
the editor's bestiary export rather than manually rebuilding the envelope.

An **Aina workspace backup** (`format: "aina-critter-workspace"`) is a different
file. It holds documents, local encounter aliases, UI settings, calculation
links, and trait configuration. Keep it as an additional backup; do not label it
a CritterDB creature/bestiary export or import it into CritterDB.

### Identity rules

| Operation | Required handling |
| --- | --- |
| Edit an existing creature | Preserve `_id`, `bestiaryId`, `__v` and all other existing identity/collection fields; let the authenticated service manage its revision on save. |
| Duplicate or create a new creature | Do not reuse the original's `_id`, `id`, `bestiaryId`, `publishedBestiaryId`, or `__v` as the new identity. Use the editor's duplicate/new flow. |
| Direct update | Use the authenticated account's existing authorized creature and the reviewed save flow. Possessing an edit URL is not authorization. |
| New remote creature | The current direct-save flow updates an existing creature; create/import the new record in CritterDB before binding it for direct updates. |
| Encounter copy | Keep source creature name/ID separate from its encounter alias. Never rename the bestiary source just to target a copy. |

**Existing-creature edits preserve identity by default.** A different name or
an authoring script is not authorization to strip database fields. Removing IDs
requires an explicit new/duplicate request. The Reiko generator follows this
rule; its `--new` option is only for an explicitly requested new copy.

Before delivering an update, compare `_id`, `id`, `bestiaryId`,
`publishedBestiaryId`, `__v`, sharing and other original root metadata against
the latest supplied export. Test the result against the editor/remote identity
guard. Keep the latest user-edited stats, not an older template's scores.
Updating existing generated abilities must replace those entries in place,
preserving unknown entry properties and order; rerunning a generator must not
append duplicate blessings/actions. Never bypass the guard to make a mismatched
file save, and never silently assign another library creature's ID.

## 3. Stats and calculations

Use these formulas only where the source rule calls for them:

| Quantity | Calculation / preservation rule |
| --- | --- |
| Ability modifier | `floor((score - 10) / 2)`; floor negative values too. |
| Proficient save/skill | Ability modifier + proficiency bonus. |
| Half proficiency | Ability modifier + `floor(PB / 2)`, when that is the actual rule; no double addition with proficiency. |
| Expertise | Ability modifier + `2 * PB`, only if explicitly granted. |
| Average HP | `floor(numberOfDice * (dieSize + 1) / 2) + numberOfDice * CON modifier`, subject to any explicit source exceptions. |
| Formula-based attack/DC | Usually ability modifier + PB for hit and `8 + ability modifier + PB` for DC; use only the designated ability/formula. |
| Fixed/custom attack/DC | Preserve the specified value instead of forcing a formula. Seija's default DC is explicitly 16. |
| AC | Aina defaults to base + DEX. On import, derive a base that retains the current AC, then recalculate from that base when DEX changes. Honor selected capped-DEX/no-DEX formulas and explicit exceptions. |

Saving throw entries use full lowercase abilities, e.g.
`{"ability":"dexterity","proficient":true,"value":4}`. Skill entries use
CritterDB display names, e.g.
`{"name":"Sleight of Hand","proficient":true,"value":4}`.
`value` is a total modifier, not an extra bonus to add again. Preserve imported
explicit totals and verify their interpretation after import. For half
proficiency or expertise, keep the calculation configuration in the workspace
and export the actual compatible numerical result; do not invent an importer
field such as `halfProficient` and rely on it surviving.

Do not change an imported total merely because a guessed formula disagrees.
Report a mismatch and apply only the requested calculation link/correction.
Likewise, keep a source's printed average when preservation is requested and
identify a discrepancy with its dice instead of silently changing mechanics.

The stat-block preview must show the resulting saves, skills, AC, HP, defenses,
and rules. Advantage/disadvantage belongs to roll rules/effects, not the numeric
modifier. Keep temporary AC/hit/damage/DC bonuses out of base stats.

## 4. Readable rules and hidden automation

CritterDB stores abilities as ordered arrays of `{name, description}` objects:

| Section | CritterDB key |
| --- | --- |
| Passive traits / other abilities | `stats.additionalAbilities` |
| Actions | `stats.actions` |
| Reactions | `stats.reactions` |
| Legendary actions | `stats.legendaryActions` |
| Legendary overview / resource notes | `stats.legendaryActionsDescription` |

Preserve any extra entry properties. Do not move an imported ability solely
because its existing section is unconventional: Seija's source stores some
spell-point abilities in legendary actions despite their printed action type.
Keep her activation rules explicit rather than inventing legendary costs.

The description contains readable text/HTML followed by an Avrae payload:

```html
<p>Readable rules, including exact activation, damage, and ending conditions.</p>
<avrae hidden>
_v: 2
name: Stable command name
automation:
  - type: text
    text: Read and resolve the stated rule manually.
</avrae>
```

The block content is YAML; JSON is also valid YAML and is used in Seija's
export. Each normal block should contain one unambiguous `_v: 2` action object
with `name` and an `automation` node array. Do not wrap it in Markdown fences
inside the actual description. Some existing exports contain multiple action
objects/blocks: preserve them and validate every payload rather than flattening
or deleting them.

The hidden `name` is the Avrae command name. It can be shorter than a decorative
CritterDB heading with spell names/costs, but it must be unique enough to select
reliably. Quote names containing spaces in prepared commands.

### Reminders are not executable actions

For this project, **Multiattack and Extra Attack are readable attack-count
reminders**, even when the source presents Multiattack in its Actions section.
Keep their original rule text and section, with no hidden attack sequence,
roll macro, automatic target distribution, resource consumption or command.
The user chooses and performs the individual weapon attacks. Do not bundle
them into a Multiattack button or infer a repeat count from the reminder.

Apply the same rule to other reminder-only passives. Unarmored Defense,
equipment restrictions, trigger descriptions and usage rules need readable
text, not a hidden `text` action that merely repeats it. Distinguish these from
activated features such as Rage, whose explicitly requested native effect
actually changes the combatant. A passive with supported numerical mechanics
may affect the relevant existing attack/save/check without becoming a separate
in-game activation or attack macro.

The interface must let the user read reminders without preparing a sendable
command or showing irrelevant attack modifiers. A reminder's presence in an
Actions list is not evidence that it should be executable. Authoring checks
must verify that reminder-only entries contain no unintended automation.

For class-level NPCs, confirm the rules edition, subclass, equipment, attack
count and spell/feature choices before assigning level-based mechanics. A
character's level is not its challenge rating; do not set CR to 15 merely
because its class level is 15. Do not silently replace an explicitly requested
homebrew attack count with the class table, or vice versa.

### Naming and readable output

- Preserve the user's creature and ability names. Do not insert app branding,
  "AI-generated", "integration utility", debug labels, explanatory essays or
  renamed versions of standard conditions into readable stat-block rules.
- Use the standard visible condition names **Charmed**, **Incapacitated**,
  **Paralyzed**, **Prone**, etc. Identify the source in a brief description or
  verified source linkage when needed, rather than inventing a new condition.
- Use neutral internal identifiers such as `damage`, `steps` and `extraDice`.
  A damage `roll` must have `displayName: Damage` (or the proper damage label)
  so a variable name does not become a visible roll heading.
- Internal identifiers are code, not abilities. They must not appear in
  readable rules, action names or normal chat output. `ainaDamage` was an
  internal roll variable, not a game concept; do not reproduce it in new output.
- Keep resource/DM instructions outside the stat block in a concise chat note.
  Hidden `text` nodes can also leak into chat; remove debug/implementation prose
  there as well. Readable descriptions should contain the actual game rule.
- Editor metadata may remain hidden in its supported comments. Do not expose
  its markers, fingerprints or configuration values as visible creature rules.

When generating outer JSON, serialize the description string with a JSON
serializer. Preserve actual newlines/valid escapes; do not hand-concatenate
unescaped quotes, HTML, YAML, or backslashes.

Readable prose and automation must agree on damage order, DC, duration, and
cost. A `text` node explains a rule; it does not apply that rule mechanically.
Prefer explicit hidden automation over relying on Avrae's prose parser for
complex or nonstandard abilities. Avoid duplicate executable copies of the same
ability and preserve action ordering.

## 5. Executable action patterns

These complete hidden-payload examples use the existing project's node shapes.
Numbers are examples only. Put the payload inside `<avrae hidden>...</avrae>`
in the appropriate ability description, and supply matching readable rules.

### Attack roll followed by damage on hit

```yaml
_v: 2
name: Example Strike
automation:
  - type: target
    target: each
    effects:
      - type: attack
        attackBonus: "5"
        hit:
          - type: damage
            damage: (1d6+3)[piercing]
        miss: []
```

### Saving throw, shared damage roll, half on success

```yaml
_v: 2
name: Example Burst
automation:
  - type: roll
    dice: (4d8)[bludgeoning]
    name: damage
    displayName: Damage
  - type: target
    target: each
    effects:
      - type: save
        stat: str
        dc: "16"
        fail:
          - type: damage
            damage: "{damage}"
            fixedValue: true
        success:
          - type: damage
            damage: "({damage})/2"
            fixedValue: true
```

`target: each` acts on selected `-t` targets; `target: self` acts on the caster.
Use the six short save identifiers `str`, `dex`, `con`, `int`, `wis`, `cha` in
these generated save nodes. Damage, saves, attacks and initiative effects
belong within a target context. A top-level shared `roll` can feed all selected
targets when the rule calls for one area-damage roll.

For **damage before a save**, put the damage node before the save inside the
target; let the save branch control the debuff only. Reverse Needle does this.
Do not accidentally make its initial damage contingent on failing the save or
deal the same damage a second time in `fail`.

For half damage, reuse the same rolled damage and halve it; do not reroll on
success. This project's compiled save pattern uses `fixedValue: true` on the
application of a stored roll to prevent adding command bonuses twice. Decide
where bonuses belong when adapting this pattern to another rule.

### Typed damage and dice

Use the selectable standard types:

```text
acid, bludgeoning, cold, fire, force, lightning, necrotic,
piercing, poison, psychic, radiant, slashing, thunder
```

Mixed damage is separate annotated components, such as
`(1d6+3)[piercing]+(1d4)[fire]`. A choice of one type is different from dealing
all types at once. For Sorcerous Burst-like behavior, preserve the actual
selection and extra-die rules; do not grant every listed type simultaneously.

The builder supports positive custom die sizes such as `1d2`, `2d17`, or `6dX`
after replacing `X` with the chosen positive integer. Validate the concrete dice
with Avrae's `d20` parser. Reject zero-sided dice and unresolved placeholders.
Use a `roll` node for an arbitrary die roll; this alone does not cause damage.

## 6. Choices and upcasting

**Automation conditions use a restricted evaluator, not general Python or full
alias scripting.** A valid JSON/YAML array is fine as structural data; a list
literal inside an evaluated condition is not supported by the interpreter used
in the reproduced Seija failure.

Never generate this known-broken expression:

```text
choice == '' or choice in ["0", "1", "2"]
```

For literal allowed values, use scalar comparisons:

```text
choice == '' or choice == "0" or choice == "1" or choice == "2"
```

For new numeric scaling, prefer the existing `choiceGuard` compiler. Its
validated input stage is:

```yaml
_v: 2
name: Example Numeric Choice
automation:
  - type: variable
    name: ainaSteps
    value: choice or 0
    onError: -1
  - type: condition
    condition: ainaSteps >= 0 and ainaSteps <= 10
    onTrue:
      - type: text
        text: "Selected {ainaSteps} extra steps."
    onFalse:
      - type: text
        text: Choose an integer from 0 through 10.
    errorBehaviour: raise
```

Put **all costs, effects, damage and concentration changes** inside the valid
branch. Missing choice is zero; malformed/out-of-range input must not partially
apply the ability. Runtime conversion/evaluation must be tested, not inferred
from YAML validity. Restrict further if the particular ability has a smaller
allowed range.

Use a variable such as `ainaExtraDice = 2*ainaSteps` and interpolate it into a
dice string such as `(4d8+{ainaExtraDice}d8)[piercing]`. Do not pass algebraic die
counts like `(4+2*choice)d8` directly to the dice parser. For choice-of-type,
compare allowed strings explicitly before inserting `{choice}` as a damage type.

Aina's point/level selectors currently prepare `-choice N`. A level selector
converts the selected level into extra steps above the configured base level;
it does not consume spell slots. The current compiler uses the same `choice`
argument for numeric scaling and damage-type selection and refuses to combine
the two. Do not claim it supports both together without a separately verified
encoding and matching interface.

True spell-casting slot scaling and a custom spell-point attack are different
workflows. Do not substitute native casting or `-l` for an unverified custom
action. Do not increase DC on upcast unless the supplied rule explicitly does.

The current official model limits each `IntExpression` to **255 characters**.
Long scalar whitelists must be split into short nested conditions; a valid
YAML string can still exceed the native model's limit. For exact integer choices,
whitelist the accepted strings before converting them. Reject fractional,
arithmetic, malformed and out-of-range input before changing HP or effects.
Missing input needs an explicit documented default. Single-recipient healing
must reject multiple selected targets so one resource expenditure is not
silently applied to several creatures.

A command like `!i aoo "Seija Kijin" "Reverse Needle Attack" -t "Tewi" -choice 2`
is valid. An error that quotes the old List expression is a stored-automation
problem. Do not blame command syntax or ask the user to cycle through `=`, `==`,
or brackets to repair the automation.

## 7. Effects, conditions, and follow-up buttons

Use the project's `ieffect2` builder for live combatant passives, duration,
concentration, buttons and granted follow-up attacks. The following complete
payload is a fixture for a temporary self ward, not a new suggested ability:

```yaml
_v: 2
name: Example Ward
automation:
  - type: target
    target: self
    effects:
      - type: ieffect2
        name: Example Ward
        duration: 3
        end: false
        stacking: false
        effects:
          resistances: [cold]
        desc: Cold resistance for the stated duration.
        buttons:
          - label: End ward
            automation:
              - type: remove_ieffect
```

An effect name such as **Prone**, **Bleeding**, **Poisoned**, or **Stunned** does
not automatically implement every consequence. Configure each supported
passive explicitly and state the remaining rules. Bleeding is a custom named
effect: derive all damage, type, timing, duration and ending rules from that
ability; never invent universal Bleeding mechanics.

### Reuse standard conditions first

Before authoring a condition, inspect the actual current Avrae implementation
and any relevant installed condition alias/preset that the user identifies.
Reuse a verified condition implementation if it provides the required scope,
timing and cleanup without changing mechanics. Do not duplicate it with a
custom-named substitute. Do not assume a community alias exists in the user's
server, invent its syntax, or substitute a spell that adds different saves,
concentration, targeting or costs merely because it causes the same condition.

The official `!condition` / `!status` command is a **rules lookup**. A portable
`ieffect2` records a named initiative effect; its `effects` object contains
supported passive fields. The automation node `type: condition` is an **if/else
branch**, not a status application node. The reviewed portable schema does not
provide a universal `apply_condition` field that automatically implements every
rule of a named status. Do not invent one, and do not claim typing a status
name automatically supplies all its consequences.

Use exact standard names when a named initiative effect is the available
native representation. Keep its game-rule description concise. Explain the
specific unsupported consequences once in the delivery note, rather than
turning a standard condition into an invented creature ability.

| Standard condition | Mechanics to preserve; do not replace with a generic modifier |
| --- | --- |
| Charmed | Relates to the charmer: the creature cannot attack/harm that charmer, and the charmer has the appropriate social-check advantage. Do not apply universal attack disadvantage or advantage to every skill check. Enforcement of target restrictions/social context needs verified support or DM handling. |
| Incapacitated | Preserve the selected rules edition's action/reaction and other consequences. A named effect alone is not proof that Avrae rejects attempted actions. |
| Paralyzed | Includes Incapacitated and its other standard consequences. Automatic STR/DEX save failure is not disadvantage. Incoming attack advantage is not the victim's outgoing attack modifier. Proximity-dependent automatic criticals require proximity information or an explicit choice. Do not fake any of these with an unrelated passive. |
| Prone | Separate outgoing attack rules, incoming attack distance, movement and standing cost. A Stand up button removes the relevant condition; it does not by itself validate or spend movement. |
| Poisoned | Use the existing standard condition and only the applicable attack/check modifiers. Do not add saving-throw disadvantage. |
| Bleeding | Not a universal standard condition in this workflow. Only create it when the user defines its actual damage, timing and ending rules. |

Condition immunities must be respected. A named effect is not proof of an
automatic immunity check. Verify the target metadata/API before coding an
immunity predicate; otherwise ask about and disclose the required manual
immunity check. Never apply a condition to a known immune target silently.

### Saving-throw conditions and staged effects

An intended executable breath/condition ability must have a real target/save
tree. A description that says "DC ... saving throw" is not enough evidence that
the importer created that action. Inspect the imported action, not just its
visible description. In the earlier Reiko export, Paralyzing Breath remained
prose-only; that was not a completed automation implementation.

After the user confirms the rule, encode:

1. The actual save ability/DC inside the target context.
2. Only the specified condition in the failure branch.
3. Exactly the stated success outcome, including no effect when appropriate.
4. A clock belonging to the correct creature, with the correct start/end tick.
5. Repeat-save buttons only when repeat saves are in the confirmed rule.
6. Removal that affects this source and preserves unrelated conditions/effects.

For a simple confirmed "Paralyzed until the end of the target's next turn"
rule, do not add an initial Incapacitated stage, repeat saves, concentration or
a one-minute duration. In the usual off-turn application, the generated effect
uses the target's end clock (`end: true`, `tick_on_caster: false`) with the
appropriate duration. Verify same-turn/group/initiative-edge cases against
the actual runtime rather than assuming a scalar duration solves every case.

For an actual multi-stage rule, confirm the state transitions with the user
first. Test first success/failure, stage transitions, repeated success/failure,
and the original total timeout. A repeat must not reset a fixed maximum duration.
Do not let a stage expire before its required save button can be used. Never
keep stages the user has removed in a later correction.

Keep reminders short. For Prone, a **Stand up** button can remove that Prone
effect. It does not automatically spend movement, check available movement,
implement incoming attack range rules, or spend a reaction. A button placed in
Discord is not inherently a D&D Reaction; its cost comes from the source rule.
Separate effects with different endings so Stand up cannot also remove an
unrelated movement restriction or Bleeding effect.

### Timing and repeated saves

- Effect duration counts initiative ticks. Choose `end` and `tick_on_caster`
  according to whose turn and which boundary the rule actually references.
- Duration expiry is not an automatic damage/save event. The current portable
  approach provides explicitly labeled **Start of turn: damage**, **End of
  turn: save**, etc. A person clicks at the correct time.
- A damage button targets its effect holder with `target: self`. A repeat-save
  button puts the `save` in that target context and removes only its containing
  effect on a successful ending save using `remove_ieffect`.
- Buttons are repeatable unless a verified mechanism prevents repeats. Never
  claim once-per-turn enforcement from a label or duration alone. The operator
  must avoid duplicate damage/save clicks.
- For Seija's This Side Down, the user's final instruction is immediate damage,
  Prone and movement restriction on casting. There is no Resolve fall step.
  Do not generalize this timing change to other creatures' rules.

### Concentration, scope, and cleanup

For a caster maintaining effects on other creatures, use the existing caster
concentration anchor and parent-linked target effects. `save_as` identifies an
effect reference and `parent` links dependent effects. Do not put concentration
on each victim as though each victim were concentrating.

Use stable, distinct effect names and `stacking: false` for replacement when
the rules call for non-stacking behavior. For multiple casters or multiple
copies, explicitly decide whether their effects coexist and use a verified
identity scheme; a same-named effect must not accidentally replace another
caster's legal effect. Test recasting and cleanup.

Granted attacks and buttons can use the current effect reference only in their
verified runtime context. Do not assume a fresh ordinary action has an
`ieffect` reference. Reverse Needle's repeat action reuses its existing caster
anchor; recasting and repeating must not be treated as the same operation.

Automatic interception of somebody else's roll, rollback, forced reroll
substitution, initiative swapping, line of sight, shape/range targeting,
movement enforcement, and once-per-round triggers require separate verified
support. Otherwise provide an explicit after-roll utility/manual step and say
what it changes. Do not describe a reminder as an interceptor.

## 8. Passive traits and roll defaults

Record rules text, scope, restriction, generated coverage, and application
status for every trait. Use the existing **Combat traits** generator and its
stable generated identity. Do not fabricate its IDs/comments by hand.

Unconditional save/skill passives are activated by an explicit **Aina Setup
Traits** action on each actual encounter combatant. This is an integration
utility without an invented action/resource cost. Importing a passive trait's
description does not activate it.

### Identifiers

| Context | Encoding |
| --- | --- |
| CritterDB save row | `strength`, `dexterity`, `constitution`, `intelligence`, `wisdom`, `charisma` in `ability` |
| Generated save node / prepared save argument | `str`, `dex`, `con`, `int`, `wis`, `cha` |
| `save_adv` / `save_dis` generated passive | Explicit full lowercase ability identifiers |
| CritterDB skill row | Display name, e.g. `Animal Handling`, `Sleight of Hand` |
| `check_adv` / `check_dis` generated passive | Exact camelCase skill identifiers below |

```text
acrobatics, animalHandling, arcana, athletics, deception, history,
insight, intimidation, investigation, medicine, nature, perception,
performance, persuasion, religion, sleightOfHand, stealth, survival
```

For this application, expand all six saves and all 18 skills explicitly instead
of depending on an `all` shortcut. Avrae's current documentation describes
shortcuts, but broad engine coverage is not the same as the user's requested
scope. `check_adv: [strength]` also affects Strength-based skills; Dexterity
coverage can affect initiative. Aina deliberately keeps base-only checks and
initial initiative separate.

| Requested scope | Aina's portable behavior |
| --- | --- |
| Selected/all six saves | Generated `save_adv` or `save_dis`; setup each copy. |
| Selected skills | Generated `check_adv` or `check_dis` using exact skill IDs. |
| Base ability checks only | Explicit `adv` / `dis` flags on matching commands; do not widen to associated skills. |
| All checks excluding initiative | All 18 skills in the passive plus explicit flags on all six base checks. |
| Initial initiative advantage | Include the setting in the creature-add/initiative roll before trait setup; a fixed initiative has no roll to modify. |
| Conditional benefit | Command-time choice/manual confirmation on each applicable roll; excluded from unconditional passives. |

“Saves against spells,” “hearing-based Perception,” and “Strength checks while
raging” must remain conditional. Describing a restriction does not make Avrae
detect it. Explain whether Strength-based skills are included by the actual
rule instead of guessing from an interface scope label.

Add-creature commands precede per-copy setup commands. Use each actual alias,
e.g. `Seija One` and `Seija Two`, independently. Reapplication replaces only the
generated effect; removal targets its exact name and preserves unrelated
effects. For live effect-aware rolls prepare `!i os "Alias" dex` and
`!i oc "Alias" stealth`. Lookup `!ms "Source name" dex` and
`!mc "Source name" stealth` must not be represented as using that encounter's
effects. Preserve the user's source lookup names independently.

Without a verified Avrae state connection, display **application status unknown**.
An emitted setup command, Discord delivery, or owner confirmation is not proof
that a passive is active or that a live roll used it.

## 9. Critical hits and command modifiers

For an explicitly granted expanded critical range, use the supported action
model's top-level `criton` on relevant attack-roll automation. `criton: 15`
means natural 15 through 20; it is not an extra modifier to the attack total.
Do not put `criton` inside a damage node or apply attack critical ranges to
save-only abilities. Keep the passive's readable rules in the creature and
review affected attacks using Aina's critical-range generator.

Normal / force critical / suppress critical, an optional critical threshold,
extra to-hit dice, and bonus damage are distinct settings. Per-command changes
must not rewrite the creature's base stats. Mixed-type bonus damage must retain
its selected type. Verify the current command flags before adding a new
modifier; never infer a flag from a UI label.

Default Normal/Advantage/Disadvantage radios may reflect the creature's
configured unconditional perks. Conditional perks require a choice. Temporary
encounter effects can oppose them; do not claim the local default proves the
final roll state or silently remove opposing sources.

## 10. Spellcasting and resources

### Reuse native spells when their actual rules match

Prefer a verified existing spell implementation over recreating its saves,
healing, conditions or upcast rules. The native root-level `spell` node uses
the DDB spell entity ID, not a guessed name or an invented condition API:

```yaml
_v: 2
name: Example Spell
activation_type: 1
automation:
  - type: spell
    id: 2619079
    level: 1
    dc: "17"
    attackBonus: "9"
    castingMod: "4"
```

This example references the 2024 Cure Wounds; the numbers are illustrative.
Verify both the ID and rules edition against a primary source. Do not replace
the 2024 version with a similarly named legacy spell (notably Counterspell).
The node belongs at the automation root, outside a target context, and cannot
be called inside another spell. Set the action/bonus action/reaction activation
to the actual spell rule. A slot level is an integer, not an evaluated string;
for selectable levels use validated branches with explicit numeric levels.

Native Cast Spell **does not spend a spell slot**. A monster's resources need
the explicitly stated manual workflow unless separately verified counters exist.
It also checks the invoking user's spell-content access. A verified DDB ID and
passing schema do not prove that the running Avrae compendium contains usable
automation or that the invoking account has access. Report those live checks
as unverified until actually tested. Do not bypass content access checks.

Spell effects can be narrower than generic combatant bonuses. A once-per-turn
bonus to one fire/radiant spell damage roll is not a universal `damage_bonus`.
Likewise, a bonus to one selected weapon must not improve every weapon or a
spell attack. Keep conditional extra dice and spatial auras as explicit choices
or manual rules unless their exact state can be verified. Never double-count
an aura in base saves and a temporary effect.

For a damage rider used **after** an attack hits, such as 2024 Divine Smite,
preserve the Bonus Action cost and prerequisite hit. Do not reroll the weapon
attack or attach a free rider to every hit. If run separately after a critical,
critical damage needs an explicit verified command-time choice; the later run
cannot infer the preceding attack's result. Distinct Eldritch Blast beams are
individual attacks; the beam-count reminder must not become a Multiattack macro.

Use **Spellcasting & resources** for a shared base save DC and optional shared
spell-hit bonus. Export actual values into recognized native save/attack nodes;
do not rely on a custom root `spellDC` being interpreted by Avrae. Keep an
explicit per-ability **Fixed** override for exceptions. Preserve configured
upcast increments separately from the shared base.

Existing automation using unusual DC/hit expressions must be reviewed before
replacement. Do not globally replace every digit in descriptions or hidden
code. Initial and repeat saves should agree with their actual rule, and visible
DC/hit text must match the intended native values.

`legendaryActionsDescription` remains editable readable content even with zero
legendary actions. It may carry spell points, spell DC/hit, inventory and custom
resource rules. This does not make it an automatic Avrae resource tracker.

Record maximum, cost, recharge/rest recovery and ambiguity explicitly. Aina's
per-copy resources are local/manual records, independent for each encounter
copy. Posting or confirming a command does not spend them. Generic character
custom counters must not be assumed to exist for monster combatants.

Recharge, legendary-action budgets, reaction use, once-per-turn limits,
spell-point expenditure, and arbitrary custom resources remain manual unless
their particular native integration has been verified. Do not invent an
automatic counter, rest reset, or recharge threshold. Do not turn an ambiguous
half-recovery rule into a guessed fixed amount.

## 11. Preservation and export

Required invariants when editing:

- Preserve IDs, collection membership, unknown JSON properties, flavor,
  descriptions, image URLs, senses/languages, ordering, unrelated abilities and
  existing hidden automation.
- Readable-text edits preserve hidden blocks byte-for-byte. Automation edits
  preserve everything outside the approved change and show the replacement
  preview. Never regenerate all automation just to change one DC or typo.
- Keep a recoverable original and a workspace backup. Failed saves retain the
  candidate; reconnecting must not discard unsaved edits.
- Direct CritterDB saves compare against the loaded remote snapshot, report
  conflicts, update the existing authorized ID, then reload and verify. Do not
  silently overwrite changes made elsewhere.
- Export one creature for a single record, the preserved full envelope for a
  bestiary, and the workspace separately for application settings.

### Aina metadata versus portable automation

The project already uses comments such as `AINA_ABILITY:v1`,
`AINA_SPELLCASTING:v1`, `AINA_SPELL_OVERRIDE:v1`, `AINA_DAMAGE_CHOICES:v1`, and
`AINA_COMBAT_TRAITS:v1` in existing description strings. These are application
metadata, not Avrae effect types. Let the corresponding project modules write
them and maintain their fingerprints/identities; do not invent incompatible
markers or stale hashes when manually editing a payload.

The actual `<avrae hidden>` payload must remain usable without Aina. If a
different editor strips optional comments, native automation can still work,
but editable recipes/default links may be lost. Combat-trait form configuration
also needs the workspace backup; its exported action alone cannot reconstruct
every editor setting. Do not depend on unsupported custom JSON properties
surviving a CritterDB round trip.

## 12. Validation and delivery

### Mandatory checks for each creature

1. Parse the complete UTF-8 JSON. Validate the creature or bestiary through
   `Core.importData`; check identity, complete sections and intended membership.
2. Parse **every** hidden block with duplicate-key errors enabled. Inspect each
   action model, node type, required keys, branch, target context and reference.
   Validate against the current official model when available.
3. Exercise restricted expressions and dice with the actual compatible
   interpreter/parser. JSON/YAML/schema validity does not prove expressions work.
4. For choices test omitted input, zero, a normal value, maximum, malformed and
   out-of-range input. Invalid choices must not roll damage or change effects.
5. Check hits/misses, save pass/fail, damage before/after saves, half damage,
   typed damage, base/scaled DCs and fixed exceptions against the readable rule.
6. Check concentration ownership/cleanup, removal/reapplication, independent
   copies, conditional scope, granted repeat actions and button ending rules.
7. Diff original/candidate. Confirm unrelated stats, hidden blocks, unknown
   fields, descriptions, IDs and order survived. Reparse the serialized export.
8. Distinguish local validation from actual CritterDB import/save and live Avrae
   execution. Use a duplicate/test creature for authorized write testing; retain
   local work on failure and never silently use a live original as a test.

### Existing local checks

From the project root in PowerShell:

```powershell
npm.cmd test
```

Optional existing Seija/compiler expression regression:

```powershell
$env:AINA_AVRAE_PYTHON = Join-Path $env:TEMP 'aina-avrae-evaluator\Scripts\python.exe'
npm.cmd run test:avrae:expressions
```

The optional command assumes that isolated interpreter already exists with
Avrae's public `draconic`, `d20` and PyYAML installed. It is not a production
dependency. See [the verification guide](spellcasting-and-preview-controls.md#verification).
If absent, report the missing check rather than claiming a pass.

**Important:** `scripts/check-avrae-compat.js` currently targets the corrected
Seija export and a compiler regression fixture. It does not automatically test
every newly created creature. A future creature needs its own extracted
payloads, assertions and expression/dice cases. Do not run Seija's tests and
report that a different creature's automation has been verified.

Other optional proof scripts such as `scripts/verify-avrae-authoring.py` use
separately installed schema tooling; read their headers for exact requirements.
Schema validation, evaluator tests, simulated effects and browser UI tests each
have different coverage. None substitutes for an authorized Discord test.

### Required delivery receipt

For every new/revised creature, provide:

- The complete requested creature/bestiary JSON, or a linked file when requested.
  If the user asks for JSON in chat, put the complete JSON there without ellipses.
- A concise list of intentional changes and preserved identity/base mechanics.
- Automated / explicit-click / manual coverage, including conditional benefits
  and resource spending.
- Any unresolved ambiguities, with original behavior retained.
- Exact commands using the real source and encounter names, and clear setup order.
- What tests actually ran, what passed, and which live steps remain unverified.
- The section 13 update steps, especially existing encounter state when relevant.

Put this concise delivery information in chat. Do not create a per-creature
Markdown guide/stat block/receipt without an explicit request. Keep this single
authoring guide comprehensive instead. Do not describe a complete workflow as
verified when only its JSON parsed.

## 13. Updating the copy Avrae actually uses

There are separate states:

```text
Aina local draft/export
  -> authenticated CritterDB creature save/import
  -> publication update, if the imported collection uses a published copy
  -> Avrae bestiary refresh
  -> newly added / deliberately refreshed encounter combatant
```

These arrows are required operations, not automatic synchronization.

1. Review/save the intended creature to CritterDB through the existing signed-in
   tab connector, or manually import its JSON. Confirm its ID and reload the
   saved data. Never assume a local Save locally button is an account save.
2. Update the collection's publication when applicable.
3. With the correct bestiary active for the invoking account, send
   `!bestiary update` yourself. Initial import of a new bestiary is a separate
   workflow; verify its current Avrae command before giving import instructions.
4. Add a new test copy and activate its generated Setup Traits utility, if any.
   Use actual encounter aliases for actions, targets, saves and checks.
5. Test the requested changes. For an existing encounter copy, preserve HP,
   initiative, effects, resources and other relevant state before any deliberate
   replacement. Do not remove an active creature just to test an export. Do not
   invent a universal refresh command.

`!i aoo` executes the named encounter combatant's stored attack. Updating Aina,
CritterDB, or a bestiary alone does not prove that this stored action changed.
If the error still quotes `choice in [...]`, locate the stale executed payload;
the command's choice syntax cannot repair that payload.

Aina's **Post as Aina** posts a copyable preview. It does not force Avrae to
execute an ordinary bot message. **Confirm** records owner-reported use and
removes the preview; **Reaction** announces `A unit will use their Reaction!`;
**Cancel** removes the preview. None proves Avrae execution or automatically
spends a resource. Keep delivery, owner confirmation, and verified effect
application separate.

## 14. Implementation map and references

### Project sources to reuse

| Purpose | Source |
| --- | --- |
| Creature/bestiary validation, import, duplication, description preservation | `src/critter/public/core.js` |
| Ability compiler and native action construction | `src/critter/authoring.js` |
| Choice guard and narrow legacy repair | `src/critter/automation-compat.js` |
| Timed effects and manual buttons | `src/critter/effect-builder.js` |
| Trait scope, exact IDs and per-alias commands | `src/critter/public/combat-traits.js`, `src/critter/combat-traits.js` |
| Shared defaults and per-ability overrides | `src/critter/spellcasting.js`, `src/critter/public/spellcasting-model.js` |
| Critical range generation | `src/critter/critical-traits.js` |
| Corrected reference/export generation | `exports/Seija_Kijin_CritterDB_Avrae.json`, `scripts/adjust-seija.js` |

### Primary references

Recheck the relevant current schema/source when adding a new node, field,
identifier or runtime behavior; this review date is not a permanent guarantee.

- [Avrae automation reference](https://avrae.readthedocs.io/en/stable/automation_ref.html): authoritative node/field reference; prefer it over invented fields.
- [Native attack model](https://github.com/avrae/avrae/blob/master/cogs5e/models/sheet/attack.py): `_v: 2` action model and `criton` serialization.
- [Avrae constants](https://github.com/avrae/avrae/blob/nightly/utils/constants.py): damage types, ability identifiers and skill mapping.
- [Automation evaluator](https://github.com/avrae/avrae/blob/master/aliasing/evaluators.py) and [restricted interpreter](https://github.com/avrae/draconic/blob/master/draconic/interpreter.py): investigate expression support here, separately from full alias scripting.
- [Initiative action execution](https://github.com/avrae/avrae/blob/master/cogs5e/initiative/cog.py): encounter attack lookup and action execution.
- [Official DM combat guide](https://avrae.readthedocs.io/en/stable/cheatsheets/dm_combat.html): encounter workflow.
- [CritterDB source](https://github.com/haswellr/CritterDB): inspect the actual model/import/save flow when changing the outer schema; Aina's permissive importer is not proof that CritterDB accepts an invented field.
- [Native spell delegation](https://github.com/avrae/avrae/blob/master/cogs5e/models/automation/effects/castspell.py): spell lookup, access checks, parameter overrides and restoration; no slot spending.
- [2024 class rules](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes): selected class-level mechanics, attack counts, recovery and subclass timing. Streamlined NPCs are not complete character sheets; class level is not CR.

This file is the single authoring standard. Feature setup documents elsewhere
in the repository describe the application; they do not replace the required
questions, naming rules, condition verification or creature validation here.
