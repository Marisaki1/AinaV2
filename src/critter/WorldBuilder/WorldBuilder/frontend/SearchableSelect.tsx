import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

type Option = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};
function text(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map((n) =>
      React.isValidElement<{ children?: React.ReactNode }>(n)
        ? text(n.props.children)
        : String(n),
    )
    .join("");
}
function options(
  children: React.ReactNode,
  group?: string,
  disabled = false,
): Option[] {
  return React.Children.toArray(children).flatMap((node) => {
    if (!React.isValidElement<any>(node)) return [];
    const attributes = (
      node as React.ReactElement<{
        value?: string | number;
        label?: string;
        children?: React.ReactNode;
        disabled?: boolean;
      }>
    ).props;
    if (node.type === "option")
      return [
        {
          value: String(attributes.value ?? text(attributes.children)),
          label: attributes.label ?? text(attributes.children),
          disabled: disabled || !!attributes.disabled,
          group,
        },
      ];
    return options(
      attributes.children,
      node.type === "optgroup" ? attributes.label : group,
      disabled || !!attributes.disabled,
    );
  });
}
const normalize = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Retains a native form control, with an accessible searchable popup for interaction. */
export function SearchableSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  const {
    children,
    value,
    defaultValue,
    onChange,
    disabled,
    className,
    style,
    id,
    ...rest
  } = props;
  const generated = useId(),
    listId = generated + "-list",
    wrapper = useRef<HTMLDivElement>(null),
    native = useRef<HTMLSelectElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [invalid, setInvalid] = useState(false),
    [active, setActive] = useState(0),
    [label, setLabel] = useState("Choose an option"),
    [internal, setInternal] = useState(String(defaultValue ?? "")),
    [position, setPosition] = useState({
      left: 0,
      top: 0,
      width: 200,
      maxHeight: 280,
    });
  const all = useMemo(() => options(children), [children]);
  const selected = String(value ?? internal),
    selectedOption = all.find((o) => o.value === selected),
    filtered = all.filter((o) =>
      normalize(o.label + " " + (o.group || "")).includes(normalize(query)),
    ),
    enabled = filtered.filter((o) => !o.disabled);
  const close = (focus = false) => {
    setOpen(false);
    setQuery("");
    if (focus) trigger.current?.focus();
  };
  const choose = (option: Option) => {
    if (option.disabled || disabled) return;
    if (native.current) {
      // Dispatch through React's native select handler, preserving existing form logic.
      Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )!.set!.call(native.current, option.value);
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  };
  useLayoutEffect(() => {
    const outer =
      wrapper.current?.closest("label") ||
      (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null);
    setLabel(
      props["aria-label"] ||
        outer?.querySelector("span")?.textContent?.trim() ||
        outer?.textContent?.trim() ||
        props.title ||
        "Choose an option",
    );
  }, [props["aria-label"], props.title, id, children]);
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport,
        top = viewport?.offsetTop || 0,
        bottom = top + (viewport?.height || innerHeight),
        maxHeight = Math.max(110, Math.min(330, bottom - top - 16)),
        below = bottom - rect.bottom - 8,
        above = rect.top - top - 8;
      const height = Math.max(100, Math.min(maxHeight, Math.max(below, above)));
      const width = Math.min(Math.max(rect.width, 220), innerWidth - 16);
      const desiredTop =
        below >= Math.min(240, maxHeight) || below >= above
          ? rect.bottom + 4
          : rect.top - height - 4;
      setPosition({
        left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
        width,
        top: Math.max(top + 8, Math.min(desiredTop, bottom - height - 8)),
        maxHeight: height,
      });
    };
    place();
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (
        !wrapper.current?.contains(e.target as Node) &&
        !popup.current?.contains(e.target as Node)
      )
        close();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, query]);
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab" && open) {
      const root = wrapper.current?.closest('[role="dialog"]') || document.body;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter(
        (el) => el.getClientRects().length && !popup.current?.contains(el),
      );
      const index =
        focusable.indexOf(trigger.current!) + (event.shiftKey ? -1 : 1);
      const next =
        focusable[index] ||
        (root !== document.body
          ? focusable[(index + focusable.length) % focusable.length]
          : undefined);
      event.preventDefault();
      event.stopPropagation();
      close();
      (next || trigger.current)?.focus();
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        setQuery("");
        setActive(
          Math.max(
            0,
            all
              .filter((o) => !o.disabled)
              .findIndex((o) => o.value === selected),
          ),
        );
        setOpen(true);
      } else
        setActive((index) =>
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? Math.max(0, enabled.length - 1)
              : Math.max(
                  0,
                  Math.min(
                    enabled.length - 1,
                    index +
                      ({ ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[
                        event.key
                      ] || 0),
                  ),
                ),
        );
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      event.stopPropagation();
      if (enabled[active]) choose(enabled[active]);
    } else if (
      !open &&
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setQuery(event.key);
      setActive(0);
      setOpen(true);
    }
  };
  const portal = wrapper.current?.closest('[role="dialog"]') || document.body;
  return (
    <div ref={wrapper} className={"searchable-select " + (className || "")}>
      <select
        {...rest}
        ref={native}
        id={id ? id + "-native" : undefined}
        value={selected}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="searchable-select-native"
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          setOpen(true);
          trigger.current?.focus();
          props.onInvalid?.(event);
        }}
        onChange={(e) => {
          setInvalid(false);
          setInternal(e.target.value);
          onChange?.(e);
        }}
      >
        {children}
      </select>
      <button
        ref={trigger}
        type="button"
        id={id}
        className="searchable-select-trigger"
        style={style}
        role="combobox"
        aria-label={label}
        aria-labelledby={props["aria-labelledby"]}
        aria-required={props.required}
        aria-invalid={invalid || props["aria-invalid"]}
        title={selectedOption?.label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onKeyDown={keyDown}
        onClick={() => {
          if (open) close();
          else {
            setQuery("");
            setActive(
              Math.max(
                0,
                all
                  .filter((o) => !o.disabled)
                  .findIndex((o) => o.value === selected),
              ),
            );
            setOpen(true);
          }
        }}
      >
        <span>
          {selectedOption?.label ??
            (selected
              ? "Unavailable choice"
              : all[0]?.label || "Choose an option")}
        </span>
        <ChevronDown size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="searchable-select-popup"
            style={{ position: "fixed", ...position }}
            onKeyDown={keyDown}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="searchable-select-search">
              <Search size={15} />
              <input
                ref={search}
                aria-label={"Filter " + label}
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={listId}
                aria-activedescendant={
                  enabled[active]
                    ? listId + "-" + all.indexOf(enabled[active])
                    : undefined
                }
                placeholder="Type to filter…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
              />
            </div>
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              className="searchable-select-options"
            >
              {filtered.map((option, index) => {
                const enabledIndex = enabled.indexOf(option);
                return (
                  <React.Fragment key={option.value + ":" + index}>
                    {option.group &&
                      option.group !== filtered[index - 1]?.group && (
                        <div className="searchable-select-group">
                          {option.group}
                        </div>
                      )}
                    <div
                      id={listId + "-" + all.indexOf(option)}
                      role="option"
                      aria-selected={selected === option.value}
                      aria-disabled={option.disabled}
                      data-active={!option.disabled && active === enabledIndex}
                      onPointerMove={() => {
                        if (!option.disabled) setActive(enabledIndex);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.preventDefault();
                        choose(option);
                      }}
                      className="searchable-select-option"
                    >
                      <span>{option.label}</span>
                      {selected === option.value && <Check size={14} />}
                    </div>
                  </React.Fragment>
                );
              })}
              {!filtered.length && (
                <p role="status" className="searchable-select-empty">
                  No matching options.
                </p>
              )}
            </div>
          </div>,
          portal,
        )}
    </div>
  );
}
