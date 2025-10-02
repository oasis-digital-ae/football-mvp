// Comprehensive error handling system
import { logger } from './logger';

// Custom error types
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500);
    logger.error('Database error:', originalError);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    if (field) {
      this.message = `${field}: ${message}`;
    }
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_LOGIC_ERROR', 422);
  }
}

export class ExternalApiError extends AppError {
  constructor(message: string, service: string) {
    super(`${service}: ${message}`, 'EXTERNAL_API_ERROR', 502);
  }
}

// Error handler utility
export class ErrorHandler {
  static handle(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      logger.error('Unhandled error:', error);
      return new AppError(error.message, 'UNKNOWN_ERROR', 500, false);
    }

    logger.error('Unknown error type:', error);
    return new AppError('An unknown error occurred', 'UNKNOWN_ERROR', 500, false);
  }

  static isOperational(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }
}

// Async error wrapper for React components
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string = 'Unknown'
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = ErrorHandler.handle(error);
      logger.error(`Error in ${context}:`, appError);
      throw appError;
    }
  }) as T;
}

// Database operation wrapper with error handling
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      throw new DatabaseError(`Database operation failed in ${context}: ${error.message}`, error);
    }
    throw new DatabaseError(`Database operation failed in ${context}`, new Error(String(error)));
  }
}

// API operation wrapper with error handling
export async function withApiErrorHandling<T>(
  operation: () => Promise<T>,
  service: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      throw new ExternalApiError(error.message, service);
    }
    throw new ExternalApiError(String(error), service);
  }
}

// Validation helper
export function validateRequired(value: any, fieldName: string): void {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
}

export function validatePositiveNumber(value: number, fieldName: string): void {
  if (typeof value !== 'number' || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, fieldName);
  }
}

export function validateStringLength(value: string, minLength: number, maxLength: number, fieldName: string): void {
  if (typeof value !== 'string' || value.length < minLength || value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be between ${minLength} and ${maxLength} characters`, fieldName);
  }
}

// Simple error boundary - will be implemented in a separate file
export interface ErrorBoundaryState {
  hasError: boolean;
  error?: AppError;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: AppError }>;
}

// ErrorBoundary is implemented in src/shared/components/ErrorBoundary.tsx