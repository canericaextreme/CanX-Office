import { describe, expect, it } from "vitest";
import { forSpeech, isAffirmative, isNegative, spokenSummary } from "@/lib/voice-summary";
import { pickNaturalVoice, speechChunks } from "@/lib/use-speech";

describe("spokenSummary", () => {
  it("speaks a short answer in full", () => {
    const result = spokenSummary("Two tasks are open.");
    expect(result.spoken).toBe("Two tasks are open.");
    expect(result.truncated).toBe(false);
  });

  it("summarises a long list and asks first", () => {
    const list = ["Here are the tasks:", ...Array.from({ length: 8 }, (_, i) => `- Task ${i + 1}`)].join("\n");
    const result = spokenSummary(list);
    expect(result.truncated).toBe(true);
    expect(result.spoken).toContain("There are 8 items");
    expect(result.spoken).toContain("Want the rest?");
    expect(result.spoken).not.toContain("Task 8");
    // `full` is the spoken form of the answer: bullet marks are not read out.
    expect(result.full).toBe(forSpeech(list));
    expect(result.full).toContain("Task 8");
  });

  it("shortens a long paragraph and offers the rest", () => {
    const long = "Sentence one is here. ".repeat(40);
    const result = spokenSummary(long);
    expect(result.truncated).toBe(true);
    expect(result.spoken.length).toBeLessThan(long.length);
    expect(result.spoken).toContain("Want the whole thing?");
  });
});

describe("voice replies", () => {
  it("recognises yes and no", () => {
    expect(isAffirmative("yes please")).toBe(true);
    expect(isAffirmative("read the full list")).toBe(true);
    expect(isNegative("no thanks")).toBe(true);
    expect(isAffirmative("what about finance")).toBe(false);
  });
});

describe("speech shaping", () => {
  it("splits into sentence-sized chunks", () => {
    const chunks = speechChunks("One. Two. Three.", 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("Three.");
  });

  it("prefers a natural English voice", () => {
    const voices = [
      { name: "Basic", lang: "en-US" },
      { name: "Microsoft Aria Online (Natural)", lang: "en-US" },
      { name: "Français", lang: "fr-FR" },
    ] as SpeechSynthesisVoice[];
    expect(pickNaturalVoice(voices)?.name).toContain("Natural");
    expect(pickNaturalVoice([])).toBeNull();
  });
});

describe("forSpeech", () => {
  it("drops markdown marks instead of reading them out", () => {
    expect(forSpeech("## Heading\n- **Bold** item\n- `code` item")).toBe("Heading\nBold item\ncode item");
  });

  it("says money and shorthand the way a person would", () => {
    expect(forSpeech("Total C$1,240.00 e.g. parts")).toBe("Total 1240 Canadian dollars for example parts");
  });

  it("replaces links with a spoken word", () => {
    expect(forSpeech("See https://example.com/x now")).toBe("See a link now");
  });

  it("keeps the spoken summary free of markdown", () => {
    const shaped = spokenSummary("**Done.** Two receipts filed.");
    expect(shaped.spoken).toBe("Done. Two receipts filed.");
  });
});
