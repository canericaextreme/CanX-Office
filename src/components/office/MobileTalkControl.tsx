import { Button } from "@/components/ui/button";

export function MobileTalkControl({ verified, historyReady, on, status, onStart, onStop }: {
  verified: boolean;
  historyReady: boolean;
  on: boolean;
  status: string;
  onStart: () => void;
  onStop: () => void;
}) {
  return <div className="canx-mobile-talk">
    <Button type="button" className="min-h-11 w-full whitespace-normal"
      onClick={on ? onStop : onStart} disabled={!on && (!verified || !historyReady)}>
      {on ? "End conversation" : "Talk to Elsie"}
    </Button>
    <p role="status" className="text-xs">{!verified ? "Verify your authenticator in the conversation first." : !historyReady ? "Loading conversation…" : status}</p>
  </div>;
}
