import React, { useEffect, useState } from "react";

export function noteText(node: any): string {
  if(node.type==='sourceBlock')return '[Live source: '+(node.attrs?.label||'Source')+']';
  if(node.type==='diceButton')return (node.attrs?.label||'Roll')+' ('+(node.attrs?.formula||'')+')';
  if(node.type==='snippet')return '[Snippet: '+(node.attrs?.label||'Reusable snippet')+']';
  if (node.type === "text") return node.text || "";
  if (["resourceLink", "variable"].includes(node.type))
    return node.attrs?.label || "";
  const value = (node.content || [])
    .map(noteText)
    .join(["paragraph", "heading"].includes(node.type) ? "" : "\n");
  return node.type === "taskItem"
    ? `[${node.attrs?.checked ? "x" : " "}] ${value}`
    : value;
}

export function WritingTools({ editor }: { editor: any }) {
  const [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState(""),
    [index, setIndex] = useState(0),
    [, update] = useState(0),
    [feedback, setFeedback] = useState("");
  useEffect(() => {
    const changed = () => update((n) => n + 1);
    editor.on("update", changed);
    return () => {
      editor.off("update", changed);
    };
  }, [editor]);
  const headings: { title: string; pos: number; level: number }[] = [],
    matches: { from: number; to: number }[] = [];
  let taskCount = 0,
    completed = 0;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === "taskItem") {
      taskCount++;
      if (node.attrs.checked) completed++;
    }
    if (node.type.name === "heading")
      headings.push({ title: node.textContent, pos, level: node.attrs.level });
    if (query && node.isTextblock) {
      let raw = "";
      const positions: number[] = [];
      node.descendants((child: any, offset: number) => {
        if (child.isText) {
          for (let i = 0; i < child.text.length; i++) {
            raw += child.text[i];
            positions.push(pos + 1 + offset + i);
          }
        } else if (child.isLeaf) {
          raw += "\uFFFC";
          positions.push(pos + 1 + offset);
        }
      });
      const text = raw.toLocaleLowerCase(),
        term = query.toLocaleLowerCase();
      let at = 0;
      while ((at = text.indexOf(term, at)) !== -1) {
        matches.push({
          from: positions[at],
          to: positions[at + query.length - 1] + 1,
        });
        at += Math.max(1, term.length);
      }
      return false;
    }
  });
  const jump = (next: number) => {
    if (!matches.length) return;
    const i = (next + matches.length) % matches.length;
    setIndex(i);
    editor.chain().focus().setTextSelection(matches[i]).scrollIntoView().run();
  };
  const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="writing-tools">
      {taskCount > 0 && (
        <span role="status">
          Checklist: {completed}/{taskCount} complete
        </span>
      )}
      <details>
        <summary>Outline · {headings.length} headings</summary>
        <nav aria-label="Note outline">
          {headings.length ? (
            headings.map((h, i) => (
              <button
                type="button"
                className="text-button"
                key={i}
                style={{ paddingLeft: h.level * 10 }}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(h.pos + 1)
                    .scrollIntoView()
                    .run()
                }
              >
                {h.title || "Untitled heading"}
              </button>
            ))
          ) : (
            <span>Add headings to navigate this note.</span>
          )}
        </nav>
      </details>
      <label>
        Find in note
        <input
          aria-label="Find in note"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jump(index + (e.shiftKey ? -1 : 1));
            }
          }}
        />
      </label>
      {query && (
        <details>
          <summary>Replace text</summary>
          <input
            aria-label="Replacement text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button
            type="button"
            className="text-button"
            disabled={!matches.length}
            onClick={() => {
              const match = matches[Math.max(0, index) % matches.length];
              editor
                .chain()
                .focus()
                .insertContentAt(
                  match,
                  replacement ? { type: "text", text: replacement } : "",
                )
                .run();
              setIndex(-1);
            }}
          >
            Replace match
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!matches.length}
            onClick={() => {
              let tr = editor.state.tr;
              for (const match of [...matches].reverse())
                tr = tr.insertText(replacement, match.from, match.to);
              editor.view.dispatch(tr);
              setIndex(-1);
            }}
          >
            Replace all ({matches.length})
          </button>
        </details>
      )}
      <span role="status">
        {query
          ? `${matches.length} matches`
          : `${words} words · ${Math.max(1, Math.ceil(words / 200))} min read`}
      </span>
      <button
        type="button"
        className="text-button"
        disabled={!matches.length}
        onClick={() => jump(index - 1)}
      >
        Previous
      </button>
      <button
        type="button"
        className="text-button"
        disabled={!matches.length}
        onClick={() => jump(index + 1)}
      >
        Next
      </button>
      <button
        type="button"
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(noteText(editor.getJSON()));
            setFeedback("Copied note text.");
          } catch {
            setFeedback(
              "Clipboard unavailable. Select and copy the note manually.",
            );
          }
        }}
      >
        Copy text
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([noteText(editor.getJSON())], {
              type: "text/plain;charset=utf-8",
            }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "note.txt";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download text
      </button>
      {feedback && <span role="status">{feedback}</span>}
    </div>
  );
}
