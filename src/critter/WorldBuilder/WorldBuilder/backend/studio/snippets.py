import copy
from .models import Resource
from .documents import validate_document
from .services import check_json

def materialize(resource):
    if not resource.data.get('reusable_snippet') or resource.deleted_at:
        raise ValueError('Choose an available reusable snippet.')
    sources={str(r.id):r.document for r in Resource.objects.filter(world=resource.world,deleted_at=None,data__reusable_snippet=True)}
    count=0
    def expand(node,seen):
        nonlocal count
        count+=1
        if count>18000:raise ValueError('This expanded snippet is too large.')
        if node.get('type')=='snippet':
            identity=str(node.get('attrs',{}).get('id',''))
            if identity in seen or len(seen)>=8:raise ValueError('This snippet contains a cycle or is nested too deeply. Edit its original first.')
            if identity not in sources:raise ValueError('A nested snippet is unavailable. Restore its original before copying.')
            return expand(sources[identity],(*seen,identity))['content']
        value=copy.deepcopy(node);children=[]
        for child in node.get('content',[]):
            result=expand(child,seen);children.extend(result if isinstance(result,list) else [result])
        if 'content' in node:value['content']=children
        return value
    result=expand(resource.document,(str(resource.id),))
    check_json(result)
    return validate_document(result)
