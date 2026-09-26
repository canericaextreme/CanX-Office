import { describe, expect, it, vi } from "vitest";
import { waitForIceGatheringComplete } from "./webrtc-ice";

describe("waitForIceGatheringComplete", () => {
  it("returns immediately when gathering is already complete", async () => {
    const addEventListener = vi.fn();
    await waitForIceGatheringComplete({
      iceGatheringState: "complete",
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("waits for the complete state and removes its listener", async () => {
    let listener: (() => void) | undefined;
    const pc = {
      iceGatheringState: "gathering" as RTCIceGatheringState,
      addEventListener: vi.fn((_type: string, callback: () => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    const waiting = waitForIceGatheringComplete(pc as unknown as RTCPeerConnection, 100);
    pc.iceGatheringState = "complete";
    listener?.();
    await waiting;
    expect(pc.removeEventListener).toHaveBeenCalledWith("icegatheringstatechange", expect.any(Function));
  });
});
