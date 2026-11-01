// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountMenu } from "./AccountMenu";
import { openOfficeAccount } from "@/lib/office-account-dialog";

const h = vi.hoisted(() => ({ session: {
  state: "signed_out", configured: true, viewer: false, stepUpComplete: false,
  email: null as string | null, signIn: vi.fn(), submitMfaCode: vi.fn(),
  enrolTotp: vi.fn(), confirmEnrolment: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
} }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => h.session }));
beforeEach(() => {
  h.session.state = "signed_out"; h.session.viewer = false;
  h.session.stepUpComplete = false; h.session.configured = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("one deliberate Account verification flow", () => {
  it("opens only on request, sends credentials through the existing session once", async () => {
    h.session.signIn.mockResolvedValue(null);
    render(<AccountMenu />);
    expect(h.session.signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Account sign-in and authenticator" }));
    fireEvent.change(screen.getByLabelText("Owner email"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true, selector: "input" }), { target: { value: "fixture-only" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
    await waitFor(() => expect(h.session.signIn).toHaveBeenCalledExactlyOnceWith("owner@example.test", "fixture-only"));
    expect(h.session.submitMfaCode).not.toHaveBeenCalled();
  });
  it.each(["mfa_required", "owner"])("uses the same verifier for %s and rejects incomplete codes", async state => {
    h.session.state = state;
    h.session.submitMfaCode.mockResolvedValue("Incorrect code");
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Account sign-in and authenticator" }));
    const code = screen.getByLabelText("Six digit code");
    fireEvent.change(code, { target: { value: "12345" } });
    fireEvent.submit(code.closest("form") as HTMLFormElement);
    expect(h.session.submitMfaCode).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: "12x34567" } });
    fireEvent.click(screen.getByRole("button", { name: /^Verify$/ }));
    await waitFor(() => expect(h.session.submitMfaCode).toHaveBeenCalledExactlyOnceWith("123456"));
    expect(h.session.signIn).not.toHaveBeenCalled();
  });
  it("a protected-attempt event opens Account without executing verification or replaying an action", async () => {
    render(<AccountMenu />);
    openOfficeAccount();
    await screen.findByRole("dialog");
    expect(h.session.signIn).not.toHaveBeenCalled();
    expect(h.session.submitMfaCode).not.toHaveBeenCalled();
  });
  it("does not offer owner verification to an assistant viewer", () => {
    h.session.viewer = true;
    render(<AccountMenu />);
    openOfficeAccount();
    expect(h.session.signIn).not.toHaveBeenCalled();
    expect(h.session.submitMfaCode).not.toHaveBeenCalled();
  });
  it("reopens the code step after a page reload in the middle of it, and not after closing on purpose", async () => {
    h.session.state = "owner";
    window.sessionStorage.setItem("canx-account-code-pending", "1");
    render(<AccountMenu />);
    await screen.findByLabelText("Six digit code");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.sessionStorage.getItem("canx-account-code-pending")).toBeNull();
  });
  it("forgets the pending code step once the authenticator is done", () => {
    h.session.state = "owner"; h.session.stepUpComplete = true;
    window.sessionStorage.setItem("canx-account-code-pending", "1");
    render(<AccountMenu />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.sessionStorage.getItem("canx-account-code-pending")).toBeNull();
  });
});
