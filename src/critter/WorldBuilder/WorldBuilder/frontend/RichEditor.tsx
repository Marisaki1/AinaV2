import React, { useEffect, useRef, useState } from "react";
import { WritingTools } from "./WritingTools";
import { TaskList, TaskItem } from "./TaskBlocks";
import { SnippetNode } from "./SnippetNode";
import { SourceBlock, DiceButton } from "./LiveBlocks";
import { AppContext } from "./domain";
import DOMPurify from "dompurify";
import { post, saveBeforeNavigate } from "./domain";
import { Modal, ErrorBox } from "./ui";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Quote,
  Link2,
  ImagePlus,
  Table2,
  Undo2,
  Redo2,
  EyeOff,
  Minus,
  Braces,
  PanelsTopLeft,
  Dices,
} from "lucide-react";
import type { Doc, Entry } from "./domain";
const ResourceLink = Node.create({
  name: "resourceLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-resource-id") ||
          element.getAttribute("data-variable-id") ||
          element.getAttribute("id") ||
          "",
      },
      label: {
        default: "Linked entry",
        parseHTML: (element) =>
          element.getAttribute("label") ||
          element.textContent ||
          "Linked entry",
      },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-resource-id]", priority: 1100 }];
  },
  renderHTML({ HTMLAttributes }) {
    const { id, label, ...attributes } = HTMLAttributes;
    return [
      "a",
      mergeAttributes(attributes, {
        "data-resource-id": id,
        href: "/#/entry/" + id,
        class: "resource-link",
      }),
      label,
    ];
  },
});
const Variable = ResourceLink.extend({
  name: "variable",
  parseHTML() {
    return [{ tag: "span[data-variable-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const { id, label, ...attributes } = HTMLAttributes;
    return [
      "span",
      mergeAttributes(attributes, {
        "data-variable-id": id,
        class: "variable-token",
        tabindex: 0,
        role: "button",
        "aria-label": "Preview reusable term " + label,
      }),
      label,
    ];
  },
});
const PrivateBlock = Node.create({
  name: "privateBlock",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: "aside[data-private]" }];
  },
  renderHTML() {
    return ["aside", { "data-private": "true", class: "private-block" }, 0];
  },
});
export function RichEditor({
  value,
  onChange,
  onReference,
  onImage,
  onVariable,
  onSnippet,
  onLiveSource,
  ctx,
}: {
  value: Doc;
  ctx?: AppContext;
  onLiveSource?: (insert: (id: string, label: string) => void) => void;
  onChange: (v: Doc) => void;
  onReference?: (insert: (id: string, label: string) => void) => void;
  onImage?: (insert: (url: string, name: string) => void) => void;
  onVariable?: (insert: (id: string, label: string) => void) => void;
  onSnippet?: (
    insert: (entry: Entry, copy: boolean) => void,
    selection?: Doc,
  ) => void;
}) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [diceDraft, setDiceDraft] = useState<{
    formula: string;
    label: string;
  } | null>(null);
  const [diceError, setDiceError] = useState("");
  const [diceBusy, setDiceBusy] = useState(false);
  const diceLock = useRef(false);
  const [markdown, setMarkdown] = useState<string | null>(null),
    [markdownError, setMarkdownError] = useState(""),
    [markdownPreview, setMarkdownPreview] = useState(""),
    [converting, setConverting] = useState(false);
  const markdownDraft = useRef({ text: markdown, busy: converting });
  markdownDraft.current = { text: markdown, busy: converting };
  useEffect(() => {
    if (markdown === null) return;
    const previous = saveBeforeNavigate.current;
    const pending = () =>
      !!markdownDraft.current.text?.trim() || markdownDraft.current.busy;
    const guard = async () => {
      if (markdownDraft.current.busy) return false;
      if (
        pending() &&
        !confirm("Discard this Markdown insertion before leaving?")
      )
        return false;
      if (previous && !(await previous())) return false;
      setMarkdown(null);
      return true;
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (pending()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    saveBeforeNavigate.current = guard;
    window.addEventListener("beforeunload", unload);
    return () => {
      if (saveBeforeNavigate.current === guard)
        saveBeforeNavigate.current = previous;
      window.removeEventListener("beforeunload", unload);
    };
  }, [markdown !== null]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image.configure({ allowBase64: false }),
      TableKit,
      ResourceLink,
      PrivateBlock,
      Variable,
      TaskList,
      TaskItem,
      SnippetNode,
      SourceBlock.configure({ context: () => ctxRef.current }),
      DiceButton.configure({ context: () => ctxRef.current }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "prose-editor", "aria-label": "Entry content" },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") || "";
        const html = event.clipboardData?.getData("text/html") || "";
        if (/<(?:img|table|aside|h[1-6]|strong|em|ul|ol)\b/i.test(html))
          return false;
        if (
          !/(?:!\[[^\]]*\]\(|\[[^\]]+\]\(https?:|^#{1,6}\s|^```|\*\*[^*]+\*\*|^[-*] )/m.test(
            text,
          )
        )
          return false;
        event.preventDefault();
        setMarkdown(text);
        setMarkdownError("");
        setMarkdownPreview("");
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as Doc),
  });
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value))
      editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);
  if (!editor) return null;
  const tool = (
    label: string,
    Icon: any,
    action: () => unknown,
    active = false,
  ) => (
    <button
      key={label}
      type="button"
      className={"editor-tool " + (active ? "active" : "")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => action()}
    >
      <Icon size={16} />
    </button>
  );
  return (
    <div className="rich-editor">
      <WritingTools editor={editor} />
      {diceDraft && (
        <Modal
          title="Insert dice button"
          onClose={() => {
            if (!diceBusy) setDiceDraft(null);
          }}
        >
          <label className="field">
            <span>Roll label</span>
            <input
              maxLength={180}
              value={diceDraft.label}
              onChange={(e) =>
                setDiceDraft({ ...diceDraft, label: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Dice formula</span>
            <input
              value={diceDraft.formula}
              onChange={(e) =>
                setDiceDraft({ ...diceDraft, formula: e.target.value })
              }
            />
          </label>
          {diceError && <ErrorBox message={diceError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={diceBusy}
              onClick={() => setDiceDraft(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={diceBusy}
              onClick={async () => {
                if (diceLock.current) return;
                diceLock.current = true;
                setDiceBusy(true);
                setDiceError("");
                try {
                  await post("/tools/dice-preview", {
                    formula: diceDraft.formula,
                  });
                  editor
                    .chain()
                    .focus()
                    .insertContent({ type: "diceButton", attrs: diceDraft })
                    .run();
                  setDiceDraft(null);
                } catch (e: any) {
                  setDiceError(e.message);
                } finally {
                  diceLock.current = false;
                  setDiceBusy(false);
                }
              }}
            >
              Insert roll
            </button>
          </div>
        </Modal>
      )}
      {markdown !== null && (
        <Modal
          title="Insert Markdown"
          wide
          onClose={() => {
            if (
              !converting &&
              (!markdown.trim() || confirm("Discard this Markdown insertion?"))
            )
              setMarkdown(null);
          }}
        >
          <p>
            Markdown headings, lists, links, tables, code and image links are
            converted into editable rich notes at your cursor. Existing notes
            stay intact.
          </p>
          <label className="field">
            <span>Markdown source</span>
            <textarea
              rows={12}
              value={markdown}
              disabled={converting}
              onChange={(e) => {
                setMarkdown(e.target.value);
                setMarkdownPreview("");
              }}
              placeholder="![Description](https://example.com/image.png)"
            />
          </label>
          {markdownError && <ErrorBox message={markdownError} />}
          {markdownPreview && (
            <div
              className="reader-prose markdown-preview"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(markdownPreview),
              }}
            />
          )}
          <div className="button-row">
            {["Preview Markdown", "Insert Markdown"].map((label) => (
              <button
                key={label}
                className="button secondary"
                disabled={converting || !markdown.trim()}
                onClick={async () => {
                  setConverting(true);
                  setMarkdownError("");
                  try {
                    const parsed = await post<{ document: Doc; html: string }>(
                      "/documents/parse",
                      { text: markdown },
                    );
                    if (editor.isDestroyed) return;
                    if (label === "Preview Markdown")
                      setMarkdownPreview(parsed.html);
                    else {
                      editor
                        .chain()
                        .focus()
                        .insertContent(parsed.document.content || [])
                        .run();
                      setMarkdown(null);
                    }
                  } catch (error: any) {
                    setMarkdownError(error.message);
                  } finally {
                    setConverting(false);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Modal>
      )}
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        {tool(
          "Bold",
          Bold,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {tool(
          "Italic",
          Italic,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        {tool(
          "Heading",
          Heading2,
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          editor.isActive("heading"),
        )}
        <i />
        <button
          type="button"
          className="editor-tool"
          title="Insert Markdown"
          aria-label="Insert Markdown"
          onClick={() => {
            setMarkdown("");
            setMarkdownError("");
            setMarkdownPreview("");
          }}
        >
          MD
        </button>
        {tool(
          "Bullet list",
          List,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {tool(
          "Numbered list",
          ListOrdered,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        <button
          type="button"
          className="editor-tool"
          aria-label="Checklist"
          title="Checklist"
          aria-pressed={editor.isActive("taskList")}
          onClick={() =>
            editor.chain().focus().toggleList("taskList", "taskItem").run()
          }
        >
          ☑
        </button>
        {tool(
          "Quote",
          Quote,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        {tool("Divider", Minus, () =>
          editor.chain().focus().setHorizontalRule().run(),
        )}
        <i />
        {onReference &&
          tool("Link an entry", Link2, () =>
            onReference((id, label) =>
              editor
                .chain()
                .focus()
                .insertContent({ type: "resourceLink", attrs: { id, label } })
                .run(),
            ),
          )}
        {onImage &&
          tool("Insert image", ImagePlus, () =>
            onImage((src, alt) =>
              editor.chain().focus().setImage({ src, alt }).run(),
            ),
          )}
        {tool("Insert table", Table2, () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        )}
        {tool("Insert GM-only section", EyeOff, () =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "privateBlock",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Private GM notes" }],
                },
              ],
            })
            .run(),
        )}
        {onVariable &&
          tool("Insert reusable term", Braces, () =>
            onVariable((id, label) =>
              editor
                .chain()
                .focus()
                .insertContent({ type: "variable", attrs: { id, label } })
                .run(),
            ),
          )}
        {onLiveSource &&
          tool("Insert live source", PanelsTopLeft, () =>
            onLiveSource((id, label) =>
              editor
                .chain()
                .focus()
                .insertContent([
                  { type: "sourceBlock", attrs: { id, label } },
                  { type: "paragraph" },
                ])
                .run(),
            ),
          )}
        {ctx &&
          tool("Insert dice button", Dices, () => {
            setDiceDraft({ formula: "1d20", label: "Roll" });
            setDiceError("");
          })}
        {onSnippet && (
          <>
            <button
              type="button"
              className="editor-tool"
              aria-label="Insert reusable snippet"
              onClick={() =>
                onSnippet((entry, copy) => {
                  if (copy)
                    editor
                      .chain()
                      .focus()
                      .insertContent(entry.document?.content || [])
                      .run();
                  else
                    editor
                      .chain()
                      .focus()
                      .insertContent({
                        type: "snippet",
                        attrs: { id: entry.id, label: entry.title },
                      })
                      .run();
                })
              }
            >
              Snippets
            </button>
            <button
              type="button"
              className="editor-tool"
              aria-label="Save selection as snippet"
              disabled={editor.state.selection.empty}
              onClick={() => {
                const { from, to } = editor.state.selection;
                onSnippet(
                  (entry, copy) => {
                    if (copy)
                      editor
                        .chain()
                        .focus()
                        .insertContent(entry.document?.content || [])
                        .run();
                    else
                      editor
                        .chain()
                        .focus()
                        .insertContent({
                          type: "snippet",
                          attrs: { id: entry.id, label: entry.title },
                        })
                        .run();
                  },
                  editor.state.doc.cut(from, to).toJSON() as Doc,
                );
              }}
            >
              Save selection
            </button>
          </>
        )}
        <i />
        {tool("Undo", Undo2, () => editor.chain().focus().undo().run())}
        {tool("Redo", Redo2, () => editor.chain().focus().redo().run())}
        {editor.isActive("table") && (
          <>
            <button onClick={() => editor.chain().focus().addRowAfter().run()}>
              + Row
            </button>
            <button
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              + Column
            </button>
            <button onClick={() => editor.chain().focus().deleteTable().run()}>
              Remove table
            </button>
          </>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
