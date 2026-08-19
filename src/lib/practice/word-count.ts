const LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;
const NUMBER = /^\p{N}$/u;
const COMBINING_MARK = /^\p{M}$/u;

function isInternalApostrophe(character: string): boolean {
  return character === "'" || character === "’";
}

function isNumericSeparator(character: string): boolean {
  return character === "." || character === ",";
}

/**
 * Count deterministic Unicode-aware tokens without relying on an OS language
 * dictionary. See docs/WORD_COUNTING.md for the user-facing rules.
 */
export function countWords(text: string): number {
  const characters = Array.from(text);
  let words = 0;
  let inWord = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    const previous = characters[index - 1] ?? "";
    const next = characters[index + 1] ?? "";

    if (LETTER_OR_NUMBER.test(character)) {
      if (!inWord) words += 1;
      inWord = true;
      continue;
    }

    if (inWord && COMBINING_MARK.test(character)) continue;

    if (
      inWord &&
      isInternalApostrophe(character) &&
      LETTER_OR_NUMBER.test(next)
    ) {
      continue;
    }

    if (
      inWord &&
      isNumericSeparator(character) &&
      NUMBER.test(previous) &&
      NUMBER.test(next)
    ) {
      continue;
    }

    inWord = false;
  }

  return words;
}

export interface DailyPracticeState {
  documentWords: number;
  dailyWords: number;
}

/** Establish a document baseline without crediting words that already exist. */
export function beginDailyPractice(
  documentText: string,
  dailyWords = 0,
): DailyPracticeState {
  return {
    documentWords: countWords(documentText),
    dailyWords,
  };
}

/** Apply one active text edit and retain all previously earned daily credit. */
export function applyDailyPracticeEdit(
  state: DailyPracticeState,
  documentText: string,
): DailyPracticeState {
  const documentWords = countWords(documentText);
  const earnedWords = Math.max(0, documentWords - state.documentWords);

  return {
    documentWords,
    dailyWords: state.dailyWords + earnedWords,
  };
}
