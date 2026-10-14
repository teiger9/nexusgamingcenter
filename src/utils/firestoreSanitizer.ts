/**
 * Nexus Gaming Center - Firestore Data Sanitizer & Validation Utilities
 * Enforces zero-undefined writes, strict normalization, and field constraints.
 */

/**
 * Deeply sanitizes any object or array to ensure NO `undefined` values are ever
 * sent to Firestore, which would trigger "Unsupported field value: undefined".
 * - Omits undefined properties in objects.
 * - Converts undefined elements in arrays to null (or filters if appropriate).
 * - Preserves Date objects, booleans, numbers, and non-empty strings.
 */
export function cleanForFirestore<T extends Record<string, any>>(data: T): Partial<T> {
  if (data === null || data === undefined) {
    return {} as Partial<T>;
  }

  const sanitized: any = {};
  for (const key of Object.keys(data)) {
    const val = (data as any)[key];

    if (val === undefined) {
      continue; // Strictly omit undefined
    } else if (Array.isArray(val)) {
      sanitized[key] = val.map((item) => {
        if (item === undefined) return null;
        if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
          return cleanForFirestore(item);
        }
        return item;
      });
    } else if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      sanitized[key] = cleanForFirestore(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized as Partial<T>;
}

/**
 * Reserved words that cannot be claimed as GamerTags
 */
export const RESERVED_GAMER_TAGS = new Set([
  'admin',
  'administrator',
  'nexus',
  'nexusgaming',
  'nexusadmin',
  'staff',
  'mod',
  'moderator',
  'system',
  'root',
  'superadmin',
  'support',
  'official',
  'null',
  'undefined',
  'guest',
  'anonymous',
  'referee',
  'arena',
]);

/**
 * Normalizes and validates a GamerTag / Nexus username:
 * - 3 to 20 characters
 * - Letters, digits, underscores, hyphens, periods
 * - Rejects reserved words
 * - Normalized lowercase format for lookups
 */
export function normalizeGamerTag(rawTag: string): {
  isValid: boolean;
  displayTag: string;
  normalizedTag: string;
  error?: string;
} {
  const displayTag = (rawTag || '').trim();
  const normalizedTag = displayTag.toLowerCase();

  if (!displayTag) {
    return {
      isValid: false,
      displayTag: '',
      normalizedTag: '',
      error: 'Username is required.',
    };
  }

  if (displayTag.length < 3) {
    return {
      isValid: false,
      displayTag,
      normalizedTag,
      error: 'Username must be at least 3 characters long.',
    };
  }

  if (displayTag.length > 20) {
    return {
      isValid: false,
      displayTag,
      normalizedTag,
      error: 'Username cannot exceed 20 characters.',
    };
  }

  const validCharRegex = /^[a-zA-Z0-9_\-\.]+$/;
  if (!validCharRegex.test(displayTag)) {
    return {
      isValid: false,
      displayTag,
      normalizedTag,
      error: 'Username can only contain letters, numbers, underscores (_), hyphens (-), and dots (.).',
    };
  }

  if (RESERVED_GAMER_TAGS.has(normalizedTag)) {
    return {
      isValid: false,
      displayTag,
      normalizedTag,
      error: `Username "${displayTag}" is reserved. Please choose a different GamerTag.`,
    };
  }

  return {
    isValid: true,
    displayTag,
    normalizedTag,
  };
}

/**
 * Normalizes phone numbers:
 * - Strips whitespace, brackets, hyphens
 * - Checks length if provided
 */
export function normalizePhoneNumber(rawPhone?: string): {
  isValid: boolean;
  formatted: string;
  error?: string;
} {
  if (!rawPhone || !rawPhone.trim()) {
    return { isValid: true, formatted: '' };
  }

  const cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');

  // Must contain only digits and optional leading '+'
  const phoneRegex = /^\+?[0-9]{7,15}$/;
  if (!phoneRegex.test(cleaned)) {
    return {
      isValid: false,
      formatted: cleaned,
      error: 'Please enter a valid phone number (7-15 digits).',
    };
  }

  return { isValid: true, formatted: cleaned };
}

/**
 * Validates standard email address format
 */
export function validateEmail(email: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) {
    return { isValid: false, normalized: '', error: 'Email address is required.' };
  }

  // Standard RFC 5322 compatible simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(normalized)) {
    return { isValid: false, normalized, error: 'Please enter a valid email address.' };
  }

  return { isValid: true, normalized };
}

/**
 * Validates password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (!password) {
    return { isValid: false, error: 'Password is required.' };
  }

  if (password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters long.' };
  }

  return { isValid: true };
}
