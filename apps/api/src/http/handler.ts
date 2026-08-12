import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route so a rejected promise reaches the error middleware.
 *
 * Express 4 does not await handlers, so an unwrapped `async` route that throws produces an
 * unhandled rejection and a request that hangs until the client gives up. Every async route in
 * this service goes through here.
 */
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
