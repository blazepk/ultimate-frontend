// react/react-dom ship no bundled TypeScript declarations of their own
// (@types/react is maintained as a separate package and is not among this
// stage's permitted dependencies — STAGE_INPUTS.md's Stage 3 "New deps" row
// lists only react@18/react-dom@18/preact@10/svelte@4 plus jsdom/vite-plugin-svelte
// as dev deps). Minimal ambient declarations for exactly the surface this
// package's react.ts adapter and .tsx reference components use.

declare module "react" {
  export function createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  export function useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void];
}

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: Record<string, unknown> | null, key?: unknown): unknown;
  export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: unknown): unknown;
  export const Fragment: unknown;
}

declare module "react-dom/server" {
  export function renderToString(element: unknown): string;
}

declare module "react-dom/client" {
  export function createRoot(container: Element): { render(element: unknown): void; unmount(): void };
  export function hydrateRoot(container: Element, element: unknown): { unmount(): void };
}

// No top-level import/export in this file on purpose: that keeps it a
// "script" rather than a "module", so the `declare module` blocks above are
// fresh ambient declarations rather than augmentations of an existing
// (nonexistent) type declaration, and this JSX namespace is already global
// without needing a `declare global` wrapper.
namespace JSX {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  type Element = unknown;
}
