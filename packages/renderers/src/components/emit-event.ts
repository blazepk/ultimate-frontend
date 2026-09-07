// Shared across all reference components/renderers: dispatches a
// CustomEvent on the actual island wrapper (docs/CONTRACTS.md §7.5's
// `data-island` div), located via `.closest()` from wherever inside the
// component the interaction originated, per §6.2: "Events are emitted as
// DOM CustomEvent on the island wrapper."

export function emitOnWrapper(origin: Element, name: string, detail?: unknown): void {
  const wrapper = origin.closest("[data-island]");
  if (!wrapper) return;
  wrapper.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail, bubbles: true }) : new CustomEvent(name, { bubbles: true }));
}
