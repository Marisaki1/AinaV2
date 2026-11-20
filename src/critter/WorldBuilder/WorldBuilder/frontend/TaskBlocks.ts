import { Node, mergeAttributes } from "@tiptap/core";

export const TaskList = Node.create({
  name: "taskList",
  group: "block list",
  content: "taskItem+",
  parseHTML() {
    return [{ tag: 'ul[data-type="taskList"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(HTMLAttributes, { "data-type": "taskList" }),
      0,
    ];
  },
});
export const TaskItem = Node.create({
  name: "taskItem",
  defining: true,
  content: "paragraph block*",
  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-checked") === "true",
      },
    };
  },
  parseHTML() {
    return [{ tag: 'li[data-type="taskItem"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, {
        "data-type": "taskItem",
        "data-checked": String(node.attrs.checked),
      }),
      0,
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.commands.splitListItem("taskItem", { checked: false }),
      "Shift-Tab": () => this.editor.commands.liftListItem("taskItem"),
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("li"),
        box = document.createElement("input"),
        contentDOM = document.createElement("div");
      dom.dataset.type = "taskItem";
      dom.dataset.checked = String(node.attrs.checked);
      box.type = "checkbox";
      box.checked = !!node.attrs.checked;
      box.contentEditable = "false";
      box.setAttribute("aria-label", "Mark task complete");
      box.addEventListener("change", () => {
        const pos = getPos();
        if (typeof pos === "number")
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: box.checked,
            }),
          );
      });
      dom.append(box, contentDOM);
      return {
        dom,
        contentDOM,
        stopEvent: (event) => event.target === box,
        update: (next) => {
          if (next.type.name !== "taskItem") return false;
          node = next;
          box.checked = !!next.attrs.checked;
          dom.dataset.checked = String(box.checked);
          return true;
        },
      };
    };
  },
});
