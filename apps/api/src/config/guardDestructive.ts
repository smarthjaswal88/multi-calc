/**
 * Refuse to run a destructive script against anything but a local database.
 *
 * THE HAZARD
 * ----------
 * Three scripts write to whatever `DATABASE_URL` points at:
 *
 *   - `prisma/seed.ts` deletes the demo user's documents and recreates the account with a
 *     guessable password (`demo1234`)
 *   - `scripts/verify-constraints.ts` inserts probe rows
 *   - `scripts/verify-api.ts` creates and deletes users
 *
 * The README's quickstart tells a reader to run `npm run db:seed`. If `DATABASE_URL` happened to be
 * the production database, that one command would plant a guessable credential on production and
 * delete that user's documents.
 *
 * WHY THIS CHECKS THE HOST, NOT NODE_ENV
 * --------------------------------------
 * The first version of this guard refused only when `NODE_ENV === 'production'`, and review caught
 * that it keyed on the one signal that was never wrong. The actual hazard was a developer machine —
 * `NODE_ENV=development`, the default — pointed at a hosted database. That is precisely the case a
 * NODE_ENV check waves through. It failed **open** on the only scenario that mattered.
 *
 * An earlier docstring argued against inspecting the URL because sniffing for "production-looking"
 * hostnames "misses a production database on an unfamiliar host". That reasoning is sound and its
 * conclusion was backwards: the answer is not to guess which hosts are dangerous, but to allow only
 * the hosts known to be safe. A local database is identifiable with certainty; a remote one cannot
 * be cleared by inspection. So this allowlists loopback and refuses everything else.
 *
 * That fails **closed**. A hosted URL is refused whatever NODE_ENV says, and the escape hatch is
 * deliberately awkward to type so it cannot be reached by muscle memory.
 */

const OVERRIDE = 'I_KNOW_THIS_WRITES_TO_PRODUCTION';

/** Hostnames that are unambiguously this machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

interface Target {
  host: string;
  description: string;
  isLocal: boolean;
}

/** Parse the connection target, with credentials stripped before anything is logged. */
function describeTarget(url: string | undefined): Target {
  if (!url) {
    return { host: '', description: '(DATABASE_URL is not set)', isLocal: false };
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return {
      host,
      description: `${host}${parsed.pathname}`,
      isLocal: LOCAL_HOSTS.has(host),
    };
  } catch {
    return { host: '', description: '(unparseable DATABASE_URL)', isLocal: false };
  }
}

/**
 * Call before touching the database. Exits rather than throwing, because every caller is a script
 * whose only sensible response is to stop.
 */
export function guardDestructive(scriptName: string): void {
  const target = describeTarget(process.env.DATABASE_URL);
  const overridden = process.env[OVERRIDE] === '1';

  if (target.isLocal && process.env.NODE_ENV !== 'production') {
    return;
  }

  if (overridden) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n⚠  ${scriptName} is writing to a NON-LOCAL database because ${OVERRIDE}=1 is set.` +
        `\n   Target: ${target.description}\n`,
    );
    return;
  }

  const reason = target.isLocal
    ? `NODE_ENV is "production"`
    : `the database host is "${target.host || 'unknown'}", which is not this machine`;

  // eslint-disable-next-line no-console
  console.error(
    `\n${scriptName} refuses to run: ${reason}.\n\n` +
      `  This script writes to the database — it deletes rows and creates accounts with known\n` +
      `  passwords. It only runs against a local database.\n\n` +
      `  Target would have been: ${target.description}\n\n` +
      `  Start the local Postgres and point DATABASE_URL at it:\n` +
      `      docker compose up -d\n` +
      `      DATABASE_URL="postgresql://postgres:postgres@localhost:5432/multicalc?schema=public"\n\n` +
      `  If you genuinely mean to write to this database, set ${OVERRIDE}=1.\n`,
  );

  process.exit(1);
}
