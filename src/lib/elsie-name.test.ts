import { describe, expect, it } from "vitest";
import { fixElsieName } from "./elsie-name";
import { requestIsDiscussionOnly } from "./builder-choice";

describe("fixElsieName", () => {
  it("fixes the misheard name John's transcripts actually showed", () => {
    expect(fixElsieName("LC name the saved office connection inventory entries.")).toBe("Elsie name the saved office connection inventory entries.");
    expect(fixElsieName("Okay, LC, read one saved item relevant to our LC repair work.")).toBe("Okay, Elsie, read one saved item relevant to our Elsie repair work.");
    expect(fixElsieName("Kirby, open Finance.")).toBe("Elsie, open Finance.");
    expect(fixElsieName("lc, are you there?")).toBe("Elsie, are you there?");
    expect(fixElsieName("L.C. open the brain")).toBe("Elsie open the brain");
    expect(fixElsieName("Hey Elsy, catch me up")).toBe("Hey Elsie, catch me up");
    expect(fixElsieName("make LC better.")).toBe("make Elsie better.");
    expect(fixElsieName("What did LC's last build do?")).toBe("What did Elsie's last build do?");
  });

  it("leaves other words alone", () => {
    for (const text of ["Check the LCD screen", "Add the PLC report", "Elsie, open Reception.", "Kirby Smith called about the invoice", "the calc is off", ""]) {
      expect(fixElsieName(text)).toBe(text);
    }
  });

  it("does not change whether a request is an action", () => {
    expect(requestIsDiscussionOnly(fixElsieName("LC, take care of those stale items."))).toBe(false);
  });
});
