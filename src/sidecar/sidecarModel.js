export function isCaptureSuccessNotice(message) {
  return message === "Saved" || message === "Captured" || message?.startsWith("Captured ");
}
