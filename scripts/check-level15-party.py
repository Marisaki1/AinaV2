"""Offline proof for the actual four NPC exports. No network/account access.

Run using the isolated automation-common/draconic/d20 Python environment.
Optional second argument: directory with downloaded official Avrae reference .py files.
Source-method fixtures validate selected behavior, not the full Avrae runtime,
spell-compendium availability, entitlement access, or a live Discord execution.
"""
import ast
import copy
import json
import pathlib
import random
import re
import subprocess
import sys
from types import SimpleNamespace as NS

import d20
import draconic
from automation_common.validation.models import AttackModel

root = pathlib.Path(__file__).resolve().parent.parent
directory = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "exports")
reference = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else None
names = ("Braxton", "Tomkin", "Collin", "Glen")
extract = r"""
const fs=require('fs'),Y=require('yaml'),C=require('./src/critter/public/core'),A=require('./src/critter/automation');
const path=require('path'),out={};
for(const n of ['Braxton','Tomkin','Collin','Glen']) {
 const c=C.importData(JSON.parse(fs.readFileSync(path.join(process.argv[1],n+'_CritterDB_Avrae.json'),'utf8'))).data;
 const actions=[];
 for(const s of C.sections)for(const e of c.stats[s])for(const b of C.splitDescription(e.description).blocks){
  const d=Y.parseDocument(b.source,{uniqueKeys:true});if(d.errors.length)throw d.errors[0];
  actions.push(d.toJS());
 }
 out[n]={creature:c,actions,reminders:A.inspectCreature(c).filter(x=>x.reminderOnly).map(x=>({name:x.title,blocks:x.blocks.length}))};
}process.stdout.write(JSON.stringify(out));
"""
data = json.loads(subprocess.check_output(["node", "-e", extract, str(directory.resolve())], cwd=root))
actions = {}
for name, record in data.items():
    assert record["creature"]["name"] == name
    assert all(r["blocks"] == 0 for r in record["reminders"])
    assert record["creature"]["stats"]["proficiencyBonus"] == 5
    assert record["creature"]["stats"]["numHitDie"] == 15
    assert len({a["name"] for a in record["actions"]}) == len(record["actions"])
    actions[name] = {a["name"]: a for a in record["actions"]}
    for a in record["actions"]:
        AttackModel.parse_obj(a)
        assert a["name"] != "Multiattack"

original_path = root / "data/critter/creature-backups/level15-party/latest-library-inputs.json"
if original_path.exists():
    original = json.loads(original_path.read_text(encoding="utf-8-sig"))["Braxton"]
    candidate = data["Braxton"]["creature"]
    assert candidate["flavor"] == original["flavor"]
    for k, value in original.items():
        if k not in ("stats", "name", "flavor"):
            assert candidate[k] == value, k


class Replay:
    """Small explicit model; Draconic/d20 are real, initiative state is a fixture."""
    def __init__(self, actor, targets=(), choice="", effects=None, hp=50, maximum=100, hit=True):
        self.actor, self.targets, self.hit = actor, list(targets), hit
        self.effects = effects if effects is not None else {}
        self.hp, self.maximum = hp, maximum
        self.engine = draconic.SimpleInterpreter(builtins={"choice": choice, "targets": self.targets, "len": len})
        self.attacks, self.damage, self.spells = [], [], []

    def run(self, nodes, target=None, effect_name=None):
        for n in nodes:
            kind = n["type"]
            if kind == "condition":
                self.run(n["onTrue"] if self.engine.eval(n["condition"]) else n["onFalse"], target)
            elif kind == "variable":
                value = int(self.engine.eval(n["value"]))
                self.engine.builtins[n["name"]] = value
            elif kind == "target":
                selected = [self.actor] if n["target"] == "self" else self.targets
                for name in selected:
                    self.run(n["effects"], name)
            elif kind == "attack":
                self.attacks.append((target, int(n["attackBonus"])))
                self.run(n["hit"] if self.hit else n["miss"], target)
            elif kind == "damage":
                expression = re.sub(r"\{([^{}]+)\}", lambda m: str(self.engine.eval(m[1])), n["damage"])
                tree = copy.copy(d20.parse(expression))
                if not n.get("fixedValue"):
                    for e in self.effects.values():
                        bonus = e["effects"].get("damage_bonus")
                        if bonus:
                            tree.roll = d20.ast.BinOp(tree.roll, "+", d20.parse(bonus).roll)
                value = d20.roll(tree).total
                self.damage.append((target, value))
                self.hp = min(self.maximum, self.hp - value)
            elif kind == "ieffect2":
                assert n["stacking"] is False
                self.effects[n["name"]] = copy.deepcopy(n)
            elif kind == "remove_ieffect":
                self.effects.pop(effect_name, None)
            elif kind == "spell":
                self.spells.append(copy.deepcopy(n))
            elif kind != "text":
                raise AssertionError(kind)
        return self


def run(actor, action, **kwargs):
    return Replay(actor, **kwargs).run(actions[actor][action]["automation"])


