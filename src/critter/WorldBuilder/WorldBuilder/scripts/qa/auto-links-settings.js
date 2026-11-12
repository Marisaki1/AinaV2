(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaGuideLinks),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms)),
    expect = (v, m) => {
      if (!v) throw Error(m);
    };
  const button = (n) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  for (const enabled of [false, true]) {
    location.hash = "/settings";
    await pause(650);
    const checkbox = [...document.querySelectorAll("label")]
      .find((l) =>
        l.textContent.includes(
          "Automatically link entry names and aliases in reading views",
        ),
      )
      ?.querySelector("input");
    expect(checkbox, "Automatic linking setting missing");
    if (checkbox.checked !== enabled) checkbox.click();
    button("Save world settings").click();
    await pause(650);
    location.hash = "/entry/" + f.note;
    await pause(650);
    button("Read linked notes").click();
    await pause(450);
    expect(
      document.querySelectorAll(".linked-reading-view .auto-resource-link")
        .length === (enabled ? 3 : 0),
      "World automatic-link setting not respected",
    );
  }
  location.hash = "/entry/" + f.hero;
  await pause(650);
  expect(
    !document.querySelector(".linked-reading-view") &&
      document.querySelector(".prose-editor").textContent ===
        "This scout knows the forest route.",
    "Reading state leaked across entries",
  );
  location.hash = "/entry/" + f.note;
  await pause(650);
  expect(
    document.querySelector(".prose-editor").textContent === f.text,
    "Source wording changed after toggles",
  );
  return {
    checks: [
      "world opt-out and re-enable work through actual settings UI",
      "automatic links refresh on reading without document changes",
      "navigating to another entry resets reading state",
    ],
  };
})();
