/**
 * Spreadsheet utility functions
 */

/**
 * Convert a 0-based column index to A1 notation letter(s)
 *
 * @example
 * columnIndexToLetter(0)  // 'A'
 * columnIndexToLetter(25) // 'Z'
 * columnIndexToLetter(26) // 'AA'
 * columnIndexToLetter(27) // 'AB'
 */
export function columnIndexToLetter(index: number): string {
  let result = '';
  let remaining = index;

  while (remaining >= 0) {
    result = String.fromCharCode((remaining % 26) + 65) + result;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return result;
}

/**
 * Convert A1 notation letter(s) to 0-based column index
 *
 * @example
 * letterToColumnIndex('A')  // 0
 * letterToColumnIndex('Z')  // 25
 * letterToColumnIndex('AA') // 26
 * letterToColumnIndex('AB') // 27
 */
export function letterToColumnIndex(letter: string): number {
  let result = 0;
  for (let charIndex = 0; charIndex < letter.length; charIndex++) {
    result = result * 26 + (letter.charCodeAt(charIndex) - 64);
  }
  return result - 1;
}
