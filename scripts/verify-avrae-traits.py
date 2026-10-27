"""Offline verification using an explicitly supplied checkout/source snapshot of official Avrae.

Requires automation-common==4.4.0 and pydantic==1.10.19 (Avrae nightly requirements,
2026-10-23). This is a source-function harness with minimal context adapters, NOT
a deployed Avrae instance, Discord execution, or an authenticated CritterDB import.
No source is downloaded and no network messages are sent by this script.
"""
import ast
import collections
import json
import pathlib
import sys
from types import SimpleNamespace as NS
from automation_common.validation.models import AttackModel

reference = pathlib.Path(sys.argv[1])
actions = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
for action in actions:
    validated = AttackModel.parse_obj(action)
    assert validated.dict()["automation"]  # Real official validator; no local schema facsimile.
print("PASS official automation-common 4.4.0 AttackModel validation")

env = {"namedtuple": collections.namedtuple, "Any": object, "InvalidArgument": ValueError}


def source_nodes(file, names, parent=None):
    tree = ast.parse((reference / file).read_text(encoding="utf-8"))
    nodes = tree.body if parent is None else next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == parent).body
    chosen = [n for n in nodes if getattr(n, "name", None) in names or isinstance(n, (ast.Assign, ast.AnnAssign)) and any(isinstance(t, ast.Name) and t.id in names for t in getattr(n, "targets", [getattr(n, "target", None)]))]
    assert len(chosen) == len(names), (file, names)
    module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)] + chosen, type_ignores=[])
    exec(compile(ast.fix_missing_locations(module), file, "exec"), env)


source_nodes("constants.py", {"STAT_NAMES", "STAT_ABBREVIATIONS", "SKILL_NAMES", "SKILL_MAP"})
source_nodes("passive.py", {"resolve_save_advs", "resolve_check_advs"})
source_nodes("base.py", {"Skill"})
source_nodes("argparser.py", {"adv"}, "ParsedArguments")
source_nodes("cogs5e_initiative_utils.py", {"ieffect_handler"})
source_nodes("checkutils.py", {"run_check", "run_save", "_run_common", "CheckResult", "SaveResult", "SkillRollResult"})
source_nodes("cogs5e_initiative_combatant.py", {"add_effect", "get_effect", "get_effects", "active_effects", "remove_effect"}, "Combatant")
env.update({"verbose_stat": lambda s: next(a for a in env["STAT_NAMES"] if a.startswith(s)), "camel_to_title": lambda s: s, "a_or_an": lambda s: "a " + s, "parse_save_bonuses": lambda *a: [], "roll": lambda expression: NS(total=10, result=expression), "embeds": NS(add_fields_from_args=lambda *a: None)})


class Args:
    adv = env["adv"]

    def __init__(self, flags=()):
        self.values = {f: [True] for f in flags}
        self.context = {}

    def last(self, key, default=None, type_=None, **kwargs):
        values = self.context.get(key) or self.values.get(key)
        return (type_(values[-1]) if type_ else values[-1]) if values else default

    def join(self, key, connector, **kwargs):
        values = self.context.get(key) or self.values.get(key)
        return connector.join(map(str, values)) if values else None

    def get(self, key, default=None):
        return self.context.get(key) or self.values.get(key) or default

    def __contains__(self, key):
        return key in self.values or key in self.context

    def add_context(self, name, values):
        self.context = values

    def set_context(self, name):
        pass


class Combatant:
    add_effect = env["add_effect"]
    get_effect = env["get_effect"]
    get_effects = env["get_effects"]
    active_effects = env["active_effects"]
    remove_effect = env["remove_effect"]

    def __init__(self, name):
        self.name, self._effects = name, []
        self.skills = {s: env["Skill"](2) for s in env["SKILL_NAMES"]}
        self.saves = NS(get=lambda s: env["Skill"](3))

    def _invalidate_effect_cache(self):
        pass

    def get_title_name(self):
        return self.name


env["init"] = NS(Combatant=Combatant)


class Effect:
    concentration = False

    def __init__(self, owner, name, passive):
        self.owner, self.name = owner, name
        self.effects = NS(save_adv=env["resolve_save_advs"](passive.get("save_adv", [])), save_dis=env["resolve_save_advs"](passive.get("save_dis", [])), check_adv=env["resolve_check_advs"](passive.get("check_adv", [])), check_dis=env["resolve_check_advs"](passive.get("check_dis", [])), check_bonus=[], save_bonus=[])

    def remove(self):
        self.owner.remove_effect(self)


def roll(actor, kind, key, flags=()):
    embed = NS(add_field=lambda **kw: None, set_footer=lambda **kw: None)
    env["run_save" if kind == "save" else "run_check"](key, actor, Args(flags), embed)
    return embed.description


node = actions[0]["automation"][0]["effects"][0]
first, second = Combatant("Copy1"), Combatant("Copy2")
unrelated = Effect(first, "Unrelated", {})
first.add_effect(unrelated)
first.add_effect(Effect(first, node["name"], node["effects"]))
assert "2d20kh1" in roll(first, "save", "dex")
assert "1d20" in roll(first, "save", "con")  # conditional spell benefit is not passive
assert "2d20kl1" in roll(first, "check", "perception")
assert "1d20" in roll(second, "save", "dex")  # copies do not share effects
assert "1d20" in roll(first, "check", "initiative")
assert "1d20" in roll(first, "check", "strength")  # base-only advantage is explicit command flag
assert "2d20kh1" in roll(first, "check", "strength", ["adv"])
assert "1d20" in roll(first, "check", "perception", ["adv"])  # opposite sources cancel
first.add_effect(Effect(first, node["name"], node["effects"]))
assert len(first.get_effects()) == 2
first.get_effect(node["name"]).remove()
assert first.get_effects() == [unrelated]
assert "1d20" in roll(first, "save", "dex")
for actor in [first, second]:
    actor.add_effect(Effect(actor, node["name"], node["effects"]))
    assert "2d20kh1" in roll(actor, "save", "dex")
assert set(env["resolve_check_advs"](["all"])) == set(env["SKILL_NAMES"])
assert "initiative" in env["resolve_check_advs"](["all"])
assert env["resolve_save_advs"](["all"]) == set(env["STAT_ABBREVIATIONS"])
first.get_effect(node["name"]).remove()
first.add_effect(Effect(first, node["name"], {"check_adv": ["perception"]}))
assert "2d20kh1" in roll(first, "check", "perception")
assert "1d20" in roll(first, "check", "medicine")
first.get_effect(node["name"]).remove()
skills_only = [s for s in env["SKILL_NAMES"] if s not in env["STAT_NAMES"] and s != "initiative"]
assert len(skills_only) == 18
first.add_effect(Effect(first, node["name"], {"check_adv": skills_only}))
for skill in skills_only:
    assert "2d20kh1" in roll(first, "check", skill)
for ability in env["STAT_NAMES"]:
    assert "2d20kh1" in roll(first, "check", ability, ["adv"])
assert "1d20" in roll(first, "check", "initiative")
print("PASS official Avrae source functions: selected saves/skills, disadvantage, cancellation, removal/reapplication, copies, restrictions, and initiative exclusion")
print("Local source-function harness with context adapters. Discord execution and real CritterDB import remain untested.")
