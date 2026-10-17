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

/** An image wins over any text (first image used by the photo path); otherwise the first token decides. */
export function parseCommand(msg: Pick<InboundMessage, "text" | "attachments">): ParsedCommand {
  if (msg.attachments.some((attachment) => attachment.kind === "image")) {
    return { command: "photo", short_code: null };
  }

  const [first, second] = tokens(msg.text);
  const command = first === undefined ? undefined : COMMAND_WORDS[first.toLowerCase()];
  if (command === undefined) return { command: "unknown", short_code: null };

  if (command !== "accept" && command !== "decline") return { command, short_code: null };

  const code = second?.toUpperCase();
  return { command, short_code: code !== undefined && SHORT_CODE_REGEX.test(code) ? code : null };
}
