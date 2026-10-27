"""Runs the read-only export proof in Avrae's Draconic interpreter against local fixtures.
No Discord connection, combat writes, rolls, or authenticated services are involved.
Optional argument: path to write the generated snapshot for local UI testing.
"""
import json
import pathlib
import sys
import time
from urllib.parse import unquote
from types import SimpleNamespace as NS
import draconic

owner, guild, channel = "123456789012345678", "223456789012345678", "323456789012345678"
request = str(((int(time.time() * 1000) - 1420070400000) << 22) + 1)
nonce = "a" * 32
effects = [NS(name="Bless", duration=0, remaining=0, conc=True, ticks_on_end=False)]


class Unit:
    def __init__(self, uid, name, hidden=False):
        self.id, self.name, self.is_hidden = uid, name, hidden
        self.controller, self.init, self.effects = owner, 14, effects

    def __getattr__(self, key):
        if key.startswith('_'):
            raise AttributeError(key)
        if self.is_hidden:
            raise AssertionError("Exporter accessed hidden property: " + key)
        return {"monster_name": "Test Dragon", "hp": 0, "max_hp": 40, "temp_hp": 0, "ac": 15, "resistances": NS(resist=["cold"], immune=[], vuln=[]), "attacks": [NS(name="Bite")], "spellbook": NS(spells=[NS(name="Fog Cloud")])}[key]


units = [Unit("copy1", "Dragon One"), Unit("copy2", "Dragon Two", True)]
group = NS(id="group1", name="Dragons", init=14, combatants=units)
encounter = NS(name="Bridge proof", round_num=2, turn_num=14, current=NS(id="group1"), combatants=units, groups=[group])
ctx = NS(author=NS(id=owner), guild=NS(id=guild), channel=NS(id=channel), message_id=request, prefix="!")
source = (pathlib.Path(__file__).resolve().parent.parent / "src/critter/avrae-export.drac2").read_text(encoding="utf-8").replace("__OWNER_ID__", owner).replace("&ARGS&", repr([nonce]))
source = source.split("<drac2>", 1)[1].split("</drac2>", 1)[0]


def run(c):
    builtins = {"len": len, "str": str, "int": int, "range": range, "enumerate": enumerate, "ctx": ctx, "combat": lambda: c, "time": time.time, "dump_json": lambda value: json.dumps(value, default=lambda obj: obj.data), "signature": lambda: "local-fixture-not-a-real-signature", "err": lambda reason: (_ for _ in ()).throw(ValueError(reason))}
    return draconic.DraconicInterpreter(builtins=builtins).execute(source)


output = run(encounter)
lines = output.splitlines()
assert lines[0] == "multiline" and len(lines) <= 21
parts = [json.loads(line.split(" -desc ", 1)[1][1:-1]) for line in lines[1:]]
assert all("\\" not in line.split(" -desc ", 1)[1] and line.split(" -desc ", 1)[1].startswith("'") for line in lines[1:])
assert all(len(line.split(" -desc ", 1)[1][1:-1]) < 4096 for line in lines[1:])
snapshot = json.loads(unquote("".join(p["chunk"] for p in parts)))
assert snapshot["combatants"][0]["hp"] == {"status": "known", "value": 0}
assert snapshot["combatants"][0]["tempHp"]["value"] == 0
assert snapshot["combatants"][1]["hp"] == {"status": "hidden", "value": None}
assert snapshot["combatants"][1]["actions"]["value"] is None
assert snapshot["combatants"][0]["effects"]["value"][0]["remaining"] == 0
assert snapshot["currentId"] == "group1"
empty = run(None)
empty_parts = [json.loads(line.split(" -desc ", 1)[1][1:-1]) for line in empty.splitlines()[1:]]
assert json.loads(unquote("".join(p["chunk"] for p in empty_parts)))["active"] is False
if len(sys.argv) > 1:
    pathlib.Path(sys.argv[1]).write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
print("PASS real Draconic export execution: groups/stable IDs, public HP=0/THP=0, hidden-property access prevented, effects/timing, multipart bounds and absent encounters")
print("Local proof only. Signature output is a fixture; no Discord/Avrae deployment was tested.")
