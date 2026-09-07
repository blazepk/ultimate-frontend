# ADR-0012 — JSON-file persistence, no database

**Status:** accepted (frozen with CONTRACTS v1)

## Context

The harness persists configs, contracts, profiles, proposals, experiment
results, samples, and the KB. The system runs single-process on a developer
machine; artifacts must be diffable, fixture-able, and creatable by any stage
without infrastructure.

## Decision

Every artifact is a UTF-8 JSON (or JSONL for sample streams) file at a frozen
path (CONTRACTS §15), stamped with `schema_version: 1`. The KB is one file
(`kb/records.json`) loaded and saved whole. Samples are append-oriented JSONL
(`runs/samples/<experiment_id>.jsonl`). No database, no ORM, no file locking:
the experiment runner is the only writer during a run, and the contract
declares single-process operation as an operating assumption.

Fixed-width generated IDs (`<prefix>_<unix_ms>_<seq>`, CONTRACTS §1.1) keep
files sortable by name and make cross-references greppable.

## Alternatives rejected

- **SQLite** — better queries and atomicity, but adds a native dependency,
  makes fixtures opaque blobs, and every stage's tests would need schema
  migration handling.
- **One JSON file per KB record** — precedence queries need the whole set
  anyway; a directory of tiny files complicates the supersede rule's scan.
- **In-memory only with export** — the KB's entire purpose is surviving
  across runs.

## Revisit when

The KB exceeds ~10,000 records or whole-file load/save measurably slows the
proposal loop; or a second concurrent writer appears (parallel experiment
runners) — either forces a real store behind the same module surface
(CONTRACTS §13.5 signatures are deliberately store-agnostic).
