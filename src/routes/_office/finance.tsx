import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeDollarSign, ChevronRight, FileText, Landmark, ReceiptText } from "lucide-react";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BudgetPanel } from "@/components/office/BudgetPanel";
import { OwnerSignIn } from "@/components/office/OwnerSignIn";
import { useOwnerSession } from "@/lib/owner-session";
import { listPrivateReceipts, savePrivateReceipts } from "@/lib/finance.functions";
import {
  currencyLabel,
  currencyKey,
  loadDeviceReceipts,
  MAX_IMPORT_BYTES,
  mergeReceipts,
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

const SECTION_LABELS: Record<FinanceSection, string> = {
  income: "Income",
  expenses: "Expenses",
  receipts: "Receipts",
  tax: "Tax prep",
};

export function Finance() {
  const owner = useOwnerSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<FinanceReceipt[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [section, setSection] = useState<FinanceSection | null>(null);
  const sectionHeading = useRef<HTMLHeadingElement>(null);

  // Device-only records first. Private account records replace them once the
  // owner is signed in with two-step verification.
  useEffect(() => {
    setReceipts(loadDeviceReceipts());
  }, []);

  useEffect(() => {
    if (!owner.shared || !owner.accessToken) return;
    void listPrivateReceipts({ data: { accessToken: owner.accessToken } })
      .then((result) => {
        if (!result.ok) {
          setNotice(result.message || "Your saved receipts could not be read just now. Nothing was changed.");
          return;
        }
        if (!result.data) return; // No saved document yet; device records stay.
        const parsed = parseReceiptImport(result.data);
        if (parsed.ok) setReceipts(parsed.receipts);
        else setNotice("Your saved receipts could not be read. Nothing was changed.");
      })
      .catch(() => setNotice("Your saved receipts could not be read just now. Nothing was changed."));
  }, [owner.shared, owner.accessToken]);

  const persist = async (next: FinanceReceipt[]) => {
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
  if (owner.state !== "owner") {
    return (
      <RoomShell showSample={false}>
        <div className="mx-auto max-w-xl space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Sign in to Finance</h2>
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
      <div className="grid gap-4">
        <OwnerSignIn />
        {section === null ? (
          <>
            <nav aria-label="Finance categories" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { id: "income", label: "Income", value: "Unknown", note: "No reconciled income source", icon: BadgeDollarSign, border: "border-t-canx-green", iconTone: "bg-canx-green/10 text-canx-green" },
                { id: "expenses", label: "Expenses", value: "Unknown", note: "No reconciled payment source", icon: Landmark, border: "border-t-canx-blue", iconTone: "bg-canx-blue/10 text-canx-blue" },
                { id: "receipts", label: "Receipts", value: String(summary.receipts), note: `${summary.needsReview} need review`, icon: ReceiptText, border: "border-t-canx-green", iconTone: "bg-canx-green/10 text-canx-green" },
                { id: "tax", label: "Tax prep", value: "Not started", note: "Records only — no tax advice", icon: FileText, border: "border-t-canx-blue", iconTone: "bg-canx-blue/10 text-canx-blue" },
              ] as const).map((item) => {
                const Icon = item.icon;
                return (
                  <Button key={item.id} type="button" variant="outline" onClick={() => openSection(item.id)}
                    aria-label={`Open ${item.label}: ${item.value}. ${item.note}`}
                    className={`group h-auto min-h-32 w-full items-start justify-between whitespace-normal border-border border-t-4 bg-card p-4 text-left hover:bg-secondary/60 ${item.border}`}>
                    <span className="flex min-w-0 items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${item.iconTone}`}><Icon className="h-5 w-5" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                        <span className="mt-1 block text-2xl font-semibold text-foreground">{item.value}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{item.note}</span>
                      </span>
                    </span>
                    <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Button>
                );
              })}
            </nav>
            <BudgetPanel />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={backToFinance}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to Finance</Button>
            <h2 ref={sectionHeading} tabIndex={-1} className="text-xl font-semibold outline-none">{SECTION_LABELS[section]}</h2>
          </div>
        )}

        {section === "income" && (
          <Card className="border-t-4 border-t-canx-green bg-card">
            <CardHeader><CardTitle className="text-base">Income records</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>No reconciled income records or connected income source are available in Finance.</p>
              <p>Income remains Unknown. Nothing is estimated from receipts or subscription records.</p>
            </CardContent>
          </Card>
        )}

        {section === "expenses" && (
          <>
            <Card className="border-t-4 border-t-canx-blue bg-card">
              <CardHeader><CardTitle className="text-base">Expense records</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>No connected payment source or reconciled expense total is available in Finance.</p>
                <p>{summary.receipts} receipt{summary.receipts === 1 ? " is" : "s are"} available for review, but receipts are not treated as confirmed expenses.</p>
              </CardContent>
            </Card>
            <BudgetPanel />
          </>
        )}

        {section === "tax" && (
          <Card className="border-t-4 border-t-canx-blue bg-card">
            <CardHeader><CardTitle className="text-base">Tax preparation records</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Tax preparation has not started. This Office does not provide tax advice or determine tax treatment.</p>
              {receipts.length === 0 ? <p>No receipt records are available for tax preparation.</p> : (
                <>
                  <p>{receipts.length} receipt record{receipts.length === 1 ? " is" : "s are"} available. {receipts.filter((r) => r.tax !== null).length} state a tax amount; {receipts.filter((r) => r.businessUsePercent !== null).length} have a business-use percentage recorded.</p>
                  <ul aria-label="Receipts with tax preparation fields" className="space-y-2">
                    {receipts.filter((r) => r.tax !== null || r.businessUsePercent !== null).map((r) => (
                      <li key={r.id} className="rounded-md border border-border p-3 text-foreground"><span className="font-semibold">{r.vendor}</span> · Tax {r.tax === null ? "not stated" : `${r.currencySymbol}${r.tax}`} · Business use {r.businessUsePercent === null ? "not set" : `${r.businessUsePercent}%`}</li>
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
        <Card className="border-t-4 border-t-canx-green bg-card">
          <CardHeader>
            <CardTitle className="text-base">Receipt inbox — private file import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This section shows the receipt records currently available to Finance. A private receipts file can also be
              reviewed here before import. Nothing is sent or deleted from email by this section.
            </p>
            <p className="text-xs font-semibold text-primary">Storage: {storageLabel}</p>
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
          <Card className="border-primary bg-card">
            <CardHeader>
              <CardTitle className="text-base">Review before importing — {preview.fileName}</CardTitle>
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
              <ul className="max-h-64 space-y-1 overflow-auto text-sm">
                {preview.receipts.slice(0, 50).map((r) => (
                  <li key={r.id} className="rounded-md border border-border p-2">
                    <span className="font-semibold">{r.vendor}</span>{" "}
                    <span className="text-muted-foreground">
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

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Totals by currency</CardTitle>
          </CardHeader>
          <CardContent>
            {totals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No receipts yet, so there is nothing to total.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {totals.map((t) => (
                  <div key={t.currency} className="rounded-md border border-border p-3">
                    <div className="text-sm font-semibold">{currencyLabel(t.currency)}</div>
                    <div className="text-xl font-bold">{t.total === null ? "Unknown" : t.total.toFixed(2)}</div>
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

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Receipts ({receipts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No receipts have been imported. Choose a private receipts file above to add them.
              </p>
            ) : (
              receipts.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3">
                  <Button type="button" variant="ghost" className="h-auto w-full justify-between whitespace-normal p-0 text-left hover:bg-transparent"
                    aria-expanded={openId === r.id} aria-controls={`receipt-${r.id}`} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">{r.vendor}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{r.description || "No description"} · {r.date || "No date"}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {r.total === null ? "Amount not stated" : `${r.currencySymbol}${r.total}`} {currencyLabel(currencyKey(r))}
                      <ChevronRight className={`ml-1 inline h-4 w-4 transition-transform ${openId === r.id ? "rotate-90" : ""}`} aria-hidden />
                    </span>
                  </Button>
                  {openId === r.id && <div id={`receipt-${r.id}`} className="mt-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">Order: {r.orderNumber || "Not stated"} · Subtotal: {r.subtotal === null ? "Not stated" : `${r.currencySymbol}${r.subtotal}`} · Tax: {r.tax === null ? "Not stated" : `${r.currencySymbol}${r.tax}`}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Evidence: {r.sourceMessageIds.length} source message{r.sourceMessageIds.length === 1 ? "" : "s"}{r.duplicateCount > 1 ? ` · ${r.duplicateCount} copies merged into this one record` : ""}</p>
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

                    <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
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

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Reconciliation</CardTitle>
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
