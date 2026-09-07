// Public entry point — docs/PUBLIC_API.md "@harness/experiment" ".":
// runExperiment (CONTRACTS §12).
//
// Published as its own package, not re-exported from @harness/engine — that
// would close a dependency cycle, since this package imports `decide` from
// @harness/engine. See docs/OPEN_QUESTIONS.md #16 (RESOLVED) and
// docs/decisions/07-experiment.md.

export * from "./run";
