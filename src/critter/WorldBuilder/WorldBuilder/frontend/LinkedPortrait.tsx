import React, { useEffect, useState } from "react";
import { Field, ErrorBox } from "./ui";
export function imageURL(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      !/[\s\u0000-\u001f]/.test(value) &&
      value.length <= 2000
      ? value
      : "";
  } catch {
    return "";
  }
}
export function LinkedPortrait({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  onSave: (url: string) => Promise<unknown>;
}) {
  const [url, setURL] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setURL(value);
  }, [value]);
  return (
    <div className="linked-portrait">
      <Field
        label="Linked portrait URL"
        value={url}
        onChange={setURL}
        placeholder="https://example.com/portrait.png"
      />
      {error && <ErrorBox message={error} />}
      <button
        className="button secondary small"
        disabled={disabled || busy || url === value}
        onClick={async () => {
          const next = url.trim();
          if (next && !imageURL(next)) {
            setError("Use a direct HTTP or HTTPS image URL.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await onSave(next);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving portrait…" : "Save linked portrait"}
      </button>
      <p className="small-copy muted">
        Use the image address, not a web page. Linked images load from their
        host; upload a copy for offline use.
      </p>
    </div>
  );
}
