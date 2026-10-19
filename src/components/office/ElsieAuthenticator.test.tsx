// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ElsieAuthenticator } from "./ElsieAuthenticator";

const mock = vi.hoisted(() => ({ session: { signedIn: true, state: "mfa_required", stepUpComplete: false, submitMfaCode: vi.fn() } }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => mock.session }));
vi.mock("./OwnerSignIn", () => ({ OwnerSignIn: () => <div>Account access</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Elsie existing authenticator protection", () => {
  it("submits only six numeric digits through the existing session", async () => {
    mock.session.signedIn = true;
    mock.session.state = "mfa_required";
    mock.session.stepUpComplete = false;
    mock.session.submitMfaCode.mockResolvedValue("Incorrect code");
    render(<ElsieAuthenticator />);
    const input = screen.getByLabelText("Six-digit authenticator code for Elsie");
    fireEvent.change(input, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(mock.session.submitMfaCode).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "12x34567" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(mock.session.submitMfaCode).toHaveBeenCalledExactlyOnceWith("123456"));
    expect(screen.getByRole("alert").textContent).toBe("Incorrect code");
  });
  it("does not submit a code without a signed-in session", () => {
    mock.session.signedIn = false;
    mock.session.state = "signed_out";
    render(<ElsieAuthenticator />);
    fireEvent.change(screen.getByLabelText("Six-digit authenticator code for Elsie"), { target: { value: "123456" } });
    fireEvent.keyDown(screen.getByLabelText("Six-digit authenticator code for Elsie"), { key: "Enter" });
    expect(mock.session.submitMfaCode).not.toHaveBeenCalled();
  });
});