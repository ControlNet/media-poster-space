const PAGES_REDIRECT_STORAGE_KEY = "mps.pages.redirect-target";

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  const withoutEdgeSlashes = trimmed.replace(/^\/+|\/+$/g, "");
  return `/${withoutEdgeSlashes}`;
}

function normalizePathname(pathname: string): string {
  if (pathname.length <= 1) {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeAppRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  const withoutEdgeSlashes = trimmed.replace(/^\/+|\/+$/g, "");
  return `/${withoutEdgeSlashes}`;
}

function readSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn("[routing] sessionStorage is unavailable", error);
    return null;
  }
}

export function resolveAppPath(relativePath: string, basePath: string = import.meta.env.BASE_URL): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedRelativePath = normalizeAppRelativePath(relativePath);

  if (normalizedRelativePath === "/") {
    return normalizedBasePath === "/" ? "/" : `${normalizedBasePath}/`;
  }

  return normalizedBasePath === "/"
    ? normalizedRelativePath
    : `${normalizedBasePath}${normalizedRelativePath}`;
}

export function isAppPath(pathname: string, relativePath: string, basePath: string = import.meta.env.BASE_URL): boolean {
  return normalizePathname(pathname) === normalizePathname(resolveAppPath(relativePath, basePath));
}

export function restorePendingPagesRedirect(): void {
  const sessionStorageRef = readSessionStorage();
  const redirectTarget = sessionStorageRef?.getItem(PAGES_REDIRECT_STORAGE_KEY);
  if (!redirectTarget) {
    return;
  }

  sessionStorageRef?.removeItem(PAGES_REDIRECT_STORAGE_KEY);
  const currentTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (redirectTarget === currentTarget) {
    return;
  }

  window.history.replaceState({}, "", redirectTarget);
}

export { PAGES_REDIRECT_STORAGE_KEY };
