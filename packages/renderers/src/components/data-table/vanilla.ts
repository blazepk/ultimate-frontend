import type { JsonValue } from "@harness/contracts";
import { emitOnWrapper } from "../emit-event";

function rowsOf(props: Record<string, JsonValue>): Record<string, JsonValue>[] {
  const data = props.data as { rows?: Record<string, JsonValue>[] } | undefined;
  const pageSize = typeof props.page_size === "number" ? props.page_size : 10;
  return (data?.rows ?? []).slice(0, pageSize);
}

export function render(props: Record<string, JsonValue>): string {
  const rows = rowsOf(props);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const head = columns.map((col) => `<th><button data-sort="${col}">${col}</button></th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((col) => `<td>${String(row[col])}</td>`).join("")}</tr>`)
    .join("");
  return `<div role="region" aria-label="Results table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function attach(el: Element): void {
  el.querySelectorAll("button[data-sort]").forEach((btn) => {
    const column = btn.getAttribute("data-sort");
    btn.addEventListener("click", (e) => emitOnWrapper(e.currentTarget as Element, "sort_change", { column }));
  });
}
