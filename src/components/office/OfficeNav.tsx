"use client";

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, Brain, Building2, ChevronLeft, FileText, FolderKanban, Home, LayoutGrid, List, Search, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ROOM_SYNOPSES } from '@/lib/room-synopses';
import { AccountMenu } from "@/components/office/AccountMenu";
import { SecondEyesPanel } from "@/components/office/SecondEyesPanel";
import { ROOMS, SAMPLE_APPROVALS, SAMPLE_PROJECTS, SAMPLE_WORKERS, SAMPLE_WORK_ITEMS } from "@/lib/office-data";
import { OFFICE_MAP_ROOMS, clockwiseOfficeRooms, readOfficeLabelPositions } from '@/lib/office-map';
import type { OfficeViewMode } from "@/hooks/use-office-view";

interface OfficeNavProps { viewMode: OfficeViewMode; onToggleView: () => void; }
type SearchResult = { id: string; label: string; detail: string; type: "Room" | "Task" | "Project" | "Worker" | "Record"; route: string; icon: typeof Building2 };

const SEARCH_ITEMS: SearchResult[] = [
  ...ROOMS.map((room) => ({ id: room.id, label: room.label, detail: room.purpose, type: "Room" as const, route: room.route, icon: room.icon })),
  ...SAMPLE_WORK_ITEMS.map((item) => ({ id: item.id, label: item.title, detail: item.project, type: "Task" as const, route: "/work-board", icon: FileText })),
  ...SAMPLE_PROJECTS.map((item) => ({ id: item.id, label: item.name, detail: item.healthText, type: "Project" as const, route: "/projects", icon: FolderKanban })),
  ...SAMPLE_WORKERS.map((item) => ({ id: item.id, label: item.role, detail: item.provider, type: "Worker" as const, route: "/office-team", icon: Users })),
  ...SAMPLE_APPROVALS.map((item) => ({ id: item.id, label: item.action, detail: item.requestedAt, type: "Record" as const, route: "/approvals", icon: FileText })),
];

