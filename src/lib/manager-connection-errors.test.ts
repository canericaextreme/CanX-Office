import { describe, expect, it } from "vitest";
import { managerConnectionFailure } from "./manager-connection-errors";

describe("provider connection failure diagnostics", () => {
  it("distinguishes the server's timed abort from other transport failures", () => {
    expect(managerConnectionFailure(new Error("private upstream message"), true)).toContain("timed out after 15 seconds");
    expect(managerConnectionFailure(new DOMException("private", "AbortError"), false)).toContain("interrupted");
  });

  it.each(["ENOTFOUND", "ECONNRESET", "CERT_HAS_EXPIRED"])("reports only an allowlisted transport code: %s", code => {
    const error = new TypeError("secret provider request", { cause: { code, message: "private" } });
    expect(managerConnectionFailure(error, false)).toContain(`(${code})`);
    expect(managerConnectionFailure(error, false)).not.toContain("secret");
    expect(managerConnectionFailure(error, false)).not.toContain("private");
  });

  it("withholds arbitrary error names, messages, cause codes and non-Error values", () => {
    const secret = "sk-private-value";
    const error = new Error(secret, { cause: { code: secret } });
    error.name = secret;
    for (const value of [error, secret, null, { message: secret }]) {
      const detail = managerConnectionFailure(value, false);
      expect(detail).not.toContain(secret);
      expect(detail).toContain("unknown transport failure");
    }
    expect(managerConnectionFailure(new TypeError(secret), false)).toContain("transport layer");
  });

  it.each([
    ["Illegal invocation: sk-private-value", "fetch invocation"],
    ["Invalid character in header content: sk-private-value", "request-header value"],
    ["Network connection lost: sk-private-value", "network request"],
  ])("classifies known runtime wording without returning its contents", (message, expected) => {
    const detail = managerConnectionFailure(new Error(message), false);
    expect(detail).toContain(expected);
    expect(detail).not.toContain("sk-private-value");
  });
});
