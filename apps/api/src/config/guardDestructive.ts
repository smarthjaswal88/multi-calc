const OVERRIDE = 'I_KNOW_THIS_WRITES_TO_PRODUCTION';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

interface Target {
  host: string;
  description: string;
  isLocal: boolean;
}

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

export function guardDestructive(scriptName: string): void {
  const target = describeTarget(process.env.DATABASE_URL);
  const overridden = process.env[OVERRIDE] === '1';

  if (target.isLocal && process.env.NODE_ENV !== 'production') {
    return;
  }

  if (overridden) {
    console.warn(
      `\n⚠  ${scriptName} is writing to a NON-LOCAL database because ${OVERRIDE}=1 is set.` +
        `\n   Target: ${target.description}\n`,
    );
    return;
  }

  const reason = target.isLocal
    ? `NODE_ENV is "production"`
    : `the database host is "${target.host || 'unknown'}", which is not this machine`;

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
