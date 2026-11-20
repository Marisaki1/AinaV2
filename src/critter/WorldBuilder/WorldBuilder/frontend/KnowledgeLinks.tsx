import React, { useState } from "react";
import { Entry, Doc, EMPTY_DOC } from "./domain";
import { SearchableSelect } from "./SearchableSelect";

type Mention = {
  key: string;
  path: number[];
  start: number;
  end: number;
  text: string;
  context: string;
  candidates: Entry[];
};
export function findMentions(
  document: Doc,
  entries: Entry[],
  exclude: string,
): Mention[] {
  const terms = new Map<string, Entry[]>();
  for (const entry of entries.filter(
    (e) => e.id !== exclude && e.kind !== "folder",
  ))
    for (const value of [entry.title, ...entry.aliases]) {
      const term = value.trim().toLowerCase();
      if (term.length < 2) continue;
      const list = terms.get(term) || [];
      if (!list.some((e) => e.id === entry.id)) list.push(entry);
      terms.set(term, list);
    }
  const result: Mention[] = [];
  const walk = (node: any, path: number[], blocked = false) => {
    blocked =
      blocked || ["codeBlock", "resourceLink", "variable"].includes(node.type);
    if (
      !blocked &&
      node.type === "text" &&
      !node.marks?.some((m: any) => ["link", "code"].includes(m.type))
    ) {
      const text = node.text,
        lower = text.toLowerCase(),
        found: any[] = [];
      const protectedRanges = [
        ...text.matchAll(/(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+\.[\w-]+/g),
      ].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
      for (const [term, candidates] of terms) {
        let at = 0;
        while ((at = lower.indexOf(term, at)) !== -1) {
          const end = at + term.length;
          if (
            !/[\p{L}\p{N}_]/u.test(text[at - 1] || " ") &&
            !/[\p{L}\p{N}_]/u.test(text[end] || " ") &&
            !protectedRanges.some(
              (range) => at < range.end && end > range.start,
            )
          )
            found.push({ start: at, end, candidates });
          at = end;
        }
      }
      found.sort((a, b) => a.start - b.start || b.end - a.end);
      let end = -1;
      for (const item of found)
        if (item.start >= end) {
          end = item.end;
          result.push({
            ...item,
            key: path.join(".") + ":" + item.start,
            path,
            text: text.slice(item.start, item.end),
            context: text.slice(Math.max(0, item.start - 40), item.end + 60),
          });
        }
    }
    node.content?.forEach((child: any, i: number) =>
      walk(child, [...path, i], blocked),
    );
  };
  walk(document, []);
  return result;
}
export function linkMentions(
  document: Doc,
  accepted: { mention: Mention; id: string }[],
): Doc {
  const copy = JSON.parse(JSON.stringify(document));
  const groups = new Map<string, typeof accepted>();
  for (const item of accepted) {
    const key = item.mention.path.join(".");
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  // Work backwards so inserting siblings never invalidates later node paths.
  for (const items of [...groups.values()].sort((a, b) => {
    const x = a[0].mention.path,
      y = b[0].mention.path;
    for (let i = 0; i < Math.min(x.length, y.length); i++)
      if (x[i] !== y[i]) return y[i] - x[i];
    return y.length - x.length;
  })) {
    const path = items[0].mention.path;
    let parent = copy;
    for (const index of path.slice(0, -1)) parent = parent.content[index];
    const at = path[path.length - 1],
      node = parent.content[at],
      parts: any[] = [];
    let start = 0;
    for (const { mention: m, id } of items.sort(
      (a, b) => a.mention.start - b.mention.start,
    )) {
      if (m.start > start)
        parts.push({ ...node, text: node.text.slice(start, m.start) });
      parts.push({
        ...node,
        text: node.text.slice(m.start, m.end),
        marks: [
          ...(node.marks || []),
          { type: "link", attrs: { href: "/#/entry/" + id } },
        ],
      });
      start = m.end;
    }
    if (start < node.text.length)
      parts.push({ ...node, text: node.text.slice(start) });
    parent.content.splice(at, 1, ...parts);
  }
  return copy;
}
export function KnowledgeLinks({
  entry,
  entries,
  onChange,
}: {
  entry: Entry;
  entries: Entry[];
  onChange: (document: Doc) => void;
}) {
  const [open, setOpen] = useState(false),
    [ignored, setIgnored] = useState<string[]>([]),
    [choices, setChoices] = useState<Record<string, string>>({});
  const mentions = findMentions(
    entry.document || EMPTY_DOC,
    entries,
    entry.id,
  ).filter((m) => !ignored.includes(m.text.toLowerCase()));
  return (
    <section className="knowledge-links">
      <button
        type="button"
        className="text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Review suggested links ({mentions.length})
      </button>
      {open && (
        <div>
          <p>
            Review mentions before linking them to original entries. Ambiguous
            names require a choice.
          </p>
          <button
            type="button"
            className="button secondary small"
            disabled={!mentions.some((m) => m.candidates.length === 1)}
            onClick={() =>
              onChange(
                linkMentions(
                  entry.document || EMPTY_DOC,
                  mentions
                    .filter((m) => m.candidates.length === 1)
                    .map((mention) => ({
                      mention,
                      id: mention.candidates[0].id,
                    })),
                ),
              )
            }
          >
            Link all unambiguous mentions
          </button>
          <div className="knowledge-link-results">
            {mentions.slice(0, 100).map((m) => (
              <article key={m.key}>
                <strong>{m.text}</strong>
                <p>{m.context}</p>
                {m.candidates.length > 1 && (
                  <label>
                    Choose source
                    <SearchableSelect
                      aria-label={"Source for " + m.text}
                      value={choices[m.key] || ""}
                      onChange={(e) =>
                        setChoices({ ...choices, [m.key]: e.target.value })
                      }
                    >
                      <option value="">Choose an entry</option>
                      {m.candidates.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} · {e.kind}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                )}
                <button
                  type="button"
                  className="button secondary small"
                  disabled={m.candidates.length > 1 && !choices[m.key]}
                  onClick={() =>
                    onChange(
                      linkMentions(entry.document || EMPTY_DOC, [
                        {
                          mention: m,
                          id: choices[m.key] || m.candidates[0].id,
                        },
                      ]),
                    )
                  }
                >
                  Link mention
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setIgnored([...ignored, m.text.toLowerCase()])}
                >
                  Ignore this name
                </button>
              </article>
            ))}
          </div>
          {!mentions.length && <p>No unlinked mentions found.</p>}
        </div>
      )}
    </section>
  );
}
