/** End only the temporary viewing session; other room reads may overlap it. */
export async function endViewerSession(
  token: string,
  logout: (path: string, token: string) => Promise<unknown>,
): Promise<void> {
  await logout('/auth/v1/logout?scope=local', token).catch(() => undefined);
}
