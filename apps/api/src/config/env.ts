/**
 * Environment configuration, validated once at boot.
 *
 * Failing here means the process never starts. The alternative — discovering a missing
 * JWT_SECRET when the first user tries to log in — turns a deployment mistake into a runtime
 * incident.
 */

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((value) => value !== 'change-me', {
      message: 'JWT_SECRET is still the placeholder value',
    }),
  /** Exact origin allowed by CORS. Comma-separate to allow more than one. */
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  /** Days a session cookie remains valid. */
  SESSION_DAYS: z.coerce.number().int().positive().max(90).default(7),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  /**
   * Normalised to scheme://host[:port], the form the CSRF check compares against.
   *
   * A trailing slash in WEB_ORIGIN — easy to paste from a browser bar — would otherwise never match
   * an Origin header, 403-ing every mutation while CORS also silently stopped matching. Parsing
   * each entry through URL collapses that difference. An unparseable entry is kept verbatim so a
   * typo surfaces as a mismatch rather than vanishing from the allowlist.
   */
  webOrigins: raw.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return origin;
      }
    }),
} as const;

export type Env = typeof env;
