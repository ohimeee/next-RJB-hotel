import { Pool, types } from "pg";

// DATE columns are calendar days, not instants. Left alone, node-postgres turns
// them into Dates in the server's local zone, which shifts a booking by one day
// for anyone west of Greenwich. Hand them over as the `YYYY-MM-DD` strings the
// rest of the app already speaks — see lib/dates.ts.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value) => value);

// TIMESTAMP columns have the same problem one level down. They are written by
// `now()`, so they are instants in the database's zone (UTC on Supabase), but
// they carry no offset — and node-postgres therefore reads them in the *Node
// server's* zone. A check-in stamped 08:12 UTC then renders as 8:12 AM for a
// developer in Manila when the guest actually arrived at 4:12 PM.
//
// Appending the offset that is really there is the whole fix: from here up,
// every timestamp is a correct instant, and lib/dates.ts renders it in the
// property's zone rather than the server's.
const TIMESTAMP_OID = 1114;
types.setTypeParser(TIMESTAMP_OID, (value) => new Date(`${value}Z`));

// NUMERIC already arrives as a string, and that is deliberate: parsing pesos
// into a float would reintroduce the rounding error lib/money.ts exists to
// avoid. Do not add a parser for it.

const connectionString = process.env.DATABASE_URL ?? "";

/** A URL pointing at this machine, rather than at Supabase. */
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);

/**
 * TLS settings for the connection.
 *
 * Local Postgres speaks plaintext over the loopback interface and has no
 * certificate to present, so TLS is off there. Supabase requires it.
 *
 * `rejectUnauthorized: false` encrypts the connection but does not verify who
 * is on the other end of it — enough to stop anyone reading the traffic, not
 * enough to prove the server is really Supabase. Set `DATABASE_CA_CERT` to
 * Supabase's certificate (Dashboard → Settings → Database → SSL certificate,
 * pasted as one line) to turn full verification on.
 */
const ssl = isLocal
  ? undefined
  : process.env.DATABASE_CA_CERT
    ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
    : { rejectUnauthorized: false };

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    ssl,
    // Deliberately small. This is per developer, and a shared Supabase project
    // has one connection budget for the whole team — four people running `npm
    // run dev` at ten connections each is how everyone starts seeing "too many
    // clients". Dev also reloads the module tree constantly, so a stray pool
    // would otherwise keep its sockets.
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

/**
 * Every read and write goes through here. Values are always passed as `$1`
 * parameters — never interpolated into the SQL string — so user input cannot
 * change the shape of a query.
 */
export const query = async <T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const result = await pool.query(text, params);
  return result.rows as T[];
};

/** First row, or null. For lookups by primary key. */
export const queryOne = async <T>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> => {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
};

/**
 * Run `fn` against a single client inside one transaction.
 *
 * For the writes that touch two rows at once — check-in and check-out each move
 * a reservation *and* a room's housekeeping status, and a crash between them
 * would leave a room occupied by a guest who has left. `query()` above takes a
 * fresh client from the pool per call, so it cannot express that; this hands
 * the same client to every statement in `fn`.
 *
 * The client is released in `finally` whatever happens. Leaking one would
 * shrink the pool by a connection each time an action failed.
 */
export const withTransaction = async <T>(
  fn: (
    run: <R>(text: string, params?: unknown[]) => Promise<R[]>,
  ) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await fn(async <R>(text: string, params: unknown[] = []) => {
      const rows = await client.query(text, params);
      return rows.rows as R[];
    });

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
