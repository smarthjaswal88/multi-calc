export {
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  getCurrency,
  isCurrencyCode,
  minorUnitsPerMajor,
  type Currency,
  type CurrencyCode,
} from './currency.js';

export {
  BASIS_POINTS_SCALE,
  ROUNDING_POLICY,
  applyPercentBp,
  basisPointsToPercent,
  divideRound,
  percentToBasisPoints,
} from './rounding.js';

export {
  MAX_AMOUNT_MINOR,
  MAX_QUANTITY,
  PG_INT4_MAX,
  MoneyParseError,
  formatMoney,
  formatPercentBp,
  fromMinor,
  parseMoney,
  toDecimalString,
  toInputString,
  toMinor,
} from './money.js';

export { computeLine } from './line.js';

export {
  assertTotalsConsistent,
  computeDocument,
  exceedsStorageBounds,
  sumLineResults,
  type ComputedDocument,
} from './document.js';

export {
  VALIDATION_MESSAGES,
  credentialsSchema,
  currencyCodeSchema,
  dateStringSchema,
  discountExceedsSubtotalMessage,
  documentMetadataPatchSchema,
  documentMetadataSchema,
  finalizePriceMessage,
  finalizeQuantityMessage,
  lineInputSchema,
  reportRangeSchema,
  validateFinalizePreconditions,
  type FinalizeIssue,
} from './schemas.js';

export type {
  DiscountType,
  DocumentInput,
  DocumentStatus,
  DocumentTotals,
  LineInput,
  LineResult,
} from './types.js';
