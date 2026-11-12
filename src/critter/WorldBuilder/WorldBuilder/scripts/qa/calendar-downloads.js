(async () => {
  const boot = await fetch("/api/bootstrap").then((r) => r.json());
  if (!boot.test_workspace || location.port !== "8768")
    throw new Error("QA only");
  const f = JSON.parse(localStorage.getItem("qaCalendarIcons"));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test) => {
    for (let i = 0; i < 70; i++) {
      if (test()) return;
      await pause(100);
    }
    throw new Error("Download UI did not load");
  };
  const button = (text, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  location.hash = "/entry/" + f.cal;
  await pause(700);
  await wait(() => button("Export calendar JSON"));
  button("Export calendar JSON").click();
  await pause(700);
  button("Reader preview").click();
  await wait(() => document.querySelector(".modal .calendar-grid button"));
  button("Export calendar JSON", document.querySelector(".modal")).click();
  await pause(700);
  document.querySelector('.modal [aria-label="Close dialog"]').click();
  return { owner: f.cal + ".json", reader: f.cal + "-reader.json" };
})();
