(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaEras")),
    checks = [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const route of [
    "entry/" + f.created,
    "entry/" + f.coarse,
    "history/" + f.timeline,
  ]) {
    location.hash = "/" + route;
    await pause(950);
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
