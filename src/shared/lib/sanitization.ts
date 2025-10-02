// Input sanitization utilities for security
// Prevents XSS and other injection attacks

/**
 * Sanitizes HTML content by removing potentially dangerous tags and attributes
 * @param input - The input string to sanitize
 * @returns Sanitized string safe for display
 */
export const sanitizeHtml = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove javascript: protocols
    .replace(/javascript:/gi, '')
    // Remove on* event handlers
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove data: protocols (except safe image types)
    .replace(/data:(?!image\/(png|jpg|jpeg|gif|svg))/gi, '')
    // Remove vbscript: protocols
    .replace(/vbscript:/gi, '')
    // Remove iframe tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove object tags
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    // Remove embed tags
    .replace(/<embed\b[^<]*>/gi, '')
    // Remove applet tags
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '')
    // Remove form tags
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    // Remove input tags
    .replace(/<input\b[^<]*>/gi, '')
    // Remove textarea tags
    .replace(/<textarea\b[^<]*(?:(?!<\/textarea>)<[^<]*)*<\/textarea>/gi, '')
    // Remove select tags
    .replace(/<select\b[^<]*(?:(?!<\/select>)<[^<]*)*<\/select>/gi, '')
    // Remove button tags
    .replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, '')
    // Remove link tags with javascript
    .replace(/<a\b[^>]*href\s*=\s*["']javascript:[^"']*["'][^>]*>.*?<\/a>/gi, '')
    // Remove style attributes with javascript
    .replace(/\sstyle\s*=\s*["'][^"']*javascript:[^"']*["']/gi, '')
    // Remove meta refresh
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi, '')
    // Remove base tags
    .replace(/<base\b[^>]*>/gi, '')
    // Remove link tags
    .replace(/<link\b[^>]*>/gi, '')
    // Remove style tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove any remaining dangerous attributes
    .replace(/\s(on\w+|javascript:|vbscript:|data:|livescript:)[^>\s]*/gi, '')
    // Trim whitespace
    .trim();
};

/**
 * Sanitizes plain text input by removing control characters and limiting length
 * @param input - The input string to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export const sanitizeText = (input: string, maxLength: number = 1000): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Trim and limit length
    .trim()
    .substring(0, maxLength);
};

/**
 * Sanitizes email input (for real-time input, allows partial emails)
 * @param email - Email string to sanitize
 * @returns Sanitized email (allows partial input for typing)
 */
export const sanitizeEmail = (email: string): string => {
  if (typeof email !== 'string') {
    return '';
  }

  // For real-time input, just remove dangerous characters but allow partial emails
  return email
    .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
    .substring(0, 254); // Limit length
};

/**
 * Validates email input (for form submission)
 * @param email - Email string to validate
 * @returns Sanitized email or empty string if invalid
 */
export const validateEmail = (email: string): string => {
  if (typeof email !== 'string') {
    return '';
  }

  const sanitized = email.trim().toLowerCase();
  
  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(sanitized)) {
    return '';
  }

  // Additional length check
  if (sanitized.length > 254) {
    return '';
  }

  return sanitized;
};

/**
 * Sanitizes numeric input
 * @param input - Input to sanitize
 * @param allowDecimals - Whether to allow decimal numbers
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Sanitized number or 0 if invalid
 */
export const sanitizeNumber = (
  input: string | number, 
  allowDecimals: boolean = true, 
  min?: number, 
  max?: number
): number => {
  if (typeof input === 'number') {
    if (isNaN(input) || !isFinite(input)) {
      return 0;
    }
  } else if (typeof input === 'string') {
    // Remove non-numeric characters except decimal point and minus sign
    const cleaned = input.replace(/[^\d.-]/g, '');
    const parsed = allowDecimals ? parseFloat(cleaned) : parseInt(cleaned, 10);
    
    if (isNaN(parsed) || !isFinite(parsed)) {
      return 0;
    }
    
    input = parsed;
  } else {
    return 0;
  }

  // Apply min/max constraints
  if (min !== undefined && input < min) {
    return min;
  }
  if (max !== undefined && input > max) {
    return max;
  }

  return input;
};

/**
 * Sanitizes URL input
 * @param url - URL string to sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export const sanitizeUrl = (url: string): string => {
  if (typeof url !== 'string') {
    return '';
  }

  const sanitized = url.trim();
  
  // Only allow http, https, and relative URLs
  const urlRegex = /^(https?:\/\/|\/|\.\/|\.\.\/)/i;
  
  if (!urlRegex.test(sanitized)) {
    return '';
  }

  // Remove javascript: and other dangerous protocols
  if (sanitized.toLowerCase().includes('javascript:') || 
      sanitized.toLowerCase().includes('vbscript:') ||
      sanitized.toLowerCase().includes('data:')) {
    return '';
  }

  return sanitized;
};

/**
 * Sanitizes team name input
 * @param teamName - Team name to sanitize
 * @returns Sanitized team name
 */
export const sanitizeTeamName = (teamName: string): string => {
  if (typeof teamName !== 'string') {
    return '';
  }

  return teamName
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Trim and limit length
    .trim()
    .substring(0, 100);
};

/**
 * Sanitizes user input for database queries (prevents SQL injection)
 * @param input - Input to sanitize
 * @returns Sanitized string safe for database queries
 */
export const sanitizeForDatabase = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove SQL injection patterns - use character class instead of alternation
    .replace(/[';\\*%+\-<>=()[\]{}^$?!~`|]/g, '')
    // Remove SQL comment patterns
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim whitespace
    .trim()
    .substring(0, 255);
};

/**
 * Comprehensive sanitization for user input
 * @param input - Input to sanitize
 * @param type - Type of sanitization to apply
 * @returns Sanitized input
 */
export const sanitizeInput = (input: string, type: 'html' | 'text' | 'email' | 'number' | 'url' | 'team' | 'database' = 'text'): string => {
  switch (type) {
    case 'html':
      return sanitizeHtml(input);
    case 'email':
      return sanitizeEmail(input);
    case 'number':
      return sanitizeNumber(input).toString();
    case 'url':
      return sanitizeUrl(input);
    case 'team':
      return sanitizeTeamName(input);
    case 'database':
      return sanitizeForDatabase(input);
    case 'text':
    default:
      return sanitizeText(input);
  }
};

/**
 * Validates and sanitizes form data
 * @param data - Form data object
 * @param schema - Validation schema
 * @returns Sanitized and validated data
 */
export const sanitizeFormData = <T extends Record<string, any>>(
  data: T, 
  schema: Record<keyof T, 'html' | 'text' | 'email' | 'number' | 'url' | 'team' | 'database'>
): T => {
  const sanitized = {} as T;
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeInput(value, schema[key as keyof T] || 'text') as T[keyof T];
    } else {
      sanitized[key as keyof T] = value;
    }
  }
  
  return sanitized;
};
