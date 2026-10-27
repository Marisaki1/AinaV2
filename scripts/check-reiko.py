"""Reiko-only offline proof: official schema + actual Draconic/d20, modeled state.

Usage: python scripts/check-reiko.py <candidate.json> <original.json>
Uses the existing isolated schema environment. No Discord or CritterDB calls.
This is not Avrae's full initiative/automation runtime or a live integration test.
"""
import copy
import json
import pathlib
import re
import subprocess
import sys
from types import SimpleNamespace

import d20
import draconic
from automation_common.validation.models import AttackModel


candidate, original = [json.load(open(p, encoding="utf-8-sig")) for p in sys.argv[1:3]]
assert candidate["name"] == "Reiko"
for key in ("_id", "id", "bestiaryId", "publishedBestiaryId", "__v"):
    assert candidate.get(key) == original.get(key), key
assert candidate["flavor"] == original["flavor"]
assert candidate["sharing"] == original["sharing"]
for key, value in original["stats"].items():
    if key not in ("actions", "additionalAbilities", "legendaryActionsDescription"):
        assert candidate["stats"][key] == value, key
managed = {"Four Blessings", "Rend Blessing", "Resistance Aura", "Charm Blessing", "Alter Terrain"}
for index, before in enumerate(original["stats"]["additionalAbilities"]):
    after = candidate["stats"]["additionalAbilities"][index]
    assert after["name"] == before["name"]
    assert ({k: v for k, v in after.items() if k != "description"} ==
            {k: v for k, v in before.items() if k != "description"})
    if before["name"] not in managed:
        assert after == before
for name in managed:
    assert sum(e["name"] == name for e in candidate["stats"]["additionalAbilities"]) == 1
for before, after in zip(original["stats"]["actions"], candidate["stats"]["actions"]):
    assert before["name"] == after["name"]
    if before["name"] not in ("Rend", "Paralyzing Breath") and not before["name"].startswith("Cold Breath"):
        assert before == after
    else:
        assert {k: v for k, v in before.items() if k != "description"} == {
            k: v for k, v in after.items() if k != "description"}
def without_profile(value):
    return re.sub(r"<!-- AINA_SPELLCASTING:v1:[\s\S]*? -->\s*", "", value)
assert without_profile(candidate["stats"]["legendaryActionsDescription"]) == without_profile(original["stats"]["legendaryActionsDescription"])

root = pathlib.Path(__file__).resolve().parent.parent
extract = r"""
const fs=require('fs'),Y=require('yaml'),C=require('./src/critter/public/core');
const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),out=[];
for(const section of C.sections)for(const entry of c.stats[section])
  for(const block of C.splitDescription(entry.description).blocks){
    const doc=Y.parseDocument(block.source,{uniqueKeys:true});
    if(doc.errors.length)throw doc.errors[0];
    const value=doc.toJS();out.push(...(Array.isArray(value)?value:[value]));
  }
process.stdout.write(JSON.stringify(out));
"""
actions = {}
for model in json.loads(subprocess.check_output(["node", "-e", extract, sys.argv[1]], cwd=root)):
    AttackModel.parse_obj(model)
    assert model["name"] not in actions
    actions[model["name"]] = model
assert len(actions) == 10, list(actions)


def nodes(items):
    for node in items:
        yield node
        for key in ("effects", "hit", "miss", "fail", "success", "onTrue", "onFalse"):
            if isinstance(node.get(key), list):
                yield from nodes(node[key])
        for granted in node.get("attacks", []):
            yield from nodes(granted["attack"]["automation"])
        for button in node.get("buttons", []):
            yield from nodes(button["automation"])


for action in actions.values():
    for node in nodes(action["automation"]):
        if node["type"] == "ieffect2":
            assert node["duration"] == 1
            assert node["end"] is (node["name"] == "Paralyzed")
            assert node["tick_on_caster"] is (node["name"] != "Paralyzed")
            assert node["stacking"] is False and node["conc"] is False
        if node["type"] == "save":
            assert str(node["dc"]) == "23"
        if node["type"] == "condition":
            assert "[" not in node["condition"]


class Unit:
    def __init__(self, name, hp=50, maximum=100):
        self.name, self.hp, self.maximum, self.effects = name, hp, maximum, {}


