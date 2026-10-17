import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeDollarSign, ChevronRight, FileText, Landmark, Lock, ReceiptText } from "lucide-react";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BudgetPanel } from "@/components/office/BudgetPanel";
import { OwnerSignIn } from "@/components/office/OwnerSignIn";
import { useOwnerSession } from "@/lib/owner-session";
import { listPrivateReceipts, savePrivateReceipts } from "@/lib/finance.functions";
import { formatZoned, OFFICE_TIMEZONE } from "@/lib/subscriptions";
import {
  currencyLabel,
  currencyKey,
  loadDeviceReceipts,
  MAX_IMPORT_BYTES,
  mergeReceipts,
  monthlyTotals,
  parseReceiptImport,
  PAYMENT_LABELS,
  reconciliationSummary,
  REVIEW_LABELS,
  saveDeviceReceipts,
  toExportDocument,
  totalsByCurrency,
  type FinanceReceipt,
  type PaymentStatus,
  type ReviewStatus,
} from "@/lib/finance-receipts";

export const Route = createFileRoute("/_office/finance")({
  head: () => ({
    meta: [
      { title: "CanX Office" },
      { name: "description", content: "Owner-only CanX operations workspace." },
      { property: "og:title", content: "CanX Office" },
      { property: "og:description", content: "Owner-only CanX operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Finance,
});

interface Preview {
  receipts: FinanceReceipt[];
  errors: string[];
  fileName: string;
  added: number;
  duplicates: number;
}

type FinanceSection = "income" | "expenses" | "receipts" | "tax";

const evidenceTime = (value: string | undefined) => value && !Number.isNaN(Date.parse(value))
  ? formatZoned(value)
  : "Not recorded";

const SECTION_LABELS: Record<FinanceSection, string> = {
  income: "Income",
  expenses: "Expenses",
  receipts: "Receipts",
  tax: "Tax prep",
};

/**
 * Card-level section title. Rendered as a real <h3> (under the room's <h1> and
 * the Finance <h2>) so every section has a clear title for screen readers and
 * heading navigation; the shared CardTitle is a plain <div>.
 */
function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="bank-serif text-lg font-semibold leading-tight text-[var(--bank-navy)]">{children}</h3>;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const monthName = (month: string) =>
  month === "undated" ? "No date on receipt" : MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
const money = (total: number | null) =>
  total === null ? "Unknown" : total.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Finance() {
  const owner = useOwnerSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<FinanceReceipt[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [section, setSection] = useState<FinanceSection | null>(null);
  // Whether the private account receipts have been read. Until they have, the
  // count shown is not the saved count, and saving could replace saved records.
  const [privateLoad, setPrivateLoad] = useState<"idle" | "loading" | "loaded" | "failed">("idle");
  const sectionHeading = useRef<HTMLHeadingElement>(null);

  // Device-only records first. Private account records replace them once the
  // owner is signed in with two-step verification.
  useEffect(() => {
    setReceipts(loadDeviceReceipts());
  }, []);

  useEffect(() => {
    if (!owner.shared || !owner.accessToken) return;
    setPrivateLoad("loading");
    const failed = (message: string) => { setNotice(message); setPrivateLoad("failed"); };
    void listPrivateReceipts({ data: { accessToken: owner.accessToken } })
      .then((result) => {
        if (!result.ok) {
          failed(result.message || "Your saved receipts could not be read just now. Nothing was changed.");
          return;
        }
        setPrivateLoad("loaded");
        if (!result.data) return; // No saved document yet; device records stay.
        const parsed = parseReceiptImport(result.data);
        if (parsed.ok) setReceipts(parsed.receipts);
        else failed("Your saved receipts could not be read. Nothing was changed.");
      })
      .catch(() => failed("Your saved receipts could not be read just now. Nothing was changed."));
  }, [owner.shared, owner.accessToken]);

  const persist = async (next: FinanceReceipt[]) => {
    // Never save over account records this page has not read.
    if (owner.shared && privateLoad !== "loaded") {
      setNotice("Your saved receipts have not loaded yet, so nothing was saved. Finish sign-in (authenticator code) and refresh, then try again.");
      return;
    }
    setReceipts(next);
    saveDeviceReceipts(next);
    if (owner.shared && owner.accessToken) {
      const result = await savePrivateReceipts({
        data: { accessToken: owner.accessToken, doc: JSON.stringify(toExportDocument(next)) },
      });
      setNotice(result.ok ? "Saved to your private CanX account." : result.message);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    setNotice("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setPreview(null);
      setNotice("That file is larger than the 4 MB import limit. Nothing was changed.");
      return;
    }
    const raw = await file.text();
    const parsed = parseReceiptImport(raw);
    if (!parsed.ok) {
      setPreview(null);
      setNotice(`${parsed.errors[0] ?? "That file could not be read."} Your existing records were not changed.`);
      return;
    }
    const dry = mergeReceipts(receipts, parsed.receipts);
    setPreview({
      receipts: parsed.receipts,
      errors: parsed.errors,
      fileName: file.name,
      added: dry.added,
      duplicates: dry.duplicates,
    });
  };

  const confirmImport = async () => {
    if (!preview) return;
    const result = mergeReceipts(receipts, preview.receipts);
    await persist(result.merged);
    setNotice(
      `Imported ${result.added} new receipt${result.added === 1 ? "" : "s"}. ` +
        `${result.duplicates} matched a receipt already held and were merged, not counted twice.`,
    );
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const update = (id: string, patch: Partial<FinanceReceipt>) => {
    void persist(receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(toExportDocument(receipts), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "canx-finance-receipts.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = totalsByCurrency(receipts);
  const summary = reconciliationSummary(receipts);
  const months = monthlyTotals(receipts);
  const receiptsUnread = owner.shared && privateLoad !== "loaded";
  const storageLabel = owner.shared
    ? "Saved in your private CanX account"
    : "Saved on this device only — not shared, not backed up";

  const openSection = (next: FinanceSection) => {
    setSection(next);
    setOpenId(null);
    window.requestAnimationFrame(() => {
      sectionHeading.current?.focus();
      sectionHeading.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const backToFinance = () => {
    setSection(null);
    setOpenId(null);
  };

  // Gate: nothing below is rendered until the server has verified the owner.
  // Gate: nothing below is rendered until the server has verified the owner.
  if (owner.state !== "owner") {
    return (
      <RoomShell showSample={false}>
        <div className="finance-bank mx-auto max-w-xl space-y-4">
          <div className="rounded-lg border border-border border-t-4 border-t-[var(--bank-gold)] bg-card p-5 shadow-sm">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.22em] text-[var(--bank-gold-text)]">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Private ledger · Secure access
            </p>
            <h2 className="bank-serif mt-2 text-2xl font-semibold text-[var(--bank-navy)]">Sign in to Finance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Private receipts are available only to the verified owner, with two-step verification. Nothing in this
              room is shown until you are signed in.
            </p>
          </div>
          <OwnerSignIn />
        </div>
      </RoomShell>
    );
  }

  return (
    <RoomShell showSample={false}>
      <div className="finance-bank grid gap-5">
        <OwnerSignIn />
        {section === null ? (
          <>
            <header className="overflow-hidden rounded-lg shadow-md">
              <div className="bank-masthead px-5 py-5 text-white sm:px-7 sm:py-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-[var(--bank-gold-soft)]">
                      CanX Office · Room 13 · Private ledger
                    </p>
                    <h2 className="bank-serif mt-2 text-2xl font-semibold sm:text-3xl">Finance overview</h2>
                    <p className="mt-1 text-sm text-white/80">Statement of accounts from your saved Finance records.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--bank-gold-soft)]/50 px-3 py-1 text-xs text-[var(--bank-gold-soft)]">
                    <Lock className="h-3.5 w-3.5" aria-hidden /> {storageLabel}
                  </span>
                </div>
              </div>
              <div className="h-1 bg-[var(--bank-gold)]" />
            </header>
            {privateLoad === "failed" && notice && <p role="alert" className="rounded-md border border-[var(--bank-amber)]/40 bg-[var(--bank-amber-soft)] px-4 py-3 text-sm text-foreground">{notice}</p>}
            <nav aria-label="Finance categories" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { id: "income", label: "Income", value: "Unknown", note: "No reconciled income source", icon: BadgeDollarSign },
                { id: "expenses", label: "Expenses", value: "Unknown", note: "No reconciled payment source", icon: Landmark },
                { id: "receipts", label: "Receipts", value: receiptsUnread ? (privateLoad === "failed" ? "Not loaded" : "Loading…") : String(summary.receipts), note: receiptsUnread ? (privateLoad === "failed" ? "Saved receipts could not be read — open for details" : "Reading your saved receipts") : `${summary.needsReview} need review`, icon: ReceiptText },
                { id: "tax", label: "Tax prep", value: "Not started", note: "Records only — no tax advice", icon: FileText },
              ] as const).map((item, index) => {
                const Icon = item.icon;
                return (
                  <Button key={item.id} type="button" variant="outline" onClick={() => openSection(item.id)}
                    aria-label={`Open ${item.label}: ${item.value}. ${item.note}`}
                    className="group h-auto min-h-36 w-full flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-lg border-border bg-card p-0 text-left shadow-sm transition-shadow hover:bg-card hover:shadow-md">
                    <span className="flex items-center justify-between border-b border-border bg-[var(--bank-paper)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
                      <span>Account {String(index + 1).padStart(2, "0")}</span>
                      <Icon className="h-4 w-4 text-[var(--bank-gold-text)]" aria-hidden />
                    </span>
                    <span className="block px-4 pb-4 pt-3">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="bank-serif bank-figure mt-1 block text-3xl font-semibold text-[var(--bank-navy)]">{item.value}</span>
                      <span className="mt-2 flex items-end justify-between gap-2 text-xs text-muted-foreground">
                        <span>{item.note}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </span>
                  </Button>
                );
              })}
            </nav>
            <section aria-labelledby="finance-monthly" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--bank-navy)] px-4 py-4 sm:px-5">
                <h3 id="finance-monthly" className="bank-serif text-lg font-semibold text-[var(--bank-navy)]">Monthly cost summary</h3>
                <p className="text-xs text-muted-foreground">Receipts on file, grouped by receipt date</p>
              </div>
              {receiptsUnread ? (
                <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">Shown once your saved receipts have loaded.</p>
              ) : months.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">No receipts on file, so there is nothing to summarise yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                      <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Month</th>
                      <th scope="col" className="px-2 py-2 font-semibold">Currency</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">Receipts</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold sm:px-5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={`${m.month}|${m.currency}`} className="border-t border-border">
                        <th scope="row" className="px-4 py-2.5 text-left font-medium text-foreground sm:px-5">{monthName(m.month)}</th>
                        <td className="px-2 py-2.5 text-muted-foreground">{currencyLabel(m.currency)}</td>
                        <td className="bank-figure px-2 py-2.5 text-right">{m.count}</td>
                        <td className="bank-figure px-4 py-2.5 text-right font-semibold text-[var(--bank-navy)] sm:px-5">{money(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="border-t border-border bg-[var(--bank-paper)] px-4 py-3 text-xs text-muted-foreground sm:px-5">
                Currencies are never added together, and receipts marked “Not a business receipt” are left out. These are
                receipts on file, not confirmed bank charges, so Expenses stay Unknown until they are reconciled.
              </p>
            </section>
            <BudgetPanel />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--bank-navy)] pb-3">
            <Button type="button" variant="outline" onClick={backToFinance}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to Finance</Button>
            <h2 ref={sectionHeading} tabIndex={-1} className="bank-serif text-2xl font-semibold text-[var(--bank-navy)] outline-none">{SECTION_LABELS[section]}</h2>
          </div>
        )}

        {section === "income" && (
          <Card className="bank-card">
            <CardHeader><SectionTitle>Income records</SectionTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>No reconciled income records or connected income source are available in Finance.</p>
              <p>Income remains Unknown. Nothing is estimated from receipts or subscription records.</p>
            </CardContent>
          </Card>
        )}

        {section === "expenses" && (
          <>
            <Card className="bank-card">
              <CardHeader><SectionTitle>Expense records</SectionTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>No connected payment source or reconciled expense total is available in Finance.</p>
                <p>{summary.receipts} receipt{summary.receipts === 1 ? " is" : "s are"} available for review, but receipts are not treated as confirmed expenses.</p>
              </CardContent>
            </Card>
            <BudgetPanel />
          </>
        )}

        {section === "tax" && (
          <Card className="bank-card">
            <CardHeader><SectionTitle>Tax preparation records</SectionTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Tax preparation has not started. This Office does not provide tax advice or determine tax treatment.</p>
              {receipts.length === 0 ? <p>No receipt records are available for tax preparation.</p> : (
                <>
                  <p>{receipts.length} receipt record{receipts.length === 1 ? " is" : "s are"} available. {receipts.filter((r) => r.tax !== null).length} state a tax amount; {receipts.filter((r) => r.businessUsePercent !== null).length} have a business-use percentage recorded.</p>
                  <ul aria-label="Receipts with tax preparation fields" className="divide-y divide-border rounded-md border border-border">
                    {receipts.filter((r) => r.tax !== null || r.businessUsePercent !== null).map((r) => (
                      <li key={r.id} className="p-3 text-foreground"><span className="font-semibold">{r.vendor}</span> · Tax <span className="bank-figure">{r.tax === null ? "not stated" : `${r.currencySymbol}${r.tax}`}</span> · Business use {r.businessUsePercent === null ? "not set" : `${r.businessUsePercent}%`}</li>
                    ))}
                  </ul>
                  {!receipts.some((r) => r.tax !== null || r.businessUsePercent !== null) && <p>No receipt currently has a stated tax amount or business-use percentage.</p>}
                </>
              )}
              <p className="text-xs">A qualified professional must review the source records and decide their tax treatment.</p>
            </CardContent>
          </Card>
        )}

        {section === "receipts" && <>
        <Card className="bank-card">
          <CardHeader>
            <SectionTitle>Receipt inbox: import and export</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This section shows the receipt records currently available to Finance. A private receipts file can also be
              reviewed here before import. Nothing is sent or deleted from email by this section.
            </p>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--bank-navy)]"><Lock className="h-3.5 w-3.5" aria-hidden /> Storage: {storageLabel}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                aria-label="Choose a private receipts file"
                className="h-11 w-full sm:max-w-sm"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              <Button variant="outline" className="h-11" onClick={exportFile} disabled={!receipts.length}>
                Export my receipts
              </Button>
            </div>
            {notice && <p className="text-sm text-foreground">{notice}</p>}
          </CardContent>
        </Card>

        {preview && (
          <Card className="bank-card border-[var(--bank-gold)]">
            <CardHeader>
              <SectionTitle>Review before importing — {preview.fileName}</SectionTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {preview.receipts.length} receipt{preview.receipts.length === 1 ? "" : "s"} read from the file.{" "}
                {preview.added} would be added and {preview.duplicates} match a receipt already held, so they would be
                merged rather than counted twice. Nothing is saved until you confirm.
              </p>
              {preview.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} in the file could not be read and
                  will be skipped.
                </p>
              )}
              <ul className="max-h-64 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
                {preview.receipts.slice(0, 50).map((r) => (
                  <li key={r.id} className="p-2">
                    <span className="font-semibold">{r.vendor}</span>{" "}
                    <span className="bank-figure text-muted-foreground">
                      {r.date || "no date"} ·{" "}
                      {r.total === null ? "amount not stated" : `${r.currencySymbol}${r.total} ${currencyLabel(currencyKey(r))}`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button className="h-11" onClick={() => void confirmImport()}>
                  Import these receipts
                </Button>
                <Button variant="outline" className="h-11" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bank-card">
          <CardHeader>
            <SectionTitle>Totals by currency</SectionTitle>
          </CardHeader>
          <CardContent>
            {totals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No receipts yet, so there is nothing to total.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {totals.map((t) => (
                  <div key={t.currency} className="rounded-md border border-border border-l-4 border-l-[var(--bank-gold)] bg-[var(--bank-paper)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{currencyLabel(t.currency)}</div>
                    <div className="bank-serif bank-figure mt-1 text-2xl font-semibold text-[var(--bank-navy)]">{t.total === null ? "Unknown" : t.total.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{t.count} receipt{t.count === 1 ? "" : "s"}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Currencies are never added together, and receipts with no stated currency are kept separate.
            </p>
          </CardContent>
        </Card>

        <Card className="bank-card">
          <CardHeader>
            <SectionTitle>Receipt records ({receipts.length})</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {receipts.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No receipts have been imported. Choose a private receipts file above to add them.
              </p>
            ) : (
              receipts.map((r) => (
                <div key={r.id} className="border-t border-border px-4 py-3 sm:px-6">
                  <Button type="button" variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal p-0 text-left hover:bg-transparent"
                    aria-expanded={openId === r.id} aria-controls={`receipt-${r.id}`} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-foreground">{r.vendor}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{r.description || "No description"} · <span className="bank-figure">{r.date || "No date"}</span></span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="bank-figure block font-semibold text-[var(--bank-navy)]">{r.total === null ? "Amount not stated" : `${r.currencySymbol}${money(r.total)}`} {currencyLabel(currencyKey(r))}</span>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${r.reviewStatus === "needs-review" ? "bg-[var(--bank-amber-soft)] text-[var(--bank-amber)]" : "bg-[var(--bank-green-soft)] text-[var(--bank-green)]"}`}>{REVIEW_LABELS[r.reviewStatus]}</span>
                      <ChevronRight className={`ml-1 inline h-4 w-4 text-muted-foreground transition-transform ${openId === r.id ? "rotate-90" : ""}`} aria-hidden />
                    </span>
                  </Button>
                  {openId === r.id && <div id={`receipt-${r.id}`} className="mt-3 border-t border-border pt-3">
                    <p className="bank-figure text-xs text-muted-foreground">Order: {r.orderNumber || "Not stated"} · Subtotal: {r.subtotal === null ? "Not stated" : `${r.currencySymbol}${r.subtotal}`} · Tax: {r.tax === null ? "Not stated" : `${r.currencySymbol}${r.tax}`}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Evidence: {r.sourceMessageIds.length} source message{r.sourceMessageIds.length === 1 ? "" : "s"}{r.duplicateCount > 1 ? ` · ${r.duplicateCount} copies merged into this one record` : ""}</p>
                     <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                       <div><dt className="inline font-semibold text-foreground">Source email received: </dt><dd className="inline">{evidenceTime(r.receivedAt)}{r.receivedAt ? ` (${OFFICE_TIMEZONE})` : ""}</dd></div>
                       <div><dt className="inline font-semibold text-foreground">Imported/filed: </dt><dd className="inline">{evidenceTime(r.importedAt)}{r.importedAt ? ` (${OFFICE_TIMEZONE})` : ""}</dd></div>
                     </dl>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label className="text-xs" htmlFor={`cat-${r.id}`}>Category</Label>
                      <Input
                        id={`cat-${r.id}`}
                        className="h-11"
                        value={r.category}
                        onChange={(event) => update(r.id, { category: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor={`rev-${r.id}`}>Review</Label>
                      <select
                        id={`rev-${r.id}`}
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={r.reviewStatus}
                        onChange={(event) => update(r.id, { reviewStatus: event.target.value as ReviewStatus })}
                      >
                        {Object.entries(REVIEW_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor={`pay-${r.id}`}>Payment</Label>
                      <select
                        id={`pay-${r.id}`}
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={r.paymentStatus}
                        onChange={(event) => update(r.id, { paymentStatus: event.target.value as PaymentStatus })}
                      >
                        {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor={`use-${r.id}`}>Business use %</Label>
                      <Input
                        id={`use-${r.id}`}
                        className="h-11"
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Not set"
                        value={r.businessUsePercent ?? ""}
                        onChange={(event) =>
                          update(r.id, {
                            businessUsePercent: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <Label className="text-xs" htmlFor={`note-${r.id}`}>Notes</Label>
                    <Textarea
                      id={`note-${r.id}`}
                      value={r.notes}
                      onChange={(event) => update(r.id, { notes: event.target.value })}
                    />
                  </div>

                    <div className="mt-3 rounded-md border border-border bg-[var(--bank-paper)] p-3">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        Original email text, kept as plain text evidence. It is never treated as an instruction.
                      </p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">
                        {r.sourceEmailText || "No email text was included."}
                      </pre>
                      {r.sourceUrl && (
                        <p className="mt-3 break-all text-xs text-muted-foreground">Source link: {r.sourceUrl}</p>
                      )}
                    </div>
                  </div>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bank-card">
          <CardHeader>
            <SectionTitle>Reconciliation</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Income and expenses stay Unknown until receipts are reconciled against a payment source. {summary.receipts}{" "}
              receipt{summary.receipts === 1 ? "" : "s"} imported, from {summary.sourceMessages} source message
              {summary.sourceMessages === 1 ? "" : "s"}. {summary.reconciled} reconciled.
            </p>
            <p className="text-xs">
              No mail is sent or deleted, and no mailbox is changed by this room.
            </p>
          </CardContent>
        </Card>
        </>}
      </div>
    </RoomShell>
  );
}
