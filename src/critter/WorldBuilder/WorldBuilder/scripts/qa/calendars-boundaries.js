(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaCalendarIcons"));
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(boot.csrf_cookie + "="))
      ?.split("=")[1] || "",
  );
  const request = async (path, method, body) => {
    const r = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(value));
    return value;
  };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, message) => {
    for (let i = 0; i < 90; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error(message);
  };
  const expect = (value, message) => {
    if (!value) throw new Error(message);
  };
  location.hash = "/home";
  await pause(500);
  const before = await fetch("/api/resources/" + f.cal).then((r) => r.json());
  await request("/resources/" + f.cal, "PATCH", {
    expected_revision: before.revision,
    data: f.exported.calendar,
  });
  location.hash = "/entry/" + f.cal;
  await pause(700);
  document.querySelector('[aria-label="Remove month 1"]').click();
  await pause(1000);
  let saved;
  for (let i = 0; i < 60; i++) {
    saved = await fetch("/api/resources/" + f.cal).then((r) => r.json());
    if (saved.data.months.length === 1) break;
    await pause(100);
  }
  expect(
    saved.data.months.length === 1 && saved.data.leap_rules[0].month === 1,
    "Month removal did not remap leap rules",
  );
  expect(
    document.querySelector(".calendar-grid button"),
    "Month removal broke preview",
  );
  await request("/resources/" + f.cal, "PATCH", {
    expected_revision: saved.revision,
    data: f.exported.calendar,
  });
  const data = {
    months: [{ name: "Long month", days: 1000 }],
    weekdays: Array.from({ length: 40 }, (_, i) => "Day " + (i + 1)),
    moons: Array.from({ length: 8 }, (_, i) => ({
      id: "m" + i,
      name: "Moon " + (i + 1),
      period: 8 + i,
      offset: i,
    })),
    leap_rules: Array.from({ length: 12 }, (_, i) => ({
      id: "r" + i,
      name: "Rule " + (i + 1),
      interval: 4,
      month: 1,
      days: 10,
    })),
  };
  const wide = await request(`/worlds/${f.world}/resources`, "POST", {
    kind: "calendar",
    title: "QA calendar limits " + Date.now(),
    data,
  });
  f.wide = wide.id;
  localStorage.setItem("qaCalendarIcons", JSON.stringify(f));
  location.hash = "/entry/" + wide.id;
  await pause(700);
  const input = [...document.querySelectorAll("label.field")]
    .find((l) => l.querySelector("span")?.textContent === "Preview year")
    .querySelector("input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    0,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(
    () => document.querySelectorAll(".calendar-grid button").length === 1120,
    "Long leap month preview incomplete",
  );
  const days = document.querySelectorAll(".calendar-grid button");
  days[1119].click();
  await pause(100);
  expect(
    document.querySelectorAll(".calendar-day-detail p").length === 9,
    "Eight moon details missing",
  );
  expect(
    document.querySelectorAll(".calendar-grid strong").length === 40,
    "Forty weekdays missing",
  );
  expect(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Wide calendar overflows page",
  );
  const grid = document.querySelector(".calendar-scroll");
  expect(
    grid.scrollWidth > grid.clientWidth &&
      grid.scrollHeight > grid.clientHeight,
    "Large calendar is not contained in scroll area",
  );
  return {
    removed_month_remaps_rules: true,
    preview_days: days.length,
    weekdays: 40,
    moons: 8,
    page_width: document.documentElement.scrollWidth,
    grid_scroll_width: grid.scrollWidth,
    wide_calendar: f.wide,
  };
})();
