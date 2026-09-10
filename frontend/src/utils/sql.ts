/**
 * Presentation-only SQL helpers. Nothing here rewrites, validates or executes
 * a statement -- the server owns all three. These exist so the review UI can
 * say something honest about a query before the user decides to run it.
 */

const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_$]*";
const QUALIFIED = `(?:"${IDENTIFIER}"|\`${IDENTIFIER}\`|${IDENTIFIER})(?:\\.(?:"${IDENTIFIER}"|\`${IDENTIFIER}\`|${IDENTIFIER}))*`;

/**
 * Best-effort list of the tables a SELECT reads, pulled from FROM and JOIN
 * clauses. Deliberately conservative: it strips comments and string literals
 * first, skips subquery openers, and returns an empty list when it can't tell.
 * The UI treats an empty list as "no claim", never as "touches nothing".
 */
export function extractSqlTables(sql: string): string[] {
  const cleaned = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, " ");

  const pattern = new RegExp(`\\b(?:from|join)\\s+(${QUALIFIED})`, "gi");
  const found: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    const name = match[1].replace(/["`]/g, "");
    // `FROM (SELECT ...)` and CTE references land here too; the bare word
    // filter below is enough to keep obvious noise out.
    if (/^(select|values|lateral|unnest)$/i.test(name)) continue;
    if (!found.includes(name)) found.push(name);
  }

  return found;
}

/** How the connection's db_type should be named in the review header. */
export function dialectLabel(dbType?: string): string {
  switch (dbType) {
    case "postgres":
      return "PostgreSQL";
    case "mysql":
      return "MySQL";
    default:
      return "SQL";
  }
}

/** Example questions offered on an empty thread. Concrete and operational --
 *  they show the shape of a good question rather than advertising the product. */
export const EXAMPLE_QUESTIONS = [
  "What were our top-selling products last month?",
  "Which customers haven't ordered in 90 days?",
  "Show revenue by month this year.",
  "Which products are running low on stock?",
];
