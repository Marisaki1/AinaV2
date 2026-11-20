"""Owner-scoped checklist aggregation; changes target original documents."""
import copy
from django.db import transaction
from .models import Resource
from .documents import plain_text
from .services import save_resource, Conflict

def tasks(document, path=()):
    if document.get('type')=='taskItem':
        yield {'path':list(path),'checked':bool(document.get('attrs',{}).get('checked')),
               'text':plain_text((document.get('content') or [{}])[0]).strip()}
    for i,child in enumerate(document.get('content',[])):
        yield from tasks(child,(*path,i))

def checklist_view(world, params):
    query=str(params.get('q','')).casefold();state=params.get('state','open')
    if state not in ('open','complete','all'):raise ValueError('Choose open, complete or all tasks.')
    try: offset=int(params.get('offset',0))
    except (TypeError,ValueError):raise ValueError('Invalid checklist page.')
    if not 0<=offset<=100000:raise ValueError('Invalid checklist page.')
    rows=[];completed=0;total=0
    for entry in Resource.objects.filter(world=world,deleted_at=None).order_by('-updated_at'):
        if entry.data.get('notebook_type'):continue
        for item in tasks(entry.document):
            if query and query not in (entry.title+' '+item['text']).casefold():continue
            total+=1;completed+=item['checked']
            if state=='open' and item['checked'] or state=='complete' and not item['checked']:continue
            rows.append({**item,'entry_id':str(entry.id),'title':entry.title,'revision':entry.revision})
    return {'tasks':rows[offset:offset+100],'total':len(rows),'all_count':total,'completed':completed,'has_more':len(rows)>offset+100}

def toggle_task(world, value):
    with transaction.atomic():
        entry=Resource.objects.filter(world=world,id=value.get('entry_id'),deleted_at=None).first()
        if entry is None:raise ValueError('Choose an available original in this world.')
        if type(value.get('expected_revision')) is not int or value['expected_revision']!=entry.revision:
            raise Conflict('This note changed elsewhere. Refresh tasks before changing it.')
        if type(value.get('checked')) is not bool:raise ValueError('Choose a valid completion state.')
        path=value.get('path')
        if not isinstance(path,list) or len(path)>30 or any(type(i) is not int or i<0 for i in path):raise ValueError('Invalid checklist item.')
        document=copy.deepcopy(entry.document);node=document
        try:
            for i in path:node=node['content'][i]
        except (KeyError,IndexError,TypeError):raise Conflict('This checklist item moved. Refresh tasks.')
        if node.get('type')!='taskItem':raise ValueError('Choose a checklist item.')
        node.setdefault('attrs',{})['checked']=value['checked']
        saved=save_resource(world,{'document':document,'expected_revision':entry.revision},entry)
        return {'entry_id':str(saved.id),'revision':saved.revision}
