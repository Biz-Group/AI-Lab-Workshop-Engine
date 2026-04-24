// ============================================================================
// Join Code Generator
// Supports two formats:
// - 6-character alphanumeric for new codes
// - Legacy 4-character alphanumeric codes remain valid
// - Two-word codes (adjective-noun)
// ============================================================================

// Characters excluding ambiguous ones (I, O, 0, 1)
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CURRENT_ALPHANUMERIC_CODE_LENGTH = 6;
const LEGACY_ALPHANUMERIC_CODE_LENGTHS = [4];
const VALID_ALPHANUMERIC_CODE_LENGTHS = [
  ...LEGACY_ALPHANUMERIC_CODE_LENGTHS,
  CURRENT_ALPHANUMERIC_CODE_LENGTH,
];

// Word lists for two-word codes
const ADJECTIVES = [
  'happy', 'swift', 'brave', 'calm', 'cool', 'eager', 'fair', 'glad',
  'jolly', 'keen', 'lively', 'merry', 'noble', 'proud', 'quick', 'ready',
  'sharp', 'smart', 'sunny', 'tidy', 'vivid', 'warm', 'wise', 'zesty',
  'bright', 'clever', 'daring', 'fancy', 'gentle', 'humble', 'joyful', 'kind',
  'lucky', 'mighty', 'neat', 'peaceful', 'quiet', 'royal', 'shiny', 'tender',
  'upbeat', 'witty', 'amber', 'azure', 'coral', 'golden', 'ivory', 'jade',
  'ruby', 'silver', 'violet', 'cosmic', 'lunar', 'solar', 'stellar', 'polar'
];

const NOUNS = [
  'apple', 'river', 'mountain', 'forest', 'ocean', 'sunset', 'meadow', 'garden',
  'bridge', 'castle', 'dragon', 'falcon', 'harbor', 'island', 'jungle', 'knight',
  'lantern', 'maple', 'nectar', 'orchid', 'phoenix', 'quartz', 'rainbow', 'salmon',
  'tiger', 'umbrella', 'voyage', 'walrus', 'zebra', 'anchor', 'beacon', 'canyon',
  'delta', 'echo', 'flame', 'glacier', 'horizon', 'inlet', 'jasper', 'keystone',
  'lagoon', 'meteor', 'nest', 'oasis', 'pebble', 'quest', 'reef', 'summit',
  'trail', 'valley', 'willow', 'zenith', 'mango', 'lemon', 'cedar', 'pine'
];

export type JoinCodeFormat = 'alphanumeric' | 'two-word';

/**
 * Generate a cryptographically random index
 */
function cryptoRandomInt(max: number): number {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    return array[0] % max;
  }
  // Fallback for environments without crypto
  return Math.floor(Math.random() * max);
}

/**
 * Validate alphanumeric join codes across supported lengths.
 */
function isAlphanumericJoinCode(code: string): boolean {
  return (
    VALID_ALPHANUMERIC_CODE_LENGTHS.includes(code.length) &&
    /^[A-HJ-NP-Za-hj-np-z2-9]+$/.test(code)
  );
}

/**
 * Generate a random alphanumeric code using the current default length.
 */
export function generateAlphanumericCode(
  length: number = CURRENT_ALPHANUMERIC_CODE_LENGTH
): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += SAFE_CHARS.charAt(cryptoRandomInt(SAFE_CHARS.length));
  }
  return code;
}

/**
 * Generate a two-word code (adjective-noun)
 */
export function generateTwoWordCode(): string {
  const adjective = ADJECTIVES[cryptoRandomInt(ADJECTIVES.length)];
  const noun = NOUNS[cryptoRandomInt(NOUNS.length)];
  return `${adjective}-${noun}`;
}

/**
 * Generate a join code in the specified format
 */
export function generateJoinCode(format: JoinCodeFormat = 'alphanumeric'): string {
  if (format === 'two-word') {
    return generateTwoWordCode();
  }
  return generateAlphanumericCode();
}

/**
 * Normalize a join code for comparison (lowercase, trimmed)
 */
export function normalizeJoinCode(code: string): string {
  return code.toLowerCase().trim();
}

/**
 * Validate join code format
 */
export function isValidJoinCodeFormat(code: string): boolean {
  const normalized = code.trim();
  
  // Check legacy/new alphanumeric formats
  if (isAlphanumericJoinCode(normalized)) {
    return true;
  }
  
  // Check two-word format (word-word)
  const twoWordRegex = /^[a-zA-Z]+-[a-zA-Z]+$/;
  if (twoWordRegex.test(normalized)) {
    return true;
  }
  
  return false;
}

/**
 * Detect join code format
 */
export function detectJoinCodeFormat(code: string): JoinCodeFormat | null {
  const normalized = code.trim();
  
  if (isAlphanumericJoinCode(normalized)) {
    return 'alphanumeric';
  }
  
  if (/^[a-zA-Z]+-[a-zA-Z]+$/.test(normalized)) {
    return 'two-word';
  }
  
  return null;
}

/**
 * Get display format for join code (uppercase for alphanumeric)
 */
export function formatJoinCodeForDisplay(code: string): string {
  const format = detectJoinCodeFormat(code);
  if (format === 'alphanumeric') {
    return code.toUpperCase();
  }
  return code.toLowerCase();
}
