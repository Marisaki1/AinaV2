import { useEffect } from "react";

export function ReadingPosition({
  world,
  route,
}: {
  world: string;
  route: string;
}) {
  useEffect(() => {
    const key = `worldbuilder.reading-position:${world}:${route}`;
    const main = document.getElementById("main-content");
    let saved = { window: 0, main: 0 };
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      saved = {
        window: Number.isFinite(value.window) ? value.window : 0,
        main: Number.isFinite(value.main) ? value.main : 0,
      };
    } catch {}
    let restoring = true;
    const restore = () => {
      if (!restoring) return;
      window.scrollTo(0, saved.window);
      if (main) main.scrollTop = saved.main;
    };
    const store = () => {
      if (!restoring)
        try {
          localStorage.setItem(
            key,
            JSON.stringify({
              window: window.scrollY,
              main: main?.scrollTop || 0,
            }),
          );
        } catch {}
    };
    const finish = () => {
      restoring = false;
      observer?.disconnect();
      changes?.disconnect();
    };
    const observer = main ? new ResizeObserver(restore) : null;
    observer?.observe(main!);
    // The scrolling viewport may stay fixed while live source bodies grow.
    // Include page roots that mount after the initial route load.
    const observeContent = () => {
      if (!restoring || !main) return;
      for (const child of main.children) observer?.observe(child);
      restore();
    };
    const changes = main ? new MutationObserver(observeContent) : null;
    changes?.observe(main!, { childList: true, subtree: true });
    observeContent();
    const frame = requestAnimationFrame(restore);
    const timer = setTimeout(finish, 4000);
    for (const name of ["pointerdown", "wheel", "touchstart", "keydown"])
      window.addEventListener(name, finish, { passive: true, capture: true });
    window.addEventListener("scroll", store, { passive: true });
    main?.addEventListener("scroll", store, { passive: true });
    window.addEventListener("pagehide", store);
    return () => {
      store();
      finish();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      for (const name of ["pointerdown", "wheel", "touchstart", "keydown"])
        window.removeEventListener(name, finish, true);
      window.removeEventListener("scroll", store);
      main?.removeEventListener("scroll", store);
      window.removeEventListener("pagehide", store);
    };
  }, [world, route]);
  return null;
}