rage = actions["Braxton"]["Rage"]["automation"][0]["effects"][0]
assert rage["duration"] == 100 and not rage["end"]
assert rage["effects"] == dict(resistances=["bludgeoning", "piercing", "slashing"],
                              save_adv=["strength"], check_adv=["strength"], damage_bonus="3[piercing]")
reckless = actions["Braxton"]["Reckless"]["automation"][0]["effects"][0]
assert reckless["duration"] == 1 and not reckless["end"]
assert reckless["effects"] == {"attack_advantage": 1}
assert set(actions["Braxton"]) == {"Rage", "Reckless", "Pickaxe"}
damage_cases = 0
for seed in range(30):
    random.seed(seed)
    basic = run("Braxton", "Pickaxe", targets=["Target"])
    random.seed(seed)
    raging = run("Braxton", "Pickaxe", targets=["Target"], effects={"Rage": rage})
    assert raging.damage[0][1] - basic.damage[0][1] == 3
    assert 7 <= basic.damage[0][1] <= 17
    assert 10 <= raging.damage[0][1] <= 20
    damage_cases += 1
assert not run("Braxton", "Pickaxe", targets=["Target"], hit=False).damage
state = {"Unrelated": {"effects": {"ac_bonus": 1}}}
run("Braxton", "Rage", effects=state); run("Braxton", "Rage", effects=state)
assert set(state) == {"Unrelated", "Rage"}
other = {}
Replay("Braxton Two", effects=other).run(actions["Braxton"]["Rage"]["automation"])
Replay("Braxton", effects=state).run(rage["buttons"][0]["automation"], effect_name="Rage")
assert set(state) == {"Unrelated"} and "Rage" in other

for weapon in ("Greatsword", "Glaive", "Longbow", "Handaxe"):
    assert actions["Tomkin"][weapon]["criton"] == 18
    assert len(run("Tomkin", weapon, targets=["Target"]).attacks) == 1
for seed in range(10):
    sw = run("Tomkin", "Second Wind", hp=90)
    assert -25 <= sw.damage[0][1] <= -16 and sw.hp == 100

choice_cases = 0
for actor, ability, maximum, sides in [("Collin", "Healing Light", 5, 6), ("Glen", "Lay on Hands", 75, 1)]:
    for choice in ["", *map(str, range(1, maximum + 1))]:
        result = run(actor, ability, choice=choice, targets=["Target"], hp=0, maximum=500)
        amount = int(choice or 1)
        assert len(result.damage) == 1
        assert amount <= -result.damage[0][1] <= amount * sides
        choice_cases += 1
    for choice in ("0", "-1", str(maximum + 1), "2.5", "2+1", "nan", "= 2", "[2]", "no"):
        result = run(actor, ability, choice=choice, targets=["Target"])
        assert not result.damage and not result.effects and not result.spells
        choice_cases += 1
    for targets in ([], ["One", "Two"]):
        assert not run(actor, ability, choice="1", targets=targets).damage
    result = run(actor, ability, targets=["Target"], effects={"Unrelated": {"effects": {"damage_bonus": "100"}}})
    assert result.damage[0][1] < 0, 'healing does not pick up damage bonuses'

spell_cases = []
for ability, ident in [("Guiding Bolt", 2619136), ("Cure Wounds", 2619079), ("Counterspell", 2619072)]:
    result = run("Collin", ability, targets=["Target"])
    n = result.spells[0]
    assert n == dict(type="spell", id=ident, level=5, dc="18", attackBonus="10", castingMod="5")
    spell_cases.append(n)
for ability, ident in [("Cure Wounds", 2619079), ("Divine Smite", 2618833)]:
    for choice in ("", "1", "2", "3", "4"):
        result = run("Glen", ability, choice=choice, targets=["Target"])
        n = result.spells[0]
        assert n == dict(type="spell", id=ident, level=int(choice or 1), dc="17", attackBonus="9", castingMod="4")
        spell_cases.append(n)
    for choice in ("0", "5", "2.0", "2+1", "x"):
        assert not run("Glen", ability, choice=choice, targets=["Target"]).spells
    for targets in ([], ["One", "Two"]):
        assert not run("Glen", ability, targets=targets).spells
assert actions["Collin"]["Counterspell"]["activation_type"] == 4
assert actions["Glen"]["Divine Smite"]["activation_type"] == 3
glen = data["Glen"]["creature"]["stats"]
assert [s["value"] for s in glen["savingThrows"]] == [6, 9]
longsword = run("Glen", "Longsword", targets=["Target"])
assert len(longsword.damage) == 1  # Both damage types in one node, bonuses added once.
assert actions["Glen"]["Sacred Weapon"]["activation_type"] == 2

