export const CHATGPT_URL = "https://chatgpt.com/";
export const CHATGPT_WINDOW_NAME = "canx-chatgpt-companion";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 760;
const DESKTOP_MIN_WIDTH = 768;

type PopupWindow = Pick<Window, "closed" | "focus" | "opener"> & {
  location: Pick<Location, "replace">;
};

type OpenWindow = (url?: string | URL, target?: string, features?: string) => PopupWindow | null;

export interface ChatGptWindowEnvironment {
  viewportWidth: number;
  availableWidth: number;
  availableHeight: number;
  availableLeft: number;
  availableTop: number;
  openWindow: OpenWindow;
}

export type ChatGptOpenResult = "focused" | "popup" | "tab" | "blocked";

let companionWindow: PopupWindow | null = null;

function openSafeTab(openWindow: OpenWindow): ChatGptOpenResult {
  const tab = openWindow(CHATGPT_URL, "_blank", "noopener,noreferrer");
  return tab ? "tab" : "blocked";
}

export function openChatGptCompanion(environment: ChatGptWindowEnvironment): ChatGptOpenResult {
  if (environment.viewportWidth < DESKTOP_MIN_WIDTH || environment.availableWidth < POPUP_WIDTH + 320) {
    return openSafeTab(environment.openWindow);
  }

  if (companionWindow && !companionWindow.closed) {
    companionWindow.focus();
    return "focused";
  }

  const height = Math.min(POPUP_HEIGHT, Math.max(600, environment.availableHeight));
  const left = environment.availableLeft + Math.max(0, environment.availableWidth - POPUP_WIDTH);
  const top = environment.availableTop + Math.max(0, Math.floor((environment.availableHeight - height) / 2));
  const features = [
    `width=${POPUP_WIDTH}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  const popup = environment.openWindow("", CHATGPT_WINDOW_NAME, features);
  if (!popup) return openSafeTab(environment.openWindow);

  popup.opener = null;
  popup.location.replace(CHATGPT_URL);
  popup.focus();
  companionWindow = popup;
  return "popup";
}

export function openChatGptFromBrowser(): ChatGptOpenResult {
  const screenWithOffsets = window.screen as Screen & { availLeft?: number; availTop?: number };
  return openChatGptCompanion({
    viewportWidth: window.innerWidth,
    availableWidth: window.screen.availWidth,
    availableHeight: window.screen.availHeight,
    availableLeft: screenWithOffsets.availLeft ?? window.screenX,
    availableTop: screenWithOffsets.availTop ?? window.screenY,
    openWindow: window.open.bind(window) as OpenWindow,
  });
}

export function resetChatGptCompanionForTests() {
  companionWindow = null;
}