export function OfficeNav({ viewMode, onToggleView }: OfficeNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [synopsis, setSynopsis] = useState<{ route: string; label: string } | null>(null);
  const synopsisTrigger = useRef<HTMLButtonElement>(null);
  const [roomMenu, setRoomMenu] = useState(() => clockwiseOfficeRooms());
  const otherRooms = ROOMS.filter(room => room.id !== 'brain' && !OFFICE_MAP_ROOMS.some(mapped => mapped.route === room.route));
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const historyRef = useRef<string[]>([]);

  useEffect(() => {
    const history = historyRef.current;
    if (history.at(-1) !== pathname) history.push(pathname);
  }, [pathname]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return SEARCH_ITEMS.filter((item) => `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(query)).slice(0, 12);
  }, [search]);

  const goBack = () => {
    const history = historyRef.current;
    if (history.at(-1) === pathname) history.pop();
    const previous = history.pop() ?? "/";
    void navigate({ to: previous });
  };

  const choose = () => {
    const result = filtered[activeIndex];
    if (!result) return;
    setSearch(""); setOpen(false);
    void navigate({ to: result.route });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <Button variant="ghost" size="icon" aria-label="Back to previous CanX Office screen" onClick={goBack}><ChevronLeft className="h-5 w-5" /></Button>
        <Button variant="ghost" size="icon" asChild aria-label="Home / Reception"><Link to="/"><Home className="h-5 w-5" /></Link></Button>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search rooms and sample items…"
            className="h-10 bg-background pl-9"
            value={search}
            onFocus={() => setOpen(true)}
            onChange={(event) => { setSearch(event.target.value); setOpen(true); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, filtered.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter") { event.preventDefault(); choose(); }
              if (event.key === "Escape") setOpen(false);
            }}
            aria-label="Search rooms and sample tasks, projects, workers, and approval records"
            role="combobox"
            aria-expanded={open && Boolean(search.trim())}
            aria-controls="office-search-results"
          />
          {open && search.trim() && (
            <div id="office-search-results" role="listbox" className="absolute left-0 right-0 top-12 max-h-80 overflow-auto rounded-md border border-border bg-popover p-2 shadow-lg">
              {filtered.length ? filtered.map((result, index) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  to={result.route}
                  role="option"
                  aria-selected={activeIndex === index}
                  className={`flex items-start gap-3 rounded-md px-3 py-2 ${activeIndex === index ? "bg-accent" : "hover:bg-muted"}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => { setSearch(""); setOpen(false); }}
                >
                  <result.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0"><span className="block text-xs font-bold uppercase text-primary">{result.type}</span><span className="block truncate text-sm font-semibold text-foreground">{result.label}</span><span className="block truncate text-xs text-muted-foreground">{result.detail}</span></span>
                </Link>
              )) : <div className="px-3 py-5 text-center"><p className="font-semibold text-foreground">No results</p><p className="mt-1 text-xs text-muted-foreground">Try a room, task, project, worker, or approval record.</p></div>}
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={onToggleView} aria-label={viewMode === "3d" ? "Switch to simple view" : "Switch to office view"} className="shrink-0 gap-2 px-2 sm:px-3">
          {viewMode === "3d" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          <span className="hidden sm:inline">{viewMode === "3d" ? "Simple" : "Office"}</span>
        </Button>
        <DropdownMenu onOpenChange={isOpen => { if (isOpen) setRoomMenu(clockwiseOfficeRooms(readOfficeLabelPositions())); }}>
          <DropdownMenuTrigger asChild><Button ref={synopsisTrigger} variant="ghost" size="sm" aria-label="Room synopsis" className="shrink-0 gap-2"><Building2 className="h-5 w-5" /><span>Synopsis</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-72 overflow-auto" onCloseAutoFocus={event => { if (synopsis) event.preventDefault(); }}>
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Clockwise from Reception</p>
            {roomMenu.map((room, index) => <DropdownMenuItem key={room.number} onSelect={() => setSynopsis({ route: room.route, label: room.label })} className="flex cursor-pointer items-center gap-2"><span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}</span><room.icon className="h-4 w-4 shrink-0 text-primary" /><span>{room.label}</span></DropdownMenuItem>)}
            <p className="mt-2 border-t px-2 py-1.5 text-xs text-muted-foreground">Centre and control wall</p>
            <DropdownMenuItem onSelect={() => setSynopsis({ route: "/brain", label: "CanX Brain" })} className="flex cursor-pointer items-center gap-2"><Brain className="h-4 w-4 text-primary" />CanX Brain</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSynopsis({ route: "/analytics", label: "Analytics Control Wall" })} className="flex cursor-pointer items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Analytics Control Wall</DropdownMenuItem>
            <p className="mt-2 border-t px-2 py-1.5 text-xs text-muted-foreground">Other Office pages</p>
            {otherRooms.map(room => <DropdownMenuItem key={room.id} onSelect={() => setSynopsis({ route: room.route, label: room.shortLabel })} className="flex cursor-pointer items-center gap-2"><room.icon className="h-4 w-4 text-primary" /><span>{room.shortLabel}</span></DropdownMenuItem>)}
            <DropdownMenuItem onSelect={() => setSynopsis({ route: "/round-table", label: "Round Table" })} className="flex cursor-pointer items-center gap-2"><Users className="h-4 w-4 text-primary" />Round Table</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={Boolean(synopsis)} onOpenChange={isOpen => { if (!isOpen) setSynopsis(null); }}>
          <DialogContent onCloseAutoFocus={event => { event.preventDefault(); synopsisTrigger.current?.focus(); }}>
            <DialogHeader>
              <DialogTitle>{synopsis?.label}</DialogTitle>
              <DialogDescription className="pt-3 text-base leading-relaxed text-foreground">
                {synopsis ? ROOM_SYNOPSES[synopsis.route] : ''}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        {/* Reachable from every room, without adding a destination. */}
        <SecondEyesPanel />
        <AccountMenu />
      </div>
    </header>
  );
}