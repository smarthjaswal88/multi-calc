/**
 * The rounding policy, in one place.
 *
 * POLICY
 * ------
 * Round half away from zero, to the currency's minor unit, at exactly two points per line:
 * after computing the discount amount, and after computing the tax amount.
 *
 * Because every monetary value is held as an integer number of minor units, "round to the
 * currency's minor unit" is the same operation as "round to an integer". That is what makes
 * the arithmetic in `line.ts` currency-agnostic: the exponent matters when parsing and
 * formatting a value, not when computing with one.
 *
 * Half away from zero is chosen over banker's rounding because it matches the arithmetic a
 * reader performs by hand when checking a quote. Predictability to a human outweighs the
 * marginal statistical bias banker's rounding avoids, in a document someone signs.
 */

export const ROUNDING_POLICY = {
  mode: 'half-away-from-zero',
  appliedAt: ['discount-amount', 'tax-amount'],
  description:
    "Each line is rounded to the currency's minor unit after the discount and again after " +
    'tax. Document totals are the sum of those rounded line amounts, so they always match ' +
    'what you see per line.',
} as const;

/**
 * Exact integer division with half-away-from-zero rounding.
 *
 * Uses `%` and subtraction rather than floating-point division, so the result is exact for
 * any operands inside the safe-integer range. Schemas bound inputs well below that limit.
 */
export function divideRound(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error('divideRound requires integer operands');
  }
  if (denominator === 0) {
    throw new Error('divideRound: division by zero');
  }

  const negative = numerator < 0 !== denominator < 0;
  const a = Math.abs(numerator);
  const b = Math.abs(denominator);

  const remainder = a % b;
  const quotient = (a - remainder) / b;

  // Half away from zero: a remainder of exactly half rounds up in magnitude.
  const rounded = remainder * 2 >= b ? quotient + 1 : quotient;

  return negative ? -rounded : rounded;
}

/** One hundred percent, expressed in basis points. */
export const BASIS_POINTS_SCALE = 10_000;

/**
 * Apply a percentage held in basis points to an integer minor-unit amount, rounding once.
 * 825 basis points is 8.25%.
 */
export function applyPercentBp(amountMinor: number, basisPoints: number): number {
  return divideRound(amountMinor * basisPoints, BASIS_POINTS_SCALE);
}

/** Convert a human percentage (8.25) to basis points (825). Rounds to the nearest bp. */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/** Convert basis points (825) back to a human percentage (8.25). */
export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}
