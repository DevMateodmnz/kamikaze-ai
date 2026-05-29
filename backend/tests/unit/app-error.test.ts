/**
 * Unit Tests for AppError
 */

import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, ValidationError, UnauthorizedError } from '../../src/utils/app-error.js';

describe('AppError', () => {
  it('should create error with default values', () => {
    const error = new AppError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.name).toBe('AppError');
  });

  it('should create error with custom status code and code', () => {
    const error = new AppError('Not found', { statusCode: 404, code: 'NOT_FOUND' });
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('should be instance of Error', () => {
    const error = new AppError('Test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  it('should create 404 error with resource name', () => {
    const error = new NotFoundError('Customer');
    expect(error.message).toBe('Customer not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('ValidationError', () => {
  it('should create 400 validation error', () => {
    const error = new ValidationError('Invalid phone number');
    expect(error.message).toBe('Invalid phone number');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

describe('UnauthorizedError', () => {
  it('should create 401 unauthorized error', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });
});
