// French text-to-speech via the Web Speech API, for the listening test. No audio
// files ship — the browser's fr-FR voice speaks each word. Best-effort: if no
// voice is available the utterance still plays under the fr-FR locale.

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Prefer a metropolitan-French voice, then any French voice, else let the locale
// pick. Voices load lazily, so this is re-read on every call.
function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "fr-FR") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ??
    null
  );
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
  const voice = pickFrenchVoice();
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function cancelSpeech(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
