import json,re,sys,copy
sys.path.insert(0,'.cache/patchouli-validation')
import draconic,d20
from types import SimpleNamespace as NS
c=json.load(open('exports/Patchouli_Knowledge_CritterDB_Avrae.json',encoding='utf8'));o=json.load(open('exports/Patchouli_uploaded_original.json',encoding='utf8'))
for k in o:
 if k!='stats':assert c[k]==o[k],k
for k in o['stats']:
 if k not in ('abilityScores','skills','savingThrows','actions','additionalAbilities','reactions','legendaryActions','legendaryActionsDescription'):assert c['stats'][k]==o['stats'][k],k
engine=draconic.SimpleInterpreter();total=0;dice=set()
res=NS(is_immune=lambda t:False)
engine.names.update(target=NS(resistances=res,hp=10,max_hp=20,temp_hp=0),healing=12,healed=10,damage=21)
def walk(n):
 global total
 if isinstance(n,list):
  for x in n:walk(x)
 elif isinstance(n,dict):
  if n.get('type')=='condition':
   assert len(n['condition'])<=255
   for choice in re.findall(r'choice == "([^"]*)"',n['condition']) or ['Fire+Wood|none/fire']:
    engine.names['choice']=choice;engine.eval(n['condition']);total+=1
  if n.get('type')=='variable':engine.eval(n['value'])
  if n.get('type')=='roll':dice.add(n['dice'])
  if n.get('type') in ('damage','temphp'):dice.add(n.get('damage',n.get('amount')))
  for v in n.values():
   if isinstance(v,(list,dict)):walk(v)
for sec in ('actions','additionalAbilities','reactions','legendaryActions'):
 for a in c['stats'][sec]:
  for payload in re.findall(r'<avrae hidden>(.*?)</avrae>',a['description'],re.S):walk(json.loads(payload))
for expr in dice:
 expr=expr.replace('{damage}','21').replace('{healing}','12').replace('{healed}','10').replace('{target.temp_hp if target.temp_hp > healed else healed}','10')
 d20.roll(expr)
assert d20.roll('(21)/2').total==10
print('PASS identity and unrelated fields; '+str(total)+' real restricted-expression evaluations; '+str(len(dice))+' real dice/THP expressions; odd half damage.')

# Invalid choices must reach only text, before any HP or effect changes.
def route(nodes, choice):
 engine.names['choice']=choice.lower()
 output=[]
 for n in nodes:
  if n['type']=='condition': output += route(n['onTrue'] if engine.eval(n['condition']) else n['onFalse'],choice)
  else: output.append(n)
 return output
for section in ('actions','reactions','legendaryActions'):
 for a in c['stats'][section]:
  for payload in re.findall(r'<avrae hidden>(.*?)</avrae>',a['description'],re.S):
   action=json.loads(payload)
   for bad in ('invalid','999','sunwood/poison','none/fire/extra'):
    assert all(n['type']=='text' for n in route(action['automation'],bad)),(a['name'],bad)
print('PASS malformed and out-of-range choices cannot roll or change HP/effects across every executable action.')

# Exercise every compact mixer route in the real restricted interpreter.
main=json.loads(c['stats']['actions'][0]['description'].split('<avrae hidden>')[1].split('</avrae>')[0])
count=0
from itertools import combinations
for size in (2,3):
 for es in combinations(('Fire','Water','Wood','Metal','Earth'),size):
  for inf in ['none']+[p+e.lower() for e in es for p in ('sun','moon')]:
   for typ in ('fire','cold','lightning','thunder','radiant'):
    code='+'.join(es)+'|'+inf+'/'+typ
    result=route(main['automation'],code)
    assert any(n['type'] in ('target','roll') for n in result),code
    count+=1
print('PASS all '+str(count)+' compact mixer routes resolve to executable spell nodes.')

# Regression: Avrae lowercases the user's command choice before evaluating it.
exact='Water+Wood|none/lightning'
result=route(main['automation'],exact)
assert result[0]['type']=='roll' and result[0]['name']=='healing'
assert result[0]['dice']=='(2d10)*2'
assert any(n['type']=='target' and any(e['type']=='damage' and e['damage']=='-{healing}' for e in n['effects']) for n in result)
print('PASS exact reported Water+Wood command reaches the doubled healing roll and HP application after Avrae lowercase normalization.')
