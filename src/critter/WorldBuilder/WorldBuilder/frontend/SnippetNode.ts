import { Node, mergeAttributes } from "@tiptap/core";
export const SnippetNode = Node.create({
  name: "snippet",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-snippet-id"),
      },
      label: {
        default: "Reusable snippet",
        parseHTML: (el) => el.getAttribute("data-label") || el.textContent,
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-snippet-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const { id, label, ...rest } = HTMLAttributes;
    return [
      "div",
      mergeAttributes(rest, {
        "data-snippet-id": id,
        "data-label": label,
        class: "snippet-token",
      }),
      [
        "a",
        { "data-resource-id": id, href: "/#/entry/" + id },
        "Snippet: " + label,
      ],
    ];
  },
});
