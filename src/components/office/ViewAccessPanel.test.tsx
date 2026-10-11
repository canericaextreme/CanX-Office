// @vitest-environment happy-dom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const h = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), revoke: vi.fn(), verified: true, mfa: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: string) => fn === 'read' ? h.read : fn === 'save' ? h.save : h.revoke }));
vi.mock('@/lib/office-view-owner.functions', () => ({ getViewAccess: 'read', setViewAccess: 'save', revokeViewAccess: 'revoke' }));
vi.mock('@/lib/owner-session', () => ({ useOwnerSession: () => ({ accessToken: 'owner-token', signedIn: true, viewer: false, stepUpComplete: h.verified, submitMfaCode: h.mfa }) }));
import { ViewAccessPanel } from './ViewAccessPanel';
const grant = (assistant: string, enabled = true) => ({ assistant, viewer_user_id: '00000000-0000-4000-8000-000000000011', enabled, rooms: ['/brain'], scopes: ['view_room_images'], expires_at: '2099-01-01T00:00:00Z', delegated_at: '2026-10-10T00:00:00Z', revoked_at: enabled ? null : '2026-10-10T00:00:00Z', captures_last_day: 0, last_used_at: null });
beforeEach(() => { vi.clearAllMocks(); h.verified = true; h.mfa.mockResolvedValue(null); h.read.mockResolvedValue({ ok: true, grants: ['claude','chatgpt','elsie'].map(a => grant(a)), history: [] }); h.revoke.mockResolvedValue({ ok: true, message: 'Access revoked.' }); h.save.mockResolvedValue({ ok: true, message: 'Access saved.' }); });
afterEach(cleanup);
describe('independent owner viewing switches', () => {
  it('switches only the selected assistant off without requiring MFA', async () => {
    h.verified = false;
    render(<ViewAccessPanel />);
    const selected = await screen.findByRole('switch', { name: 'Claude viewing access' });
    await waitFor(() => expect(selected.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(selected);
    await waitFor(() => expect(h.revoke).toHaveBeenCalledWith({ data: { accessToken: 'owner-token', assistant: 'claude' } }));
    expect(h.revoke).toHaveBeenCalledTimes(1);
    expect(h.save).not.toHaveBeenCalled();
  });
  it('re-enables the saved assistant with its original rooms and scopes', async () => {
    h.read.mockResolvedValue({ ok: true, grants: [grant('claude', false)], history: [] });
    render(<ViewAccessPanel />);
    const selected = await screen.findByRole('switch', { name: 'Claude viewing access' });
    await waitFor(() => expect((selected as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(selected);
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ data: { accessToken: 'owner-token', input: { assistant: 'claude', viewerUserId: grant('claude').viewer_user_id, rooms: ['/brain'], scopes: ['view_room_images'], days: 30 } } }));
    expect(h.revoke).not.toHaveBeenCalled();
  });
  it('does not show a database error as known OFF access or allow toggling it', async () => {
    h.read.mockResolvedValue({ ok: false, message: 'Database status unavailable.' });
    render(<ViewAccessPanel />);
    await screen.findByRole('alert');
    for (const button of screen.getAllByRole('switch')) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Claude — UNAVAILABLE')).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled(); expect(h.revoke).not.toHaveBeenCalled();
  });
});

describe('viewing panel authenticator verification', () => {
  it('opens the authenticator popup from Authorise without submitting a grant and preserves the selected rooms', async () => {
    h.verified = false;
    const ui = render(<ViewAccessPanel />);
    fireEvent.click(screen.getByLabelText('Reception'));
    fireEvent.click(screen.getByRole('button', { name: 'Authorise (needs your authenticator)' }));
    const input = screen.getByLabelText('Six-digit authenticator code');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.mfa).toHaveBeenCalledWith('123456'));
    expect(h.save).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    h.verified = true;
    ui.rerender(<ViewAccessPanel />);
    expect(screen.queryByLabelText('Six-digit authenticator code')).toBeNull();
    expect((screen.getByLabelText('Reception') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('button', { name: 'Authorise (needs your authenticator)' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('shows a rejected code and keeps authorisation disabled', async () => {
    h.verified = false;
    h.mfa.mockResolvedValue('That code was not accepted.');
    render(<ViewAccessPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Authorise (needs your authenticator)' }));
    fireEvent.change(screen.getByLabelText('Six-digit authenticator code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify with authenticator' }));
    expect(await screen.findByText('That code was not accepted.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled();
  });
});
describe('assistant connector sign-in', () => {
  it('shows an approved but signed-out assistant as needing reconnect', async () => {
    h.read.mockResolvedValue({ ok: true, grants: [], history: [], connections: [
      { identity: 'chatgpt', enabled: true, consent_active: true, live_sessions: 0, last_active_at: null },
      { identity: 'claude', enabled: true, consent_active: true, live_sessions: 1, last_active_at: '2026-10-11T02:00:00Z' } ] });
    render(<ViewAccessPanel />);
    expect(await screen.findByText('ChatGPT — NEEDS RECONNECT.')).toBeTruthy();
    expect(screen.getByText('Claude — CONNECTED.')).toBeTruthy();
  });
  it('shows UNKNOWN, not disconnected, when the check is not installed', async () => {
    h.read.mockResolvedValue({ ok: true, grants: [], history: [], connections: null });
    render(<ViewAccessPanel />);
    expect(await screen.findByText('ChatGPT — UNKNOWN.')).toBeTruthy();
  });
  it('warns that the authenticator code signs the assistants out', async () => {
    h.verified = false;
    render(<ViewAccessPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'All rooms' }));
    fireEvent.change(screen.getByPlaceholderText('00000000-0000-0000-0000-000000000000'), { target: { value: '00000000-0000-4000-8000-000000000011' } });
    fireEvent.click(screen.getByRole('button', { name: 'Authorise (needs your authenticator)' }));
    expect(await screen.findByText(/signs ChatGPT and Claude out/)).toBeTruthy();
  });
});
