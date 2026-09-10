/* SQL keywords worth colouring. Kept to the shapes that actually help a
   reviewer skim a statement -- clause boundaries, joins, set operations and
   the modifiers that change what a query touches. */
const KEYWORDS = new Set(
  `select from where group by order having limit offset join inner left right full outer cross on
   as and or not in is null like ilike between exists union all distinct case when then else end
   with asc desc using natural over partition window filter fetch next rows only lateral
   count sum avg min max coalesce nullif cast extract date_trunc now current_date current_timestamp
   interval integer text varchar boolean numeric decimal timestamp true false`
    .split(/\s+/)
    .filter(Boolean)
);

export type TokenKind = "keyword" | "string" | "number" | "comment" | "punct" | "plain";

export interface Token {
  kind: TokenKind;
  text: string;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: "text-info font-medium",
  string: "text-accent-text",
  number: "text-warn",
  comment: "text-faint italic",
  punct: "text-muted",
  plain: "text-primary",
};

/**
 * Minimal SQL tokeniser for read-only display. It is deliberately not a
 * parser: it never rewrites the SQL, and anything it fails to classify falls
 * through as plain text, so the statement always renders verbatim.
 */
export function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)|([(),;.*=<>!+\-/|[\]{}])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "plain", text: sql.slice(lastIndex, match.index) });
    }
    const [text, comment, str, num, word, punct] = match;
    if (comment) tokens.push({ kind: "comment", text });
    else if (str) tokens.push({ kind: "string", text });
    else if (num) tokens.push({ kind: "number", text });
    else if (word) {
      tokens.push({ kind: KEYWORDS.has(word.toLowerCase()) ? "keyword" : "plain", text });
    } else if (punct) tokens.push({ kind: "punct", text });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < sql.length) tokens.push({ kind: "plain", text: sql.slice(lastIndex) });
  return tokens;
}
