import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { listOfficeFiles, openOfficeFile } from "@/lib/office-files.functions";
import { getLegalFilings, saveLegalFiling } from "@/lib/legal-room.functions";
import {
  LEGAL_TOPICS,
  LEGAL_STATUSES,
  EMPTY_LEGAL_FILING,
  legalDateState,
  type LegalFiling,
} from "@/lib/legal-room";
import type { OfficeFile } from "@/lib/office-files";
import { OfficeFiles } from "./OfficeFiles";
import { OfficeFilePreview } from "./OfficeFilePreview";
import { Button } from "@/components/ui/button";

export function LegalRoom() {
  const session = useOwnerSession();
  const list = useServerFn(listOfficeFiles),
    read = useServerFn(getLegalFilings),
    save = useServerFn(saveLegalFiling),
    open = useServerFn(openOfficeFile);
  const [files, setFiles] = useState<OfficeFile[]>([]),
    [filings, setFilings] = useState<Record<string, LegalFiling>>({}),
    [loaded, setLoaded] = useState(false),
    [labelsReady, setLabelsReady] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [topic, setTopic] = useState("all"),
    [status, setStatus] = useState("all"),
    [preview, setPreview] = useState<OfficeFile | null>(null);
  useEffect(() => {
    let active = true;
    setFiles([]);
    setFilings({});
    setLoaded(false);
    setLabelsReady(false);
    setError("");
    if (!session.accessToken) return;
    void Promise.allSettled([
      list({ data: { accessToken: session.accessToken, room: "legal" } }),
      read({ data: { accessToken: session.accessToken } }),
    ]).then(([docs, labels]) => {
      if (!active) return;
      if (docs.status === "fulfilled") {
        setFiles(docs.value);
        setLoaded(true);
      } else setError("Saved documents could not be loaded. Retry before relying on counts.");
      if (labels.status === "fulfilled") {
        setFilings(labels.value);
        setLabelsReady(true);
      } else
        setError(
          (previous) =>
            previous ||
            (labels.reason instanceof Error
              ? labels.reason.message
              : "Filing labels could not be read. Counts are unavailable."),
        );
    });
    return () => {
      active = false;
    };
  }, [session.accessToken, list, read, refresh]);
  const ready = loaded && labelsReady;
  const filing = (f: OfficeFile) => filings[f.id] ?? EMPTY_LEGAL_FILING;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
  const deadlines = files
    .filter((f) => filing(f).dueDate && filing(f).status !== "Closed or expired")
    .sort((a, b) => filing(a).dueDate.localeCompare(filing(b).dueDate));
  const filtered = files.filter(
    (f) =>
      (topic === "all" || filing(f).topic === topic) &&
      (status === "all" || filing(f).status === status),
  );
  async function download(f: OfficeFile) {
    try {
      if (session.accessToken)
        window.location.assign(
          await open({ data: { accessToken: session.accessToken, id: f.id, download: true } }),
        );
    } catch {
      setError("The original could not be opened. Please retry.");
    }
  }
  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-[#ba9848] bg-[#172943] p-6 text-white sm:p-8">
        <p className="text-xs font-semibold tracking-[.2em] text-[#e5c67f]">
          CANX OFFICE / ROOM 11
        </p>
        <h2 className="mt-3 font-serif text-3xl sm:text-4xl">Your legal papers, in order</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed">
          Keep agreements, policies and legal papers sorted in one place. This room organizes
          papers. It does not give legal advice.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <OfficeFiles room="legal" compact onSaved={() => setRefresh((n) => n + 1)} />
          <p className="text-sm">
            {ready
              ? `${files.length} saved ${files.length === 1 ? "paper" : "papers"}`
              : "Checking saved papers…"}
          </p>
        </div>
      </header>
      {error && (
        <div role="alert" className="rounded border border-destructive p-4">
          <p>{error}</p>
          <Button className="mt-2" variant="outline" onClick={() => setRefresh((n) => n + 1)}>
            Retry loading
          </Button>
        </div>
      )}
      <section aria-label="Legal topic folders">
        <h2 className="font-serif text-2xl">Sort by topic</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Twelve folders. Each paper has one primary topic. Dates are also collected below.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {LEGAL_TOPICS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopic((current) => (current === t.id ? "all" : t.id))}
              aria-pressed={topic === t.id}
              className={`overflow-hidden rounded-lg text-left text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${topic === t.id ? "ring-4 ring-ring ring-offset-2" : ""}`}
              style={{ backgroundColor: t.color }}
            >
              <div className="flex justify-between gap-2 bg-black/20 px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                <span>
                  {String(i + 1).padStart(2, "0")} · {t.id}
                </span>
                <span>
                  {ready ? files.filter((f) => filing(f).topic === t.id).length : "—"} filed
                </span>
              </div>
              <div className="p-4">
                <h3 className="min-h-12 font-serif text-xl font-semibold leading-tight">
                  {t.label}
                </h3>
                <p className="mt-3 text-sm leading-relaxed">{t.description}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {t.examples.map((example) => (
                    <li key={example}>• {example}</li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section aria-label="Legal document statuses">
        <h2 className="font-serif text-2xl">Sort by status</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every paper starts in Unsorted. Select a status to see its papers.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {LEGAL_STATUSES.map((s) => (
            <Button
              key={s}
              variant={status === s ? "default" : "outline"}
              aria-pressed={status === s}
              className="h-auto min-h-12 whitespace-normal"
              onClick={() => setStatus((current) => (current === s ? "all" : s))}
            >
              {s} · {ready ? files.filter((f) => filing(f).status === s).length : "—"}
            </Button>
          ))}
        </div>
      </section>
      <section aria-label="Legal papers">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Filed papers</h2>
          <Button
            variant="outline"
            onClick={() => {
              setTopic("all");
              setStatus("all");
            }}
          >
            Show all papers
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {topic === "all" ? "All topics" : LEGAL_TOPICS.find((t) => t.id === topic)?.label} ·{" "}
          {status === "all" ? "All statuses" : status}
        </p>
        {files.length === 200 && (
          <p className="mt-2 text-sm">
            Showing the 200 most recent papers. Counts apply to these papers.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {loaded &&
            (!labelsReady ? (
              <p>Documents are available below; filing labels and counts could not be confirmed.</p>
            ) : filtered.length === 0 ? (
              <p>No papers match this view.</p>
            ) : null)}
          {(labelsReady ? filtered : files).map((f) => (
            <LegalPaper
              key={`${f.id}:${session.ownerId}`}
              file={f}
              filing={filing(f)}
              labelsReady={labelsReady}
              onOpen={() => setPreview(f)}
              onSave={async (next) => {
                if (!session.accessToken) throw new Error("Sign in to save filing.");
                const result = await save({
                  data: {
                    accessToken: session.accessToken,
                    fileId: f.id,
                    filing: next,
                    expected: filings[f.id] ? JSON.stringify(filings[f.id]) : null,
                  },
                });
                setFilings((current) => ({ ...current, [f.id]: result }));
              }}
            />
          ))}
        </div>
      </section>
      <section aria-label="Legal deadlines" className="rounded-xl border bg-card p-5">
        <h2 className="font-serif text-2xl">Deadlines &amp; renewals</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Saved dates for open papers, earliest first. Check this room for reminders; automatic
          notifications are not connected.
        </p>
        {!ready ? (
          <p className="mt-3">Dates could not yet be confirmed.</p>
        ) : !deadlines.length ? (
          <p className="mt-3">No dates set for open papers.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {deadlines.map((f) => {
              const due = filing(f).dueDate,
                state = legalDateState(due, today);
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                >
                  <div>
                    <p className="break-words font-medium">{f.filename}</p>
                    <p
                      className={
                        state === "overdue" ? "text-destructive" : "text-sm text-muted-foreground"
                      }
                    >
                      {due} ·{" "}
                      {state === "overdue"
                        ? "Overdue"
                        : state === "today"
                          ? "Due today"
                          : "Upcoming"}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setPreview(f)}>
                    Open paper
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-serif text-2xl">How a paper moves</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Intake", "Upload the original. It starts in Unsorted."],
            ["Sort by topic", "Pick the one folder that fits it best."],
            ["Set status and dates", "Save its status, deadline and any question for a lawyer."],
            [
              "Escalate to John",
              "Routine filing can proceed. Commitments, spending and consequential legal actions follow John’s recorded authorization.",
            ],
          ].map(([title, detail], i) => (
            <article key={title} className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground">STEP {i + 1}</p>
              <h3 className="mt-2 font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed">{detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          The four installed Office helpers use the master Skills registry. No legal research
          service or lawyer is connected yet. Saving a lawyer question does not send it.
        </p>
      </section>
      <OfficeFilePreview
        file={preview}
        accessToken={session.accessToken}
        onClose={() => setPreview(null)}
        onDownload={(f) => void download(f)}
      />
    </div>
  );
}
export function LegalPaper({
  file,
  filing,
  labelsReady,
  onOpen,
  onSave,
}: {
  file: OfficeFile;
  filing: LegalFiling;
  labelsReady: boolean;
  onOpen: () => void;
  onSave: (next: LegalFiling) => Promise<void>;
}) {
  const [draft, setDraft] = useState(filing),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(filing);
  }, [filing]);
  const field = "mt-1 w-full rounded border border-border bg-background p-2 text-foreground";
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{file.filename}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Saved original · {file.folder}</p>
        </div>
        {file.source_url ? (
          <Button asChild variant="outline">
            <a href={file.source_url} target="_blank" rel="noopener noreferrer">
              Open link
            </a>
          </Button>
        ) : (
          <Button variant="outline" onClick={onOpen}>
            Open paper
          </Button>
        )}
      </div>
      <fieldset disabled={!labelsReady || busy} className="mt-4">
        <legend className="sr-only">Filing for {file.filename}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Topic
            <select
              className={field}
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            >
              <option value="">Not classified</option>
              {LEGAL_TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Status
            <select
              className={field}
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as LegalFiling["status"] })
              }
            >
              {LEGAL_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Deadline or renewal
            <input
              type="date"
              className={field}
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
            />
          </label>
        </div>
        <label className="mt-4 block text-sm">
          Question for a lawyer
          <textarea
            className={field}
            rows={2}
            maxLength={1000}
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
        </label>
        <Button
          className="mt-3"
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await onSave(draft);
              setMessage("Filing saved and confirmed.");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Filing was not confirmed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save filing"}
        </Button>
      </fieldset>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </article>
  );
}