native_spell_checked = native_clock_checked = native_checks_checked = False
if reference:
    # Execute the current official CastSpell methods with a fake spell registry
    # and recording children. This checks parameter forwarding, not spell data.
    castfile = reference / "castspell_current.py"
    if castfile.exists():
        tree = ast.parse(castfile.read_text(encoding="utf-8-sig"))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "CastSpell")
        methods = [n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name in ("__init__", "run")]

        class Effect:
            def __init__(self, *args, **kwargs): pass
            def run(self, ctx): pass
            def run_children(self, children, ctx):
                ctx.captured = (ctx.dc_override, ctx.ab_override, ctx.evaluator.builtins["spell"], ctx.spell_level_override)
                return []

        fixture = ast.ClassDef(name="NativeSpell", bases=[ast.Name(id="Effect", ctx=ast.Load())], keywords=[], body=methods, decorator_list=[])
        env = dict(Effect=Effect, CastSpellResult=lambda **kwargs: kwargs, smart_trim=str)
        exec(compile(ast.fix_missing_locations(ast.Module(body=[fixture], type_ignores=[])), str(castfile), "exec"), env)
        for n in spell_cases:
            instance = env["NativeSpell"](**{k: v for k, v in n.items() if k != "type"})
            instance.spell = NS(level=3 if n["id"] == 2619072 else 1, range="fixture", automation=NS(effects=["fixture"]), higherlevels=None)
            ctx = NS(is_spell=False, ab_override=None, dc_override=None, spell_level_override=None,
                     evaluator=NS(builtins={"spell": None}), metavars={}, meta_queue=lambda *_: None,
                     parse_intexpression=lambda x: int(x), spell=None)
            outcome = instance.run(ctx)
            assert outcome["success"] is True
            assert ctx.captured == (int(n["dc"]), int(n["attackBonus"]), int(n["castingMod"]), n["level"])
            assert ctx.ab_override is None and ctx.dc_override is None and ctx.spell is None
        instance.spell = None
        assert instance.run(ctx)["success"] is False
        native_spell_checked = True

    effectfile = reference / "initiative_effect_current.py"
    if effectfile.exists():
        tree = ast.parse(effectfile.read_text(encoding="utf-8-sig"))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "InitiativeEffect")
        methods = [n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name in ("new", "on_turn")]

        class Clock:
            def __init__(self, **kwargs): self.__dict__.update(kwargs); self.removed = False
            @property
            def tick_on_combatant(self): return self.combatant
            def remove(self): self.removed = True

        fixture = ast.ClassDef(name="NativeClock", bases=[ast.Name(id="Clock", ctx=ast.Load())], keywords=[], body=methods, decorator_list=[])
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        env = dict(Clock=Clock, create_effect_id=lambda: "fixture", InitPassiveEffect=dict)
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, fixture], type_ignores=[])), str(effectfile), "exec"), env)
        actor, combat = NS(id="actor", index=1), NS(round_num=4, index=1)
        for node, expiry in [(rage, 104), (reckless, 5), (actions["Glen"]["Sacred Weapon"]["automation"][0]["effects"][0], 104)]:
            clock = env["NativeClock"].new(combat=combat, combatant=actor, name=node["name"], duration=node["duration"], end_on_turn_end=node["end"], passive_effects=node["effects"])
            assert clock.end_round == expiry
            clock.on_turn(); assert not clock.removed
            combat.round_num, combat.index = expiry, 0
            clock.on_turn(); assert not clock.removed
            combat.index = 1
            clock.on_turn(); assert clock.removed
            combat.round_num, combat.index = 4, 1
        native_clock_checked = True

    utility, constants = reference / "cogs5e_initiative_utils.py", reference / "constants.py"
    if utility.exists() and constants.exists():
        function = next(n for n in ast.parse(utility.read_text(encoding="utf-8-sig")).body if isinstance(n, ast.FunctionDef) and n.name == "ieffect_handler")
        mapping = next(ast.literal_eval(n.value) for n in ast.parse(constants.read_text(encoding="utf-8-sig")).body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "SKILL_MAP" for t in n.targets))
        env = {"SKILL_MAP": mapping}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(utility), "exec"), env)

        class Args:
            def add_context(self, name, values): self.values = values
            def set_context(self, name): pass

        class Caster:
            def active_effects(self, mapper, reducer=None, default=None):
                value = mapper(NS(effects=NS(check_bonus=None, check_adv={"strength"}, check_dis=set())))
                return reducer([value]) if value and reducer else [value] if value else default

        for skill, expected in [("strength", True), ("athletics", True), ("intimidation", False), ("initiative", False)]:
            args = env["ieffect_handler"](Caster(), Args(), skill)
            assert bool(args.values.get("adv")) == expected
        native_checks_checked = True

print(json.dumps(dict(result="PASS", schema_actions=sum(map(len, actions.values())), real_dice_cases=damage_cases,
                     restricted_choice_cases=choice_cases, native_spell_forwarding_cases=len(spell_cases),
                     reminders_readable_only=True, removal_reapplication_copies_modeled=True,
                     official_spell_method_fixture=native_spell_checked, official_expiry_method_fixture=native_clock_checked,
                     official_check_handler_fixture=native_checks_checked,
                     live_Discord=False, live_CritterDB=False, full_Avrae_runtime=False, spell_entitlements_verified=False)))
