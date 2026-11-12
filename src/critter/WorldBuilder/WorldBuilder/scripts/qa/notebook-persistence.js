(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaNotebook);
  const expect = (v, message) => {
    if (!v) throw Error(message);
  };
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("worldbuilder."),
  );
  keys.forEach((k) => localStorage.removeItem(k));
  const read = (id) => fetch("/api/resources/" + id).then((r) => r.json());
  const [book, note, template, fact, original] = await Promise.all(
    [f.book, f.note, f.template, f.fact, f.original].map(read),
  );
  expect(
    book.id === f.book && book.data.notebook_sections.length === 2,
    "Notebook and nested sections survive",
  );
  expect(
    book.data.notebook_sections[1].parent_id ===
      book.data.notebook_sections[0].id,
    "Nested parent preserved",
  );
  expect(
    book.data.note_board.cards.length === 2 &&
      book.data.note_board.edges.length === 1,
    "Visual sources and connection survive",
  );
  expect(
    JSON.stringify(note.document).includes("BEFORE_REFERENCE AFTER_REFERENCE"),
    "Original rich prose survives",
  );
  expect(
    template.data.notebook_type === "template" &&
      template.document.content.length > 0,
    "Rich template survives",
  );
  expect(
    fact.data.note_starred &&
      Object.values(fact.data.note_values).includes(0.85),
    "Favorite and typed metadata survive",
  );
  expect(
    original.data.note_question_status === "resolved",
    "Knowledge question resolution survives",
  );
  location.hash = `/notebooks/all/${f.book}/all/${f.note}`;
  for (
    let i = 0;
    i < 85 && !document.querySelector(".notebook-editor .tiptap");
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  expect(
    document
      .querySelector(".notebook-editor .tiptap")
      ?.textContent.includes("BEFORE_REFERENCE AFTER_REFERENCE"),
    "Database note renders",
  );
  return {
    applicationStorageKeysCleared: keys.length,
    sameOriginalUUIDs: true,
    nestedSectionsPreserved: true,
    richProseAndTemplatePreserved: true,
    metadataFavoriteQuestionPreserved: true,
    boardSourcesAndLabeledEdgePreserved: true,
  };
})();
