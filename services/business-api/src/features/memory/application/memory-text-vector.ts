const VECTOR_DIMENSIONS = 64;

function hashToken(token: string): number {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createDeterministicTextVector(value: string): number[] {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0);
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3);

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % VECTOR_DIMENSIONS;
    const direction = hash % 2 === 0 ? 1 : -1;

    vector[index] = (vector[index] ?? 0) + direction;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, valueAtIndex) => sum + valueAtIndex ** 2, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((valueAtIndex) => Number((valueAtIndex / magnitude).toFixed(6)));
}
