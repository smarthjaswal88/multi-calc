export interface FieldError {
  path: string;
  message: string;

  lineId?: string;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'PRECONDITION_FAILED'
  | 'INTERNAL_ERROR';

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCode;
  readonly fields: FieldError[];

  constructor(message: string, fields: FieldError[] = []) {
    super(message);
    this.name = new.target.name;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR' as const;
}

export class UnauthenticatedError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED' as const;

  constructor(message = 'Sign in to continue.') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND' as const;

  constructor(message = 'Not found.') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN' as const;
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT' as const;
}

export class PreconditionFailedError extends AppError {
  readonly status = 422;
  readonly code = 'PRECONDITION_FAILED' as const;
}
