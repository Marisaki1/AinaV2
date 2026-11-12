(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaRecurrence")),
    checks = [];
  for (const route of [
    "entry/" + f.series,
    "history/" + f.timeline,
    "entry/" + f.cal,
  ]) {
    location.hash = "/" + route;
    await new Promise((r) => setTimeout(r, 1050));
    if (document.documentElement.scrollWidth > innerWidth + 1)
      throw new Error("Page overflow " + route);
    checks.push({
      route,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    });
  }
  return checks;
})();
