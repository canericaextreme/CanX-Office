export const VIEWPORTS: Record<"desktop" | "mobile", { width: number; height: number }>;
export const TWO_STEP_ROUTES: string[];
export const MASK_CSS: string;
export const ROOM_LABELS: Record<string, string>;
export const ALLOWED_ROUTES: string[];
export const EXIT_REFUSED: number;
export const EXIT_NOT_THE_ROOM: number;
export function checkTarget(baseUrl: string, route: string): string | null;
export type CaptureOutcome = "ok" | "unavailable" | "wrong_route" | "sign_in_page" | "not_a_room" | "blank";
export function classifyCapture(input: {
  route: string;
  finalPath: string;
  httpStatus: number;
  hasOfficeView: boolean;
  hasSignIn: boolean;
  textLength: number;
}): CaptureOutcome;
