(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaCalendarIcons")),
    results = [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const id of [f.cal, f.map, ...(f.wide ? [f.wide] : [])]) {
    location.hash = "/entry/" + id;
    await pause(900);
    if (document.documentElement.scrollWidth > innerWidth + 1)
      throw new Error("Page overflow " + id);
    results.push({
      id,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    });
  }
  location.hash = "/entry/" + f.cal;
  await pause(700);
  return results;
})();
