/** UI browsing only: never supplies a session, owner role or bearer token. */
export function canBrowseOfficeWithoutSignIn(isDevelopment: boolean): boolean {
  return isDevelopment === true;
}