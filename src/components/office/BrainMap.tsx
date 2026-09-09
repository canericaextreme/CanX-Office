"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import { BRAIN_LINKS, BRAIN_NODES, CATEGORY_COLORS, CATEGORY_LABELS, STATUS_COLORS, type BrainLink, type BrainNode, type StatusTone } from "@/lib/office-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleBadge } from "./SampleBadge";

const STATUS_LABELS: Record<StatusTone, string> = { green: "Verified", blue: "Active", yellow: "Needs input", red: "Stop", grey: "Unknown / stale" };
type Filter = "all" | "project" | "worker";

const DETAILS: Record<string, string> = {
  "safe-highways": "Read-only sample programme record. No live Safe Highways connection is active.",
  "trail-tales": "Isolated Phase 1 project placeholder. No live project data is connected.",
  manager: "Sample Office Manager role for demonstrating request routing only.",
  reviewer: "Sample Quality & Security role for demonstrating independent review.",
  systems: "Planned connection control record. All external connections remain disabled.",
};

function nodeDetail(node: BrainNode) { return DETAILS[node.id] ?? `Sample ${CATEGORY_LABELS[node.category].toLowerCase()} record used to demonstrate CanX Office relationships.`; }

export function BrainMap() {
  const [selectedNode, setSelectedNode] = useState<BrainNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<BrainLink | null>(null);
  const [mode, setMode] = useState<"category" | "status">("category");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);

  const visibleNodes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return BRAIN_NODES.filter((node) => (filter === "all" || node.category === filter) && (!term || node.label.toLowerCase().includes(term)));
  }, [filter, query]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleLinks = BRAIN_LINKS.filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target));
  const connected = selectedNode ? BRAIN_LINKS.filter((link) => link.source === selectedNode.id || link.target === selectedNode.id) : [];
  const clearSelection = () => { setSelectedNode(null); setSelectedLink(null); };

  return (
    <Card className="overflow-hidden border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border bg-card">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><CardTitle className="text-lg">CanX Brain</CardTitle><SampleBadge /></div>
            <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}><TabsList><TabsTrigger value="category">Category</TabsTrigger><TabsTrigger value="status">Status</TabsTrigger></TabsList></Tabs>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sample brain records…" className="pl-9" aria-label="Search sample brain records" /></div>
            <div className="flex gap-1" aria-label="Filter brain records">
              {(["all", "project", "worker"] as Filter[]).map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => { setFilter(value); clearSelection(); }} className="capitalize">{value === "all" ? "All" : `${value}s`}</Button>)}
            </div>
          </div>
          <nav aria-label="Brain selection breadcrumb" className="flex min-h-6 flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <button className="font-semibold text-primary hover:underline" onClick={clearSelection}>Brain</button>
            {selectedNode && <><span aria-hidden="true">/</span><span>{selectedNode.label}</span></>}
            {selectedLink && <><span aria-hidden="true">/</span><span>Connection: {selectedLink.label}</span></>}
          </nav>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="relative min-h-[480px] overflow-hidden bg-office-wall">
              <div className="absolute right-3 top-3 z-10 flex gap-1">
                <Button variant="outline" size="icon" onClick={() => setZoom((value) => Math.min(1.5, value + 0.15))} aria-label="Zoom in"><Plus /></Button>
                <Button variant="outline" size="icon" onClick={() => setZoom((value) => Math.max(0.7, value - 0.15))} aria-label="Zoom out"><Minus /></Button>
                <Button variant="outline" size="icon" onClick={() => { setZoom(1); setQuery(""); setFilter("all"); clearSelection(); }} aria-label="Reset brain view"><RotateCcw /></Button>
              </div>
              <svg className="absolute inset-0 h-full w-full" viewBox={`${200 - 260 / zoom} ${150 - 190 / zoom} ${520 / zoom} ${380 / zoom}`} role="img" aria-label="Brain-shaped map of sample CanX Office records">
                <path d="M200 84 C145 28 48 48 42 126 C5 155 20 224 72 232 C90 286 156 290 200 250 C244 290 310 286 328 232 C380 224 395 155 358 126 C352 48 255 28 200 84Z" fill="var(--color-card)" stroke="var(--color-border)" strokeWidth="3" />
                <path d="M200 82V250 M80 125C125 115 145 142 132 176 M320 125C275 115 255 142 268 176 M100 220C145 190 166 214 158 252 M300 220C255 190 234 214 242 252" fill="none" stroke="var(--color-border)" strokeWidth="2" strokeDasharray="5 5" />
                {visibleLinks.map((link) => {
                  const source = BRAIN_NODES.find((node) => node.id === link.source); const target = BRAIN_NODES.find((node) => node.id === link.target); if (!source || !target) return null;
                  const active = selectedLink === link || selectedNode?.id === source.id || selectedNode?.id === target.id;
                  return <line key={`${link.source}-${link.target}`} x1={source.x + 200} y1={source.y + 150} x2={target.x + 200} y2={target.y + 150} stroke={active ? "var(--color-canx-red)" : "var(--color-canx-grey)"} strokeWidth={active ? 3 : 1.5} strokeOpacity={active ? 1 : 0.45} onClick={() => { setSelectedLink(link); setSelectedNode(null); }} className="cursor-pointer" />;
                })}
                {visibleNodes.map((node) => {
                  const color = mode === "category" ? CATEGORY_COLORS[node.category] : STATUS_COLORS[node.status]; const active = selectedNode?.id === node.id;
                  return <g key={node.id} transform={`translate(${node.x + 200}, ${node.y + 150})`} className="cursor-pointer" onClick={() => { setSelectedNode(node); setSelectedLink(null); }}>
                    <circle r={active ? 18 : 13} fill="var(--color-card)" stroke={color} strokeWidth={active ? 4 : 3} />
                    <text y={29} textAnchor="middle" fill="var(--color-foreground)" fontSize="12" fontWeight="700">{node.label}</text>
                  </g>;
                })}
              </svg>
              <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-card/95 p-3 text-xs shadow-sm">
                <div className="mb-2 font-bold text-foreground">{mode === "category" ? "Category legend" : "Status legend"}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-2">{mode === "category" ? (Object.keys(CATEGORY_COLORS) as BrainNode["category"][]).map((key) => <span key={key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[key] }} />{CATEGORY_LABELS[key]}</span>) : (Object.keys(STATUS_COLORS) as StatusTone[]).map((key) => <span key={key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[key] }} />{STATUS_LABELS[key]}</span>)}</div>
              </div>
            </div>
            <div className="border-t border-border p-4">
              <h3 className="mb-2 text-sm font-bold text-foreground">Keyboard-accessible list</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleNodes.map((node) => <Button key={node.id} variant={selectedNode?.id === node.id ? "secondary" : "outline"} className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => { setSelectedNode(node); setSelectedLink(null); }}>{node.label}<span className="sr-only">, {CATEGORY_LABELS[node.category]}, {STATUS_LABELS[node.status]}</span></Button>)}</div>
              {!visibleNodes.length && <p className="py-5 text-center text-sm text-muted-foreground">No matching sample brain records.</p>}
            </div>
          </div>
          <aside className="border-t border-border bg-card p-4 xl:border-l xl:border-t-0" aria-live="polite">
            {(selectedNode || selectedLink) && <Button variant="ghost" size="sm" onClick={clearSelection} className="float-right"><X /> Clear</Button>}
            {selectedNode ? <div><h3 className="pr-16 text-base font-bold text-foreground">{selectedNode.label}</h3><p className="mt-1 text-xs font-semibold text-primary">{CATEGORY_LABELS[selectedNode.category]} · {STATUS_LABELS[selectedNode.status]}</p><p className="mt-4 text-sm text-muted-foreground">{nodeDetail(selectedNode)}</p>{connected.length > 0 && <div className="mt-5"><h4 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Connections</h4><div className="space-y-2">{connected.map((link) => <Button key={`${link.source}-${link.target}`} variant="outline" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => { setSelectedLink(link); setSelectedNode(null); }}>{link.label}</Button>)}</div></div>}<p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">Demonstration record only. No measured growth or live activity.</p></div> : selectedLink ? <div><h3 className="pr-16 text-base font-bold text-foreground">{selectedLink.label}</h3><p className="mt-1 text-xs font-semibold text-primary">Sample connection</p><p className="mt-4 text-sm text-muted-foreground"><strong>{BRAIN_NODES.find((node) => node.id === selectedLink.source)?.label}</strong> connects to <strong>{BRAIN_NODES.find((node) => node.id === selectedLink.target)?.label}</strong>. This relationship is sample data and does not indicate live activity or authorization.</p></div> : <div><h3 className="font-bold text-foreground">Inspect the Brain</h3><p className="mt-2 text-sm text-muted-foreground">Choose a node or connection, or use the equivalent list below the map.</p></div>}
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}