class Runtime:
    """Limited branch replay; native saves/attacks are forced to chosen outcomes."""
    def __init__(self, caster, targets=(), save=False, hit=True, trigger=None):
        self.caster, self.targets, self.save, self.hit = caster, targets, save, hit
        self.trigger, self.rolls, self.damage, self.messages = trigger, [], [], []
        self.engine = draconic.SimpleInterpreter(builtins={"caster": SimpleNamespace(name=caster.name), "choice": ""})

    def annotated(self, value):
        return re.sub(r"(?<!\{)\{([^{}]+)\}", lambda m: str(self.engine.eval(m[1])), str(value))

    def run(self, items, unit=None):
        for node in items:
            kind = node["type"]
            if kind == "target":
                for selected in ([self.caster] if node["target"] == "self" else self.targets):
                    self.engine.builtins["target"] = SimpleNamespace(name=selected.name)
                    self.run(node["effects"], selected)
            elif kind == "condition":
                self.run(node["onTrue"] if self.engine.eval(node["condition"]) else node.get("onFalse", []), unit)
            elif kind == "attack":
                assert int(node["attackBonus"]) == 17
                self.run(node["hit"] if self.hit else node.get("miss", []), unit)
            elif kind == "save":
                assert int(node["dc"]) == 23
                self.run(node["success"] if self.save else node["fail"], unit)
            elif kind == "roll":
                result = d20.roll(self.annotated(node["dice"]))
                self.engine.builtins[node["name"]] = result.total
                self.rolls.append(result.total)
            elif kind == "damage":
                expression = self.annotated(node["damage"])
                amount = d20.roll(expression).total
                self.damage.append((unit.name, expression, amount))
                unit.hp = min(unit.maximum, unit.hp - amount) if amount < 0 else unit.hp - amount
            elif kind == "ieffect2":
                name = self.annotated(node["name"])
                self.annotated(node.get("desc", ""))
                unit.effects[name] = {"node": copy.deepcopy(node), "caster": self.caster.name}
            elif kind == "remove_ieffect":
                assert self.trigger is not None
                owner, name = self.trigger
                owner.effects.pop(name, None)
            elif kind == "text":
                self.messages.append(self.annotated(node["text"]))
            else:
                raise AssertionError("Unexpected node " + kind)
        return self


def run(name, caster, targets=(), **kwargs):
    return Runtime(caster, targets, **kwargs).run(actions[name]["automation"])


def granted(unit, name):
    found = [a["attack"] for e in unit.effects.values() for a in e["node"].get("attacks", []) if a["attack"]["name"] == name]
    assert len(found) == 1, (name, len(found))
    AttackModel.parse_obj(found[0])
    return found[0]["automation"]


def tick(who, at_end, *units):
    # Model only: verifies the configured caster-clock contract, not Avrae runtime.
    for unit in units:
        for name, effect in list(unit.effects.items()):
            node = effect["node"]
            owner = effect.get("caster") if node.get("tick_on_caster") else unit.name
            if node.get("duration") == 1 and node.get("end", False) == at_end and owner == who.name:
                del unit.effects[name]


reiko, other_reiko, tewi, sanae = Unit("Reiko One"), Unit("Reiko Two"), Unit("Tewi"), Unit("Sanae")
base = run("Rend", reiko, [tewi])
assert "[cold]" not in base.damage[0][1]
assert not run("Rend", reiko, [tewi], hit=False).damage
run("Rend Blessing", reiko)
run("Rend Blessing", reiko)
assert len(reiko.effects) == 1
blessed = Runtime(reiko, [tewi]).run(granted(reiko, "Blessed Rend"))
assert "(2d8+10)[slashing]+(2d8)[cold]" == blessed.damage[0][1]
assert not Runtime(reiko, [tewi], hit=False).run(granted(reiko, "Blessed Rend")).damage
assert "[cold]" not in run("Rend", reiko, [tewi]).damage[0][1]

failed = run("Cold Breath", reiko, [tewi])
passed = run("Cold Breath", reiko, [tewi], save=True)
assert failed.damage[0][2] == failed.rolls[0]
assert passed.damage[0][2] == passed.rolls[0] // 2
assert 15 <= failed.rolls[0] <= 120

