export function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `corr_${crypto.randomUUID()}`;
  }

  return `corr_${Date.now().toString(36)}`;
}
