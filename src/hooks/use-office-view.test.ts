import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_MODE,
  persistViewMode,
  readStoredViewMode,
} from "./use-office-view";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe("office view mode startup state", () => {
  it("defaults to Simple view", () => {
    expect(DEFAULT_VIEW_MODE).toBe("simple");
  });

  it("stays Simple on a fresh load with no saved preference", () => {
    expect(readStoredViewMode(storage)).toBe("simple");
  });

  it("ignores and clears a stale legacy 3d preference", () => {
    storage.setItem("canx-office-view-mode", "3d");
    expect(readStoredViewMode(storage)).toBe("simple");
    expect(storage.getItem("canx-office-view-mode")).toBeNull();
  });

  it("persists a manual switch to Office view under the versioned key", () => {
    persistViewMode("3d", storage);
    expect(storage.getItem("canx-office-view-mode-v2")).toBe("3d");
    expect(readStoredViewMode(storage)).toBe("3d");
  });

  it("persists a manual switch back to Simple view", () => {
    persistViewMode("3d", storage);
    persistViewMode("simple", storage);
    expect(readStoredViewMode(storage)).toBe("simple");
  });

  it("falls back to Simple when the stored value is invalid", () => {
    storage.setItem("canx-office-view-mode-v2", "nonsense");
    expect(readStoredViewMode(storage)).toBe("simple");
  });

  it("survives a storage that throws", () => {
    const broken = {
      getItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readStoredViewMode(broken)).toBe("simple");
    expect(() => persistViewMode("3d", broken)).not.toThrow();
  });
});
