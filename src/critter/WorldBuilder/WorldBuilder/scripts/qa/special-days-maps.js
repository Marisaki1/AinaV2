(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSpecialDays),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const field = (n, root = document) =>
    [...root.querySelectorAll("label.field")]
      .find((l) => l.querySelector("span")?.textContent === n)
      ?.querySelector("input,select");
  const button = (n) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  const set = async (el, v) => {
    if (!el) throw Error("Missing field " + v);
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await pause();
  };
  location.hash = "/entry/" + f.map;
  await pause(700);
  button("Capture version").click();
  await pause();
  await set(field("Historical version name"), "Captured intercalary");
  await set(field("Version year"), 1);
  await set(field("Version date period"), "mid");
  await set(field("Version day"), 2);
  if (field("Version month", document.querySelector(".modal")))
    throw Error("Ordinary month visible");
  button("Capture map state").click();
  let version;
  for (let i = 0; i < 70; i++) {
    const e = await fetch("/api/resources/" + f.map).then((r) => r.json());
    version = e.data.versions.find((v) => v.name === "Captured intercalary");
    if (version) break;
    await pause(150);
  }
  if (version?.special_day_id !== "mid" || version.day !== 2)
    throw Error("Capture did not retain special day");
  location.hash = "/history/" + f.timeline;
  await pause(800);
  button("Chronicles").click();
  await pause(500);
  const cards = [...document.querySelectorAll(".chronicle-stops button")];
  if (cards.length !== 3) throw Error("Occurrences missing");
  const names = [
    "Still terrain",
    "Captured intercalary",
    "Later still terrain",
  ];
  for (let i = 0; i < 3; i++) {
    cards[i].click();
    await pause(450);
    if (
      !document
        .querySelector(".historical-map-caption")
        ?.textContent.includes(names[i])
    )
      throw Error("Wrong dated scene " + i);
  }
  return {
    checks: [
      "capture special-day version with searchable period control",
      "timeline occurrence maps choose chronological special-day scenes",
    ],
    version,
  };
})();
