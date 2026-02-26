import { describe, expect, it } from "vitest";

import {
  POSTER_CACHE_TTL_MS,
  POSTER_PREFETCH_POLICY_MEDIUM,
  POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS,
  SCHEDULER_CACHE_TTL_MS,
  SCHEDULER_PREFETCH_POLICY_MEDIUM,
  SCHEDULER_REAPPEARANCE_WINDOW_MS,
  schedulePoster,
  type MediaItem,
  type PosterScheduleHistoryEntry,
  type PosterSchedulerState
} from "../../src";

function makeMediaItem(overrides: Partial<MediaItem> & Pick<MediaItem, "id" | "title">): MediaItem {
  return {
    id: overrides.id,
    providerId: overrides.providerId ?? "jellyfin",
    libraryId: overrides.libraryId ?? "library-main",
    kind: overrides.kind ?? "movie",
    title: overrides.title,
    ...(overrides.sortTitle ? { sortTitle: overrides.sortTitle } : {}),
    ...(overrides.originalTitle ? { originalTitle: overrides.originalTitle } : {}),
    ...(typeof overrides.year === "number" ? { year: overrides.year } : {}),
    genres: overrides.genres ?? [],
    tags: overrides.tags ?? [],
    people: overrides.people ?? [],
    poster: overrides.poster ?? { url: `https://poster.local/${overrides.id}.jpg` }
  };
}

