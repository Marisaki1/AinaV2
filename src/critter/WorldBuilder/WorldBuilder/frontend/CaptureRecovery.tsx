import React, { useEffect, useRef, useState } from "react";

// World-scoped IDs keep local recovery drafts separate between accounts.
export function useCaptureRecovery(
  key: string,
  value: any,
  dirty: boolean,
  restore: (value: any) => void,
) {
  const [saved, setSaved] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  });
  const [error, setError] = useState("");
  const cleared = useRef(false);
  useEffect(() => {
    if (!dirty || cleared.current || saved) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setError(
        "Draft recovery storage is full. Save this note before leaving.",
      );
    }
  }, [key, value, dirty, saved]);
  const clear = () => {
    cleared.current = true;
    try {
      localStorage.removeItem(key);
    } catch {}
    setSaved(null);
  };
  const controls = (
    <>
      {saved && (
        <div className="button-row" role="status">
          <span>An unfinished capture is available.</span>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              restore(saved);
              setSaved(null);
            }}
          >
            Restore draft
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              try {
                localStorage.removeItem(key);
              } catch {}
              setSaved(null);
            }}
          >
            Discard recovered draft
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
  return { clear, controls };
}
