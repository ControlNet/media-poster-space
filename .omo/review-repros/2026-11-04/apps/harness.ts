// Shared throwaway harness for review repros (mirrors apps/desktop/test/onboarding-auth.test.ts helpers).
export const TEST_SERVER = "https://jellyfin.test"

export interface FetchHarnessOptions {
  logoutDelayMs?: number
  mediaStatus?: number
}

export function createMousePointerEvent(type: string): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, "pointerType", { value: "mouse" })
  Object.defineProperty(event, "button", { value: 0 })
  return event
}

export function clickElement(element: HTMLElement): void {
  element.dispatchEvent(createMousePointerEvent("pointerdown"))
  element.click()
}

export function clickByTestId(testId: string): void {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${testId}`)
  }
  clickElement(element)
}

export function setInputValue(testId: string, value: string): void {
  const input = document.querySelector(`[data-testid="${testId}"]`)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${testId}`)
  }
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

export function setChecked(testId: string, checked: boolean): void {
  const input = document.querySelector(`[data-testid="${testId}"]`)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${testId}`)
  }
  input.checked = checked
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

export function blurServerInput(): void {
  const input = document.querySelector('[data-testid="server-url-input"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing server input")
  }
  input.dispatchEvent(new Event("blur"))
}

export function listTestIds(): string[] {
  return Array.from(document.querySelectorAll("[data-testid]"))
    .map((node) => (node as HTMLElement).dataset.testid ?? "")
    .filter((id) => id.length > 0)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
  })
}

export function createFetchHarness(options: FetchHarnessOptions = {}): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push(url)

    if (url.endsWith("/System/Info/Public")) {
      return json({ Version: "10.9.0" })
    }

    if (url.endsWith("/Users/AuthenticateByName")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { Username?: string } : {}
      return json({ AccessToken: "token-abc", User: { Id: "user-1", Name: body.Username ?? "demo-user" } })
    }

    if (url.endsWith("/Users/user-1/Views")) {
      return json({ Items: [{ Id: "movies-main", Name: "Movies", CollectionType: "movies" }] })
    }

    if (url.includes("/Users/user-1/Items")) {
      if (typeof options.mediaStatus === "number") {
        return json({ Message: "media-failure" }, options.mediaStatus)
      }
      const items = Array.from({ length: 6 }, (_, index) => ({
        Id: `movie-${index}`,
        Name: `Poster ${index}`,
        Type: "Movie",
        ProductionYear: 2024,
        ImageTags: { Primary: `tag-${index}` }
      }))
      return json({ Items: items, TotalRecordCount: items.length })
    }

    if (url.endsWith("/Sessions/Logout")) {
      if (options.logoutDelayMs && options.logoutDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.logoutDelayMs))
      }
      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 404 })
  }) as typeof fetch & { calls: string[] }
  fn.calls = calls
  return fn
}

export function seedPersistedSessionAndHandoff(storage: Storage): void {
  storage.setItem("mps.auth.session", JSON.stringify({
    providerId: "jellyfin",
    serverUrl: TEST_SERVER,
    userId: "user-1",
    username: "demo-user",
    accessToken: "token-abc",
    createdAt: "2026-01-01T00:00:00.000Z"
  }))
  storage.setItem("mps.wall.handoff", JSON.stringify({
    selectedLibraryIds: ["movies-main"],
    preferences: { rememberServer: true, rememberUsername: true, rememberPasswordRequested: false }
  }))
}
