(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("Isolated QA installation required.");
  const o = JSON.parse(localStorage.getItem("qaOrganization"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const call = async (path, data, method = "POST") => {
    const response = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(data),
    });
    return { status: response.status, value: await response.json() };
  };
  const one = (
    await call("/worlds/" + o.world + "/resources", {
      title: "QA parallel save",
    })
  ).value;
  const edits = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      call(
        "/resources/" + one.id,
        { title: "QA concurrent title " + i, expected_revision: 1 },
        "PATCH",
      ),
    ),
  );
  const statuses = edits.map((e) => e.status);
  if (
    statuses.filter((v) => v === 200).length !== 1 ||
    statuses.some((v) => ![200, 409].includes(v))
  )
    throw new Error("Concurrent writes did not resolve safely: " + statuses);
  const final = await fetch("/api/resources/" + one.id).then((r) => r.json());
  if (final.revision !== 2)
    throw new Error("Concurrent writes produced an incorrect revision");
  const a = (
      await call("/worlds/" + o.world + "/resources", {
        title: "QA parallel parent A",
        kind: "folder",
      })
    ).value,
    b = (
      await call("/worlds/" + o.world + "/resources", {
        title: "QA parallel parent B",
        kind: "folder",
      })
    ).value;
  const parents = await Promise.all([
    call("/resources/" + a.id, { parent: b.id, expected_revision: 1 }, "PATCH"),
    call("/resources/" + b.id, { parent: a.id, expected_revision: 1 }, "PATCH"),
  ]);
  if (
    parents
      .map((v) => v.status)
      .sort()
      .join(",") !== "200,400"
  )
    throw new Error(
      "Concurrent parent changes did not prevent a cycle: " +
        parents.map((v) => v.status),
    );
  return {
    simultaneousStaleEdits: statuses,
    oneSavedRevision: true,
    simultaneousParentCyclePrevented: true,
    expectedHttpStatuses: [400, 409],
  };
})();
