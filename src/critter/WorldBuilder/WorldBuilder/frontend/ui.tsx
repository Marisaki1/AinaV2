import { SearchableSelect } from "./SearchableSelect";
import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Plus,
  FileText,
  UserRound,
  Map,
  CalendarDays,
  NotebookPen,
  BookOpen,
  GitBranch,
  Layers,
  Boxes,
  ScrollText,
  Table2,
  Dices,
  Sparkles,
  Flag,
  CheckSquare,
  Image,
  Network,
} from "lucide-react";
import type { Entry } from "./domain";
export const icons: Record<string, any> = {
  article: FileText,
  character: UserRound,
  map: Map,
  calendar: CalendarDays,
  event: CalendarDays,
  era: CalendarDays,
  timeline: CalendarDays,
  note: NotebookPen,
  manuscript: BookOpen,
  chapter: BookOpen,
  scene: ScrollText,
  board: Layers,
  tree: GitBranch,
  relationship: Network,
  folder: Boxes,
  table: Table2,
  generator: Sparkles,
  variable: FileText,
  campaign: Flag,
  session: CalendarDays,
  quest: Flag,
  task: CheckSquare,
  statblock: Dices,
};
export function KindIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  const Icon = icons[kind] || FileText;
  return <Icon size={size} />;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    (
      ref.current?.querySelector<HTMLElement>("[data-autofocus]") || ref.current
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      );
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const list = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  icon: Icon = FileText,
  title,
  children,
  action,
  label = "Create an entry",
}: {
  icon?: any;
  title: string;
  children?: React.ReactNode;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">
        <Icon size={30} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && (
        <button className="button primary" onClick={action}>
          <Plus size={16} />
          {label}
        </button>
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function EntryPicker({
  value,
  onChange,
  entries,
  label = "Linked entry",
  empty = "None",
}: {
  value: string;
  onChange: (v: string) => void;
  entries: Entry[];
  label?: string;
  empty?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <SearchableSelect
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{empty}</option>
        {entries.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </SearchableSelect>
    </label>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  min,
  max,
  step,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </label>
  );
}
export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      {message}
    </div>
  );
}
export function TagField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setRaw(value.join(", "));
  }, [JSON.stringify(value)]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={input}
        aria-label={"Entry " + label.toLowerCase()}
        value={raw}
        placeholder={placeholder}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          );
        }}
        onBlur={() => setRaw(value.join(", "))}
      />
    </label>
  );
}
