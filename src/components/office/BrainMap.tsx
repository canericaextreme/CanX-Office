"use client";

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import {
  BRAIN_CELLS,
  BRAIN_EDGES,
  BRAIN_GYRI,
  BRAIN_OUTLINE,
  BRAIN_REGIONS,
  BRAIN_VIEW,
  CELL_BY_ID,
  KIND_COLORS,
  KIND_LABELS,
  REGION_BY_ID,
  STATUS_LABELS,
  type BrainCell,
  type BrainEdge,
  type BrainKind,
} from "@/lib/brain-data";
import { STATUS_COLORS, type StatusTone } from "@/lib/office-data";
import { useReducedMotion } from "@/lib/office-theme";
import {
  animatingCellIds,
  animatingEvents,
  describeState,
  lastUpdatedLabel,
  loadWorkFeed,
  WORK_STATE_LABELS,
} from "@/lib/work-activity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleBadge } from "./SampleBadge";

type Mode = "category" | "status";
type Filter = "all" | BrainKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "room", label: "Rooms" },
  { value: "project", label: "Projects" },
  { value: "worker", label: "Workers" },
];

export function BrainMap() {
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>("category");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const term = query.trim().toLowerCase();

  const visibleCells = useMemo(
    () =>
      BRAIN_CELLS.filter(
        (cell) =>
          (filter === "all" || cell.kind === filter) &&
          (!regionId || cell.regionId === regionId) &&
          (!term || `${cell.label} ${cell.detail}`.toLowerCase().includes(term)),
      ),
    [filter, regionId, term],
  );

  const visibleIds = useMemo(() => new Set(visibleCells.map((c) => c.id)), [visibleCells]);
  const visibleEdges = BRAIN_EDGES.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

  const cell = cellId ? (CELL_BY_ID.get(cellId) ?? null) : null;
  const edge = edgeId ? (BRAIN_EDGES.find((e) => e.id === edgeId) ?? null) : null;
  const region = regionId ? (REGION_BY_ID.get(regionId) ?? null) : null;
  const connections = cell ? BRAIN_EDGES.filter((e) => e.source === cell.id || e.target === cell.id) : [];

  const colorOf = (item: BrainCell) => (mode === "category" ? KIND_COLORS[item.kind] : STATUS_COLORS[item.status]);

  const selectCell = (id: string) => {
    setCellId(id);
    setEdgeId(null);
  };

  const resetView = () => {
    setZoom(1);
    setQuery("");
    setFilter("all");
    setRegionId(null);
    setCellId(null);
    setEdgeId(null);
  };

  const pad = 40 / zoom;
  const viewBox = `${(BRAIN_VIEW.width * (1 - 1 / zoom)) / 2 - pad} ${(BRAIN_VIEW.height * (1 - 1 / zoom)) / 2 - pad} ${BRAIN_VIEW.width / zoom + pad * 2} ${BRAIN_VIEW.height / zoom + pad * 2}`;

  return (
    <Card className="overflow-hidden border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">CanX Brain</CardTitle>
              <SampleBadge />
            </div>
            <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
              <TabsList>
                <TabsTrigger value="category">Category</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rooms, projects, and worker roles…"
                className="pl-9"
                aria-label="Search brain records"
              />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter brain records by type">
              {FILTERS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={filter === option.value ? "default" : "outline"}
                  onClick={() => {
                    setFilter(option.value);
                    setCellId(null);
                    setEdgeId(null);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <nav aria-label="Brain drilldown" className="flex min-h-6 flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <button className="font-semibold text-primary hover:underline" onClick={resetView}>
              Whole brain
            </button>
            {region && (
              <>
                <span aria-hidden="true">/</span>
                <button
                  className="font-semibold text-primary hover:underline"
                  onClick={() => {
                    setCellId(null);
                    setEdgeId(null);
                  }}
                >
                  {region.name}
                </button>
              </>
            )}
            {cell && (
              <>
                <span aria-hidden="true">/</span>
                <span className="text-foreground">{cell.label}</span>
              </>
            )}
            {edge && (
              <>
                <span aria-hidden="true">/</span>
                <span className="text-foreground">Connection: {edge.label}</span>
              </>
            )}
          </nav>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_330px]">
          <div>
            <div className="relative min-h-[420px] overflow-hidden bg-gradient-to-br from-canx-black via-canx-charcoal to-canx-black sm:min-h-[520px]">
              <div className="absolute right-3 top-3 z-10 flex gap-1">
                <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}>
                  <Plus />
                </Button>
                <Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.8, z - 0.2))}>
                  <Minus />
                </Button>
                <Button variant="outline" size="icon" aria-label="Reset brain view" onClick={resetView}>
                  <RotateCcw />
                </Button>
              </div>

              <svg
                className="h-full min-h-[420px] w-full sm:min-h-[520px]"
                viewBox={viewBox}
                role="img"
                aria-label="Brain-shaped map of CanX Office rooms, projects, and planned worker roles"
              >
                <defs>
                  <radialGradient id="brain-core" cx="50%" cy="42%" r="68%">
                    <stop offset="0%" stopColor="oklch(0.55 0.19 255)" stopOpacity="0.85" />
                    <stop offset="58%" stopColor="oklch(0.36 0.15 268)" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="oklch(0.42 0.2 20)" stopOpacity="0.55" />
                  </radialGradient>
                  <linearGradient id="brain-rim" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.15 245)" />
                    <stop offset="55%" stopColor="oklch(0.7 0.12 280)" />
                    <stop offset="100%" stopColor="oklch(0.68 0.21 22)" />
                  </linearGradient>
                  <filter id="brain-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="7" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g transform="scale(2)">
                  <path d={BRAIN_OUTLINE} fill="url(#brain-core)" stroke="url(#brain-rim)" strokeWidth="2.4" filter="url(#brain-glow)" />
                  <path d={BRAIN_OUTLINE} fill="none" stroke="oklch(0.9 0.05 250 / 0.35)" strokeWidth="0.8" transform="translate(4 5) scale(0.98)" />
                  <g fill="none" stroke="oklch(0.85 0.08 250 / 0.3)" strokeWidth="1.2" strokeLinecap="round">
                    {BRAIN_GYRI.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </g>
                </g>

                {/* Region halos — click to drill into a region */}
                {BRAIN_REGIONS.map((r) => {
                  const active = regionId === r.id;
                  return (
                    <g key={r.id} className="cursor-pointer" onClick={() => { setRegionId(active ? null : r.id); setCellId(null); setEdgeId(null); }}>
                      <ellipse
                        cx={r.cx}
                        cy={r.cy}
                        rx={r.radius}
                        ry={r.radius * 0.88}
                        fill={`${r.color}${active ? "33" : "1c"}`}
                        stroke={r.color}
                        strokeOpacity={active ? 0.95 : 0.45}
                        strokeWidth={active ? 2.5 : 1.4}
                      />
                      <text
                        x={r.cx}
                        y={r.cy - r.radius * 0.88 - 8}
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="700"
                        fill={r.color}
                      >
                        {r.name}
                      </text>
                    </g>
                  );
                })}

                {/* Connections, with a travelling signal when movement is on */}
                {visibleEdges.map((item) => {
                  const a = CELL_BY_ID.get(item.source)!;
                  const b = CELL_BY_ID.get(item.target)!;
                  const active = edgeId === item.id || cellId === item.source || cellId === item.target;
                  return (
                    <g key={item.id}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={active ? "var(--color-canx-red)" : "oklch(0.86 0.06 250 / 0.5)"}
                        strokeWidth={active ? 3 : 1.4}
                        className="cursor-pointer"
                        onClick={() => { setEdgeId(item.id); setCellId(null); }}
                      />
                      {!reducedMotion && (
                        <circle r="3" fill="oklch(0.92 0.1 250)">
                          <animateMotion
                            dur={`${3 + (item.id.length % 4)}s`}
                            repeatCount="indefinite"
                            path={`M${a.x} ${a.y} L${b.x} ${b.y}`}
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {visibleCells.map((item) => {
                  const color = colorOf(item);
                  const active = cellId === item.id;
                  const showLabel = active || hoverId === item.id || Boolean(regionId) || Boolean(term);
                  return (
                    <g
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${item.label} — ${KIND_LABELS[item.kind]}, ${STATUS_LABELS[item.status]}`}
                      className="cursor-pointer focus:outline-none"
                      onClick={() => selectCell(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectCell(item.id);
                        }
                      }}
                      onMouseEnter={() => setHoverId(item.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId(item.id)}
                      onBlur={() => setHoverId(null)}
                    >
                      {!reducedMotion && (
                        <circle cx={item.x} cy={item.y} r={active ? 20 : 15} fill={color} opacity="0.25">
                          <animate attributeName="r" values={`${active ? 18 : 13};${active ? 25 : 19};${active ? 18 : 13}`} dur="3.4s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.3;0.06;0.3" dur="3.4s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle
                        cx={item.x}
                        cy={item.y}
                        r={active ? 13 : 9}
                        fill="oklch(0.24 0.02 265)"
                        stroke={color}
                        strokeWidth={active ? 5 : 3}
                      />
                      {showLabel && (
                        <text
                          x={item.x}
                          y={item.y + (active ? 30 : 25)}
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight="700"
                          fill="oklch(0.97 0.01 260)"
                          stroke="oklch(0.2 0.02 265)"
                          strokeWidth="3"
                          paintOrder="stroke"
                        >
                          {item.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-card/95 p-3 text-xs shadow-sm">
                <div className="mb-2 font-bold text-foreground">{mode === "category" ? "Category legend" : "Status legend"}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  {mode === "category"
                    ? (Object.keys(KIND_COLORS) as BrainKind[]).map((key) => (
                        <span key={key} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KIND_COLORS[key] }} />
                          {KIND_LABELS[key]}
                        </span>
                      ))
                    : (Object.keys(STATUS_COLORS) as StatusTone[]).map((key) => (
                        <span key={key} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[key] }} />
                          {STATUS_LABELS[key]}
                        </span>
                      ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Movement is decorative. It does not represent live jobs or measured activity.
                </p>
              </div>
            </div>

            <div className="border-t border-border p-4">
              <h3 className="mb-1 text-sm font-bold text-foreground">Keyboard-accessible list</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Same records as the map. Pick a region, then a record.
              </p>
              <div className="mb-3 flex flex-wrap gap-1">
                {BRAIN_REGIONS.map((r) => (
                  <Button
                    key={r.id}
                    size="sm"
                    variant={regionId === r.id ? "secondary" : "outline"}
                    onClick={() => { setRegionId(regionId === r.id ? null : r.id); setCellId(null); setEdgeId(null); }}
                  >
                    <span className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />
                    {r.name}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleCells.map((item) => (
                  <Button
                    key={item.id}
                    variant={cellId === item.id ? "secondary" : "outline"}
                    className="h-auto justify-start whitespace-normal py-2 text-left"
                    onClick={() => selectCell(item.id)}
                  >
                    <span className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(item) }} aria-hidden="true" />
                    {item.label}
                    <span className="sr-only">, {KIND_LABELS[item.kind]}, {STATUS_LABELS[item.status]}</span>
                  </Button>
                ))}
              </div>
              {!visibleCells.length && (
                <p className="py-5 text-center text-sm text-muted-foreground">No matching records. Clear the search or filter.</p>
              )}
            </div>
          </div>

          <aside className="border-t border-border p-4 xl:border-l xl:border-t-0" aria-live="polite">
            {(cell || edge) && (
              <Button variant="ghost" size="sm" className="float-right" onClick={() => { setCellId(null); setEdgeId(null); }}>
                <X /> Clear
              </Button>
            )}
            {cell ? (
              <div>
                <h3 className="pr-16 text-base font-bold text-foreground">{cell.label}</h3>
                <p className="mt-1 text-xs font-semibold text-primary">
                  {KIND_LABELS[cell.kind]} · {STATUS_LABELS[cell.status]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Region: {REGION_BY_ID.get(cell.regionId)?.name}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">{cell.detail}</p>
                <Button asChild size="sm" className="mt-4">
                  <Link to={cell.route}>Open {cell.kind === "room" ? "room" : "record room"}</Link>
                </Button>
                {connections.length > 0 && (
                  <div className="mt-5">
                    <h4 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Connections</h4>
                    <div className="space-y-2">
                      {connections.map((item) => (
                        <Button
                          key={item.id}
                          variant="outline"
                          className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                          onClick={() => { setEdgeId(item.id); setCellId(null); }}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                  Recorded office record. No measured growth, live job, or performance figure is shown.
                </p>
              </div>
            ) : edge ? (
              <EdgeDetail edge={edge} />
            ) : region ? (
              <div>
                <h3 className="text-base font-bold text-foreground">{region.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{region.blurb}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {visibleCells.length} record{visibleCells.length === 1 ? "" : "s"} in this region. Choose one to see its detail.
                </p>
              </div>
            ) : (
              <div>
                <h3 className="font-bold text-foreground">Inspect the brain</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose a region, a record, or a connection — on the map or in the list below it.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  The brain grows only when real records are saved in the office. It does not learn or measure on its own.
                </p>
              </div>
            )}
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

function EdgeDetail({ edge }: { edge: BrainEdge }) {
  const source = CELL_BY_ID.get(edge.source);
  const target = CELL_BY_ID.get(edge.target);
  return (
    <div>
      <h3 className="pr-16 text-base font-bold text-foreground">{edge.label}</h3>
      <p className="mt-1 text-xs font-semibold text-primary">Recorded relationship</p>
      <p className="mt-4 text-sm text-muted-foreground">
        <strong>{source?.label}</strong> connects to <strong>{target?.label}</strong>. This is a recorded relationship in the
        office blueprint. It does not indicate live activity or an authorised connection.
      </p>
    </div>
  );
}
