import type { JsonValue } from "@harness/contracts";
import { emitOnWrapper } from "../emit-event";

export default function HeroCta(props: Record<string, JsonValue>) {
  const heading = String(props.heading ?? "");
  const ctaLabel = String(props.cta_label ?? "");
  return (
    <div role="region" aria-label={heading}>
      <h2>{heading}</h2>
      <button onClick={(e: { currentTarget: Element }) => emitOnWrapper(e.currentTarget, "cta_click")}>{ctaLabel}</button>
    </div>
  );
}
