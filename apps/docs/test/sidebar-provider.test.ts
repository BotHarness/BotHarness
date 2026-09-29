// @vitest-environment jsdom

import { act, createElement, createRef, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "../src/components/coss/sidebar";

let root: Root;
let container: HTMLDivElement;
let mobile = false;
let mediaListeners: Set<() => void>;
let setCookie: ReturnType<typeof vi.fn>;

function Probe() {
  const sidebar = useSidebar();
  return createElement(
    "button",
    { onClick: sidebar.toggleSidebar, type: "button" },
    `${sidebar.state}:${sidebar.openMobile}`,
  );
}

function shortcut(options: { ctrlKey?: boolean; metaKey?: boolean; key?: string } = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      ...options,
    }),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mobile = false;
  mediaListeners = new Set();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      get matches() {
        return mobile;
      },
      addEventListener(type: string, listener: () => void) {
        if (type === "change") mediaListeners.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        if (type === "change") mediaListeners.delete(listener);
      },
    })),
  );
  setCookie = vi.fn(async () => {});
  vi.stubGlobal("cookieStore", { set: setCookie });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("COSS SidebarProvider shortcut lifecycle", () => {
  it("toggles local desktop state, writes the cookie, and removes its listener and caller ref", async () => {
    const forwardedRef = createRef<HTMLDivElement>();
    const removeListener = vi.spyOn(window, "removeEventListener");
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(SidebarProvider, { ref: forwardedRef }, createElement(Probe)),
        ),
      );
    });
    expect(forwardedRef.current?.dataset.slot).toBe("sidebar-wrapper");
    expect(container.querySelector("button")?.textContent).toBe("expanded:false");

    await act(async () => shortcut({ ctrlKey: true, key: "x" }));
    expect(container.querySelector("button")?.textContent).toBe("expanded:false");
    await act(async () => shortcut({ ctrlKey: true }));
    expect(container.querySelector("button")?.textContent).toBe("collapsed:false");
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: "sidebar_state", path: "/", value: "false" }),
    );
    await act(async () => shortcut({ metaKey: true }));
    expect(container.querySelector("button")?.textContent).toBe("expanded:false");

    await act(async () => root.unmount());
    expect(forwardedRef.current).toBeNull();
    expect(removeListener.mock.calls.some(([type]) => type === "keydown")).toBe(true);
    const writesBeforeDetachedShortcut = setCookie.mock.calls.length;
    await act(async () => shortcut({ ctrlKey: true }));
    expect(setCookie).toHaveBeenCalledTimes(writesBeforeDetachedShortcut);
  });

  it("keeps controlled desktop state and opens the mobile sheet without changing the cookie", async () => {
    function Controlled() {
      const [open, setOpen] = useState(true);
      return createElement(
        SidebarProvider,
        { open, onOpenChange: setOpen },
        createElement(Probe),
      );
    }
    await act(async () => root.render(createElement(Controlled)));
    await act(async () => shortcut({ ctrlKey: true }));
    expect(container.querySelector("button")?.textContent).toBe("collapsed:false");
    expect(setCookie).toHaveBeenCalledTimes(1);

    await act(async () => {
      mobile = true;
      for (const listener of mediaListeners) listener();
    });
    await act(async () => shortcut({ ctrlKey: true }));
    expect(container.querySelector("button")?.textContent).toBe("collapsed:true");
    expect(setCookie).toHaveBeenCalledTimes(1);
  });
});