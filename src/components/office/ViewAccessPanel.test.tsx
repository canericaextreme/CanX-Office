// @vitest-environment happy-dom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const h = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), revoke: vi.fn(), verified: true }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: string) => fn === 'read' ? h.read : fn === 'save' ? h.save : h.revoke }));
vi.mock('@/lib/office-view-owner.functions', () => ({ getViewAccess: 'read', setViewAccess: 'save', revokeViewAccess: 'revoke' }));
vi.mock('@/lib/owner-session', () => ({ useOwnerSession: () => ({ accessToken: 'owner-token', signedIn: true, viewer: false, stepUpComplete: h.verified }) }));
import { ViewAccessPanel } from './ViewAccessPanel';
const grant = (assistant: string, enabled = true) => ({ assistant, viewer_user_id: '00000000-0000-4000-8000-000000000011', enabled, rooms: ['/brain'], scopes: ['view_room_images'], expires_at: '2099-01-01T00:00:00Z', delegated_at: '2026-10-10T00:00:00Z', revoked_at: enabled ? null : '2026-10-10T00:00:00Z', captures_last_day: 0, last_used_at: null });
beforeEach(() => { vi.clearAllMocks(); h.verified = true; h.read.mockResolvedValue({ ok: true, grants: ['claude','chatgpt','elsie'].map(a => grant(a)), history: [] }); h.revoke.mockResolvedValue({ ok: true, message: 'Access revoked.' }); h.save.mockResolvedValue({ ok: true, message: 'Access saved.' }); });
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
