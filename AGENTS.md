# Creature creation and editing

For every task that creates, revises, exports, or documents a CritterDB creature,
bestiary, or its Avrae automation, read and follow
[the creature authoring standard](docs/critterdb-avrae-authoring-standard.md).
Read the current input creature as well; do not substitute Seija's mechanics.

- Ask focused follow-up questions before creature implementation. Resolve missing
  mechanics and conflicting instructions first; do not silently choose them.
- Preserve the supplied rules, identities, unknown fields, and unrelated automation.
- Use standard condition names and verified existing condition implementations.
  Never invent a condition API or call a reminder fully automated mechanics.
- Keep readable stat blocks free of app branding, internal variables, instructions,
  and unsolicited renames. Use neutral visible roll labels such as Damage.
- Multiattack, Extra Attack, attack-count reminders and other reminder-only
  passives remain readable rules. Do not turn them into macros or commands.
  Automate individual attacks and activated effects only where requested.
- Use Seija's corrected export as a structural example, not a source of new powers.
- Validate hidden automation and restricted expressions separately from JSON syntax.
- Explain manual steps, conditional scope, and the difference between a local file,
  a CritterDB save, an Avrae bestiary update, and an existing encounter combatant.
- Never describe a local/schema test as a successful live Discord or CritterDB test.
- Follow the user's requested delivery format, including JSON in chat when requested.
- Maintain one canonical authoring guide. Do not create per-creature Markdown
  stat blocks, guides or receipts unless the user explicitly requests them.

This instruction file applies only to creature/bestiary authoring work. It does
not authorize live messages, account writes, new browser sessions, or changes to
creature mechanics beyond the user's request.
