import type { SavedMessage } from "./manager-history.functions";

/** Session-memory outbox. Retain failures; retry only saves, never office actions. */
export class ConversationSaveQueue {
  private pending = new Map<string, SavedMessage>();
  private running: Promise<void> | null = null;
  private generation = 0;
  get size() { return this.pending.size; }
  add(message: SavedMessage) { this.pending.set(message.id, message); }
  clear() { this.generation++; this.pending.clear(); this.running = null; }
  flush(save: (message: SavedMessage) => Promise<{ ok: boolean; message: string }>, report: (message: string) => void): Promise<void> {
    if (this.running) return this.running;
    const generation = this.generation;
    const run = async () => {
      for (const [id, message] of this.pending) {
        if (generation !== this.generation) return;
        let result;
        try { result = await save(message); }
        catch { result = { ok: false, message: "Conversation could not be saved. Keep this window open and retry saving." }; }
        if (generation !== this.generation) return;
        if (!result.ok) { report(result.message); return; }
        this.pending.delete(id);
      }
      if (generation === this.generation) report("Conversation saved.");
    };
    this.running = run().finally(() => { if (generation === this.generation) this.running = null; });
    return this.running;
  }
}
