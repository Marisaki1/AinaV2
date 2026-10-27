"""Offline expression/dice checks using Avrae's actual draconic.SimpleInterpreter.

Run with an isolated interpreter containing github.com/avrae/draconic, d20 and
PyYAML. This is not a Discord integration test or a complete Avrae runtime.
"""
import json
import math
import re
import sys
from types import SimpleNamespace

import d20
import draconic
import yaml


def run(nodes, choice):
    names = {"choice": choice, "caster": SimpleNamespace(name="Seija Kijin"),
             "target": SimpleNamespace(name="Target"), "intelligenceMod": 5,
             "proficiencyBonus": 3, "spell_level": None, "max": max, "min": min,
             "floor": math.floor, "ceil": math.ceil}
    evaluator = draconic.SimpleInterpreter(builtins=names)
    found = {"damage": [], "rolls": [], "dcs": []}

    def expression(value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return int(evaluator.eval(value))

    def annotated(value):
        return re.sub(r"\{\{(.+?)\}\}|(?<!\{)\{([^{}]+)\}",
                      lambda m: str(evaluator.eval(m[1] or m[2])), str(value))

    def walk(items):
        for node in items:
            kind = node["type"]
            if kind == "variable":
                try:
                    names[node["name"]] = expression(node["value"])
                except Exception:
                    if "onError" not in node:
                        raise
                    names[node["name"]] = expression(node["onError"])
                evaluator.builtins[node["name"]] = names[node["name"]]
            elif kind == "condition":
                walk(node["onTrue"] if evaluator.eval(node["condition"]) else node.get("onFalse", []))
            elif kind == "target":
                walk(node["effects"])
            elif kind == "attack":
                expression(node.get("attackBonus", "8"))
                walk(node["hit"])
            elif kind == "save":
                found["dcs"].append(expression(node["dc"]))
                walk(node.get("fail", []))
            elif kind == "roll":
                dice = annotated(node["dice"])
                result = d20.roll(dice)
                evaluator.builtins[node["name"]] = result.total
                found["rolls"].append(dice)
            elif kind == "damage":
                value = annotated(node["damage"])
                d20.roll(value)
                found["damage"].append(value)
            elif kind == "text":
                if isinstance(node["text"], str):
                    annotated(node["text"])
            elif kind == "ieffect2":
                annotated(node["name"])
                if node.get("desc"):
                    annotated(node["desc"])
                if node.get("duration") is not None:
                    expression(node["duration"])
                for key, value in node.get("effects", {}).items():
                    if key in ("dc_bonus", "attack_advantage"):
                        expression(value)
                # Buttons and granted attacks start their own runtime. Verify
                # their expressions with the persisted original choice as well.
                for button in node.get("buttons", []):
                    run(button["automation"], choice)
                for attack in node.get("attacks", []):
                    run(attack["attack"]["automation"], choice)
            elif kind == "remove_ieffect":
                pass
            else:
                raise AssertionError("Add explicit coverage for " + kind)
    walk(nodes)
    return found


try:
    draconic.SimpleInterpreter(builtins={"choice": "2"}).eval('choice in ["0", "1", "2"]')
    raise AssertionError("Expected the original reported List error")
except draconic.exceptions.FeatureNotAvailable as error:
    assert "List" in str(error)

with open(sys.argv[1], encoding="utf-8-sig") as handle:
    fixtures = json.load(handle)
checks = 0
for fixture in fixtures:
    for choice in ("", "0", "2", str(fixture.get("maximum", 10))):
        result = run(fixture["automation"], choice)
        if fixture.get("expectedDC") is not None and choice == "2":
            assert fixture["expectedDC"] in result["dcs"], result
        checks += 1
    if fixture.get("scaling"):
        for invalid in ("=", "2.5", "-1", "101", "two"):
            result = run(fixture["automation"], invalid)
            assert not result["damage"] and not result["rolls"], result
            checks += 1
print(json.dumps({"result": "PASS", "expression_cases": checks,
                  "original_List_error": "reproduced", "live_Discord": False}))
