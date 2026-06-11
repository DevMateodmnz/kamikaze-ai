import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/app-error.js';

// Fastify error handler signature
type ErrorHandler = (
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) => void;

export const errorHandler: ErrorHandler = (error, _request, reply) => {
  // Log error
  _request.log.error({
    err: error,
    message: error.message,
    stack: error.stack,
  });

  // Handle known application errors
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      error: true,
      code: error.code,
      message: error.message,
    });
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError' || error.name === 'ZodError') {
    void reply.status(400).send({
      error: true,
      code: 'VALIDATION_ERROR',
      message: error.message,
    });
    return;
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    void reply.status(400).send({
      error: true,
      code: 'DATABASE_ERROR',
      message: 'A database error occurred',
    });
    return;
  }

  // PrismaClientInitializationError (P1000, P1001, P1003, etc.) —
  // the client cannot reach the database (bad credentials, host down, etc.).
  // Return 503 so callers can distinguish infrastructure failures from app bugs.
  if (error.name === 'PrismaClientInitializationError') {
    void reply.status(503).send({
      error: true,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection failed. Check DATABASE_URL, credentials, and that PostgreSQL is running.',
    });
    return;
  }

  // Generic error for unknown cases
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  void reply.status(statusCode).send({
    error: true,
    code: 'INTERNAL_ERROR',
    message:
      process.env.NODE_ENV === 'production' ? 'An internal error occurred' : error.message,
  });
};
