---
name: code-partition-stats
description: >
  Generate per-partition code statistics and before/after diffs for refactor impact
  analysis. Use when evaluating architecture changes (for example web vs desktop vs
  core consolidation), creating baseline metrics before a large refactor, or reporting
  quantitative progress using file and line deltas.
---

# Code Partition Stats

Generate reproducible measurements for codebase partitions and compare refactor impact over time.

## Quick Start

From repository root, create a baseline snapshot:

```bash
python ".agent/skills/code-partition-stats/scripts/partition_stats.py" snapshot \
  --root "." \
  --output ".omo/evidence/refactor-baseline.partition-stats.json"
```

After changes, create a second snapshot:

```bash
python ".agent/skills/code-partition-stats/scripts/partition_stats.py" snapshot \
  --root "." \
  --output ".omo/evidence/refactor-after.partition-stats.json"
```

Build a quantitative diff report:

```bash
python ".agent/skills/code-partition-stats/scripts/partition_stats.py" diff \
  --before ".omo/evidence/refactor-baseline.partition-stats.json" \
  --after ".omo/evidence/refactor-after.partition-stats.json" \
  --output ".omo/evidence/refactor-diff.partition-stats.json"
```

## Default Partition Model (`mps-wall-refactor`)

The bundled script includes this preset:

- `web_frontend`: `apps/web/src`
- `desktop_frontend`: `apps/desktop/src`
- `core_shared`: `packages/core/src`
- `wall_feature`:
  - `apps/web/src/wall`
  - `apps/web/src/scene/wall-scene.ts`
  - `apps/web/src/scene/route.ts`
  - `apps/desktop/src/wall`
  - `apps/desktop/src/features/platform/wall-platform-adapter.ts`
  - `packages/core/src/wall`

## Custom Partition Config

Pass `--config <json-file>` to override partitions/extensions/excluded directories.

Example config file:

```json
{
  "partitions": {
    "web_frontend": ["apps/web/src"],
    "desktop_frontend": ["apps/desktop/src"],
    "core_shared": ["packages/core/src"],
    "wall_feature": [
      "apps/web/src/wall",
      "apps/desktop/src/wall",
      "packages/core/src/wall"
    ]
  },
  "extensions": [".ts", ".tsx", ".js", ".mjs", ".css"],
  "exclude_dirs": ["node_modules", "dist", "dist-release", "release", ".git", ".omo"]
}
```

Run with custom config:

```bash
python ".agent/skills/code-partition-stats/scripts/partition_stats.py" snapshot \
  --root "." \
  --config ".omo/evidence/partition-config.json" \
  --output ".omo/evidence/refactor-custom.partition-stats.json"
```

## How To Read Results

For refactor outcomes, prioritize:

1. `non_empty_lines` delta by partition (primary size signal)
2. `file_count` delta by partition (surface-area movement)
3. `wall_feature` movement from app partitions to `core_shared`
4. extension-level deltas to detect accidental scope expansion

Use the diff JSON as a quantitative appendix in refactor PRs.
