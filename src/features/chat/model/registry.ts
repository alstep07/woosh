// Chat tool registry — examples now, full tool definitions in V2
// Each feature file calls registerToolExamples() as a side-effect import.

const _examples: string[] = [];

export function registerToolExamples(_toolName: string, examples: string[]) {
  _examples.push(...examples);
}

export function getAllExamples(): string[] {
  return [..._examples];
}