function runSeededSequence(seed: string): string[] {
  const items: MediaItem[] = [
    makeMediaItem({ id: "movie-001", title: "One", year: 2001, people: ["Actor 1"], tags: ["series:alpha"] }),
    makeMediaItem({ id: "movie-002", title: "Two", year: 2002, people: ["Actor 2"], tags: ["series:beta"] }),
    makeMediaItem({ id: "movie-003", title: "Three", year: 2003, people: ["Actor 3"], tags: ["series:gamma"] }),
    makeMediaItem({ id: "movie-004", title: "Four", year: 2004, people: ["Actor 4"], tags: ["series:delta"] })
  ];

  let history: PosterScheduleHistoryEntry[] = [];
  let state: PosterSchedulerState | undefined;
  const sequence: string[] = [];
  const startMs = Date.parse("2026-02-24T00:00:00.000Z");

  for (let step = 0; step < 12; step += 1) {
    const result = schedulePoster({
      items,
      history,
      seed,
      now: new Date(startMs + step * (POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS + 60_000)),
      ...(state ? { state } : {})
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    sequence.push(result.item.id);
    history = result.nextHistory;
    state = result.state;
  }

  return sequence;
}

describe("poster scheduler", () => {
  it("supports pure-random baseline path when no seed/state is provided", () => {
    const result = schedulePoster({
      items: [
        makeMediaItem({ id: "random-a", title: "Random A", tags: ["series:a"], people: ["A"], year: 2020 }),
        makeMediaItem({ id: "random-b", title: "Random B", tags: ["series:b"], people: ["B"], year: 2021 })
      ],
      history: [],
      now: "2026-02-24T12:00:00.000Z"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(["random-a", "random-b"]).toContain(result.item.id);
    expect(result.state.randomState).toBeNull();
  });

  it("reproduces the same sequence for repeated deterministic seed runs", () => {
    const firstRun = runSeededSequence("task9-seed");
    const secondRun = runSeededSequence("task9-seed");

    expect(firstRun).toEqual(secondRun);
  });

  it("suppresses same-series candidates in back-to-back attempts", () => {
    const reference = makeMediaItem({
      id: "series-reference",
      title: "Series A Episode 1",
      tags: ["series:series-a"],
      people: ["Actor X"],
      year: 2020
    });

    const result = schedulePoster({
      items: [
        reference,
        makeMediaItem({
          id: "series-blocked",
          title: "Series A Episode 2",
          tags: ["series:series-a"],
          people: ["Actor Q"],
          year: 2030
        }),
        makeMediaItem({
          id: "series-allowed",
          title: "Series Safe",
          tags: ["series:series-b"],
          people: ["Actor Safe"],
          year: 2031
        })
      ],
      history: [{ mediaId: reference.id, shownAt: "2026-02-24T09:00:00.000Z" }],
      now: "2026-02-24T12:00:00.000Z",
      seed: "anti-series-seed"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.item.id).toBe("series-allowed");
    expect(result.diagnostics.blockedByAntiClusterMediaIds).toEqual(
      expect.arrayContaining(["series-reference", "series-blocked"])
    );
  });

  it("suppresses same-actor candidates in back-to-back attempts", () => {
    const reference = makeMediaItem({
      id: "actor-reference",
      title: "Actor Anchor",
      tags: ["series:series-anchor"],
      people: ["Actor Y"],
      year: 2020
    });

    const result = schedulePoster({
      items: [
        reference,
        makeMediaItem({
          id: "actor-blocked",
          title: "Actor Adjacent",
          tags: ["series:series-c"],
          people: ["Actor Y"],
          year: 2030
        }),
        makeMediaItem({
          id: "actor-allowed",
          title: "Actor Safe",
          tags: ["series:series-d"],
          people: ["Actor Safe"],
          year: 2031
        })
      ],
      history: [{ mediaId: reference.id, shownAt: "2026-02-24T09:00:00.000Z" }],
      now: "2026-02-24T12:00:00.000Z",
      seed: "anti-actor-seed"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.item.id).toBe("actor-allowed");
    expect(result.diagnostics.blockedByAntiClusterMediaIds).toEqual(
      expect.arrayContaining(["actor-reference", "actor-blocked"])
    );
  });

  it("suppresses same-year candidates in back-to-back attempts", () => {
    const reference = makeMediaItem({
      id: "year-reference",
      title: "Year Anchor",
      tags: ["series:series-year-anchor"],
      people: ["Actor Z"],
      year: 2022
    });

    const result = schedulePoster({
      items: [
        reference,
        makeMediaItem({
          id: "year-blocked",
          title: "Same Year Candidate",
          tags: ["series:series-e"],
          people: ["Actor R"],
          year: 2022
        }),
        makeMediaItem({
          id: "year-allowed",
          title: "Different Year Candidate",
          tags: ["series:series-f"],
          people: ["Actor Safe"],
          year: 2030
        })
      ],
      history: [{ mediaId: reference.id, shownAt: "2026-02-24T09:00:00.000Z" }],
      now: "2026-02-24T12:00:00.000Z",
      seed: "anti-year-seed"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.item.id).toBe("year-allowed");
    expect(result.diagnostics.blockedByAntiClusterMediaIds).toEqual(
      expect.arrayContaining(["year-reference", "year-blocked"])
    );
  });

  it("enforces the 45-minute reappearance suppression window", () => {
    const now = "2026-02-24T12:00:00.000Z";

    const result = schedulePoster({
      items: [
        makeMediaItem({
          id: "recent-item",
          title: "Recent Item",
          tags: ["series:recent"],
          people: ["Recent Actor"],
          year: 2025
        }),
        makeMediaItem({
          id: "alternate-item",
          title: "Alternate Item",
          tags: ["series:alternate"],
          people: ["Alternate Actor"],
          year: 2026
        })
      ],
      history: [
        {
          mediaId: "recent-item",
          shownAt: "2026-02-24T11:30:00.000Z"
        }
      ],
      now,
      seed: "window-seed"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.item.id).toBe("alternate-item");
    expect(result.diagnostics.blockedByReappearanceMediaIds).toContain("recent-item");
    expect(result.diagnostics.pool).toBe("strict");
  });

  it("exposes medium prefetch and 30-day cache ttl integration hints", () => {
    const result = schedulePoster({
      items: [
        makeMediaItem({ id: "item-001", title: "One", tags: ["series:one"], people: ["Actor 1"], year: 2001 }),
        makeMediaItem({ id: "item-002", title: "Two", tags: ["series:two"], people: ["Actor 2"], year: 2002 }),
        makeMediaItem({ id: "item-003", title: "Three", tags: ["series:three"], people: ["Actor 3"], year: 2003 })
      ],
      history: [],
      now: "2026-02-24T00:00:00.000Z",
      seed: "prefetch-seed"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.prefetch.policy).toEqual(POSTER_PREFETCH_POLICY_MEDIUM);
    expect(result.cache.ttlMs).toBe(POSTER_CACHE_TTL_MS);
    expect(result.cache.mediaIds[0]).toBe(result.item.id);
    expect(new Date(result.cache.expiresAt).getTime()).toBe(
      Date.parse("2026-02-24T00:00:00.000Z") + POSTER_CACHE_TTL_MS
    );
  });

  it("exports scheduler constants as stable aliases", () => {
    expect(SCHEDULER_REAPPEARANCE_WINDOW_MS).toBe(POSTER_REAPPEARANCE_SUPPRESSION_WINDOW_MS);
    expect(SCHEDULER_CACHE_TTL_MS).toBe(POSTER_CACHE_TTL_MS);
    expect(SCHEDULER_PREFETCH_POLICY_MEDIUM).toEqual(POSTER_PREFETCH_POLICY_MEDIUM);
  });

  it("falls back to anti-cluster-relaxed pool when strict pool is empty", () => {
    const anchor = makeMediaItem({
      id: "anchor-item",
      title: "Anchor",
      tags: ["series:shared-cluster"],
      people: ["Anchor Actor"],
      year: 2020
    });

    const result = schedulePoster({
      items: [
        anchor,
        makeMediaItem({
          id: "cluster-sibling",
          title: "Sibling",
          tags: ["series:shared-cluster"],
          people: ["Second Actor"],
          year: 2023
        })
      ],
      history: [{ mediaId: "anchor-item", shownAt: "2026-02-24T09:00:00.000Z" }],
      now: "2026-02-24T12:00:00.000Z",
      seed: "fallback-anti-cluster"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.diagnostics.pool).toBe("anti-cluster-relaxed");
    expect(["anchor-item", "cluster-sibling"]).toContain(result.item.id);
  });

  it("falls back to reappearance-relaxed pool when all candidates are window-blocked", () => {
    const result = schedulePoster({
      items: [
        makeMediaItem({ id: "blocked-a", title: "Blocked A", tags: ["series:a"], people: ["A"], year: 2020 }),
        makeMediaItem({ id: "blocked-b", title: "Blocked B", tags: ["series:b"], people: ["B"], year: 2021 })
      ],
      history: [
        { mediaId: "blocked-a", shownAt: "2026-02-24T11:35:00.000Z" },
        { mediaId: "blocked-b", shownAt: "2026-02-24T11:40:00.000Z" }
      ],
      now: "2026-02-24T12:00:00.000Z",
      seed: "fallback-reappearance"
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected scheduler result");
    }

    expect(result.diagnostics.pool).toBe("reappearance-relaxed");
    expect(["blocked-a", "blocked-b"]).toContain(result.item.id);
  });
});
