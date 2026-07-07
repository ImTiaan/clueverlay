export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(source: string, target: string): number {
  if (source === target) {
    return 0;
  }

  const sourceLength = source.length;
  const targetLength = target.length;

  if (sourceLength === 0) {
    return targetLength;
  }

  if (targetLength === 0) {
    return sourceLength;
  }

  const matrix = Array.from({ length: sourceLength + 1 }, () =>
    Array.from({ length: targetLength + 1 }, () => 0),
  );

  for (let i = 0; i <= sourceLength; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= targetLength; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= sourceLength; i += 1) {
    for (let j = 1; j <= targetLength; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[sourceLength][targetLength];
}

export function findFuzzyMatch<T>(
  input: string,
  candidates: T[],
  getLabel: (candidate: T) => string,
): T | null {
  const normalizedInput = normalizeForMatch(input);

  if (!normalizedInput) {
    return null;
  }

  const scored = candidates
    .map((candidate) => {
      const label = normalizeForMatch(getLabel(candidate));

      if (!label) {
        return null;
      }

      const exact = label === normalizedInput;
      const prefix = label.startsWith(normalizedInput) || normalizedInput.startsWith(label);
      const distance = levenshteinDistance(normalizedInput, label);

      return {
        candidate,
        exact,
        prefix,
        distance,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left!.exact !== right!.exact) {
        return left!.exact ? -1 : 1;
      }

      if (left!.prefix !== right!.prefix) {
        return left!.prefix ? -1 : 1;
      }

      return left!.distance - right!.distance;
    }) as Array<{
    candidate: T;
    exact: boolean;
    prefix: boolean;
    distance: number;
  }>;

  const best = scored[0];

  if (!best) {
    return null;
  }

  if (best.exact || best.prefix || best.distance <= 2) {
    const runnerUp = scored[1];

    if (runnerUp && runnerUp.distance === best.distance && runnerUp.prefix === best.prefix) {
      return null;
    }

    return best.candidate;
  }

  return null;
}
