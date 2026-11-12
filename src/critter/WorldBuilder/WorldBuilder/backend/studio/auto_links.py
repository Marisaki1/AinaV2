"""Non-destructive, audience-scoped links from prose to entry names and aliases."""

import html
import re
from functools import lru_cache

URL = re.compile(r"(?:https?://|www\.)\S+|[\w.+-]+@[\w.-]+\.[\w-]+", re.IGNORECASE)


@lru_cache(maxsize=64)
def matcher(terms):
    names = {}
    for name, identity in terms:
        names.setdefault(name.casefold(), set()).add(identity)
    alternatives = sorted(
        {name for name, _ in terms}, key=lambda name: (-len(name), name)
    )
    expression = (
        re.compile(
            r"(?<!\w)(?:"
            + "|".join(re.escape(name) for name in alternatives)
            + r")(?!\w)",
            re.IGNORECASE,
        )
        if alternatives
        else None
    )
    return expression, names


def linker(references, exclude=""):
    terms = tuple(
        sorted(
            {
                (name.strip(), identity)
                for identity, value in references.items()
                if value.get("kind") != "folder"
                for name in (value.get("title", ""), *value.get("aliases", []))
                if isinstance(name, str) and 2 <= len(name.strip()) <= 180
            }
        )
    )
    expression, names = matcher(terms)

    def link(text):
        if expression is None:
            return html.escape(text)
        protected = list(URL.finditer(text))
        result = []
        end = 0
        for match in expression.finditer(text):
            candidates = names.get(match.group().casefold(), set())
            if len(candidates) != 1 or any(
                match.start() < item.end() and match.end() > item.start()
                for item in protected
            ):
                continue
            identity = next(iter(candidates))
            if identity == exclude:
                continue
            target = references[identity]
            result.append(html.escape(text[end : match.start()]))
            result.append(
                '<a class="resource-link auto-resource-link" data-resource-id="'
                + html.escape(identity, quote=True)
                + '" href="/#/entry/'
                + html.escape(identity, quote=True)
                + '" title="Open source: '
                + html.escape(target["title"], quote=True)
                + '">'
                + html.escape(match.group())
                + "</a>"
            )
            end = match.end()
        result.append(html.escape(text[end:]))
        return "".join(result)

    return link
