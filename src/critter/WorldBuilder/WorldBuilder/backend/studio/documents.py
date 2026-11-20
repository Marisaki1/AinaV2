import copy
import html
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit

import bleach
import markdown

TYPES = {
    "doc",
    "paragraph",
    "text",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "hardBreak",
    "horizontalRule",
    "image",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
    "resourceLink",
    "privateBlock",
    "variable",
    "taskList",
    "taskItem",
    "snippet",
    "sourceBlock",
    "diceButton",
}
MARKS = {"bold", "italic", "strike", "code", "underline", "link"}
SAFE_TAGS = [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "b",
    "em",
    "i",
    "s",
    "u",
    "hr",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "span",
]


def safe_url(value, image=False):
    if not isinstance(value, str) or len(value) > 2000:
        return ""
    if image:
        if re.fullmatch(r"/media/[a-f0-9-]{36}", value):
            return value
        try:
            parts = urlsplit(value)
            return (
                value
                if parts.scheme in ("https", "http")
                and parts.hostname
                and not parts.username
                and not parts.password
                and not re.search(r"[\x00-\x20\x7f]", value)
                else ""
            )
        except ValueError:
            return ""
    if value.startswith("/#/") or re.fullmatch(r"/media/[a-f0-9-]{36}", value):
        return value
    parts = urlsplit(value)
    return (
        value
        if parts.scheme in ("https", "http", "mailto")
        and not re.search(r"[\x00-\x20]", value)
        else ""
    )


def validate_document(value):
    if value in ({}, None):
        value = {"type": "doc", "content": [{"type": "paragraph"}]}
    if not isinstance(value, dict) or value.get("type") != "doc":
        raise ValueError("The document must have a document root.")
    count = 0
    live_count = 0

    def visit(node, depth=0):
        nonlocal count, live_count
        count += 1
        if depth > 30 or count > 18000:
            raise ValueError("This document is too complex.")
        if not isinstance(node, dict) or node.get("type") not in TYPES:
            raise ValueError("Unsupported document block.")
        if "text" in node and (
            not isinstance(node["text"], str) or len(node["text"]) > 200000
        ):
            raise ValueError("Invalid document text.")
        attrs = node.get("attrs", {})
        if not isinstance(attrs, dict):
            raise ValueError("Invalid block properties.")
        if node['type'] == 'taskItem' and not isinstance(attrs.get('checked', False), bool):
            raise ValueError('Checklist state must be true or false.')
        if node["type"] == "image" and not safe_url(attrs.get("src"), True):
            raise ValueError(
                "Use a direct HTTP/HTTPS image URL or an image from this world’s media library."
            )
        if node['type'] in ('sourceBlock', 'diceButton'):
            live_count += 1
            if live_count > 40:
                raise ValueError('Use up to 40 interactive blocks per document.')
            if node.get('content'):
                raise ValueError('Interactive blocks cannot contain hidden document children.')
            import uuid
            if not isinstance(attrs.get('label', ''), str) or len(attrs.get('label', '')) > 180:
                raise ValueError('Live block labels must be text up to 180 characters.')
            if node['type'] == 'sourceBlock' and attrs.get('id'):
                try:
                    uuid.UUID(attrs['id'])
                except (ValueError, AttributeError, TypeError) as error:
                    raise ValueError('Choose a valid live source ID.') from error
            if node['type'] == 'diceButton':
                from .tools import dice_spec
                dice_spec(attrs.get('formula', ''))
        children = node.get("content", [])
        if not isinstance(children, list):
            raise ValueError("Invalid block contents.")
        marks = node.get("marks", [])
        if not isinstance(marks, list):
            raise ValueError("Invalid text formatting.")
        for mark in marks:
            if not isinstance(mark, dict) or mark.get("type") not in MARKS:
                raise ValueError("Unsupported text formatting.")
            properties = mark.get("attrs", {})
            if not isinstance(properties, dict) or (
                "href" in properties and not isinstance(properties["href"], str)
            ):
                raise ValueError("Invalid link properties.")
        for child in children:
            visit(child, depth + 1)

    visit(value)
    return copy.deepcopy(value)


def plain_text(doc, reader=False):
    if not isinstance(doc, dict):
        return ""
    if reader and doc.get("type") == "privateBlock":
        return ""
    return (
        str(doc.get("text", ""))
        + " "
        + " ".join(plain_text(c, reader) for c in doc.get("content", []))
    )


def reference_ids(doc):
    result = set()

    def walk(n):
        if n.get("type") in ("resourceLink", "variable", "snippet", "sourceBlock") and n.get("attrs", {}).get(
            "id"
        ):
            result.add(str(n["attrs"]["id"]))
        for mark in n.get("marks", []):
            href = mark.get("attrs", {}).get("href", "")
            match = re.search(r"/#/entry/([a-f0-9-]{36})", href)
            if match:
                result.add(match.group(1))
        for child in n.get("content", []):
            walk(child)

    walk(doc)
    return result


