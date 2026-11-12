import React, { useState } from "react";
import { Download } from "lucide-react";
import { saveBeforeNavigate } from "./domain";
import { ErrorBox } from "./ui";

export function GraphExportActions({
  id,
  reader = false,
  name = "Graph",
}: {
  id: string;
  reader?: boolean;
  name?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const download = async (format: string) => {
    setBusy(true);
    setError("");
    try {
      if (saveBeforeNavigate.current && !(await saveBeforeNavigate.current()))
        throw new Error("Save or recover the current edits before exporting.");
      const response = await fetch(
        "/api/resources/" +
          id +
          "/graph-export?format=" +
          format +
          (reader ? "&audience=reader" : ""),
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const message = await response.json();
        throw new Error(message.error || "Could not export this graph.");
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download =
        "WorldBuilder - " +
        name
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
          .slice(0, 120)
          .trim() +
        "." +
        format;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="graph-export-actions">
      <div className="button-row">
        {[
          ["svg", "Download SVG"],
          ["html", "Offline HTML"],
          ["json", "Graph JSON"],
        ].map(([format, label]) => (
          <button
            key={format}
            data-export-format={format}
            className="button secondary small"
            disabled={busy}
            onClick={() => download(format)}
          >
            <Download size={14} />
            {label}
          </button>
        ))}
      </div>
      <p className="muted small-copy">
        {reader
          ? "Exports this filtered reader graph."
          : "Owner exports can include private entries. Use the saved reader view for a filtered copy."}{" "}
        Offline HTML is a fixed copy with zoom, search and full-name lists.
      </p>
      {error && <ErrorBox message={error} />}
    </div>
  );
}
