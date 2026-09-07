import type { JsonValue } from "@harness/contracts";
import { emitOnWrapper } from "../emit-event";

interface NavItem {
  label: string;
  href: string;
}

export default function NavMenu(props: Record<string, JsonValue>) {
  const items = ((props.items as unknown as NavItem[]) ?? []).slice();
  return (
    <nav role="navigation" aria-label="Main navigation">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              onClick={(e: { currentTarget: Element }) => emitOnWrapper(e.currentTarget, "navigate", item)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
