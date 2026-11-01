import type { OfficeNote } from "./office-notes";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { roomReportSource } from "./manager-room-commands";

export const SECURITY_CHECKLIST_TITLE = "Security work-in-progress checklist";
export const SECURITY_STAGES = [
  "Complete",
  "Currently working",
  "Needs testing",
  "Needs improvement",
] as const;
export const isRoomNoteSource = (source: string) =>
  OFFICE_ROOM_IDENTITIES.some((room) => !room.reserved && roomReportSource(room.id) === source);
function parseChecklist(detail: string): string[] | null {
  try {
    const value = JSON.parse(detail);
    return value.type === "security-checklist-v1" &&
      Array.isArray(value.sections) &&
      value.sections.length === 4 &&
      value.sections.every((item: unknown) => typeof item === "string")
      ? value.sections
      : null;
  } catch {
    return null;
  }
}
export const isSecurityChecklist = (note: OfficeNote) =>
  note.source === roomReportSource("systems") &&
  note.title === SECURITY_CHECKLIST_TITLE &&
  parseChecklist(note.detail) !== null;
export function checklistDetail(sections: string[]) {
  return JSON.stringify({ type: "security-checklist-v1", sections });
}
export function checklistSections(detail: string) {
  return parseChecklist(detail) ?? SECURITY_STAGES.map(() => "");
}
