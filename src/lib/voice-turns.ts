/**
 * Pairs completed live-voice transcripts into user/assistant turns for durable
 * memory. A spoken request that was sent through submit_office_request is
 * already saved by the typed Manager path, so its pair is skipped here to
 * avoid saving the same turn twice.
 */
export interface VoiceTurn { user: string; answer: string }

export class VoiceTurnPairer {
  private pendingUser: string | null = null;
  private serverSaved = new Set<string>();

  /** Call when a spoken request goes through the typed Manager path. */
  markServerSaved(request: string) {
    const key = request.trim();
    if (key) this.serverSaved.add(key);
  }

  /** Feed each completed transcript; returns a turn to persist, or null. */
  feed(role: "user" | "assistant", content: string): VoiceTurn | null {
    const text = content.trim();
    if (!text) return null;
    if (role === "user") { this.pendingUser = text; return null; }
    const user = this.pendingUser;
    this.pendingUser = null;
    if (!user) return null;
    if (this.serverSaved.delete(user)) return null;
    return { user, answer: text };
  }

  reset() { this.pendingUser = null; this.serverSaved.clear(); }
}
