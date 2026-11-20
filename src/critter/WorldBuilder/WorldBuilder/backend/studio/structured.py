"""Versioned article field schemas with explicit, lossless upgrades."""
import copy
import math
import html
from django.core.exceptions import ValidationError
from .models import Resource

TYPES={'text','long','number','check','select','reference','list'}

def definitions(fields):
    if not isinstance(fields,list) or len(fields)>100:raise ValueError('Use up to 100 template fields.')
    result=[];ids=set();names=set()
    for value in fields:
        if not isinstance(value,dict):raise ValueError('Invalid template field.')
        field=copy.deepcopy(value);name=field.get('name');identity=field.get('id') or ('legacy:'+str(name))
        if not isinstance(name,str) or not name.strip() or len(name)>100:raise ValueError('Give each field a name of up to 100 characters.')
        if not isinstance(identity,str) or len(identity)>150 or identity in ids or name.casefold() in names:raise ValueError('Fields need distinct stable IDs and names.')
        if field.get('type','text') not in TYPES:raise ValueError('Unsupported template field type.')
        for flag in ['required','private']:
            if flag in field and type(field[flag]) is not bool:raise ValueError('Field flags must be checked or unchecked.')
        if not isinstance(field.get('section',''),str) or len(field.get('section',''))>100:raise ValueError('Use section names of up to 100 characters.')
        options=field.get('options',[])
        if not isinstance(options,list) or len(options)>100 or any(not isinstance(v,str) or not v.strip() or len(v)>150 for v in options) or len(set(options))!=len(options):raise ValueError('Use up to 100 distinct choices.')
        field.update(id=identity,name=name.strip(),type=field.get('type','text'))
        result.append(field);ids.add(identity);names.add(name.casefold())
    return result

def valid_value(field,value,world):
    if value is None or value=='':return True
    kind=field['type']
    if kind in ('text','long'):return isinstance(value,str) and len(value)<=20000
    if kind=='number':return type(value) in (int,float) and math.isfinite(value) and abs(value)<=1e15
    if kind=='check':return type(value) is bool
    if kind=='select':return isinstance(value,str) and value in field.get('options',[])
    if kind=='list':return isinstance(value,list) and len(value)<=100 and all(isinstance(v,str) and len(v)<=2000 for v in value)
    if kind=='reference':
        if not isinstance(value,str):return False
        try:return Resource.objects.filter(world=world,id=value).exists()
        except (ValueError,TypeError,ValidationError):return False
    return False

def source_for(template,world):
    if not isinstance(template,str) or not template.startswith('custom:'):return None
    try:return Resource.objects.filter(world=world,id=template[7:],kind='template',deleted_at=None).first()
    except (ValueError,TypeError,ValidationError):return None

def schema_for(source):
    return {'template_id':str(source.id),'template_revision':source.revision,'fields':definitions(source.data.get('fields',[]))}

def upgrade(data,schema,world):
    result=copy.deepcopy(data);old=result.get('structured_schema',{});values=copy.deepcopy(result.get('structured_values',{}));retired=copy.deepcopy(result.get('structured_retired',[]))
    if not isinstance(old,dict) or not isinstance(values,dict) or not isinstance(retired,list) or any(not isinstance(r,dict) for r in retired):raise ValueError('Invalid stored field schema or retained values.')
    old_fields={f['id']:f for f in old.get('fields',[])}
    for field in schema['fields']:
        key=field['id']
        if key not in values:
            recover=next((r for r in reversed(retired) if r.get('id')==key and valid_value(field,r.get('value'),world)),None)
            if recover is not None:values[key]=copy.deepcopy(recover['value'])
        if key not in values and not old and field['name'] in result.get('fields',{}):values[key]=copy.deepcopy(result['fields'][field['name']])
        if key in values and not valid_value(field,values[key],world):
            retired.append({'id':key,'name':old_fields.get(key,field)['name'],'value':values.pop(key),'reason':'Incompatible with updated field type or choices'})
        if key not in values and field['type']=='check':values[key]=False
    active={f['id'] for f in schema['fields']}
    for key in list(values):
        if key not in active:
            retired.append({'id':key,'name':old_fields.get(key,{}).get('name',key),'value':values.pop(key),'reason':'Field removed from schema'})
    if len(retired)>1000:raise ValueError('Too many retained values; export and reorganize this article before upgrading.')
    result.update(structured_schema=copy.deepcopy(schema),structured_values=values,structured_retired=retired)
    return result

