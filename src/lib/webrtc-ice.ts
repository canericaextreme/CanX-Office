/**
 * Wait until the browser has put its ICE candidates into localDescription.
 * Realtime WebRTC has no follow-up signalling path for late local candidates,
 * so posting the raw createOffer() SDP can create a session with no audio path.
 */
export async function waitForIceGatheringComplete(
  pc: Pick<RTCPeerConnection, "iceGatheringState" | "addEventListener" | "removeEventListener">,
  timeoutMs = 10_000,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return;

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timeout = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Timed out while gathering ICE candidates"));
    }, timeoutMs);

    pc.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}
