// Comprehensive input validation system
import React from 'react';
import { ValidationError } from './error-handling';
import { sanitizeInput, sanitizeFormData, validateEmail } from './sanitization';

// Validation rules
export interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Validator class
export class Validator<T> {
  private rules: Array<{ field: string; rule: ValidationRule<any> }> = [];

  addRule(field: string, rule: ValidationRule<any>): Validator<T> {
    this.rules.push({ field, rule });
    return this;
  }

  validate(value: T): ValidationResult {
    const errors: Record<string, string> = {};

    for (const { field, rule } of this.rules) {
      const fieldValue = (value as any)[field];
      if (!rule.validate(fieldValue)) {
        errors[field] = rule.message;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}

// Common validation rules
export const ValidationRules = {
  required: <T>(message: string = 'This field is required'): ValidationRule<T> => ({
    validate: (value: T) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    },
    message
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value: string) => value.length >= min,
    message: message || `Must be at least ${min} characters long`
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value: string) => value.length <= max,
    message: message || `Must be no more than ${max} characters long`
  }),

  email: (message: string = 'Must be a valid email address'): ValidationRule<string> => ({
    validate: (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message
  }),

  min: (min: number, message?: string): ValidationRule<number> => ({
    validate: (value: number) => value >= min,
    message: message || `Must be at least ${min}`
  }),

  max: (max: number, message?: string): ValidationRule<number> => ({
    validate: (value: number) => value <= max,
    message: message || `Must be no more than ${max}`
  }),

  positive: (message: string = 'Must be a positive number'): ValidationRule<number> => ({
    validate: (value: number) => value > 0,
    message
  }),

  integer: (message: string = 'Must be a whole number'): ValidationRule<number> => ({
    validate: (value: number) => Number.isInteger(value),
    message
  }),

  range: (min: number, max: number, message?: string): ValidationRule<number> => ({
    validate: (value: number) => value >= min && value <= max,
    message: message || `Must be between ${min} and ${max}`
  }),

  pattern: (regex: RegExp, message: string): ValidationRule<string> => ({
    validate: (value: string) => regex.test(value),
    message
  }),

  custom: <T>(validator: (value: T) => boolean, message: string): ValidationRule<T> => ({
    validate: validator,
    message
  })
};

// Specific validators for the application
export const AppValidators = {
  // User login validation
  login: new Validator<{
    email: string;
    password: string;
  }>()
    .addRule('email', ValidationRules.required('Email is required'))
    .addRule('email', ValidationRules.email())
    .addRule('password', ValidationRules.required('Password is required')),
  // User registration validation
  userRegistration: new Validator<{
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    birthday: string;
    country: string;
    phone: string;
    referredBy: string;
  }>()
    .addRule('email', ValidationRules.required('Email is required'))
    .addRule('email', ValidationRules.email())
    .addRule('password', ValidationRules.required('Password is required'))
    .addRule('password', ValidationRules.minLength(6, 'Password must be at least 6 characters'))
    .addRule('firstName', ValidationRules.required('First name is required'))
    .addRule('firstName', ValidationRules.minLength(2, 'First name must be at least 2 characters'))
    .addRule('lastName', ValidationRules.required('Last name is required'))
    .addRule('lastName', ValidationRules.minLength(2, 'Last name must be at least 2 characters'))
    .addRule('birthday', ValidationRules.required('Birthday is required'))
    .addRule('country', ValidationRules.required('Country is required'))
    .addRule('phone', ValidationRules.required('Phone number is required'))
    .addRule('referredBy', ValidationRules.required('Referral information is required'))
    .addRule('referredBy', ValidationRules.minLength(2, 'Referral name must be at least 2 characters')),

  // Share purchase validation (for modal - simplified)
  sharePurchaseModal: new Validator<{
    units: number;
    pricePerShare: number;
  }>()
    .addRule('units', ValidationRules.required('Number of shares is required'))
    .addRule('units', ValidationRules.positive('Must purchase at least 1 share'))
    .addRule('units', ValidationRules.integer('Must purchase whole shares only'))
    .addRule('units', ValidationRules.max(10000, 'Cannot purchase more than 10,000 shares at once'))
    .addRule('pricePerShare', ValidationRules.required('Price per share is required'))
    .addRule('pricePerShare', ValidationRules.positive('Price must be positive')),

  // Share purchase validation (full validation with club ID)
  sharePurchase: new Validator<{
    clubId: string;
    units: number;
    pricePerShare: number;
  }>()
    .addRule('clubId', ValidationRules.required('Club selection is required'))
    .addRule('clubId', ValidationRules.custom(
      (value: string) => !isNaN(parseInt(value)) && parseInt(value) > 0,
      'Invalid club selection'
    ))
    .addRule('units', ValidationRules.required('Number of shares is required'))
    .addRule('units', ValidationRules.positive('Must purchase at least 1 share'))
    .addRule('units', ValidationRules.integer('Must purchase whole shares only'))
    .addRule('units', ValidationRules.max(10000, 'Cannot purchase more than 10,000 shares at once'))
    .addRule('pricePerShare', ValidationRules.required('Price per share is required'))
    .addRule('pricePerShare', ValidationRules.positive('Price must be positive')),

  // Team ID validation
  teamId: new Validator<string>()
    .addRule('teamId', ValidationRules.required('Team ID is required'))
    .addRule('teamId', ValidationRules.custom(
      (value: string) => !isNaN(parseInt(value)) && parseInt(value) > 0,
      'Invalid team ID'
    )),

  // Market cap validation
  marketCap: new Validator<number>()
    .addRule('marketCap', ValidationRules.required('Market cap is required'))
    .addRule('marketCap', ValidationRules.positive('Market cap must be positive'))
    .addRule('marketCap', ValidationRules.max(1000000000, 'Market cap cannot exceed $1 billion')),

  // Share quantity validation
  shares: new Validator<number>()
    .addRule('shares', ValidationRules.required('Share quantity is required'))
    .addRule('shares', ValidationRules.min(0, 'Shares cannot be negative'))
    .addRule('shares', ValidationRules.integer('Shares must be whole numbers'))
    .addRule('shares', ValidationRules.max(10000000, 'Share quantity too large')),

  // Fixture validation
  fixture: new Validator<{
    homeTeamId: number;
    awayTeamId: number;
    kickoffAt: string;
    buyCloseAt: string;
  }>()    .addRule('homeTeamId', ValidationRules.required('Home team is required'))
    .addRule('homeTeamId', ValidationRules.positive('Invalid home team'))
    .addRule('awayTeamId', ValidationRules.required('Away team is required'))
    .addRule('awayTeamId', ValidationRules.positive('Invalid away team'))
    .addRule('kickoffAt', ValidationRules.required('Kickoff time is required'))
    .addRule('buyCloseAt', ValidationRules.required('Buy close time is required'))
};

// Validation helper functions
export function validateAndThrow<T>(validator: Validator<T>, data: T): void {
  const result = validator.validate(data);
  if (!result.isValid) {
    const errorMessage = Object.entries(result.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(', ');
    throw new ValidationError(errorMessage);
  }
}

// Enhanced validation with sanitization
export function validateAndSanitize<T>(validator: Validator<T>, data: T, sanitizationSchema?: Record<keyof T, 'html' | 'text' | 'email' | 'number' | 'url' | 'team' | 'database'>): { isValid: boolean; data: T; errors: Record<string, string> } {
  // First sanitize the data if schema is provided
  let sanitizedData = sanitizationSchema ? sanitizeFormData(data, sanitizationSchema) : data;
  
  // For email fields, use proper validation instead of just sanitization
  if (sanitizationSchema) {
    const enhancedData = { ...sanitizedData };
    for (const [key, type] of Object.entries(sanitizationSchema)) {
      if (type === 'email' && typeof enhancedData[key as keyof T] === 'string') {
        const validatedEmail = validateEmail(enhancedData[key as keyof T] as string);
        if (validatedEmail) {
          enhancedData[key as keyof T] = validatedEmail as T[keyof T];
        }
      }
    }
    sanitizedData = enhancedData;
  }
  
  // Then validate the sanitized data
  const result = validator.validate(sanitizedData);
  
  return {
    isValid: result.isValid,
    data: sanitizedData,
    errors: result.errors
  };
}

export function validateForm<T>(validator: Validator<T>, data: T): ValidationResult {
  return validator.validate(data);
}

// React hook for form validation
export function useValidation<T>(validator: Validator<T>, initialData: T) {
  const [data, setData] = React.useState<T>(initialData);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isValid, setIsValid] = React.useState(false);

  const validate = React.useCallback(() => {
    const result = validator.validate(data);
    setErrors(result.errors);
    setIsValid(result.isValid);
    return result;
  }, [data, validator]);

  const updateField = React.useCallback((field: keyof T, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const reset = React.useCallback(() => {
    setData(initialData);
    setErrors({});
    setIsValid(false);
  }, [initialData]);

  React.useEffect(() => {
    validate();
  }, [validate]);

  return {
    data,
    errors,
    isValid,
    updateField,
    reset,
    validate
  };
}