def prepare(kind,template,data,world,current=None,historical=False,allow_update=False):
    data=copy.deepcopy(data)
    if kind=='template':
        data['fields']=definitions(data.get('fields',[]));return data
    if not isinstance(template,str) or not template.startswith('custom:'):return data
    source=source_for(template,world);saved=current.data.get('structured_schema') if current and current.template==template else None
    if saved and not historical and not allow_update:
        if data.get('structured_schema',saved)!=saved:raise ValueError('Use Review template update to change this article schema.')
        data['structured_schema']=copy.deepcopy(saved)
        if 'structured_retired' not in data:data['structured_retired']=copy.deepcopy(current.data.get('structured_retired',[]))
        if 'structured_values' not in data:
            # Legacy API clients still write fields by name. Preserve the schema.
            data['structured_values']=copy.deepcopy(current.data.get('structured_values',{}))
            for field in saved['fields']:
                if field['name'] in data.get('fields',{}):data['structured_values'][field['id']]=data['fields'][field['name']]
    elif historical and data.get('structured_schema'):
        pass
    elif allow_update and data.get('structured_schema'):
        pass
    elif source:
        data=upgrade(data,schema_for(source),world)
    elif not saved:
        if current and current.template==template:return data
        raise ValueError('Choose an available custom template in this world.')
    schema=data.get('structured_schema')
    if schema:
        if not isinstance(schema,dict) or set(schema)!={'template_id','template_revision','fields'} or 'custom:'+str(schema['template_id'])!=template:raise ValueError('Invalid article field schema.')
        fields=definitions(schema['fields']);values=data.get('structured_values',{})
        if type(schema['template_revision']) is not int or schema['template_revision']<1:raise ValueError('Invalid template revision.')
        if not isinstance(values,dict):raise ValueError('Structured values must be an object.')
        retired=data.get('structured_retired',[])
        if not isinstance(retired,list) or len(retired)>1000 or any(not isinstance(r,dict) or not isinstance(r.get('id'),str) or not isinstance(r.get('name'),str) or 'value' not in r for r in retired):raise ValueError('Invalid retained field values.')
        for field in fields:
            if field['id'] in values and not valid_value(field,values[field['id']],world):raise ValueError('Invalid value for '+field['name'])
        aliases=copy.deepcopy(data.get('fields',{}))
        for field in fields:
            if field['id'] in values:aliases[field['name']]=copy.deepcopy(values[field['id']])
        data['fields']=aliases
    return data

def required(resource):
    schema=resource.data.get('structured_schema')
    if not schema:return False
    for field in schema['fields']:
        value=resource.data.get('structured_values',{}).get(field['id'])
        if field.get('required') and (value is None or value=='' or value==[] or isinstance(value,list) and not any(v.strip() for v in value)):raise ValueError('Complete the required field: '+field['name'])
    return True

def project(data,references,reader=False):
    schema=data.get('structured_schema')
    if not schema:return
    if reader:
        schema=copy.deepcopy(schema);schema.pop('template_id',None);schema['fields']=[{key:f[key] for key in ('id','name','type','section') if key in f} for f in schema['fields'] if not f.get('private')];data['structured_schema']=schema
        data.pop('structured_retired',None);data.pop('fields',None)
    fields=schema['fields'];values={f['id']:data.get('structured_values',{}).get(f['id']) for f in fields} if reader else copy.deepcopy(data.get('structured_values',{}));labels={}
    for field in fields:
        if field['type']=='reference' and values.get(field['id']):
            target=references.get(str(values[field['id']]))
            labels[field['id']]=target['title'] if target else 'Unavailable reference'
            if reader and not target:values[field['id']]=''
    data['structured_values']=values;data['structured_labels']=labels

def review(resource):
    source=source_for(resource.template,resource.world)
    if source is None:return {'available':False,'changes':[]}
    schema=schema_for(source);old=resource.data.get('structured_schema',{});before={f['id']:f for f in old.get('fields',[])};after={f['id']:f for f in schema['fields']};changes=[]
    for key,field in after.items():
        if key not in before:changes.append('Add '+field['name']+' ('+field['type']+')')
        elif field!=before[key]:
            keys=[k for k in set(field)|set(before[key]) if field.get(k)!=before[key].get(k)]
            changes.append('Update '+before[key]['name']+' → '+field['name']+' ('+', '.join(sorted(keys))+')')
    for key,field in before.items():
        if key not in after:changes.append('Retain removed value: '+field['name'])
    if before and list(before)!=list(after):changes.append('Update field order')
    data=upgrade(resource.data,schema,resource.world)
    return {'available':True,'expected_revision':resource.revision,'template_revision':source.revision,'schema':schema,'changes':changes,'retained':data.get('structured_retired',[]),'data':data}

def render_fields(data,references,reader=False):
    schema=data.get('structured_schema')
    if not schema:return ''
    values=data.get('structured_values',{});groups={}
    for field in schema['fields']:
        if reader and field.get('private'):continue
        value=values.get(field['id']);kind=field['type']
        if kind=='check':rendered='Yes' if value else 'No'
        elif kind=='list':rendered='<ul>'+''.join('<li>'+html.escape(v)+'</li>' for v in (value or []))+'</ul>'
        elif kind=='reference' and value:
            target=references.get(str(value));rendered=('<a href="/#/entry/'+html.escape(target['id'],quote=True)+'">'+html.escape(target['title'])+'</a>') if target else 'Unavailable reference'
        else:rendered=html.escape(str(value if value is not None else '')).replace('\n','<br>')
        groups.setdefault(field.get('section') or 'Details',[]).append('<dt>'+html.escape(field['name'])+('</dt><dd>'+rendered+'</dd>'))
    return ''.join('<section><h3>'+html.escape(section)+'</h3><dl class="structured-fields">'+''.join(rows)+'</dl></section>' for section,rows in groups.items())

def reference_ids(data):
    schema=data.get('structured_schema',{});values=data.get('structured_values',{})
    if not isinstance(schema,dict) or not isinstance(schema.get('fields',[]),list) or not isinstance(values,dict):return set()
    return {values[f['id']] for f in schema.get('fields',[]) if isinstance(f,dict) and f.get('type')=='reference' and isinstance(values.get(f.get('id')),str) and values.get(f.get('id'))}
