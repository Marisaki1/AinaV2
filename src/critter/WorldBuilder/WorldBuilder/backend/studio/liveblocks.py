"""Native source blocks: bounded HTML fallback and filtered owner/reader data."""
import html
from django.core.exceptions import ValidationError
from .models import Asset

KINDS = {'table', 'generator', 'map', 'timeline', 'relationship'}


def validate_document_blocks(document, world):
    from .models import Resource
    from .tools import dice_spec
    def visit(node):
        kind, attrs = node.get('type'), node.get('attrs', {})
        if kind == 'sourceBlock':
            identity = attrs.get('id')
            try:
                valid = Resource.objects.filter(id=identity, world=world, kind__in=KINDS).exists()
            except (ValueError, TypeError, ValidationError):
                valid = False
            if not valid:
                raise ValueError('Live blocks must reference supported entries in this world.')
        if kind == 'diceButton':
            dice_spec(attrs.get('formula', ''))
        for child in node.get('content', []):
            visit(child)
    visit(document)


def block_html(attrs, references, reader):
    target = references.get(str(attrs.get('id')))
    if not target or target.get('kind') not in KINDS:
        return '<p class="source-unavailable">Unavailable live source</p>'
    identity = target['id']
    label = html.escape(target['title'])
    link = '<a href="/#/entry/' + html.escape(identity, quote=True) + '">' + label + '</a>'
    body = '<p>Open the original ' + html.escape(target['kind']) + ' to explore this source.</p>'
    data = target.get('data', {})
    if target['kind'] in ('table', 'generator'):
        columns = data.get('columns', [])[:8]
        def cell(row, col):
            val = row.get('cells', {}).get(col['id'], row.get('value', ''))
            if col.get('type') == 'article' and val:
                entry = references.get(str(val))
                return html.escape(entry['title']) if entry else 'Unavailable entry'
            if isinstance(val, bool):
                val = 'Yes' if val else 'No'
            return html.escape(str(val if val is not None else '')[:2000])
        header = ''.join('<th>' + html.escape(c.get('label', '')) + '</th>' for c in columns)
        rows = data.get('rows', [])
        body = '<table><thead><tr>' + header + '</tr></thead><tbody>' + ''.join(
            '<tr>' + ''.join('<td>' + cell(r, c) + '</td>' for c in columns) + '</tr>' for r in rows[:12]) + '</tbody></table>'
        if len(rows) > 12 or len(data.get('columns', [])) > 8:
            body += '<p>Preview limited to 12 rows and 8 columns. Open the original for the full table.</p>'
    return '<section class="live-source-fallback" data-live-source="' + html.escape(identity, quote=True) + '"><h3>' + link + '</h3>' + body + '</section>'


def projection(resource, reader=False):
    from .services import serialize, asset_json, public_references
    if resource.deleted_at or resource.kind not in KINDS:
        return None
    value = serialize(resource, reader=reader)
    if value is None:
        return None
    references = public_references(resource.world) if reader else {
        str(row.id): {'title': row.title} for row in resource.world.resources.filter(deleted_at=None)}
    # Only expose labels needed by the selected table; never send the owner index to a reader.
    columns = value['data'].get('columns', []) if value['kind'] in ('table', 'generator') else []
    linked_ids = {row.get('cells', {}).get(c['id']) for row in value['data'].get('rows', []) for c in columns if c.get('type') == 'article'}
    links = {key: references[key]['title'] for key in linked_ids if key in references}
    asset_ids = set()
    def assets(node):
        if isinstance(node, dict):
            for key, val in node.items():
                if key in ('asset_id', 'icon_asset_id') and isinstance(val, str):
                    asset_ids.add(val)
                assets(val)
        elif isinstance(node, list):
            for child in node:
                assets(child)
    if value['kind'] == 'map':
        assets(value['data'])
    return {'entry': value, 'links': links, 'assets': [asset_json(a) for a in Asset.objects.filter(world=resource.world, id__in=asset_ids)],
            'audience': 'reader' if reader else 'owner'}
