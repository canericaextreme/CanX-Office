"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronLeft, Home, LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROOMS } from "@/lib/office-data";
import type { OfficeViewMode } from "@/hooks/use-office-view";
import { useState } from "react";

interface OfficeNavProps {
  viewMode: OfficeViewMode;
  onToggleView: () => void;
}

export function OfficeNav({ viewMode, onToggleView }: OfficeNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? ROOMS.filter(
        (r) =>
          r.label.toLowerCase().includes(search.toLowerCase()) ||
          r.purpose.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-3 px-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back">
          <Link to="/" onClick={(e) => pathname === "/" && e.preventDefault()}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>

        <Button variant="ghost" size="icon" asChild aria-label="Home / Reception">
          <Link to="/">
            <Home className="h-5 w-5" />
          </Link>
        </Button>

        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Find a room, task, or record…"
            className="h-9 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search rooms and records"
          />
          {filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-14 max-h-72 overflow-auto border-b border-border bg-card p-2 shadow-lg">
              {filtered.map((room) => (
                <Link
                  key={room.id}
                  to={room.route}
                  className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent"
                  onClick={() => setSearch("")}
                >
                  <room.icon className="h-4 w-4" style={{ color: room.color }} />
                  <span className="text-sm">{room.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onToggleView}
          aria-label={viewMode === "3d" ? "Switch to simple view" : "Switch to 3D office"}
          className="inline-flex gap-2"
        >
          {viewMode === "3d" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          <span className="hidden sm:inline">{viewMode === "3d" ? "Simple" : "Office"}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Rooms">
              <Building2 className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {ROOMS.map((room) => (
              <DropdownMenuItem key={room.id} asChild>
                <Link
                  to={room.route}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <room.icon className="h-4 w-4" style={{ color: room.color }} />
                  <span className="truncate">{room.shortLabel}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
