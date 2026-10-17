import { SHORT_CODE_REGEX, type InboundMessage, type InboundResult } from "@/contracts";

// Inbound command grammar (CONTRACTS §3.10). Pure: no I/O, no clock.

export type InboundCommand = InboundResult["command"];
export type ParsedCommand = { command: InboundCommand; short_code: string | null };

const COMMAND_WORDS: Record<string, InboundCommand> = {
  yes: "accept",
  accept: "accept",
  no: "decline",
  decline: "decline",
  join: "join",
  stop: "stop",
  help: "help",
};

// Trim whitespace and punctuation (including curly quotes) from both ends of a token.
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function tokens(text: string | null): string[] {
  return (text ?? "")
    .split(/\s+/)
    .map((token) => token.replace(EDGE_PUNCTUATION, ""))
    .filter((token) => token.length > 0);
}

// D-039 (CONTRACTS §3.10): opt-out words are honored anywhere in a short message. A missed opt-out is the worse failure;
// an accidental opt-out is undone by texting JOIN. An earlier YES/ACCEPT/NO/DECLINE/JOIN blocks the rule (a leading HELP
// does not), and longer messages keep the first-token rule.
const OPT_OUT_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const BLOCKING_WORDS = new Set(["yes", "accept", "no", "decline", "join"]);
const SHORT_MESSAGE_WORDS = 8;

function isOptOut(words: string[]): boolean {
  if (words.length > SHORT_MESSAGE_WORDS) return false;
  for (const word of words) {
    const lower = word.toLowerCase();
    if (OPT_OUT_WORDS.has(lower)) return true;
    if (BLOCKING_WORDS.has(lower)) return false;
  }
  return false;
}

/**
 * Opt-out first (it also beats a photo: the sender is opted out and no draft is made), then an image means `photo`
 * (the first image is used), otherwise the first token decides.
 */
export function parseCommand(msg: Pick<InboundMessage, "text" | "attachments">): ParsedCommand {
  const words = tokens(msg.text);
  if (isOptOut(words)) return { command: "stop", short_code: null };

  if (msg.attachments.some((attachment) => attachment.kind === "image")) {
    return { command: "photo", short_code: null };
  }

  const [first, second] = words;
  const command = first === undefined ? undefined : COMMAND_WORDS[first.toLowerCase()];
  if (command === undefined) return { command: "unknown", short_code: null };

  if (command !== "accept" && command !== "decline") return { command, short_code: null };

  const code = second?.toUpperCase();
  return { command, short_code: code !== undefined && SHORT_CODE_REGEX.test(code) ? code : null };
}
