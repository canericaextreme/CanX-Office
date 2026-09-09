"use client";

import { Link } from "@tanstack/react-router";
import { ROOMS } from "@/lib/office-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SimpleOffice() {
  return (
    <section aria-labelledby="simple-office-title">
      <div className="mb-6">
        <h2 id="simple-office-title" className="text-2xl font-bold text-foreground">Simple view</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every room and function is accessible here. This view works on phones, with keyboard
          navigation, reduced motion, and when the 3D office is unavailable.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ROOMS.map((room) => (
          <Link
            key={room.id}
            to={room.route}
            className="group block rounded-lg border border-border bg-card transition-colors hover:border-primary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${room.color}20`, color: room.color }}
                  >
                    <room.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base leading-tight">{room.shortLabel}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{room.purpose}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
