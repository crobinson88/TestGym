// French text-to-speech via the Web Speech API, for the listening test. No audio
// files ship — the browser's fr-FR voice speaks each word. Best-effort: if no
// voice is available the utterance still plays under the fr-FR locale.

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Prefer a French voice that speaks on the device: several browsers ship
// network-backed voices that go silent offline, and the listening and speaking
// tests are otherwise fully local. Metropolitan French first, then any French,
// local before remote in each case; else let the locale pick.
export function pickFrenchVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const fr = voices.filter((v) => v.lang.toLowerCase().startsWith("fr"));
  const metropolitan = fr.filter((v) => v.lang === "fr-FR");
  return (
    metropolitan.find((v) => v.localService) ??
    metropolitan[0] ??
    fr.find((v) => v.localService) ??
    fr[0] ??
    null
  );
}

// Voices load lazily, so the list is re-read on every call.
function currentFrenchVoice(): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  return pickFrenchVoice(window.speechSynthesis.getVoices());
}

// Speak a French word at the given rate (1 = normal). Cancels any in-flight
// utterance first so rapid replays/skips don't queue up.
export function speakFrench(text: string, rate = 1): void {
  if (!speechAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  u.rate = rate;
  const voice = currentFrenchVoice();
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function cancelSpeech(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
