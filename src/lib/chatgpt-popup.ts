export const CHATGPT_URL = "https://chatgpt.com/";
export const CHATGPT_WINDOW_NAME = "canx-chatgpt-companion";
export const CHATGPT_WORK_WINDOW_NAME = "canx-chatgpt-work";

/** Event the global header shortcut uses to reopen the compact companion. */
export const COMPANION_OPEN_EVENT = "canx:open-companion";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 760;
const WORK_POPUP_WIDTH = 960;
const WORK_POPUP_HEIGHT = 900;
const DESKTOP_MIN_WIDTH = 768;

export type ChatGptMode = "chat" | "work";

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

const companionWindows: Partial<Record<ChatGptMode, PopupWindow | null>> = {};

function openSafeTab(openWindow: OpenWindow): ChatGptOpenResult {
  const tab = openWindow(CHATGPT_URL, "_blank", "noopener,noreferrer");
  return tab ? "tab" : "blocked";
}

export function openChatGptCompanion(
  environment: ChatGptWindowEnvironment,
  mode: ChatGptMode = "chat",
): ChatGptOpenResult {
  const width = mode === "work" ? WORK_POPUP_WIDTH : POPUP_WIDTH;
  const maxHeight = mode === "work" ? WORK_POPUP_HEIGHT : POPUP_HEIGHT;

  if (environment.viewportWidth < DESKTOP_MIN_WIDTH || environment.availableWidth < POPUP_WIDTH + 320) {
    return openSafeTab(environment.openWindow);
  }

  const existing = companionWindows[mode];
  if (existing && !existing.closed) {
    existing.focus();
    return "focused";
  }

  const usableWidth = Math.min(width, Math.max(POPUP_WIDTH, environment.availableWidth - 80));
  const height = Math.min(maxHeight, Math.max(600, environment.availableHeight));
  const left = environment.availableLeft + Math.max(0, environment.availableWidth - usableWidth);
  const top = environment.availableTop + Math.max(0, Math.floor((environment.availableHeight - height) / 2));
  const features = [
    `width=${usableWidth}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  const windowName = mode === "work" ? CHATGPT_WORK_WINDOW_NAME : CHATGPT_WINDOW_NAME;
  const popup = environment.openWindow("", windowName, features);
  if (!popup) return openSafeTab(environment.openWindow);

  popup.opener = null;
  popup.location.replace(CHATGPT_URL);
  popup.focus();
  companionWindows[mode] = popup;
  return "popup";
}

export function openChatGptFromBrowser(mode: ChatGptMode = "chat"): ChatGptOpenResult {
  const screenWithOffsets = window.screen as Screen & { availLeft?: number; availTop?: number };
  return openChatGptCompanion(
    {
      viewportWidth: window.innerWidth,
      availableWidth: window.screen.availWidth,
      availableHeight: window.screen.availHeight,
      availableLeft: screenWithOffsets.availLeft ?? window.screenX,
      availableTop: screenWithOffsets.availTop ?? window.screenY,
      openWindow: window.open.bind(window) as OpenWindow,
    },
    mode,
  );
}

export function resetChatGptCompanionForTests() {
  companionWindows.chat = null;
  companionWindows.work = null;
}
