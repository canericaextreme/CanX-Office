import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { OfficeHoursView } from "../../src/components/office/OfficeHours";
import { REQUESTED_START, type HoursRecord } from "../../src/lib/office-hours";
import "../../src/styles.css";
function Fixture() {
  const [records, setRecords] = useState<HoursRecord[]>(
    Array.from({ length: 12 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      type: "elapsed",
      start: REQUESTED_START + i * 86400000,
      end: REQUESTED_START + i * 86400000 + 30000,
      activeEnd: REQUESTED_START + i * 86400000 + 15000,
    })),
  );
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [error, setError] = useState("");
  return (
    <main className="min-h-screen bg-slate-950 p-3">
      <OfficeHoursView
        loaded
        records={records}
        message="Offline draft fixture — simulated records, no tracking or live calls"
        pending={0}
        add={(r) => setRecords((s) => [...s, r])}
        period={period}
        setPeriod={setPeriod}
        error={error}
        setError={setError}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
setTimeout(() => {
  document.body.dataset.layout = JSON.stringify({
    viewport: innerWidth,
    body: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    table: !!document.querySelector("table"),
    selects: document.querySelectorAll("select").length,
  });
}, 1000);
