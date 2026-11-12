import { SearchableSelect } from "./SearchableSelect";
import React, { useRef, useState } from "react";
import {
  Download,
  Image as ImageIcon,
  Loader2,
  Save,
  Search,
  Upload,
} from "lucide-react";
import { AppContext, Asset, api, patch, size } from "./domain";
import { Empty, ErrorBox, Field, Modal, TagField } from "./ui";
import { PageHeading } from "./Pages";
import { tagKey } from "./Collections";

function ImageDetails({
  asset,
  ctx,
  close,
}: {
  asset: Asset;
  ctx: AppContext;
  close: () => void;
}) {
  const [draft, setDraft] = useState(asset),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const updated = await patch<Asset>("/media/" + asset.id, {
        name: draft.name,
        credit: draft.credit,
        tags: draft.tags,
        expected_revision: draft.revision,
      });
      setDraft(updated);
      await ctx.refresh();
      ctx.notify("Image details saved.");
    } catch (e: any) {
      setError(e.message);
      setConflict(e.status === 409);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={asset.name} wide onClose={close}>
      <img className="media-preview" src={asset.url} alt={draft.name} />
      <div className="media-information">
        <span>
          {asset.width} × {asset.height} · {size(asset.size)}
        </span>
        <a
          className="button secondary small"
          download={draft.name}
          href={asset.url}
        >
          <Download size={15} />
          Save image
        </a>
      </div>
      <div className="field-grid">
        <Field
          label="Image name"
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
        />
        <Field
          label="Artist / source credit"
          value={draft.credit}
          onChange={(credit) => setDraft({ ...draft, credit })}
        />
      </div>
      <TagField
        label="Media tags"
        value={draft.tags}
        onChange={(tags) => setDraft({ ...draft, tags })}
        placeholder="portrait, shrine, map"
      />
      <p className="muted small-copy">
        Tags make this image searchable and let it appear in matching saved
        collections.
      </p>
      {error && <ErrorBox message={error} />}
      <div className="modal-actions">
        {conflict && (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                setDraft(await api<Asset>("/media/" + asset.id));
                setConflict(false);
                setError("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            Load latest details
          </button>
        )}
        <button className="button secondary" disabled={busy} onClick={close}>
          Close
        </button>
        <button
          className="button primary"
          disabled={busy || !draft.name.trim() || conflict}
          onClick={save}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
          Save details
        </button>
      </div>
    </Modal>
  );
}

export function MediaLibrary({ ctx }: { ctx: AppContext }) {
  const [busy, setBusy] = useState(false),
    [credit, setCredit] = useState(""),
    [uploadTags, setUploadTags] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selectedId = location.hash.slice(2).split("/")[1];
  const selected = ctx.assets.find((a) => a.id === selectedId);
  const tags = new Map<string, string>();
  for (const a of ctx.assets)
    for (const value of a.tags)
      if (!tags.has(tagKey(value))) tags.set(tagKey(value), value);
  const filtered = ctx.assets.filter(
    (a) =>
      (!tag || a.tags.some((t) => tagKey(t) === tag)) &&
      tagKey(a.name + " " + a.credit + " " + a.tags.join(" ")).includes(
        tagKey(query),
      ),
  );
  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    let completed = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("credit", credit);
        form.append("tags", JSON.stringify(uploadTags));
        await api("/worlds/" + ctx.world.id + "/assets", {
          method: "POST",
          body: form,
        });
        completed++;
      }
      ctx.notify(
        "Media library updated. Identical images reuse the existing upload.",
      );
    } catch (e: any) {
      ctx.notify(
        (completed ? completed + " images processed. " : "") + e.message,
        true,
      );
    } finally {
      await ctx.refresh().catch((e) => ctx.notify(e.message, true));
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="page">
      <PageHeading
        eyebrow="A WORLD WORTH SEEING"
        title="Media library"
        action={
          <button
            className="button primary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Upload size={17} />
            )}
            Upload images
          </button>
        }
      >
        Maps, portraits, places, and things. One home for every image.
      </PageHeading>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
        }}
      />
      <div
        className="upload-strip"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy && e.dataTransfer.files.length)
            upload(e.dataTransfer.files);
        }}
      >
        <div>
          <ImageIcon size={26} />
          <p>
            <strong>Drop images here</strong>
            <span>PNG, JPEG, WebP or GIF · up to 25 MB each</span>
          </p>
        </div>
        <div className="upload-metadata">
          <Field
            label="Artist / source credit for new uploads"
            value={credit}
            onChange={setCredit}
            placeholder="Keep your images credited"
          />
          <TagField
            label="Tags for new uploads"
            value={uploadTags}
            onChange={setUploadTags}
            placeholder="portrait, shrine"
          />
        </div>
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search media"
            placeholder="Search image names, credits and tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <SearchableSelect
          aria-label="Filter media by tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">All tags</option>
          {[...tags]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
        </SearchableSelect>
        <span className="muted small-copy">{filtered.length} images</span>
      </div>
      {filtered.length ? (
        <div className="media-grid">
          {filtered.map((a) => (
            <button
              className="media-card"
              key={a.id}
              onClick={() => ctx.go("media/" + a.id)}
            >
              <div>
                <img src={a.url} alt={a.name} />
              </div>
              <strong>{a.name}</strong>
              <span>
                {a.tags.length
                  ? a.tags.slice(0, 3).join(" · ")
                  : a.width + " × " + a.height + " · " + size(a.size)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={ImageIcon}
          title={
            query || tag ? "No matching images" : "Bring your world into view"
          }
          action={() => input.current?.click()}
          label="Choose images"
        >
          {query || tag
            ? "Try another name, credit or tag."
            : "Upload a map, a portrait, or a visual reference to get started."}
        </Empty>
      )}
      {selected && (
        <ImageDetails
          key={selected.id}
          asset={selected}
          ctx={ctx}
          close={() => ctx.go("media")}
        />
      )}
    </div>
  );
}
