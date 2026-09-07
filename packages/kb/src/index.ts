// Public entry point — docs/PUBLIC_API.md "@harness/kb" ".":
// specificity, precedes, query, loadKB, saveKB, ingest — plus propose
// (CONTRACTS §14, which STAGE_INPUTS.md places in this package).

export * from "./store";
export * from "./precedence";
export * from "./ingest";
export * from "./propose/generate";
