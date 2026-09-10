export type ComposerMode = "query" | "message";

/**
 * Resolves what pressing Enter will actually do, mirroring the server:
 *   personal            -> always a Phantom Query question
 *   team, "/..."        -> a Phantom Query question
 *   team, "//..."       -> a literal team message beginning with "/"
 *   team, anything else -> a team message
 */
export function resolveComposerMode(
  raw: string,
  workspaceType: "personal" | "team"
): ComposerMode {
  if (workspaceType === "personal") return "query";
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("//")) return "message";
  if (trimmed.startsWith("/")) return "query";
  return "message";
}
