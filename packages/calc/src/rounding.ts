export const ROUNDING_POLICY = {
  mode: 'half-away-from-zero',
  appliedAt: ['discount-amount', 'tax-amount'],
  description:
    "Each line is rounded to the currency's minor unit after the discount and again after " +
    'tax. Document totals are the sum of those rounded line amounts, so they always match ' +
    'what you see per line.',
} as const;

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

  const rounded = remainder * 2 >= b ? quotient + 1 : quotient;

  return negative ? -rounded : rounded;
}

export const BASIS_POINTS_SCALE = 10_000;

export function applyPercentBp(amountMinor: number, basisPoints: number): number {
  return divideRound(amountMinor * basisPoints, BASIS_POINTS_SCALE);
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}
