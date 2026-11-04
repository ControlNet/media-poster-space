import { afterEach, describe, expect, it, vi } from "vitest";

import { PAGES_REDIRECT_STORAGE_KEY, isAppPath, restorePendingPagesRedirect } from "../src/routing/base-path";

// Test double: a minimal `window` (sessionStorage, location, history) instead of a browser.
function stubWindow(redirectTarget: string): { replaceState: ReturnType<typeof vi.fn>; storage: Map<string, string> } {
  const storage = new Map<string, string>([[PAGES_REDIRECT_STORAGE_KEY, redirectTarget]]);
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      }
    },
    location: { pathname: "/", search: "", hash: "" },
    history: { replaceState }
  });
  return { replaceState, storage };
}

describe("pages redirect restore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores a same-origin path", () => {
    const { replaceState, storage } = stubWindow("/wall?x=1");

    restorePendingPagesRedirect();

    expect(replaceState).toHaveBeenCalledWith({}, "", "/wall?x=1");
    expect(storage.has(PAGES_REDIRECT_STORAGE_KEY)).toBe(false);
  });

  it.each(["//evil.example/wall", "/\\evil.example", "https://evil.example/", "wall"])(
    "ignores %s instead of throwing at boot",
    (target) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { replaceState, storage } = stubWindow(target);

      expect(() => restorePendingPagesRedirect()).not.toThrow();
      expect(replaceState).not.toHaveBeenCalled();
      expect(storage.has(PAGES_REDIRECT_STORAGE_KEY)).toBe(false);
    }
  );
});

describe("app path matching", () => {
  it("treats /wall and /wall/ as the same route", () => {
    expect(isAppPath("/wall", "/wall", "/")).toBe(true);
    expect(isAppPath("/wall/", "/wall", "/")).toBe(true);
    expect(isAppPath("/walls", "/wall", "/")).toBe(false);
  });
});
