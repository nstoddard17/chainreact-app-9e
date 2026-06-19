/**
 * Internal ChainReact CLI — tiny, dependency-free argument parser.
 *
 * Deliberately minimal (no commander/yargs — the repo ships neither). It splits
 * argv into: the command, an optional subcommand, positional args, and boolean /
 * `--key=value` flags. Pure + deterministic so it is fully unit-testable.
 *
 * Grammar (loose by design — commands validate their own needs):
 *   chainreact <command> [subcommand] [positionals...] [--flag] [--key=value]
 *
 * `--` is NOT treated specially here (npm strips the first `--`); everything after
 * the command is parsed uniformly.
 */

export interface ParsedArgs {
  /** First non-flag token, e.g. "status" | "verify" | "mcp" | "app". "" if none. */
  readonly command: string;
  /** Second non-flag token when present (e.g. "smoke" for `mcp smoke`). */
  readonly subcommand: string | null;
  /** Remaining non-flag tokens after command/subcommand. */
  readonly positionals: readonly string[];
  /** Boolean flags (`--run`) and valued flags (`--key=value`). */
  readonly flags: Readonly<Record<string, string | boolean>>;
}

const KNOWN_SUBCOMMAND_PARENTS: ReadonlySet<string> = new Set(["mcp", "app", "smoke"]);

/** Parse a raw argv tail (already stripped of node + script path). Pure. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionalTokens: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (const raw of argv) {
    const token = typeof raw === "string" ? raw : "";
    if (token.startsWith("--")) {
      const body = token.slice(2);
      if (body.length === 0) continue; // bare "--" — ignore
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        flags[body] = true;
      }
    } else if (token.startsWith("-") && token.length > 1) {
      // Short boolean flag(s): "-h" → {h:true}. Combined "-ab" → {a:true,b:true}.
      for (const ch of token.slice(1)) flags[ch] = true;
    } else if (token.length > 0) {
      positionalTokens.push(token);
    }
  }

  const command = positionalTokens[0] ?? "";
  let subcommand: string | null = null;
  let rest = positionalTokens.slice(1);

  // Only treat the second token as a subcommand for grouped commands (mcp/app);
  // for flat commands the second token is a positional (e.g. `app validate slack`
  // is command=app, subcommand=validate, positional=slack).
  if (KNOWN_SUBCOMMAND_PARENTS.has(command) && rest.length > 0) {
    subcommand = rest[0] ?? null;
    rest = rest.slice(1);
  }

  return { command, subcommand, positionals: rest, flags };
}

/** True when the user asked for help (`--help`/`-h`, or no command at all). */
export function wantsHelp(parsed: ParsedArgs): boolean {
  return parsed.flags.help === true || parsed.flags.h === true || parsed.command === "";
}
