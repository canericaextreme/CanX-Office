/**
 * Pairs completed live-voice transcripts into user/assistant turns for durable
 * memory. A spoken request that was sent through submit_office_request is
 * already saved by the typed Manager path, so its pair is skipped here to
 * avoid saving the same turn twice.
 */
export interface VoiceTurn { user: string; answer: string }

export class VoiceTurnPairer {
  private pendingUsers = new Map<string, string>();
  private serverSaved = new Set<string>();

  /** Call when a spoken request goes through the typed Manager path. */
  markServerSaved(request: string) {
    const key = request.trim();
    if (key) this.serverSaved.add(key);
  }

  /** Feed each completed transcript; returns a turn to persist, or null. */
  feed(role: "user" | "assistant", content: string, turnId = "default"): VoiceTurn | null {
    const text = content.trim();
    if (!text) return null;
    if (role === "user") { this.pendingUsers.set(turnId, text); return null; }
    const user = this.pendingUsers.get(turnId) ?? null;
    this.pendingUsers.delete(turnId);
    if (!user) return null;
    if (this.serverSaved.delete(user)) return null;
    return { user, answer: text };
  }

  cancel(turnId = "default") { this.pendingUsers.delete(turnId); }

  reset() { this.pendingUsers.clear(); this.serverSaved.clear(); }
}
