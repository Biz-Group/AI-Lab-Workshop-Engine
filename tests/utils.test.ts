/**
 * Basic Tests for Workshop Runner
 * 
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { 
  generateJoinCode, 
  generateTwoWordCode, 
  formatJoinCodeForDisplay,
  normalizeJoinCode,
  isValidJoinCodeFormat,
} from '../src/lib/utils/join-code';
import { 
  createSessionToken, 
  verifySessionToken 
} from '../src/lib/utils/session-token';
import { substituteVariables } from '../src/lib/utils/variables';
import { cn, formatDate, truncate, getTimeRemaining, percentage } from '../src/lib/utils/common';

describe('Join Code Utils', () => {
  describe('generateJoinCode', () => {
    it('should generate a 6-character alphanumeric code by default', () => {
      const code = generateJoinCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    });

    it('should generate two-word code when specified', () => {
      const code = generateJoinCode('two-word');
      expect(code).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it('should exclude ambiguous characters (O, I, 0, 1)', () => {
      // Generate multiple codes and check none contain ambiguous chars
      for (let i = 0; i < 100; i++) {
        const code = generateJoinCode();
        expect(code).not.toMatch(/[OI01]/);
      }
    });
  });

  describe('generateTwoWordCode', () => {
    it('should generate a two-word code with hyphen', () => {
      const code = generateTwoWordCode();
      expect(code).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it('should generate different codes', () => {
      const codes = new Set();
      for (let i = 0; i < 20; i++) {
        codes.add(generateTwoWordCode());
      }
      // Should have mostly unique codes
      expect(codes.size).toBeGreaterThan(10);
    });
  });

  describe('formatJoinCodeForDisplay', () => {
    it('should uppercase alphanumeric codes', () => {
      expect(formatJoinCodeForDisplay('ab3k9q')).toBe('AB3K9Q');
    });

    it('should lowercase two-word codes', () => {
      expect(formatJoinCodeForDisplay('Blue-Tiger')).toBe('blue-tiger');
    });
  });

  describe('normalizeJoinCode', () => {
    it('should lowercase and trim', () => {
      expect(normalizeJoinCode('  AB3K9Q  ')).toBe('ab3k9q');
    });
  });

  describe('isValidJoinCodeFormat', () => {
    it('should accept valid alphanumeric codes in current and legacy lengths', () => {
      expect(isValidJoinCodeFormat('AB3K')).toBe(true);
      expect(isValidJoinCodeFormat('AB3K9Q')).toBe(true);
    });

    it('should accept valid two-word codes', () => {
      expect(isValidJoinCodeFormat('happy-river')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidJoinCodeFormat('AB')).toBe(false);
      expect(isValidJoinCodeFormat('')).toBe(false);
    });
  });
});

describe('Session Token Utils', () => {
  describe('createSessionToken', () => {
    it('should create a valid JWT token', async () => {
      const token = await createSessionToken(
        'test-participant-id',
        'test-session-id',
        'Test User'
      );
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifySessionToken', () => {
    it('should verify a valid token', async () => {
      const token = await createSessionToken(
        'test-participant-id',
        'test-session-id',
        'Test User'
      );
      
      const payload = await verifySessionToken(token);
      expect(payload).toBeTruthy();
      expect(payload?.session_id).toBe('test-session-id');
      expect(payload?.participant_id).toBe('test-participant-id');
      expect(payload?.display_name).toBe('Test User');
    });

    it('should return null for invalid token', async () => {
      const payload = await verifySessionToken('invalid-token');
      expect(payload).toBeNull();
    });
  });
});

describe('Variable Substitution', () => {
  describe('substituteVariables', () => {
    const baseContext = {
      ORG_NAME: 'Acme',
      INDUSTRY: 'Technology',
      TONE_NOTES: 'Helpful and practical',
    };

    it('should substitute simple variables', () => {
      const template = 'Hello, {NAME}!';
      const values = { ...baseContext, NAME: 'World' };
      expect(substituteVariables(template, values)).toBe('Hello, World!');
    });

    it('should handle multiple variables', () => {
      const template = '{GREETING}, {NAME}! Today is {DAY}.';
      const values = { ...baseContext, GREETING: 'Hello', NAME: 'Alice', DAY: 'Monday' };
      expect(substituteVariables(template, values)).toBe('Hello, Alice! Today is Monday.');
    });

    it('should replace unmatched variables with placeholder', () => {
      const template = 'Hello, {NAME}! Your role is {ROLE}.';
      const values = { ...baseContext, NAME: 'Bob' };
      expect(substituteVariables(template, values)).toBe('Hello, Bob! Your role is [ROLE].');
    });

    it('should handle empty values', () => {
      const template = 'Value: {VALUE}';
      const values = { ...baseContext, VALUE: '' };
      expect(substituteVariables(template, values)).toBe('Value: ');
    });

    it('should handle variables with underscores', () => {
      const template = 'Task: {TASK_DESCRIPTION}';
      const values = { ...baseContext, TASK_DESCRIPTION: 'Write code' };
      expect(substituteVariables(template, values)).toBe('Task: Write code');
    });
  });
});

describe('Common Utils', () => {
  describe('cn (classNames)', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    });

    it('should merge Tailwind classes correctly', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
    });
  });

  describe('formatDate', () => {
    it('should format date string', () => {
      const date = '2024-01-15T10:30:00Z';
      const formatted = formatDate(date);
      expect(formatted).toContain('2024');
    });

    it('should format Date object', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toContain('2024');
    });
  });

  describe('truncate', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that needs to be truncated';
      const truncated = truncate(text, 20);
      expect(truncated).toHaveLength(20);
      expect(truncated).toContain('...');
    });

    it('should not truncate short text', () => {
      const text = 'Short';
      const truncated = truncate(text, 20);
      expect(truncated).toBe('Short');
    });

    it('should handle maxLength less than 4', () => {
      const text = 'Hello World';
      const truncated = truncate(text, 3);
      expect(truncated).toBe('Hel');
    });
  });

  describe('getTimeRemaining', () => {
    it('should return expired for past dates', () => {
      const result = getTimeRemaining(new Date(Date.now() - 1000));
      expect(result.isExpired).toBe(true);
      expect(result.total).toBe(0);
    });

    it('should include hours for long durations', () => {
      const result = getTimeRemaining(new Date(Date.now() + 90 * 60 * 1000)); // 90 min
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(30);
    });
  });

  describe('percentage', () => {
    it('should calculate percentage', () => {
      expect(percentage(50, 100)).toBe(50);
      expect(percentage(1, 3)).toBe(33);
    });

    it('should return 0 for total of 0', () => {
      expect(percentage(5, 0)).toBe(0);
    });
  });
});
