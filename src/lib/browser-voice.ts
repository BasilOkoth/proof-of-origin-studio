export function previewBrowserVoice(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Browser speech synthesis is unavailable.");
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 0.96;

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((voice) => /en[-_](KE|GB|US)/i.test(voice.lang)) ||
    voices.find((voice) => /^en/i.test(voice.lang));

  if (preferred) utterance.voice = preferred;

  window.speechSynthesis.speak(utterance);
}

export function stopBrowserVoice() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
