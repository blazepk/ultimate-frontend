import type { JsonValue } from "@harness/contracts";
import { emitOnWrapper } from "../emit-event";

export function render(props: Record<string, JsonValue>): string {
  const heading = String(props.heading ?? "");
  const ctaLabel = String(props.cta_label ?? "");
  return `<div role="region" aria-label="${heading}"><h2>${heading}</h2><button data-cta>${ctaLabel}</button></div>`;
}

export function attach(el: Element): void {
  const button = el.querySelector("[data-cta]");
  button?.addEventListener("click", (e) => emitOnWrapper(e.currentTarget as Element, "cta_click"));
}
