import { Link } from "@tanstack/react-router";
import { BRAIN_EDGES, CELL_BY_ID } from "@/lib/brain-data";

/**
 * Brain room, 1 Nov 2026 (Work Board task "Streamline duplicate Brain room views"):
 * the live Brain view above is the one interactive map. This section used to draw a
 * second map; it now lists the same documented connections as plain text, so the
 * room shows one map and one readable list instead of two maps.
 */
export function BrainConnectionsList() {
  const rows = BRAIN_EDGES.map((edge) => ({
    edge,
    from: CELL_BY_ID.get(edge.source),
    to: CELL_BY_ID.get(edge.target),
  })).filter((r) => r.from && r.to);

  if (rows.length === 0)
    return <p className="px-2 py-1 text-sm text-muted-foreground">No documented connections yet.</p>;

  return (
    <div className="px-2 py-1">
      <p className="text-sm text-muted-foreground">
        The live Brain view above is the map. This is the same set of documented links as a list.
      </p>
      <ul className="mt-2 space-y-1 text-sm" aria-label="Documented Office connections">
        {rows.map(({ edge, from, to }) => (
          <li key={edge.id} className="break-words">
            <Link to={from!.route} className="font-medium underline-offset-2 hover:underline">
              {from!.label}
            </Link>{" "}
            <span aria-hidden="true">→</span>
            <span className="sr-only">connects to</span>{" "}
            <Link to={to!.route} className="font-medium underline-offset-2 hover:underline">
              {to!.label}
            </Link>
            <span className="text-muted-foreground">: {edge.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
