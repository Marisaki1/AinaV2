(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA workspace required");
  const f = JSON.parse(localStorage.getItem("qaMapsHistory"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((s) => s.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const post = async (path, value) => {
    const r = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(value),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(v));
    return v;
  };
  const add = (title, kind, data, visibility = "public") =>
    post("/worlds/" + f.world + "/resources", {
      title,
      kind,
      data,
      visibility,
    });
  const publish = (entry) =>
    post("/resources/" + entry.id + "/publish", {
      expected_revision: entry.revision,
    });
  const cal = await add(
    "Secret calendar month names",
    "calendar",
    { months: [{ name: "Classified month", days: 30 }] },
    "private",
  );
  const events = [];
  for (let i = 1; i <= 2; i++) {
    const event = await add("Recorded public event " + i, "event", {
      calendar_id: cal.id,
      year: i,
      month: 1,
      day: 1,
    });
    await publish(event);
    events.push(event.id);
  }
  const timeline = await add("Unavailable calendar timeline", "timeline", {
    calendar_id: cal.id,
    selection: "selected",
    event_ids: events,
  });
  await publish(timeline);
  location.hash = "/entry/" + timeline.id;
  await new Promise((r) => setTimeout(r, 900));
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent.trim() === "Reader preview")
    .click();
  for (
    let i = 0;
    i < 40 &&
    !document.querySelector('[aria-label="Recorded timeline events"]');
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  const choices = document.querySelector(
    '[aria-label="Recorded timeline events"]',
  );
  if (choices?.querySelectorAll("button").length !== 2)
    throw new Error(
      "Unavailable calendar must retain all shared events in a list",
    );
  choices.querySelectorAll("button")[1].click();
  await new Promise((r) => setTimeout(r, 250));
  const preview = document.querySelector(".modal .reader-article");
  if (
    !preview
      .querySelector(".history-event-panel h2")
      .textContent.includes("event 2")
  )
    throw new Error("Fallback event selection failed");
  if (
    preview.textContent.includes("Classified") ||
    preview.textContent.includes("Secret calendar")
  )
    throw new Error("Private calendar leaked");
  return {
    checks: [
      "unavailable calendar retains selectable public events",
      "fallback selection opens the requested event",
      "private calendar names remain absent",
    ],
  };
})();
