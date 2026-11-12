import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { AppContext, api } from "./domain";
import { ErrorBox } from "./ui";

type Handout = {
  title: string;
  intro: string;
  sections: { title: string; html: string }[];
  images: { url: string; name: string }[];
  omitted: number;
};
export function HandoutView({
  ctx,
  id,
  reader = false,
}: {
  ctx: AppContext;
  id: string;
  reader?: boolean;
}) {
  const [payload, setPayload] = useState<{
      token: string;
      value: Handout;
    } | null>(null),
    [error, setError] = useState("");
  const token = JSON.stringify([
    ctx.world.id,
    id,
    reader,
    ctx.entries.map((e) => [
      e.id,
      e.revision,
      e.published_revision,
      e.visibility,
    ]),
  ]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<Handout>(`/resources/${id}/handout${reader ? "?audience=reader" : ""}`)
      .then((value) => {
        if (alive) setPayload({ token, value });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  const value = payload?.token === token ? payload.value : null;
  if (error) return <ErrorBox message={error} />;
  if (!value) return <p role="status">Preparing safe handout preview…</p>;
  return (
    <article className="handout-preview">
      <h1>{value.title}</h1>
      <p className="muted small-copy">
        Player-safe preparation preview · published source versions
      </p>
      {value.omitted > 0 && (
        <p className="notice">
          {value.omitted} unpublished or unavailable selections were omitted.
        </p>
      )}
      <div
        className="reader-prose"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value.intro) }}
      />
      {value.sections.map((section, index) => (
        <section key={index}>
          <h2>{section.title}</h2>
          <div
            className="reader-prose"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(section.html),
            }}
          />
        </section>
      ))}
      {value.images.map((image, index) => (
        <img
          key={index}
          className="handout-image"
          src={image.url}
          alt={image.name}
        />
      ))}
      <a
        className="button secondary"
        href={`/api/resources/${id}/handout?export=html${reader ? "&audience=reader" : ""}`}
        download
      >
        Download safe handout HTML
      </a>
    </article>
  );
}
