import { type GeneratedCase } from './casePipeline.js';

export type CaseCorpusEntry = {
  caseId: string | null;
  victimName: string;
  sceneNarrative: string;
  victimDescription: string;
  solutionSummary: string;
  suspectNames: string[];
  evidenceNames: string[];
  fingerprint: string;
  tokens: Set<string>;
};

export type CaseReviewResult = {
  score: number;
  passed: boolean;
  exactDuplicate: boolean;
  nearDuplicate: boolean;
  fingerprint: string;
  reasons: string[];
  matchedCaseId: string | null;
  matchedVictimName: string | null;
};

type ReviewOptions = {
  minScore?: number;
};

const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'from',
  'into',
  'over',
  'under',
  'that',
  'this',
  'their',
  'there',
  'after',
  'before',
  'while',
  'where',
  'when',
  'near',
  'inside',
  'outside',
  'have',
  'has',
  'had',
  'was',
  'were',
  'been',
  'just',
  'very',
  'only',
  'than',
  'then',
  'onto',
  'your',
  'they',
  'them',
  'hers',
  'his',
  'her',
  'him',
  'she',
  'he',
  'its',
  'for',
  'but',
  'not',
  'you',
  'our',
  'out',
  'all',
  'too',
  'off',
]);

const CRIME_METHOD_GROUPS: Record<string, string[]> = {
  blade: ['knife', 'blade', 'dagger', 'scalpel', 'razor', 'letter opener', 'machete'],
  blunt: ['hammer', 'wrench', 'crowbar', 'bat', 'pipe', 'statue', 'trophy', 'blunt'],
  firearm: ['gun', 'pistol', 'revolver', 'rifle', 'shot', 'bullet', 'firearm'],
  poison: ['poison', 'venom', 'toxin', 'laced', 'drugged', 'overdose', 'powder', 'capsule'],
  fire: ['fire', 'burn', 'petrol', 'gasoline', 'molotov', 'match', 'lighter', 'arson'],
  electric: ['electrocute', 'shock', 'generator', 'cable', 'wire', 'socket', 'battery'],
  fall: ['pushed', 'fell', 'balcony', 'ledge', 'stairs', 'railing', 'drop'],
  strangulation: ['strangled', 'garrote', 'rope', 'cord', 'wire', 'belt', 'ligature'],
  drowning: ['drowned', 'water', 'tank', 'pool', 'bath', 'canal'],
};

function canonicalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return canonicalise(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function buildTokenSet(values: string[]): Set<string> {
  return new Set(values.flatMap((value) => tokenize(value)));
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersection = 0;

  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function intersectionCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function averageLength(values: string[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value.length, 0) / values.length;
}

function lexicalDiversity(values: string[]): number {
  const tokens = values.flatMap((value) => tokenize(value));

  if (tokens.length === 0) {
    return 0;
  }

  return new Set(tokens).size / tokens.length;
}

function countTokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  let matches = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches;
}

function getCrimeMethodCategories(text: string): string[] {
  const canonical = canonicalise(text);

  return Object.entries(CRIME_METHOD_GROUPS)
    .filter(([, keywords]) => keywords.some((keyword) => canonical.includes(canonicalise(keyword))))
    .map(([category]) => category);
}

function assessCrimeEvidenceCoherence(generatedCase: GeneratedCase): { delta: number; reasons: string[] } {
  const reasons: string[] = [];
  let delta = 0;
  const narrativeBundle = [
    generatedCase.scene_narrative,
    generatedCase.victim_description,
    generatedCase.solution_summary,
    ...generatedCase.suspects.flatMap((suspect) => [suspect.statement_v1, suspect.statement_v2]),
  ].join(' ');

  const weakEvidenceCount = generatedCase.evidence.filter((item) => {
    const overlap = countTokenOverlap(`${item.name} ${item.detail}`, narrativeBundle);
    return overlap === 0;
  }).length;

  if (weakEvidenceCount === 0) {
    delta += 8;
  } else if (weakEvidenceCount === 1) {
    delta += 2;
    reasons.push('One evidence item feels only loosely tied to the crime.');
  } else {
    delta -= 12;
    reasons.push('Too many evidence items feel disconnected from the scene or solution.');
  }

  const narrativeCategories = new Set(getCrimeMethodCategories(narrativeBundle));
  const evidenceCategories = new Set(
    generatedCase.evidence.flatMap((item) => getCrimeMethodCategories(`${item.name} ${item.detail}`)),
  );

  if (narrativeCategories.size > 0) {
    const matchedCategories = [...narrativeCategories].filter((category) => evidenceCategories.has(category));

    if (matchedCategories.length === 0) {
      delta -= 15;
      reasons.push('The likely murder method is not supported by the evidence list.');
    } else {
      delta += 8;
    }
  }

  const decisiveEvidence = generatedCase.evidence.filter((item) => {
    const combined = canonicalise(`${item.name} ${item.detail}`);
    return (
      combined.includes('blood') ||
      combined.includes('fingerprint') ||
      combined.includes('fib') ||
      combined.includes('residue') ||
      combined.includes('trace') ||
      combined.includes('weapon') ||
      getCrimeMethodCategories(combined).length > 0
    );
  }).length;

  if (decisiveEvidence === 0) {
    delta -= 8;
    reasons.push('Evidence lacks a convincing decisive clue or plausible murder implement.');
  } else {
    delta += 4;
  }

  return { delta, reasons };
}

export function buildCaseCorpusEntry(input: {
  caseId?: string | null;
  victimName: string;
  sceneNarrative: string;
  victimDescription: string;
  solutionSummary: string;
  suspectNames: string[];
  evidenceNames: string[];
}): CaseCorpusEntry {
  const canonicalVictim = canonicalise(input.victimName);
  const canonicalSuspects = input.suspectNames.map(canonicalise).sort();
  const canonicalEvidence = input.evidenceNames.map(canonicalise).sort();

  return {
    caseId: input.caseId ?? null,
    victimName: input.victimName,
    sceneNarrative: input.sceneNarrative,
    victimDescription: input.victimDescription,
    solutionSummary: input.solutionSummary,
    suspectNames: canonicalSuspects,
    evidenceNames: canonicalEvidence,
    fingerprint: `${canonicalVictim}::${canonicalSuspects.join('|')}::${canonicalEvidence.join('|')}`,
    tokens: buildTokenSet([
      input.sceneNarrative,
      input.victimDescription,
      input.solutionSummary,
      input.victimName,
      ...input.suspectNames,
      ...input.evidenceNames,
    ]),
  };
}

export function buildCaseCorpusEntryFromGeneratedCase(
  generatedCase: GeneratedCase,
  caseId?: string | null,
): CaseCorpusEntry {
  return buildCaseCorpusEntry({
    caseId,
    victimName: generatedCase.victim_name,
    sceneNarrative: generatedCase.scene_narrative,
    victimDescription: generatedCase.victim_description,
    solutionSummary: generatedCase.solution_summary,
    suspectNames: generatedCase.suspects.map((suspect) => suspect.name),
    evidenceNames: generatedCase.evidence.map((item) => item.name),
  });
}

export function reviewGeneratedCase(
  generatedCase: GeneratedCase,
  corpus: CaseCorpusEntry[],
  options?: ReviewOptions,
): CaseReviewResult {
  const minScore = options?.minScore ?? 70;
  const candidate = buildCaseCorpusEntryFromGeneratedCase(generatedCase);
  const reasons: string[] = [];
  let score = 40;
  let exactDuplicate = false;
  let nearDuplicate = false;
  let matchedCaseId: string | null = null;
  let matchedVictimName: string | null = null;
  let strongestDuplicateSignal = 0;

  if (generatedCase.scene_narrative.length >= 140) {
    score += 10;
  } else if (generatedCase.scene_narrative.length >= 90) {
    score += 6;
  } else {
    reasons.push('Scene narrative is too thin.');
  }

  if (generatedCase.victim_description.length >= 70) {
    score += 8;
  } else if (generatedCase.victim_description.length >= 45) {
    score += 4;
  } else {
    reasons.push('Victim description lacks detail.');
  }

  if (generatedCase.solution_summary.length >= 70) {
    score += 8;
  } else if (generatedCase.solution_summary.length >= 45) {
    score += 4;
  } else {
    reasons.push('Solution summary is too brief.');
  }

  const suspectDescriptionAverage = averageLength(generatedCase.suspects.map((suspect) => suspect.description));
  if (suspectDescriptionAverage >= 70) {
    score += 10;
  } else if (suspectDescriptionAverage >= 50) {
    score += 5;
  } else {
    reasons.push('Suspect descriptions are too generic.');
  }

  const evidenceDetailAverage = averageLength(generatedCase.evidence.map((item) => item.detail));
  if (evidenceDetailAverage >= 50) {
    score += 8;
  } else if (evidenceDetailAverage >= 35) {
    score += 4;
  } else {
    reasons.push('Evidence details are too shallow.');
  }

  const statementVariance = averageLength(
    generatedCase.suspects.map((suspect) => `${suspect.statement_v1} ${suspect.statement_v2}`),
  );
  if (statementVariance >= 90) {
    score += 6;
  } else if (statementVariance < 60) {
    reasons.push('Suspect statements feel too slight.');
  }

  const diversity = lexicalDiversity([
    generatedCase.scene_narrative,
    generatedCase.victim_description,
    generatedCase.solution_summary,
    ...generatedCase.suspects.map((suspect) => suspect.description),
    ...generatedCase.evidence.map((item) => item.detail),
  ]);

  if (diversity >= 0.72) {
    score += 10;
  } else if (diversity >= 0.6) {
    score += 6;
  } else if (diversity < 0.45) {
    reasons.push('Language variety is low, which usually means a bland case.');
  }

  const coherence = assessCrimeEvidenceCoherence(generatedCase);
  score += coherence.delta;
  reasons.push(...coherence.reasons);

  for (const existing of corpus) {
    const victimMatch = canonicalise(existing.victimName) === canonicalise(generatedCase.victim_name);
    const suspectOverlap = intersectionCount(candidate.suspectNames, existing.suspectNames);
    const evidenceOverlap = intersectionCount(candidate.evidenceNames, existing.evidenceNames);
    const tokenSimilarity = jaccardSimilarity(candidate.tokens, existing.tokens);

    let signal = 0;

    if (candidate.fingerprint === existing.fingerprint || victimMatch) {
      exactDuplicate = true;
      signal = 100;
    } else if (
      suspectOverlap >= 2 ||
      evidenceOverlap >= 2 ||
      tokenSimilarity >= 0.72 ||
      (suspectOverlap >= 1 && evidenceOverlap >= 1 && tokenSimilarity >= 0.4)
    ) {
      nearDuplicate = true;
      signal = Math.max(signal, Math.round(tokenSimilarity * 100) + suspectOverlap * 10 + evidenceOverlap * 10);
    }

    if (signal > strongestDuplicateSignal) {
      strongestDuplicateSignal = signal;
      matchedCaseId = existing.caseId;
      matchedVictimName = existing.victimName;
    }
  }

  if (exactDuplicate) {
    score -= 40;
    reasons.push(
      matchedVictimName
        ? `Exact duplicate of existing case "${matchedVictimName}".`
        : 'Exact duplicate of an existing case.',
    );
  } else if (nearDuplicate) {
    score -= 25;
    reasons.push(
      matchedVictimName
        ? `Too close to existing case "${matchedVictimName}".`
        : 'Too close to an existing case.',
    );
  }

  const finalScore = clampScore(score);

  if (finalScore < minScore) {
    reasons.push(`Interestingness score ${finalScore} is below threshold ${minScore}.`);
  }

  return {
    score: finalScore,
    passed: !exactDuplicate && !nearDuplicate && finalScore >= minScore,
    exactDuplicate,
    nearDuplicate,
    fingerprint: candidate.fingerprint,
    reasons,
    matchedCaseId,
    matchedVictimName,
  };
}
