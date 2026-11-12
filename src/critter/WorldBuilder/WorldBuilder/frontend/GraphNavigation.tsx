import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Camera = { x: number; y: number; w: number; h: number };
export function useGraphNavigation(
  svg: React.RefObject<SVGSVGElement | null>,
  camera: Camera,
  setCamera: React.Dispatch<React.SetStateAction<Camera>>,
) {
  const current = useRef(camera);
  current.current = camera;
  const zoomBy = (factor: number, client?: { x: number; y: number }) => {
    const matrix = svg.current?.getScreenCTM();
    const anchor =
      client && matrix
        ? new DOMPoint(client.x, client.y).matrixTransform(matrix.inverse())
        : {
            x: current.current.x + current.current.w / 2,
            y: current.current.y + current.current.h / 2,
          };
    setCamera((c) => {
      const ratio = Math.max(180, Math.min(20000, c.w * factor)) / c.w;
      return {
        x: anchor.x + (c.x - anchor.x) * ratio,
        y: anchor.y + (c.y - anchor.y) * ratio,
        w: c.w * ratio,
        h: c.h * ratio,
      };
    });
  };
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    let pan: {
      id: number;
      x: number;
      y: number;
      camera: Camera;
      inverse: DOMMatrix;
    } | null = null;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || !Number.isFinite(event.deltaY)) return;
      event.preventDefault();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1);
      zoomRef.current(
        Math.exp(Math.max(-500, Math.min(500, pixels)) * 0.0015),
        { x: event.clientX, y: event.clientY },
      );
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 1) return;
      const matrix = element.getScreenCTM();
      if (!matrix) return;
      event.preventDefault();
      event.stopPropagation();
      pan = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        camera: current.current,
        inverse: matrix.inverse(),
      };
      element.setPointerCapture(event.pointerId);
      element.classList.add("graph-panning");
    };
    const move = (event: PointerEvent) => {
      if (!pan || pan.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const start = new DOMPoint(pan.x, pan.y).matrixTransform(pan.inverse);
      const end = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        pan.inverse,
      );
      setCamera({
        ...pan.camera,
        x: pan.camera.x + start.x - end.x,
        y: pan.camera.y + start.y - end.y,
      });
    };
    const finish = (event: PointerEvent) => {
      if (!pan || pan.id !== event.pointerId) return;
      event.stopPropagation();
      pan = null;
      element.classList.remove("graph-panning");
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };
    const auxiliary = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("pointerdown", down, true);
    element.addEventListener("pointermove", move, true);
    element.addEventListener("pointerup", finish, true);
    element.addEventListener("pointercancel", finish, true);
    element.addEventListener("lostpointercapture", finish, true);
    element.addEventListener("auxclick", auxiliary);
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("pointerdown", down, true);
      element.removeEventListener("pointermove", move, true);
      element.removeEventListener("pointerup", finish, true);
      element.removeEventListener("pointercancel", finish, true);
      element.removeEventListener("lostpointercapture", finish, true);
      element.removeEventListener("auxclick", auxiliary);
    };
  }, [svg, setCamera]);
  return zoomBy;
}

export type GraphMenu = {
  x: number;
  y: number;
  actions: { label: string; run: () => void; disabled?: boolean }[];
};
export function GraphContextMenu({
  menu,
  close,
}: {
  menu: GraphMenu;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: menu.x, y: menu.y });
  useLayoutEffect(() => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition({
      x: Math.max(
        8,
        Math.min(
          menu.x,
          document.documentElement.clientWidth - bounds.width - 8,
        ),
      ),
      y: Math.max(8, Math.min(menu.y, innerHeight - bounds.height - 8)),
    });
  }, [menu]);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) closeRef.current();
    };
    const scroll = () => closeRef.current();
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", scroll);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", scroll);
      window.removeEventListener("scroll", scroll, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      ref={ref}
      className="graph-context-menu"
      role="menu"
      aria-label="Graph actions"
      style={{
        left: position.x,
        top: position.y,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) %
                  buttons.length
          ]?.focus();
        }
      }}
    >
      {menu.actions.map((action) => (
        <button
          key={action.label}
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            close();
            action.run();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
