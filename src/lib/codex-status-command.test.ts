import { describe, expect, it } from "vitest";
import { isCodexStatusCommand } from "./codex-status-command";

describe("explicit builder status command", () => {
  it.each(["Check builder connection", "Check the Codex connection.", "check_codex_builds", "Use check_codex_builds and tell me the exact connection status or error. Don't start a build."])("accepts %s", text => {
    expect(isCodexStatusCommand(text)).toBe(true);
  });
  it.each(["Don't check builder connection", "Explain check_codex_builds", '"Check builder connection"', "Check builder connection and start a build", "check_codex_builds change 42"])("leaves other requests in chat: %s", text => {
    expect(isCodexStatusCommand(text)).toBe(false);
  });
});
