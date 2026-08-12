/**
 * Typed application errors.
 *
 * Every error a route can raise deliberately is one of these. The central handler maps them to
 * a single response envelope, so the client has exactly one error shape to interpret and one
 * place to map a field path back to the row that produced it.
 */

export interface FieldError {
  /** Dotted path into the submitted body, e.g. `quantity` or `lines.2.unitPriceMinor`. */
  path: string;
  message: string;
  /** Present on finalize failures, so the interface can link to the offending line. */
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

/** 400 — the request body failed a schema or domain rule. */
export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR' as const;
}

/** 401 — no valid session. */
export class UnauthenticatedError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED' as const;

  constructor(message = 'Sign in to continue.') {
    super(message);
  }
}

/**
 * 404 — no such record, *or* the record belongs to another user.
 *
 * The two cases are deliberately indistinguishable. A 403 would confirm that an identifier
 * exists, which leaks the shape of other users' data across an enumerable key space.
 */
export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND' as const;

  constructor(message = 'Not found.') {
    super(message);
  }
}

/**
 * 403 — the request is refused outright, not because of the document's state.
 *
 * Distinct from CONFLICT on purpose. The client answers a conflict by refreshing, on the assumption
 * the document changed underneath it; a blocked cross-origin request has nothing to refresh, and
 * offering a Refresh action for it is actively misleading.
 */
export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN' as const;
}

/** 409 — rejected by a lifecycle or currency-lock rule. */
export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT' as const;
}

/** 422 — the request is well-formed but the document is not in a state that permits it. */
export class PreconditionFailedError extends AppError {
  readonly status = 422;
  readonly code = 'PRECONDITION_FAILED' as const;
}
