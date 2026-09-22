import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/auth.functions', () => ({ getBrowserBackendConfig: mocks.config }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.create }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); mocks.config.mockReset(); mocks.create.mockReset(); });
afterEach(() => vi.useRealTimers());
it('recovers after a temporary settings failure', async () => {
  mocks.config.mockRejectedValueOnce(new Error('network')).mockResolvedValue({url:'https://example.supabase.co',publishableKey:'public'});
  const client = { auth: {} }; mocks.create.mockReturnValue(client);
  const { loadCanxSupabase } = await import('./canx-supabase');
  const result = loadCanxSupabase(); await vi.runAllTimersAsync();
  expect(await result).toBe(client); expect(mocks.config).toHaveBeenCalledTimes(2);
});
it('fails closed after bounded retries and permits a later retry', async () => {
  mocks.config.mockResolvedValue(null);
  const { loadCanxSupabase } = await import('./canx-supabase');
  const result = loadCanxSupabase(); await vi.runAllTimersAsync();
  expect(await result).toBeNull(); expect(mocks.config).toHaveBeenCalledTimes(3);
  expect(mocks.create).not.toHaveBeenCalled();
  const client = {auth:{}}; mocks.create.mockReturnValue(client);
  mocks.config.mockResolvedValue({url:'https://example.supabase.co',publishableKey:'public'});
  expect(await loadCanxSupabase()).toBe(client);
});