def render(doc, references=None, reader=False, auto_links=False, exclude="", _seen=(), _budget=None):
    references = references or {}
    if _budget is None:
        _budget=[18000,2000000]
    from .auto_links import linker

    link_text = linker(references, exclude) if auto_links else html.escape

    def walk(n, code=False):
        _budget[0]-=1
        _budget[1]-=len(n.get('text',''))
        if _budget[0]<0 or _budget[1]<0:
            return '<span>Snippet render limit reached</span>'
        kind = n.get("type", "paragraph")
        attrs = n.get("attrs") or {}
        if kind == 'sourceBlock':
            from .liveblocks import block_html
            return block_html(attrs, references, reader)
        if kind == 'diceButton':
            formula = str(attrs.get('formula', ''))
            return '<span class="dice-fallback" data-live-dice="' + html.escape(formula, quote=True) + '" data-dice-label="' + html.escape(attrs.get('label', '') or 'Roll', quote=True) + '">' + html.escape(attrs.get('label', '') or 'Roll') + ' (' + html.escape(formula) + ')</span>'
        if kind == 'snippet':
            identity=str(attrs.get('id',''));target=references.get(identity)
            if not target or not target.get('data',{}).get('reusable_snippet') or not target.get('document'):
                return '<span>Unavailable snippet</span>'
            if identity in (*_seen,exclude) or len(_seen)>=8:
                return '<span>Snippet cycle or depth limit</span>'
            return '<section class="reusable-snippet">'+render(target['document'],references,reader,auto_links,identity,(*_seen,exclude),_budget)+'</section>'
        if kind == "privateBlock" and reader:
            return ""
        if kind in ("resourceLink", "variable"):
            target = references.get(str(attrs.get("id")))
            if not target:
                return "<span>Unavailable reference</span>"
            if kind == "variable":
                return (
                    '<span class="variable">'
                    + html.escape(
                        str(target.get("data", {}).get("value", target["title"]))
                    )
                    + "</span>"
                )
            return (
                '<a href="/#/entry/'
                + html.escape(target["id"])
                + '">'
                + html.escape(target["title"])
                + "</a>"
            )
        if kind == "text":
            text = (
                html.escape
                if code
                or any(mark["type"] in ("code", "link") for mark in n.get("marks", []))
                else link_text
            )(n.get("text", ""))
            for mark in n.get("marks", []):
                tag = {
                    "bold": "strong",
                    "italic": "em",
                    "strike": "s",
                    "code": "code",
                    "underline": "u",
                }.get(mark["type"])
                if tag:
                    text = f"<{tag}>{text}</{tag}>"
                elif mark["type"] == "link":
                    url = safe_url(mark.get("attrs", {}).get("href", ""))
                    internal = re.fullmatch(r'/#/entry/([a-f0-9-]{36})',url)
                    if reader and internal and internal.group(1) not in references:
                        text='Unavailable reference'
                        continue
                    if url:
                        text = f'<a href="{html.escape(url, quote=True)}" rel="noopener noreferrer">{text}</a>'
            return text
        if kind == "image":
            src = safe_url(attrs.get("src"), True)
            return (
                f'<img src="{html.escape(src)}" alt="{html.escape(str(attrs.get("alt") or ""), quote=True)}" referrerpolicy="no-referrer" loading="lazy">'
                if src
                else ""
            )
        if kind == "hardBreak":
            return "<br>"
        if kind == "horizontalRule":
            return "<hr>"
        children = "".join(
            walk(child, code or kind == "codeBlock") for child in n.get("content", [])
        )
        if kind == "doc":
            return children
        if kind == 'taskList':
            return '<ul class="checklist" data-type="taskList">' + children + '</ul>'
        if kind == 'taskItem':
            checked = bool(attrs.get('checked'))
            return '<li data-type="taskItem" data-checked="' + str(checked).lower() + '"><input type="checkbox" disabled' + (' checked' if checked else '') + '>' + children + '</li>'
        if kind == "heading":
            tag = "h" + str(max(1, min(6, int(attrs.get("level", 2)))))
        else:
            tag = {
                "paragraph": "p",
                "bulletList": "ul",
                "orderedList": "ol",
                "listItem": "li",
                "blockquote": "blockquote",
                "codeBlock": "pre",
                "table": "table",
                "tableRow": "tr",
                "tableCell": "td",
                "tableHeader": "th",
                "privateBlock": "aside",
            }.get(kind, "div")
        return f"<{tag}>{children}</{tag}>"

    return walk(doc)


def reader_document(doc):
    doc = copy.deepcopy(doc)

    def walk(n):
        n["content"] = [
            walk(c) for c in n.get("content", []) if c.get("type") != "privateBlock"
        ]
        if not n["content"]:
            n.pop("content", None)
        return n

    return walk(doc)


