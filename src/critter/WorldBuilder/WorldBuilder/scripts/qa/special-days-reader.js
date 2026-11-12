(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768") throw Error("QA only");
  const f = JSON.parse(localStorage.qaSpecialDays),
    pause = (ms = 160) => new Promise((r) => setTimeout(r, ms));
  const button = (n) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === n,
    );
  location.hash = "/entry/" + f.map;
  await pause(700);
  const select = document.querySelector(
    'select[aria-label="Editing map state"]',
  );
  const labels = [...select.options].map((o) => o.textContent);
  if (
    !labels[1].includes("Before still days") ||
    !labels[2].includes("Still terrain") ||
    !labels[3].includes("Captured intercalary")
  )
    throw Error("Version period ordering");
  location.hash = "/entry/" + f.timeline;
  await pause(650);
  button("Reader preview").click();
  await pause(650);
  const cards = [...document.querySelectorAll(".modal .timeline-event-card")];
  if (cards.length !== 3) throw Error("Reader repeats");
  for (let i = 0; i < 3; i++) {
    cards[i].click();
    await pause(500);
    const caption = document.querySelector(
      ".modal .historical-map-caption",
    )?.textContent;
    if (
      !caption?.includes(i === 2 ? "Later still terrain" : "Still terrain") ||
      caption.includes("Captured intercalary")
    )
      throw Error("Reader draft scene leaked " + i);
  }
  if (document.querySelector(".modal").textContent.includes("Draft still days"))
    throw Error("Reader draft calendar leaked");
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return {
    checks: [
      "map version dropdown orders ordinary and special periods chronologically",
      "reader occurrence maps retain published date/calendar/scene snapshots",
    ],
  };
})();
