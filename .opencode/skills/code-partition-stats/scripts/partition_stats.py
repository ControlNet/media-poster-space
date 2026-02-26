#!/usr/bin/env python3
"""
partition_stats.py

Generate per-partition code statistics and before/after diff reports.

Usage:
  python .opencode/skills/code-partition-stats/scripts/partition_stats.py snapshot \
    --root . \
    --output .sisyphus/evidence/refactor-baseline.partition-stats.json

  python .opencode/skills/code-partition-stats/scripts/partition_stats.py diff \
    --before .sisyphus/evidence/refactor-baseline.partition-stats.json \
    --after .sisyphus/evidence/refactor-after.partition-stats.json \
    --output .sisyphus/evidence/refactor-diff.partition-stats.json
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VERSION = 1
NUMERIC_METRICS = (
    "file_count",
    "total_lines",
    "non_empty_lines",
    "blank_lines",
    "comment_lines",
    "code_lines",
)

HASH_COMMENT_EXTENSIONS = {
    ".py",
    ".sh",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".conf",
    ".rb",
    ".pl",
    ".dockerfile",
}

SLASH_COMMENT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".scss",
    ".sass",
    ".java",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".go",
    ".rs",
    ".swift",
    ".kt",
    ".kts",
}

HTML_COMMENT_EXTENSIONS = {".html", ".htm", ".xml", ".svg"}

DEFAULT_CONFIG: dict[str, Any] = {
    "model": "mps-wall-refactor",
    "partitions": {
        "web_frontend": ["apps/web/src"],
        "desktop_frontend": ["apps/desktop/src"],
        "core_shared": ["packages/core/src"],
        "wall_feature": [
            "apps/web/src/wall",
            "apps/web/src/scene/wall-scene.ts",
            "apps/web/src/scene/route.ts",
            "apps/desktop/src/wall",
            "apps/desktop/src/features/platform/wall-platform-adapter.ts",
            "packages/core/src/wall",
        ],
    },
    "extensions": [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".css",
        ".scss",
        ".sass",
        ".html",
    ],
    "exclude_dirs": [
        "node_modules",
        "dist",
        "dist-release",
        ".turbo",
        ".git",
        "release",
        ".sisyphus",
        "coverage",
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate partition code statistics and diff reports."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot = subparsers.add_parser(
        "snapshot", help="Create partition statistics snapshot JSON"
    )
    snapshot.add_argument("--root", required=True, help="Repository root path")
    snapshot.add_argument("--output", required=True, help="Output JSON path")
    snapshot.add_argument("--config", help="Optional custom config JSON path")

    diff = subparsers.add_parser("diff", help="Create diff report from two snapshots")
    diff.add_argument("--before", required=True, help="Before snapshot JSON")
    diff.add_argument("--after", required=True, help="After snapshot JSON")
    diff.add_argument("--output", required=True, help="Output JSON path")

    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_path(path: Path) -> str:
    return path.as_posix()


def read_json(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError(f"Expected object JSON in {path}")
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n", encoding="utf8"
    )


def merge_config(
    default_config: dict[str, Any], override: dict[str, Any] | None
) -> dict[str, Any]:
    merged: dict[str, Any] = {
        "model": default_config.get("model", "partition-model"),
        "partitions": dict(default_config.get("partitions", {})),
        "extensions": list(default_config.get("extensions", [])),
        "exclude_dirs": list(default_config.get("exclude_dirs", [])),
    }
    if not override:
        return normalize_config(merged)

    if "model" in override and isinstance(override["model"], str):
        merged["model"] = override["model"]
    if "partitions" in override and isinstance(override["partitions"], dict):
        merged["partitions"] = override["partitions"]
    if "extensions" in override and isinstance(override["extensions"], list):
        merged["extensions"] = override["extensions"]
    if "exclude_dirs" in override and isinstance(override["exclude_dirs"], list):
        merged["exclude_dirs"] = override["exclude_dirs"]

    return normalize_config(merged)


def normalize_config(config: dict[str, Any]) -> dict[str, Any]:
    model = str(config.get("model", "partition-model"))

    raw_partitions = config.get("partitions", {})
    if not isinstance(raw_partitions, dict) or not raw_partitions:
        raise ValueError("Config must contain non-empty 'partitions' object")

    partitions: dict[str, list[str]] = {}
    for name, value in raw_partitions.items():
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Partition names must be non-empty strings")
        if not isinstance(value, list) or not value:
            raise ValueError(f"Partition '{name}' must map to a non-empty string list")
        normalized_entries = [str(item) for item in value if str(item).strip()]
        if not normalized_entries:
            raise ValueError(f"Partition '{name}' has no valid include paths")
        partitions[name] = normalized_entries

    raw_extensions = config.get("extensions", [])
    if not isinstance(raw_extensions, list):
        raise ValueError("'extensions' must be a list")
    extensions = []
    for extension in raw_extensions:
        normalized = str(extension).strip().lower()
        if not normalized:
            continue
        if not normalized.startswith("."):
            normalized = f".{normalized}"
        extensions.append(normalized)
    extensions = sorted(set(extensions))

    raw_exclude_dirs = config.get("exclude_dirs", [])
    if not isinstance(raw_exclude_dirs, list):
        raise ValueError("'exclude_dirs' must be a list")
    exclude_dirs = sorted(
        {str(name).strip() for name in raw_exclude_dirs if str(name).strip()}
    )

    return {
        "model": model,
        "partitions": partitions,
        "extensions": extensions,
        "exclude_dirs": exclude_dirs,
    }


def is_excluded_path(path: Path, excluded_dirs: set[str]) -> bool:
    return any(part in excluded_dirs for part in path.parts)


def is_allowed_extension(path: Path, allowed_extensions: set[str]) -> bool:
    if not allowed_extensions:
        return True
    return path.suffix.lower() in allowed_extensions


def to_relative_or_absolute(path: Path, root: Path) -> str:
    try:
        return normalize_path(path.relative_to(root))
    except ValueError:
        return normalize_path(path)


def iter_partition_files(
    root: Path,
    include_entries: list[str],
    allowed_extensions: set[str],
    excluded_dirs: set[str],
) -> list[tuple[Path, str]]:
    results: list[tuple[Path, str]] = []
    seen: set[str] = set()

    for entry in include_entries:
        raw = Path(entry)
        absolute_entry = raw.resolve() if raw.is_absolute() else (root / raw).resolve()
        if not absolute_entry.exists():
            continue

        if absolute_entry.is_file():
            if is_excluded_path(
                absolute_entry, excluded_dirs
            ) or not is_allowed_extension(absolute_entry, allowed_extensions):
                continue
            rel = to_relative_or_absolute(absolute_entry, root)
            if rel not in seen:
                seen.add(rel)
                results.append((absolute_entry, rel))
            continue

        for current_root, dir_names, file_names in os.walk(absolute_entry):
            dir_names[:] = [name for name in dir_names if name not in excluded_dirs]
            current_path = Path(current_root)
            if is_excluded_path(current_path, excluded_dirs):
                continue

            for filename in file_names:
                file_path = current_path / filename
                if is_excluded_path(
                    file_path, excluded_dirs
                ) or not is_allowed_extension(file_path, allowed_extensions):
                    continue

                rel = to_relative_or_absolute(file_path, root)
                if rel in seen:
                    continue
                seen.add(rel)
                results.append((file_path, rel))

    return sorted(results, key=lambda item: item[1])


def count_comment_lines(lines: list[str], extension: str) -> int:
    comment_lines = 0

    if extension in HASH_COMMENT_EXTENSIONS:
        for line in lines:
            if line.strip().startswith("#"):
                comment_lines += 1
        return comment_lines

    if extension in HTML_COMMENT_EXTENSIONS:
        in_block = False
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if in_block:
                comment_lines += 1
                if "-->" in stripped:
                    in_block = False
                continue
            if stripped.startswith("<!--"):
                comment_lines += 1
                if "-->" not in stripped:
                    in_block = True
        return comment_lines

    if extension in SLASH_COMMENT_EXTENSIONS:
        in_block = False
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            if in_block:
                comment_lines += 1
                if "*/" in stripped:
                    in_block = False
                continue

            if stripped.startswith("//"):
                comment_lines += 1
                continue
            if stripped.startswith("/*"):
                comment_lines += 1
                if "*/" not in stripped[2:]:
                    in_block = True
                continue
            if stripped.startswith("*"):
                comment_lines += 1

    return comment_lines


def analyze_file(path: Path) -> dict[str, int]:
    text = path.read_text(encoding="utf8", errors="ignore")
    lines = text.splitlines()
    total_lines = len(lines)
    non_empty_lines = sum(1 for line in lines if line.strip())
    blank_lines = total_lines - non_empty_lines
    extension = path.suffix.lower()
    comment_lines = count_comment_lines(lines, extension)
    code_lines = max(non_empty_lines - comment_lines, 0)
    return {
        "total_lines": total_lines,
        "non_empty_lines": non_empty_lines,
        "blank_lines": blank_lines,
        "comment_lines": comment_lines,
        "code_lines": code_lines,
    }


def empty_stats() -> dict[str, int]:
    return {
        "file_count": 0,
        "total_lines": 0,
        "non_empty_lines": 0,
        "blank_lines": 0,
        "comment_lines": 0,
        "code_lines": 0,
    }


def snapshot_partition(
    root: Path, include_entries: list[str], extensions: set[str], exclude_dirs: set[str]
) -> dict[str, Any]:
    files = iter_partition_files(root, include_entries, extensions, exclude_dirs)
    stats = empty_stats()
    by_extension: dict[str, dict[str, int]] = {}
    largest_files: list[dict[str, Any]] = []

    for absolute_path, relative_path in files:
        extension = absolute_path.suffix.lower() or "<none>"
        file_stats = analyze_file(absolute_path)

        stats["file_count"] += 1
        for key in NUMERIC_METRICS:
            if key == "file_count":
                continue
            stats[key] += file_stats[key]

        extension_bucket = by_extension.setdefault(extension, empty_stats())
        extension_bucket["file_count"] += 1
        for key in NUMERIC_METRICS:
            if key == "file_count":
                continue
            extension_bucket[key] += file_stats[key]

        largest_files.append(
            {
                "path": relative_path,
                "total_lines": file_stats["total_lines"],
                "non_empty_lines": file_stats["non_empty_lines"],
            }
        )

    largest_files.sort(key=lambda entry: (-entry["total_lines"], entry["path"]))

    return {
        "includes": include_entries,
        **stats,
        "by_extension": {key: by_extension[key] for key in sorted(by_extension)},
        "largest_files": largest_files[:20],
    }


def create_snapshot(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    partitions = config["partitions"]
    extensions = set(config["extensions"])
    exclude_dirs = set(config["exclude_dirs"])

    partition_payload: dict[str, Any] = {}
    for partition_name in sorted(partitions):
        partition_payload[partition_name] = snapshot_partition(
            root=root,
            include_entries=partitions[partition_name],
            extensions=extensions,
            exclude_dirs=exclude_dirs,
        )

    aggregate = empty_stats()
    for partition in partition_payload.values():
        for key in NUMERIC_METRICS:
            aggregate[key] += int(partition.get(key, 0))

    return {
        "schema_version": VERSION,
        "tool": "code-partition-stats",
        "mode": "snapshot",
        "generated_at": utc_now_iso(),
        "root": normalize_path(root.resolve()),
        "model": config["model"],
        "config": {
            "partitions": partitions,
            "extensions": config["extensions"],
            "exclude_dirs": config["exclude_dirs"],
        },
        "partitions": partition_payload,
        "aggregate": aggregate,
        "notes": [
            "Partition aggregates may overlap when includes intersect.",
            "Use partition deltas comparatively between snapshots.",
        ],
    }


def delta_entry(before_value: int, after_value: int) -> dict[str, Any]:
    delta = after_value - before_value
    percent = None
    if before_value != 0:
        percent = round((delta / before_value) * 100.0, 2)
    return {
        "before": before_value,
        "after": after_value,
        "delta": delta,
        "percent": percent,
    }


def diff_snapshot(
    before: dict[str, Any], after: dict[str, Any], before_path: Path, after_path: Path
) -> dict[str, Any]:
    before_partitions = before.get("partitions", {})
    after_partitions = after.get("partitions", {})
    if not isinstance(before_partitions, dict) or not isinstance(
        after_partitions, dict
    ):
        raise ValueError("Both snapshots must contain a 'partitions' object")

    all_partitions = sorted(set(before_partitions) | set(after_partitions))
    partition_deltas: dict[str, Any] = {}
    movers: list[dict[str, Any]] = []

    for partition_name in all_partitions:
        before_partition = before_partitions.get(partition_name, {})
        after_partition = after_partitions.get(partition_name, {})

        metrics: dict[str, Any] = {}
        for metric in NUMERIC_METRICS:
            before_value = int(before_partition.get(metric, 0) or 0)
            after_value = int(after_partition.get(metric, 0) or 0)
            metrics[metric] = delta_entry(before_value, after_value)

        before_ext = (
            before_partition.get("by_extension", {})
            if isinstance(before_partition, dict)
            else {}
        )
        after_ext = (
            after_partition.get("by_extension", {})
            if isinstance(after_partition, dict)
            else {}
        )
        ext_names = sorted(set(before_ext) | set(after_ext))
        by_extension: dict[str, Any] = {}
        for extension in ext_names:
            before_bucket = (
                before_ext.get(extension, {}) if isinstance(before_ext, dict) else {}
            )
            after_bucket = (
                after_ext.get(extension, {}) if isinstance(after_ext, dict) else {}
            )
            extension_metrics: dict[str, Any] = {}
            for metric in NUMERIC_METRICS:
                extension_metrics[metric] = delta_entry(
                    int(before_bucket.get(metric, 0) or 0),
                    int(after_bucket.get(metric, 0) or 0),
                )
            by_extension[extension] = extension_metrics

        partition_deltas[partition_name] = {
            "metrics": metrics,
            "by_extension": by_extension,
        }

        movers.append(
            {
                "partition": partition_name,
                "non_empty_lines_delta": metrics["non_empty_lines"]["delta"],
                "code_lines_delta": metrics["code_lines"]["delta"],
                "file_count_delta": metrics["file_count"]["delta"],
            }
        )

    movers.sort(key=lambda item: abs(item["non_empty_lines_delta"]), reverse=True)

    aggregate_before = (
        before.get("aggregate", {})
        if isinstance(before.get("aggregate", {}), dict)
        else {}
    )
    aggregate_after = (
        after.get("aggregate", {})
        if isinstance(after.get("aggregate", {}), dict)
        else {}
    )
    aggregate_delta = {
        metric: delta_entry(
            int(aggregate_before.get(metric, 0) or 0),
            int(aggregate_after.get(metric, 0) or 0),
        )
        for metric in NUMERIC_METRICS
    }

    return {
        "schema_version": VERSION,
        "tool": "code-partition-stats",
        "mode": "diff",
        "generated_at": utc_now_iso(),
        "before_snapshot": normalize_path(before_path.resolve()),
        "after_snapshot": normalize_path(after_path.resolve()),
        "partition_deltas": partition_deltas,
        "aggregate_delta": aggregate_delta,
        "largest_partition_movers": movers,
    }


def run_snapshot(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Invalid --root path: {root}")

    override = read_json(Path(args.config).resolve()) if args.config else None
    config = merge_config(DEFAULT_CONFIG, override)
    payload = create_snapshot(root, config)

    output_path = Path(args.output).resolve()
    write_json(output_path, payload)

    print(f"[partition-stats] snapshot written: {output_path}")
    for partition_name in sorted(payload["partitions"]):
        partition = payload["partitions"][partition_name]
        print(
            "[partition-stats] "
            f"{partition_name}: files={partition['file_count']} "
            f"non_empty={partition['non_empty_lines']} code={partition['code_lines']}"
        )
    return 0


def run_diff(args: argparse.Namespace) -> int:
    before_path = Path(args.before).resolve()
    after_path = Path(args.after).resolve()
    before_payload = read_json(before_path)
    after_payload = read_json(after_path)

    diff_payload = diff_snapshot(before_payload, after_payload, before_path, after_path)
    output_path = Path(args.output).resolve()
    write_json(output_path, diff_payload)

    print(f"[partition-stats] diff written: {output_path}")
    for mover in diff_payload["largest_partition_movers"]:
        print(
            "[partition-stats] "
            f"{mover['partition']}: Δnon_empty={mover['non_empty_lines_delta']} "
            f"Δcode={mover['code_lines_delta']} Δfiles={mover['file_count_delta']}"
        )
    return 0


def main() -> int:
    args = parse_args()
    if args.command == "snapshot":
        return run_snapshot(args)
    if args.command == "diff":
        return run_diff(args)
    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
