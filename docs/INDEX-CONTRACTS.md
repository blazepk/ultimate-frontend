# INDEX-CONTRACTS.md — section-to-line map for `docs/CONTRACTS.md`

Generated from the headings of `docs/CONTRACTS.md`. Use this to resolve a
`docs/CONTRACTS.md#§N` reference to a line range and read only that range,
rather than loading the whole 1213-line file.

**Source file:** `docs/CONTRACTS.md`, 1213 lines.
**Regenerate whenever `docs/CONTRACTS.md` changes** — line numbers are positional
and any edit above a section shifts every range below it.

`#§N` addresses a top-level section and includes all of its subsections. A
subsection may be addressed directly as `#§N.M`.

---

## Top-level sections

| Ref | Title | Lines |
|-----|-------|------:|
| — | Front matter (status, freeze notice, companion docs) | 1–17 |
| `#§1` | Conventions and constants | 18–78 |
| `#§2` | Closed vocabularies | 79–146 |
| `#§3` | Core configuration types | 147–221 |
| `#§4` | Placement tuple and constraint table | 222–274 |
| `#§5` | Validation | 275–362 |
| `#§6` | Island capability contract | 363–455 |
| `#§7` | Renderer adapter, scheduler, and runtime contracts | 456–577 |
| `#§8` | Per-route budgets | 578–617 |
| `#§9` | BuildProfile, build outputs | 618–691 |
| `#§10` | Proposal | 692–717 |
| `#§11` | MeasurementSample and measurement procedure | 718–806 |
| `#§12` | ExperimentResult | 807–860 |
| `#§13` | Knowledge base | 861–976 |
| `#§14` | Proposal generation (deterministic algorithm) | 977–1023 |
| `#§15` | Repository layout (frozen paths) | 1024–1053 |
| `#Appendix-A` | Reference fixtures (normative; materialized by Stage 1) | 1054–1191 |
| `#Appendix-B` | Invalid-config test vectors (normative for Stage 1/2 tests) | 1192–1213 |

## Subsections, with the identifiers each defines

