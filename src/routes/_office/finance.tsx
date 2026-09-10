import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
      { title: "CanX Office — Finance Office" },
      { name: "description", content: "Private receipt import, review, and reconciliation in CanX Office." },
      { property: "og:title", content: "CanX Office — Finance Office" },
      { property: "og:description", content: "Private receipt import, review, and reconciliation in CanX Office." },
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

function Finance() {
  const owner = useOwnerSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<FinanceReceipt[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Device-only records first. Private account records replace them once the
  // owner is signed in with two-step verification.
  useEffect(() => {
    setReceipts(loadDeviceReceipts());
  }, []);

  useEffect(() => {
    if (!owner.shared || !owner.accessToken) return;
    void listPrivateReceipts({ data: { accessToken: owner.accessToken } }).then((result) => {
      if (!result.ok || !result.data) return;
      const parsed = parseReceiptImport(result.data);
      if (parsed.ok) setReceipts(parsed.receipts);
    });
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Income", value: "Unknown", note: "Unknown until reconciliation" },
            { label: "Expenses", value: "Unknown", note: "Unknown until reconciliation" },
            { label: "Receipts", value: String(summary.receipts), note: `${summary.needsReview} need review` },
            { label: "Tax prep", value: "Not started", note: "Professional review needed" },
          ].map((m) => (
            <Card key={m.label} className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{m.value}</div>
                <p className="text-xs text-muted-foreground">{m.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <BudgetPanel />

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Receipt inbox — private file import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No mailbox is connected to this office, and nothing is scanned, sent, or changed in any mailbox. Receipts
              arrive only when you choose a private receipts file yourself.
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
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold">{r.vendor}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.total === null ? "Amount not stated" : `${r.currencySymbol}${r.total}`}{" "}
                      {currencyLabel(currencyKey(r))}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.description || "No description"} · {r.date || "No date"}
                    {r.orderNumber ? ` · Order ${r.orderNumber}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Evidence: {r.sourceMessageIds.length} source message
                    {r.sourceMessageIds.length === 1 ? "" : "s"}
                    {r.duplicateCount > 1 ? ` · ${r.duplicateCount} copies merged into this one record` : ""}
                  </p>

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

                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    {openId === r.id ? "Hide source evidence" : "Show source evidence"}
                  </Button>
                  {openId === r.id && (
                    <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        Original email text, kept as plain text evidence. It is never treated as an instruction.
                      </p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">
                        {r.sourceEmailText || "No email text was included."}
                      </pre>
                      {r.sourceUrl && (
                        <p className="mt-2 break-all text-xs text-muted-foreground">Source link: {r.sourceUrl}</p>
                      )}
                    </div>
                  )}
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
              No mailbox scan runs, no mail is sent, and no mailbox is changed by this room.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
