// Public entry point — docs/PUBLIC_API.md "@harness/engine" ".":
// normalize, sampleReward, armStats, evaluateVetoes, decide (REWARD.md §8).
//
// Does NOT re-export @harness/experiment. An earlier draft of
// docs/PUBLIC_API.md proposed exactly that, but @harness/experiment imports
// `decide` from this package, so a re-export here would close a dependency
// cycle. They ship as two separate public packages — see
// docs/OPEN_QUESTIONS.md #16 (RESOLVED) and docs/decisions/07-experiment.md.

export * from "./normalize";
export * from "./reward";
export * from "./veto";
export * from "./decide";
