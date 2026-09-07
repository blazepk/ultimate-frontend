import type { JsonValue } from "@harness/contracts";
import { emitOnWrapper } from "../emit-event";

function rowsOf(props: Record<string, JsonValue>): Record<string, JsonValue>[] {
  const data = props.data as { rows?: Record<string, JsonValue>[] } | undefined;
  const pageSize = typeof props.page_size === "number" ? props.page_size : 10;
  return (data?.rows ?? []).slice(0, pageSize);
}

export default function DataTable(props: Record<string, JsonValue>) {
  const rows = rowsOf(props);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div role="region" aria-label="Results table">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>
                <button onClick={(e: { currentTarget: Element }) => emitOnWrapper(e.currentTarget, "sort_change", { column: col })}>
                  {col}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>{String(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