| Ref | Title | Lines | Defines |
|-----|-------|------:|---------|
| `#§1.1` | Identifiers | 20–35 | authored-ID regex; `bp_`/`pr_`/`ex_`/`sm_`/`kb_` prefixes |
| `#§1.2` | Timestamps | 36–41 | ISO-8601 UTC ms format |
| `#§1.3` | JSON values | 42–55 | `JsonValue` |
| `#§1.4` | Frozen constants | 56–70 | `SCHEMA_VERSION`, `N_PER_ARM`, `SCAN_SAMPLES`, `SETTLE_MS`, `HYDRATION_TIMEOUT_MS`, `FLAKE_TOLERANCE`, `VIEWPORT_W`, `VIEWPORT_H`, `CPU_THROTTLE`, `SERVE_PORT_BASE`, `DATA_PATH_PREFIX` |
| `#§1.5` | Rounding | 71–78 | 4-dp half-up persistence rule |
| `#§2` | Closed vocabularies | 79–146 | `Renderer`, `Hydration`, `RenderMode`, `DataStrategy`, `Tier`, `MetricName`, `Arm`, `Verdict`, `VetoCode`, `ProposalStatus`, `KBDirection`, `KBSource`, `KBStatus`, `PropType`, `AriaRole`, `KeyboardInteraction`, `FocusBehavior` |
| `#§3.1` | SiteConfig | 149–160 | `SiteConfig` |
| `#§3.2` | RouteConfig | 161–186 | `RouteConfig`; path grammar; `data_url` grammar |
| `#§3.3` | IslandConfig | 187–200 | `IslandConfig` |
| `#§3.4` | Resolved types | 201–221 | `ResolvedRouteConfig`, `ResolvedSiteConfig` |
| `#§4.1` | Combination constraints (the deny list) | 237–254 | `C001`, `C002`, `C003`, `C004` |
| `#§4.2` | Checksum (normative test vector) | 255–263 | 60 illegal / 180 legal of 240 |
| `#§4.3` | Capability constraint (contract-dependent) | 264–274 | `C005` |
| `#§5.1` | ValidationError | 277–297 | `ValidationError`, `ErrorCode` |
| `#§5.2` | Structural error codes | 298–320 | `S001`–`S018` |
| `#§5.3` | Collection and ordering | 321–328 | collect-all, sort by (pointer, code) |
| `#§5.4` | Module surface (Stage 1 / Stage 2) | 329–362 | `validate`, `resolve`, `makeBaselineProfile`, `applyProposal`, `validateWithContracts`, `validateContracts` |
| `#§6.1` | Types | 368–401 | `IslandContract`, `PropSpec`, `EventSpec`, `A11ySpec` |
| `#§6.2` | Runtime obligations | 402–418 | the four a11y wrapper checks; `CustomEvent` emission |
| `#§6.3` | Prop type checking | 419–425 | `PropType` satisfaction rules |
| `#§6.4` | The reserved `data` prop | 426–435 | `data` injection semantics |
| `#§6.5` | Contracts file | 436–455 | `ContractsFile` |
| `#§7.1` | RendererAdapter | 458–481 | `RendererAdapter`, `IslandModule` |
| `#§7.2` | Implementation registry | 482–498 | `RegistryFile`, `IslandImplementation` |
| `#§7.3` | IslandBootSpec and scheduler | 499–524 | `IslandBootSpec`, `initHarness` |
| `#§7.4` | Registry checks | 525–540 | `R001`, `R002`, `validateRegistry` |
| `#§7.5` | Island wrapper (HTML contract) | 541–557 | wrapper markup; shell template |
| `#§7.6` | Client runtime state (measurement contract) | 558–577 | `HarnessRuntimeState`, `window.__HARNESS__` |
| `#§8.1` | Schema | 580–597 | `RouteBudgets` |
| `#§8.2` | Default values by tier (canonical table) | 598–617 | tier-default budget table; merge rule |
| `#§9.1` | BuildProfile | 620–642 | `BuildProfile`; data-strategy normalization on mutation |
| `#§9.2` | Build outputs (Stage 4) | 643–691 | `build`, `BuildManifest`; `dist/` layout |
| `#§10` | Proposal | 692–717 | `Mutation`, `Proposal`; status machine |
| `#§11.1` | Types | 720–752 | `MetricValues`, `SampleFlags`, `MeasurementSample` |
| `#§11.2` | Procedure (normative for Stage 5) | 753–776 | sampling environment; metric capture table |
| `#§11.3` | Module surface (Stage 5) | 777–806 | `serve`, `collectSample`, `collectMany` |
| `#§12` | ExperimentResult | 807–860 | `MetricComparison`, `ExperimentResult`, `runExperiment` |
| `#§13.1` | KBScope | 863–879 | `KBScope`; applies/specificity definitions |
| `#§13.2` | KBClaim | 880–890 | `KBClaim` |
| `#§13.3` | KBRecord | 891–916 | `KBRecord`, `KBFile` |
| `#§13.4` | Ingest rule (ExperimentResult → KBRecord) | 917–931 | scope mapping; supersede rule |
| `#§13.5` | Precedence (the ordering function) | 932–976 | `precedes`, `specificity`, `query`, `loadKB`, `saveKB`, `ingest` |
| `#§14` | Proposal generation (deterministic algorithm) | 977–1023 | `propose`; the six-step algorithm |
| `#§15` | Repository layout (frozen paths) | 1024–1053 | frozen path tree |
| `#Appendix-A.1` | `islands/contracts.json` | 1056–1106 | `hero-cta`, `nav-menu`, `data-table` contracts |
| `#Appendix-A.2` | `site.config.json` | 1107–1172 | `home`, `catalog`, `dashboard` routes |
| `#Appendix-A.3` | Fixture data files | 1173–1191 | `fixtures/catalog.json`, `fixtures/dashboard.json` |
| `#Appendix-B` | Invalid-config test vectors | 1192–1213 | vectors `B1`–`B9` |

---

## Verification

Every row above was generated from a real heading in `docs/CONTRACTS.md`. There
are no rows for sections that do not exist, and no headings in the source file
are missing from this index: the source contains 17 `##` headings and 42 `###`
headings, all of which appear here.

The subsection table also carries rows for the five top-level sections that have
no subsections of their own (`#§2`, `#§10`, `#§12`, `#§14`, `#§15`) and for
`#Appendix-B`, so that every identifier-defining section is reachable from a
single table.
