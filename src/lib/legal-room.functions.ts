import { createServerFn } from "@tanstack/react-start";
import { validateLegalFiling, type LegalFiling } from "./legal-room";
const tok = (v: unknown) => (typeof v === "string" ? v.slice(0, 4000) : "");
const validId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const getLegalFilings = createServerFn({ method: "POST" })
  .inputValidator((v: { accessToken: string }) => ({ accessToken: tok(v.accessToken) }))
  .handler(async ({ data }) => {
    const { readLegalFilings } = await import("./legal-room.server");
    return readLegalFilings(data);
  });
export const saveLegalFiling = createServerFn({ method: "POST" })
  .inputValidator(
    (v: { accessToken: string; fileId: string; filing: LegalFiling; expected: string | null }) => {
      if (!validId(v.fileId) || !(v.expected === null || typeof v.expected === "string"))
        throw new Error("Choose a saved Legal document.");
      return {
        accessToken: tok(v.accessToken),
        fileId: v.fileId,
        filing: validateLegalFiling(v.filing),
        expected: v.expected,
      };
    },
  )
  .handler(async ({ data }) => {
    const { writeLegalFiling } = await import("./legal-room.server");
    return writeLegalFiling(data);
  });
