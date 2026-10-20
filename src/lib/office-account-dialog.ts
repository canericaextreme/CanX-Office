/** Presentation only: never grants access or replays an action. */
export const OFFICE_ACCOUNT_EVENT = "canx:open-account";
export function openOfficeAccount() {
  window.dispatchEvent(new Event(OFFICE_ACCOUNT_EVENT));
}
