import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

let locations = 0;
const failures = [];
async function sourceFiles(folder) {
  const result = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(file)));
    else if (entry.isFile() && /\.[jt]sx$/.test(entry.name)) result.push(file);
  }
  return result;
}
for (const file of await sourceFiles("frontend")) {
  const name = path.basename(file),
    source = await fs.readFile(file, "utf8");
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      if (
        tag === "select" &&
        path.resolve(file) !== path.resolve("frontend/SearchableSelect.tsx")
      )
        failures.push(
          `${file}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
        );
      if (tag === "SearchableSelect") locations++;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}
if (failures.length) {
  console.error(
    "Use SearchableSelect so every dropdown has text filtering:\n" +
      failures.join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    `${locations} searchable dropdown locations; native selects are confined to the shared control.`,
  );
