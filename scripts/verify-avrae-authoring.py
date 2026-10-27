"""Offline validation with official automation-common, Draconic, and Avrae's d20 parser.
Requires automation-common==4.4.0, pydantic==1.10.19, d20==1.1.2 and avrae/draconic.
No Discord connection or CritterDB writes. Not a live integration test.
"""
import json
import pathlib
import subprocess
from automation_common.validation.models import AttackModel
from draconic import SimpleInterpreter
import d20

root = pathlib.Path(__file__).resolve().parent.parent
source = r"""
const {build} = require('./src/critter/authoring');
const effect={name:'Test ward',duration:3,resistances:['cold'],immunities:[],vulnerabilities:['fire'],condition:'poisoned',save_adv:['wisdom'],check_dis:['perception'],attackRoll:'adv',ac_bonus:2,to_hit_bonus:'1d4'};
const inputs=[
 {name:'Attack',kind:'attack',target:'each',attackBonus:7,damages:[{dice:'2d6+3',type:'fire'},{dice:'1d2',type:'cold'}],effect},
 {name:'Breath',kind:'save',target:'each',dc:18,saveStat:'con',half:true,damages:[{dice:'6d12',type:'cold'}],effect},
 {name:'Choice',kind:'attack',target:'each',attackBonus:7,damages:[{dice:'1d8',type:'choice'}],damageChoices:['fire','cold']},
 {name:'Ward',kind:'effect',target:'self',effect},
 {name:'Die',kind:'roll',rollDice:'6d17'}];
process.stdout.write(JSON.stringify(inputs.map(x=>build(x).automation)));
"""
actions = json.loads(subprocess.check_output(["node", "-e", source], cwd=root))
for action in actions:
    AttackModel.parse_obj(action)
branch = actions[2]["automation"][0]["effects"][0]
engine = SimpleInterpreter()
for choice, expected in [("fire", True), ("cold", True), ("acid", False), ("", False)]:
    engine.names["choice"] = choice
    assert bool(engine.eval(branch["condition"])) == expected
for dice in ["(2d6+3)[fire]+(1d2)[cold]", "6d17", "(15d8)[cold]", "((67)[cold])/2", "(1d8)[fire]"]:
    d20.roll(dice)
assert d20.roll("((67)[cold])/2").total == 33
print("PASS official automation-common schema, real Draconic math choice guard, and real d20 typed/custom dice and half damage.")
print("Offline validation only; no live Avrae execution or CritterDB import was tested.")
