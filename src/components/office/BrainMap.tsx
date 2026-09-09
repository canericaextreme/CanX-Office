"use client";

import { useMemo, useState } from "react";
import {
  BRAIN_LINKS,
  BRAIN_NODES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  STATUS_COLORS,
  type BrainNode,
  type StatusTone,
} from "@/lib/office-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleBadge } from "./SampleBadge";

const STATUS_LABELS: Record<StatusTone, string> = {
  green: "Verified",
  blue: "Active",
  yellow: "Needs input",
  red: "Stop",
  grey: "Unknown / stale",
};

export function BrainMap() {
  const [selected, setSelected] = useState<BrainNode | null>(null);
  const [mode, setMode] = useState<"category" | "status">("category");

  const connected = useMemo(() => {
    if (!selected) return [];
    return BRAIN_LINKS.filter(
      (l) => l.source === selected.id || l.target === selected.id
    );
  }, [selected]);

  return (
    <Card className="overflow-hidden border-border bg-card">
      <CardHeader className="border-b border-border bg-background/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">CanX Brain</CardTitle>
            <SampleBadge />
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="bg-muted">
              <TabsTrigger value="category">Category view</TabsTrigger>
              <TabsTrigger value="status">Status view</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[1fr_320px]">
          <div className="relative min-h-[420px] overflow-hidden bg-[#12121a]">
            <svg className="absolute inset-0 h-full w-full" aria-label="CanX Brain map">
              {BRAIN_LINKS.map((link) => {
                const s = BRAIN_NODES.find((n) => n.id === link.source);
                const t = BRAIN_NODES.find((n) => n.id === link.target);
                if (!s || !t) return null;
                const active =
                  selected && (selected.id === s.id || selected.id === t.id);
                return (
                  <line
                    key={`${link.source}-${link.target}`}
                    x1={s.x + 200}
                    y1={s.y + 150}
                    x2={t.x + 200}
                    y2={t.y + 150}
                    stroke={active ? "#ef4444" : "#334155"}
                    strokeWidth={active ? 2.5 : 1}
                    strokeOpacity={active ? 0.9 : 0.4}
                  />
                );
              })}
              {BRAIN_NODES.map((node) => {
                const color =
                  mode === "category"
                    ? CATEGORY_COLORS[node.category]
                    : STATUS_COLORS[node.status];
                const isSelected = selected?.id === node.id;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x + 200}, ${node.y + 150})`}
                    className="cursor-pointer"
                    onClick={() => setSelected(node)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label} — ${CATEGORY_LABELS[node.category]}, ${STATUS_LABELS[node.status]}`}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(node)}
                  >
                    <circle
                      r={isSelected ? 22 : 16}
                      fill={`${color}20`}
                      stroke={color}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text
                      y={28}
                      textAnchor="middle"
                      fill="#e4e4e7"
                      fontSize="10"
                      fontWeight={500}
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 rounded-lg border border-border bg-card/90 p-3 text-xs shadow">
              <div className="mb-1 font-semibold text-foreground">
                {mode === "category" ? "Category legend" : "Status legend"}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {mode === "category"
                  ? (Object.keys(CATEGORY_COLORS) as BrainNode["category"][]).map((k) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[k] }}
                        />
                        <span className="text-muted-foreground">{CATEGORY_LABELS[k]}</span>
                      </div>
                    ))
                  : (Object.keys(STATUS_COLORS) as StatusTone[]).map((k) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[k] }}
                        />
                        <span className="text-muted-foreground">{STATUS_LABELS[k]}</span>
                      </div>
                    ))}
              </div>
            </div>
          </div>

          <div className="border-l border-border bg-card p-4">
            {selected ? (
              <div>
                <h3 className="text-base font-semibold text-foreground">{selected.label}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${CATEGORY_COLORS[selected.category]}20`,
                      color: CATEGORY_COLORS[selected.category],
                    }}
                  >
                    {CATEGORY_LABELS[selected.category]}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${STATUS_COLORS[selected.status]}20`,
                      color: STATUS_COLORS[selected.status],
                    }}
                  >
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {selected.id === "safe-highways"
                    ? "Read-only programme oversight. No live connection in Phase 1."
                    : selected.id === "trail-tales"
                    ? "Phase 1 placeholder with isolated demonstration data."
                    : "Interactive node. Selecting a connection shows its meaning, source, current status, and latest evidence in later phases."}
                </p>
                {connected.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Connections
                    </h4>
                    <ul className="space-y-1.5">
                      {connected.map((link) => (
                        <li key={`${link.source}-${link.target}`} className="text-xs text-foreground">
                          <span className="text-muted-foreground">{link.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-4 text-[10px] text-muted-foreground">
                  Growth history will appear here once recorded changes (approved skills, added
                  projects, verified sources, completed work) exist.
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Select a node on the brain map to inspect its record, category, status, and
                connections.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
