(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaWorkbench),
    csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((v) => v.startsWith(boot.csrf_cookie + "="))
        ?.split("=")[1] || "",
    );
  const r = await fetch(`/api/worlds/${f.world}/resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: JSON.stringify({
      title: "Explicitly detached quest " + f.stamp,
      kind: "quest",
      parent: f.campaign,
      data: { campaign_id: "", progress: "open" },
    }),
  });
  const v = await r.json();
  if (!r.ok) throw Error(JSON.stringify(v));
  f.detached = v.id;
  localStorage.qaWorkbench = JSON.stringify(f);
  return { detachedQuest: v.id };
})();
