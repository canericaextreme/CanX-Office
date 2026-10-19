/** Restore false when John finishes the build. */
export const OFFICE_BUILD_IN_PROGRESS = true;

/** UI browsing only: never supplies a session, owner role or bearer token. */
export function canBrowseOfficeWithoutSignIn(isDevelopment: boolean): boolean {
  return isDevelopment === true || OFFICE_BUILD_IN_PROGRESS;
}