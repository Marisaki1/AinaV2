export function boardSVG(board: any, entries: { id: string; title: string }[]) {
  const escape = (v: any) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const shapes = board.shapes || [],
    strokes = board.strokes || [],
    cards = board.cards || [];
  const width = Math.max(
    600,
    ...cards.map((c: any) => c.x + 250),
    ...shapes.map((s: any) => s.x + s.width + 30),
    ...strokes.flatMap((s: any) => s.points.map((p: number[]) => p[0] + 30)),
  );
  const height = Math.max(
    400,
    ...cards.map((c: any) => c.y + 240),
    ...shapes.map((s: any) => s.y + s.height + 30),
    ...strokes.flatMap((s: any) => s.points.map((p: number[]) => p[1] + 30)),
  );
  const label = (text: string, x: number, y: number) =>
    text
      .split("\n")
      .map(
        (line, i) =>
          `<text x="${x}" y="${y + i * 20}" font-family="sans-serif" font-size="14">${escape(line)}</text>`,
      )
      .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>Visual note board</title><metadata>${escape(JSON.stringify(board))}</metadata><rect width="100%" height="100%" fill="#fffefa"/>` +
    shapes
      .map(
        (s: any) =>
          (s.type === "ellipse"
            ? `<ellipse cx="${s.x + s.width / 2}" cy="${s.y + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}"`
            : `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"`) +
          ` fill="${escape(s.color)}" fill-opacity=".15" stroke="${escape(s.color)}"/>` +
          label(s.text, s.x + 12, s.y + 26),
      )
      .join("") +
    strokes
      .map(
        (s: any) =>
          `<polyline points="${escape(s.points.map((p: number[]) => p.join(",")).join(" "))}" fill="none" stroke="${escape(s.color)}" stroke-width="3"/>`,
      )
      .join("") +
    (board.edges || [])
      .map((e: any) => {
        const a = cards.find((c: any) => c.id === e.source),
          b = cards.find((c: any) => c.id === e.target);
        return a && b
          ? `<line x1="${a.x + 110}" y1="${a.y + 80}" x2="${b.x + 110}" y2="${b.y + 80}" stroke="#697a64"/>` +
              label(e.label, (a.x + b.x) / 2 + 110, (a.y + b.y) / 2 + 70)
          : "";
      })
      .join("") +
    cards
      .map(
        (c: any) =>
          `<g><title>${escape(c.caption)}</title><rect x="${c.x}" y="${c.y}" width="220" height="210" rx="8" fill="${escape(c.color)}" stroke="#697a64"/>` +
          label(
            entries.find((e) => e.id === c.entry_id)?.title ||
              "Unavailable original",
            c.x + 10,
            c.y + 25,
          ) +
          label(
            (c.caption.match(/.{1,28}/g) || []).slice(0, 8).join("\n"),
            c.x + 10,
            c.y + 50,
          ) +
          "</g>",
      )
      .join("") +
    "</svg>"
  );
}
