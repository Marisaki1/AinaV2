(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaCampaign),
    pause = (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    checks = [];
  const expect = (v, m) => {
      if (!v) throw Error(m);
    },
    wait = async (test, m) => {
      for (let i = 0; i < 75; i++) {
        if (await test()) return;
        await pause(100);
      }
      throw Error(m);
    };
  const button = (n, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const field = (n, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,select,textarea");
  const set = async (el, v) => {
    expect(el, "Missing field " + v);
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  const entries = () =>
    fetch(`/api/worlds/${f.world}/resources`)
      .then((r) => r.json())
      .then((v) => v.resources);
  location.hash = "/campaigns/" + f.campaign;
  await pause(650);
  button("New session plan").click();
  await pause();
  expect(field("Session number").value === "2", "Next session number");
  await set(field("Record title"), "Played session " + f.stamp);
  await set(field("Preparation (GM only)"), "Secret ambush preparation");
  button("Save campaign record").click();
  let session;
  await wait(async () => {
    session = (await entries()).find(
      (e) => e.title === "Played session " + f.stamp,
    );
    return session;
  }, "Session not saved");
  f.played = session.id;
  localStorage.qaCampaign = JSON.stringify(f);
  expect(
    session.visibility === "private" && !session.summary.includes("Secret"),
    "Session private and preparation not copied into summary",
  );
  location.hash = "/entry/" + session.id;
  await pause(650);
  await set(field("Session recap"), "The party saved the village.");
  await set(
    field("Consequences & world changes (GM only)"),
    "Hidden faction retaliation",
  );
  await set(field("Rewards & progression"), "Level 3 and 200 gold");
  await set(field("Next session follow-up (GM only)"), "Prepare the tower");
  await set(field("Session status"), "completed");
  await wait(async () => {
    const e = await fetch("/api/resources/" + session.id).then((r) => r.json());
    return (
      e.data.session_status === "completed" &&
      e.data.rewards === "Level 3 and 200 gold"
    );
  }, "Session outcomes not saved");
  await set(field("Visibility"), "public");
  button("Save reader version").click();
  await pause(500);
  button("Reader preview").click();
  await pause(500);
  const modal = document.querySelector(".modal");
  expect(
    modal?.textContent.includes("The party saved the village.") &&
      modal.textContent.includes("Level 3 and 200 gold"),
    "Reader recap missing",
  );
  expect(
    !modal.textContent.includes("Secret ambush") &&
      !modal.textContent.includes("Hidden faction") &&
      !modal.textContent.includes("Prepare the tower"),
    "GM plans leaked",
  );
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  const reader = await fetch(
    "/api/resources/" + session.id + "?audience=reader",
  ).then((r) => r.json());
  expect(
    !reader.data.prep && !reader.data.consequences && !reader.data.next_steps,
    "GM fields leaked in JSON",
  );
  button("Open campaign workspace").click();
  await pause(650);
  button("Progression").click();
  await pause();
  expect(
    document
      .querySelector(".campaign-workspace")
      .textContent.includes("Level 3 and 200 gold"),
    "Session rewards not in campaign progression",
  );
  checks.push(
    "private session creation and next session number",
    "saved recap, consequences, rewards, follow-up and completed state",
    "reader recap with GM-only fields excluded from HTML and JSON",
    "campaign return navigation and session progression summary",
  );
  return { checks, session: session.id };
})();
