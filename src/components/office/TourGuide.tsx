"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SampleBadge } from "./SampleBadge";

const STEPS = [
  {
    title: "Welcome to CanX Office",
    body: "This is a Phase 1 demonstration. The realistic office view and this tour are sample data — no live accounts are connected and no external actions are possible yet.",
  },
  {
    title: "Two ways to move around",
    body: "Use the 3D office view or switch to Simple view from the top bar. Simple view works on phones, with keyboard navigation, reduced motion, and if 3D fails.",
  },
  {
    title: "Every room is a destination",
    body: "Click any room to open its fast work screen. You will see what the room does and what setup it still needs.",
  },
  {
    title: "CanX Brain",
    body: "Goal & Analytics contains the interactive brain map. It shows rooms, projects, workers, and connections in Category or Status mode. Select a node to inspect it.",
  },
  {
    title: "Status language",
    body: "Green means verified, blue means active, yellow needs input, red means stop, and grey means unknown or disconnected. Colour never carries meaning alone.",
  },
  {
    title: "What's next",
    body: "Phase 2 adds saved records, login, and access rules. Phase 3 connects services one at a time, with your explicit approval.",
  },
];

const STORAGE_KEY = "canx-office-tour-completed";

export function TourGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const completed = window.localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        setOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const finish = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="gap-2"
      >
        <SampleBadge />
        Tour
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-border bg-card text-foreground">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2">
              <DialogTitle className="text-lg">{STEPS[step]?.title ?? ""}</DialogTitle>
              <SampleBadge />
            </div>
            <DialogDescription className="text-muted-foreground">
              {STEPS[step]?.body ?? ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-1 py-2">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: i === step ? "#ef4444" : "#3f3f46",
                }}
                aria-hidden="true"
              />
            ))}
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={finish}
              disabled={step < STEPS.length - 1}
            >
              Close
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button size="sm" onClick={() => setStep(step + 1)}>
                  Next
                </Button>
              ) : (
                <Button size="sm" onClick={finish}>
                  Finish
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