class DocumentParser(HTMLParser):
    blocks = {
        "p": "paragraph",
        "h1": "heading",
        "h2": "heading",
        "h3": "heading",
        "h4": "heading",
        "h5": "heading",
        "h6": "heading",
        "ul": "bulletList",
        "ol": "orderedList",
        "li": "listItem",
        "blockquote": "blockquote",
        "pre": "codeBlock",
        "table": "table",
        "tr": "tableRow",
        "td": "tableCell",
        "th": "tableHeader",
    }
    marks = {
        "b": "bold",
        "strong": "bold",
        "em": "italic",
        "i": "italic",
        "s": "strike",
        "del": "strike",
        "u": "underline",
        "code": "code",
        "a": "link",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.doc = {"type": "doc", "content": []}
        self.stack = [self.doc]
        self.open = []
        self.active = []

    def append(self, node):
        self.stack[-1].setdefault("content", []).append(node)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in self.blocks:
            node = {"type": self.blocks[tag], "content": []}
            if tag == 'ul' and attrs.get('data-type') == 'taskList':
                node['type'] = 'taskList'
            if tag == 'li' and attrs.get('data-type') == 'taskItem':
                node.update(type='taskItem', attrs={'checked': attrs.get('data-checked') == 'true'})
            if tag.startswith("h") and len(tag) == 2:
                node["attrs"] = {"level": int(tag[1])}
            self.append(node)
            self.stack.append(node)
            self.open.append(tag)
        elif tag in self.marks:
            mark = {"type": self.marks[tag]}
            if tag == "a":
                mark["attrs"] = {"href": safe_url(attrs.get("href", ""))}
            self.active.append((tag, mark))
        elif tag == "br":
            self.append({"type": "hardBreak"})
        elif tag == "hr":
            self.append({"type": "horizontalRule"})
        elif tag == "img" and safe_url(attrs.get("src"), True):
            self.append(
                {
                    "type": "image",
                    "attrs": {"src": attrs["src"], "alt": attrs.get("alt", "")},
                }
            )

    def handle_endtag(self, tag):
        if tag in self.open:
            while self.open:
                current = self.open.pop()
                self.stack.pop()
                if current == tag:
                    break
        for i in range(len(self.active) - 1, -1, -1):
            if self.active[i][0] == tag:
                self.active.pop(i)
                break

    def handle_data(self, data):
        if not data or (
            not data.strip()
            and self.stack[-1]["type"]
            in ("doc", "bulletList", "orderedList", "table", "tableRow")
        ):
            return
        if self.stack[-1]["type"] in (
            "doc",
            "listItem",
            "taskItem",
            "tableCell",
            "tableHeader",
            "blockquote",
        ):
            self.append({"type": "paragraph", "content": []})
            self.stack.append(self.stack[-1]["content"][-1])
            self.open.append("__text")
        node = {"type": "text", "text": data}
        if self.active:
            node["marks"] = [copy.deepcopy(m) for _, m in self.active]
        self.append(node)
        if self.open and self.open[-1] == "__text":
            self.open.pop()
            self.stack.pop()


def from_source(text, fmt="markdown"):
    source = (
        text
        if fmt == "html"
        else markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    )
    clean = bleach.clean(
        source,
        tags=SAFE_TAGS,
        attributes={"a": ["href"], "img": ["src", "alt"], 'ul':['data-type'], 'li':['data-type','data-checked']},
        protocols=["https", "http", "mailto"],
        strip=True,
    )
    parser = DocumentParser()
    parser.feed(clean)
    parser.close()

    # The editor models images as blocks. HTML/Markdown places them inside
    # paragraphs; lift them while retaining text order and formatting.
    def blocks(node):
        content = []
        for child in node.get("content", []):
            content.extend(blocks(child))
        if "content" in node:
            node["content"] = content
        if node["type"] in ("paragraph", "heading") and any(
            child["type"] == "image" for child in content
        ):
            result, inline = [], []
            for child in content:
                if child["type"] == "image":
                    if inline:
                        result.append({**node, "content": inline})
                        inline = []
                    result.append(child)
                else:
                    inline.append(child)
            if inline:
                result.append({**node, "content": inline})
            return result
        if node["type"] == "listItem" and (
            not content or content[0]["type"] != "paragraph"
        ):
            node["content"] = [{"type": "paragraph"}, *content]
        return [node]

    blocks(parser.doc)
    def checklists(node):
        for child in node.get('content', []):
            checklists(child)
        if node['type'] != 'bulletList':
            return
        items = node.get('content', [])
        for item in items:
            first = (item.get('content') or [{}])[0]
            text = (first.get('content') or [{}])[0]
            if not re.match(r'^\[[ xX]\]\s', text.get('text', '')):
                return
        if items:
            node['type'] = 'taskList'
            for item in items:
                text = item['content'][0]['content'][0]
                item.update(type='taskItem', attrs={'checked': text['text'][1].lower() == 'x'})
                text['text'] = text['text'][4:]
    checklists(parser.doc)
    return validate_document(parser.doc)
