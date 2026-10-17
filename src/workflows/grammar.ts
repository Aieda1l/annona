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

// NFKC first, so full-width or otherwise decorated letters (for example "ＳＴＯＰ") match the plain words.
function tokens(text: string | null): string[] {
  return (text ?? "")
    .normalize("NFKC")
    .split(/\s+/)
    .map((token) => token.replace(EDGE_PUNCTUATION, ""))
    .filter((token) => token.length > 0);
}

// D-039 (CONTRACTS §3.10, narrowed): in a message of 8 words or fewer, STOP, STOPALL and UNSUBSCRIBE opt the sender out
// wherever they appear. A missed opt-out is the worse failure; an accidental one is undone by texting JOIN (stop_ack
// says so). An earlier YES/ACCEPT/NO/DECLINE/JOIN blocks the rule (a leading HELP does not), and a STOP that is part of
// "stop by / at / in / off / over" is ordinary phrasing. END, QUIT and CANCEL are common words, so they count only as the
// whole message. Longer messages keep the first-token rule.
const OPT_OUT_WORDS = new Set(["stop", "stopall", "unsubscribe"]);
const WHOLE_MESSAGE_OPT_OUT_WORDS = new Set(["cancel", "end", "quit"]);
const BLOCKING_WORDS = new Set(["yes", "accept", "no", "decline", "join"]);
const STOP_PHRASE_FOLLOWERS = new Set(["by", "at", "in", "off", "over"]);
const SHORT_MESSAGE_WORDS = 8;

function isOptOut(words: string[]): boolean {
  if (words.length > SHORT_MESSAGE_WORDS) return false;
  const lowered = words.map((word) => word.toLowerCase());
  if (lowered.length === 1 && WHOLE_MESSAGE_OPT_OUT_WORDS.has(lowered[0]!)) return true;
  for (const [index, word] of lowered.entries()) {
    if (BLOCKING_WORDS.has(word)) return false;
    if (!OPT_OUT_WORDS.has(word)) continue;
    if (word === "stop" && STOP_PHRASE_FOLLOWERS.has(lowered[index + 1] ?? "")) continue;
    return true;
  }
  return false;
}

/**
 * A message that carries an image is a `photo`: its text is never read as an opt-out or any other command (D-039; a
 * caption such as "end of day, 20 portions" is a caption). Otherwise the opt-out rule applies first, then the first
 * token decides.
 */
export function parseCommand(msg: Pick<InboundMessage, "text" | "attachments">): ParsedCommand {
  if (msg.attachments.some((attachment) => attachment.kind === "image")) {
    return { command: "photo", short_code: null };
  }

  const words = tokens(msg.text);
  if (isOptOut(words)) return { command: "stop", short_code: null };

  const [first, second] = words;
  const command = first === undefined ? undefined : COMMAND_WORDS[first.toLowerCase()];
  if (command === undefined) return { command: "unknown", short_code: null };

  if (command !== "accept" && command !== "decline") return { command, short_code: null };

  const code = second?.toUpperCase();
  return { command, short_code: code !== undefined && SHORT_CODE_REGEX.test(code) ? code : null };
}
