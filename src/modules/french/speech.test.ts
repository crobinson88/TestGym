import { describe, it, expect } from "vitest";
import { pickFrenchVoice } from "./speech";

const voice = (name: string, lang: string, localService: boolean) =>
  ({ name, lang, localService }) as SpeechSynthesisVoice;

describe("french voice choice", () => {
  it("prefers an on-device fr-FR voice, so the audio survives going offline", () => {
    const picked = pickFrenchVoice([
      voice("Remote FR", "fr-FR", false),
      voice("Amelie", "fr-CA", true),
      voice("Thomas", "fr-FR", true),
    ]);
    expect(picked?.name).toBe("Thomas");
  });

  it("takes a remote fr-FR voice over a local non-metropolitan one", () => {
    const picked = pickFrenchVoice([voice("Amelie", "fr-CA", true), voice("Remote", "fr-FR", false)]);
    expect(picked?.name).toBe("Remote");
  });

  it("falls back to any French voice, then to none", () => {
    expect(pickFrenchVoice([voice("Amelie", "fr-CA", false)])?.name).toBe("Amelie");
    expect(pickFrenchVoice([voice("Daniel", "en-GB", true)])).toBeNull();
    expect(pickFrenchVoice([])).toBeNull();
  });
});
