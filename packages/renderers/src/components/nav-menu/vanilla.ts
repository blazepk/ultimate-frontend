import type { JsonValue } from "@harness/contracts";
import { emitOnWrapper } from "../emit-event";

interface NavItem {
  label: string;
  href: string;
}

function itemsOf(props: Record<string, JsonValue>): NavItem[] {
  return (props.items as unknown as NavItem[]) ?? [];
}

export function render(props: Record<string, JsonValue>): string {
  const items = itemsOf(props);
  const li = items.map((item) => `<li><a href="${item.href}" data-nav-href="${item.href}">${item.label}</a></li>`).join("");
  return `<nav role="navigation" aria-label="Main navigation"><ul>${li}</ul></nav>`;
}

export function attach(el: Element, props: Record<string, JsonValue>): void {
  const items = itemsOf(props);
  el.querySelectorAll("a[data-nav-href]").forEach((a) => {
    const href = a.getAttribute("data-nav-href");
    const item = items.find((i) => i.href === href);
    a.addEventListener("click", (e) => {
      if (item) emitOnWrapper(e.currentTarget as Element, "navigate", item);
    });
  });
}