run("Resistance Aura", reiko, [reiko, tewi])
run("Resistance Aura", other_reiko, [tewi])
assert len([k for k in tewi.effects if k.startswith("Resistance Blessing")]) == 2
expected_types = {"acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"}
for unit in (reiko, other_reiko, tewi):
    for effect in unit.effects.values():
        if "resistances" in effect["node"]["effects"]:
            assert set(effect["node"]["effects"]["resistances"]) == expected_types
Runtime(reiko, [sanae]).run(granted(reiko, "Aura Entry"))
assert any(k.startswith("Resistance Blessing") for k in sanae.effects)

assert actions["Charm Blessing"]["automation"][0]["effects"][0]["stat"] == "wis"
run("Charm Blessing", reiko, [tewi])
run("Charm Blessing", reiko, [sanae], save=True)
assert "Charmed" in tewi.effects
assert "Charmed" not in sanae.effects
assert not tewi.effects["Charmed"]["node"]["effects"]
assert "buttons" not in tewi.effects["Charmed"]["node"]
run("Paralyzing Breath", reiko, [tewi])
run("Paralyzing Breath", reiko, [sanae], save=True)
assert "Paralyzed" in tewi.effects and "Paralyzed" not in sanae.effects
assert actions["Paralyzing Breath"]["automation"][0]["effects"][0]["stat"] == "con"
assert "buttons" not in tewi.effects["Paralyzed"]["node"]
assert not any(n["type"] == "ieffect2" and n["name"] == "Incapacitated" for n in nodes(actions["Paralyzing Breath"]["automation"]))

run("Alter Terrain - Difficult Terrain", reiko)
run("Alter Terrain - Body of Water", reiko)
run("Alter Terrain - Rocky Terrain", reiko)
run("Alter Terrain - Gentle Meadow", reiko)
assert len([name for name in reiko.effects if name.startswith("Alter Terrain")]) == 1
meadow = granted(reiko, "Meadow Healing")
tewi.hp = 50
healing = Runtime(reiko, [tewi]).run(meadow)
assert tewi.hp == 70 and healing.damage[0][2] == -20
tewi.hp = 95
Runtime(reiko, [tewi]).run(meadow)
assert tewi.hp == 100

unrelated = {"node": {"name": "Unrelated"}, "caster": "Someone Else"}
tewi.effects["Unrelated"] = copy.deepcopy(unrelated)
for name in list(tewi.effects):
    if name == "Resistance Blessing (Reiko One)":
        button = tewi.effects[name]["node"]["buttons"][0]
        Runtime(tewi, trigger=(tewi, name)).run(button["automation"])
assert tewi.effects["Unrelated"] == unrelated
assert "Resistance Blessing (Reiko Two)" in tewi.effects
assert "Charmed" in tewi.effects
run("Resistance Aura", reiko, [tewi])
run("Charm Blessing", reiko, [tewi])
before = copy.deepcopy(tewi.effects)
tick(tewi, False, reiko, other_reiko, tewi, sanae)
assert tewi.effects == before
tick(reiko, False, reiko, other_reiko, tewi, sanae)
assert all(e.get("caster") != "Reiko One" for u in (reiko, tewi, sanae) for e in u.effects.values() if e["node"].get("tick_on_caster"))
assert "Charmed" not in tewi.effects
assert "Paralyzed" in tewi.effects
tick(tewi, True, reiko, other_reiko, tewi, sanae)
assert "Paralyzed" not in tewi.effects
assert "Resistance Blessing (Reiko Two)" in tewi.effects
assert tewi.effects["Unrelated"] == unrelated
run("Rend Blessing", reiko)
assert granted(reiko, "Blessed Rend")

print(json.dumps({"result": "PASS", "top_level_actions_schema_validated": len(actions),
                  "checks": ["existing identity/membership and original data preservation", "normal/blessed Rend and misses",
                             "DC23 breath failure/half success", "13-type resistance/self/entry",
                             "multiple caster copies/reapplication", "WIS23 charm success/failure",
                             "CON23 paralysis, target-end expiry, no repeat saves",
                             "manual terrain replacement", "20 HP healing/cap", "effect-only removal",
                             "caster-start expiry configuration and modeled lifecycle"],
                  "live_Discord": False, "live_CritterDB": False, "full_Avrae_runtime": False}))
