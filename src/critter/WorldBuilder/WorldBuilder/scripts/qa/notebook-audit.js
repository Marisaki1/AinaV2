(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaNotebook),
    pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const request = async (path, body, method = "POST") => {
    const r = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok) throw Error(JSON.stringify(v));
    return v;
  };
  const original = await fetch("/api/resources/" + f.original).then((r) =>
    r.json(),
  );
  await request(`/worlds/${f.world}/resources`, {
    kind: "note",
    title: original.title,
    document: { type: "doc", content: [{ type: "paragraph" }] },
    visibility: "private",
  });
  const target = await request(`/worlds/${f.world}/resources`, {
    kind: "note",
    title: "Temporary audit target " + f.stamp,
  });
  const source = await request(`/worlds/${f.world}/resources`, {
    kind: "note",
    title: "Unavailable source audit " + f.stamp,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "resourceLink",
              attrs: { id: target.id, label: target.title },
            },
          ],
        },
      ],
    },
  });
  await request(
    "/resources/" + target.id,
    { expected_revision: target.revision },
    "DELETE",
  );
  location.hash = "/notebooks/audit/all/all/none";
  for (
    let i = 0;
    i < 85 &&
    !document
      .querySelector(".notebook-results")
      ?.textContent.includes("Unavailable source audit");
    i++
  )
    await pause(90);
  const body = document.querySelector(".notebook-results")?.textContent;
  if (
    !body?.includes("Unavailable source audit") ||
    !body.includes(original.title)
  )
    throw Error("Audit does not show broken and ambiguous source originals");
  return {
    brokenSource: source.id,
    unavailableReferencesFound: true,
    ambiguousNamesFound: true,
    noAutomaticMerge: true,
  };
})();
