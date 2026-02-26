export function findClosestTerm(
  input: string,
  candidates: readonly string[],
  maxDistance = 2
): string | undefined {
  const normalized = normalize(input);
  if (!normalized) return undefined;

  let best: { candidate: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === normalized) return candidate;

    let distance = levenshtein(normalized, normalizedCandidate);
    if (normalizedCandidate.startsWith(normalized)) {
      distance = Math.min(distance, 1);
    }

    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }

  if (!best || best.distance > maxDistance) {
    return undefined;
  }
  return best.candidate;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}
