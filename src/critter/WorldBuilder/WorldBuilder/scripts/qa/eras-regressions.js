(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaEras"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const request = async (path, method, body) => {
    const r = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, message) => {
    for (let i = 0; i < 80; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  let event = await fetch("/api/resources/" + f.secretLinked).then((r) =>
    r.json(),
  );
  event = await request("/resources/" + event.id, "PATCH", {
    expected_revision: event.revision,
    data: { ...event.data, era: "Legacy period label" },
  });
  await request("/resources/" + event.id + "/publish", "POST", {
    expected_revision: event.revision,
  });
  location.hash = "/entry/" + event.id;
  await pause(650);
  button("Reader preview").click();
  await wait(
    () => document.querySelector(".modal .reader-date"),
    "Reader date missing",
  );
  if (
    !document
      .querySelector(".modal .reader-date")
      .innerText.includes("Legacy period label")
  )
    throw new Error("Legacy era label lost");
  if (document.querySelector(".modal").innerText.includes(f.secretName))
    throw new Error("Private era leaked");
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  await pause(100);
  const timeline = await request(`/worlds/${f.world}/resources`, "POST", {
    kind: "timeline",
    title: "Era-only timeline",
    data: { calendar_id: f.cal, selection: "selected", event_ids: [] },
  });
  location.hash = "/history/" + timeline.id;
  await wait(
    () => document.querySelectorAll(".timeline-era-row").length === 3,
    "Era-only timeline did not render bands",
  );
  if (document.querySelector(".timeline-event-card"))
    throw new Error("Era-only timeline contains events");
  return {
    legacy_reader_label_preserved: true,
    private_era_hidden: true,
    era_only_timeline_renders: true,
    timeline: timeline.id,
  };
})();
