import { describe, expect, it } from "vitest";
import { parseCommand } from "@/workflows/grammar";

// T-MS-01: inbound command grammar (CONTRACTS §3.10). Case-insensitive, surrounding punctuation
// ignored, the first token decides, CODE is 4 chars from the §1 alphabet or counts as "no code".

const text = (t: string | null) => ({ text: t, attachments: [] });

describe("T-MS-01 command words", () => {
  it.each([
    ["YES", "accept"],
    ["accept", "accept"],
    ["No", "decline"],
    ["DECLINE", "decline"],
    ["join", "join"],
    ["Stop", "stop"],
    ["HELP", "help"],
  ])("%s is %s", (input, command) => {
    expect(parseCommand(text(input)).command).toBe(command);
  });

  it("ignores surrounding whitespace, punctuation and quotes", () => {
    expect(parseCommand(text("  Yes!  ")).command).toBe("accept");
    expect(parseCommand(text('"STOP."')).command).toBe("stop");
    expect(parseCommand(text("“JOIN”")).command).toBe("join");
  });

  it("lets the first token decide", () => {
    expect(parseCommand(text("stop sending me these")).command).toBe("stop");
    expect(parseCommand(text("join please")).command).toBe("join");
  });

  it("does not match a command word inside a longer word", () => {
    expect(parseCommand(text("yesterday")).command).toBe("unknown");
    expect(parseCommand(text("stopwatch")).command).toBe("unknown");
    expect(parseCommand(text("NOW")).command).toBe("unknown");
  });

  it.each([null, "", "   ", "\u{1F44D}", "maybe later"])("%j is unknown", (input) => {
    expect(parseCommand(text(input)).command).toBe("unknown");
  });
});

describe("T-MS-01 offer codes", () => {
  it("uppercases a valid code on accept and decline", () => {
    expect(parseCommand(text("yes k7m3"))).toMatchObject({ command: "accept", short_code: "K7M3" });
    expect(parseCommand(text("No h4m9"))).toMatchObject({ command: "decline", short_code: "H4M9" });
  });

  it("accepts a code separated by punctuation or a newline", () => {
    expect(parseCommand(text("YES, K7M3."))).toMatchObject({ command: "accept", short_code: "K7M3" });
    expect(parseCommand(text("YES\nK7M3"))).toMatchObject({ command: "accept", short_code: "K7M3" });
  });

  it("treats a missing code as no code", () => {
    expect(parseCommand(text("YES"))).toMatchObject({ command: "accept", short_code: null });
  });

  it.each(["B2B2", "K7M", "K7M3X", "0000", "k-7m3"])("treats %s as no code but keeps the command", (code) => {
    expect(parseCommand(text(`YES ${code}`))).toMatchObject({ command: "accept", short_code: null });
  });

  it("carries a code only for accept and decline", () => {
    expect(parseCommand(text("JOIN K7M3")).short_code).toBeNull();
    expect(parseCommand(text("STOP K7M3")).short_code).toBeNull();
  });
});

describe("T-MS-01 photo", () => {
  const image = { kind: "image" as const, provider_attachment_id: "pho_att_x", mime: "image/heic" };

  it("is a photo when the message has an image, whatever the text says", () => {
    expect(parseCommand({ text: null, attachments: [image] }).command).toBe("photo");
    expect(parseCommand({ text: "YES K7M3", attachments: [image] })).toMatchObject({
      command: "photo",
      short_code: null,
    });
  });

  it("uses the text when there are no attachments", () => {
    expect(parseCommand({ text: "YES K7M3", attachments: [] }).command).toBe("accept");
  });
});

// D-039 (CONTRACTS §3.10, narrowed): STOP, STOPALL and UNSUBSCRIBE are honored anywhere in a short message. A missed
// opt-out is the worse failure; an accidental opt-out is undone by texting JOIN. END, QUIT and CANCEL count only as the
// whole message, "stop by / at / in / off / over" is ordinary phrasing, and the text of a message with an image is never
// an opt-out.
describe("T-MS-01 opt-out words anywhere in a short message (D-039)", () => {
  it.each([
    "please stop messaging me",
    "I want to stop",
    "Please, STOP!",
    "please don't text me anymore, stop",
    "unsubscribe",
    "please unsubscribe me",
    "stopall",
    "STOP ALL texts, stopall",
  ])("%j is stop", (input) => {
    expect(parseCommand(text(input))).toEqual({ command: "stop", short_code: null });
  });

  it("normalizes full-width and compatibility characters (NFKC) before matching", () => {
    expect(parseCommand(text("ＳＴＯＰ")).command).toBe("stop");
    expect(parseCommand(text("please ｓｔｏｐ texting me")).command).toBe("stop");
    expect(parseCommand(text("ＵＮＳＵＢＳＣＲＩＢＥ")).command).toBe("stop");
    expect(parseCommand(text("ＹＥＳ")).command).toBe("accept");
  });

  it.each(["cancel", "Cancel.", "END", "  quit  ", "“end”"])("%j alone is stop", (input) => {
    expect(parseCommand(text(input))).toEqual({ command: "stop", short_code: null });
  });

  it.each([
    "can you cancel the other offer",
    "end of day, 20 portions",
    "I quit my other job, happy to help",
    "cancel my other plans, I'll take it",
    "that's the end",
    "end quit",
  ])("%j is not an opt-out: END, QUIT and CANCEL count only as the whole message", (input) => {
    expect(parseCommand(text(input)).command).toBe("unknown");
  });

  it.each([
    "will stop by at 5",
    "I can stop at the pantry first",
    "I'll stop in later",
    "I'll stop off on the way",
    "can stop over after work",
    "we can STOP BY at 5",
  ])("%j is ordinary phrasing, not an opt-out", (input) => {
    expect(parseCommand(text(input)).command).toBe("unknown");
  });

  it("a later STOP still opts out even after a 'stop by'", () => {
    expect(parseCommand(text("will stop by, then stop")).command).toBe("stop");
  });

  it("is not blocked by a leading HELP", () => {
    expect(parseCommand(text("help me stop")).command).toBe("stop");
    expect(parseCommand(text("HELP, stop")).command).toBe("stop");
  });

  it.each([
    ["yes stop", "accept"],
    ["ACCEPT K7M3 and stop later", "accept"],
    ["no stop", "decline"],
    ["DECLINE then stop", "decline"],
    ["join and then stop", "join"],
  ])("%j keeps its first command, because an earlier word blocks the opt-out rule", (input, command) => {
    expect(parseCommand(text(input)).command).toBe(command);
  });

  it("honors an opt-out in a message of exactly 8 words but not 9", () => {
    expect(parseCommand(text("please could you stop sending me these messages")).command).toBe("stop"); // 8 words
    expect(parseCommand(text("please could you stop sending me these messages now")).command).toBe("unknown"); // 9 words
  });

  it("keeps the first-token rule for long messages", () => {
    expect(parseCommand(text("stop sending me these messages right now please thank you")).command).toBe("stop");
    expect(parseCommand(text("yes K7M3 and I will stop by the pantry later today ok")).command).toBe("accept");
  });

  it("matches whole words only", () => {
    for (const input of ["stoppage", "endeavor", "quitting", "cancelled", "ending", "unsubscribed"]) {
      expect(parseCommand(text(input)).command).toBe("unknown");
    }
  });
});

describe("T-MS-01 the text of a message with an image is never an opt-out (D-039)", () => {
  const image = { kind: "image" as const, provider_attachment_id: "pho_att_x", mime: null };

  it.each(["STOP", "please stop sending me these", "unsubscribe", "cancel", "end", "yes stop"])(
    "an image captioned %j is a photo",
    (caption) => {
      expect(parseCommand({ text: caption, attachments: [image] })).toEqual({ command: "photo", short_code: null });
    },
  );

  it("'end of day, 20 portions' is unknown as text, and a photo with the same caption", () => {
    expect(parseCommand(text("end of day, 20 portions")).command).toBe("unknown");
    expect(parseCommand({ text: "end of day, 20 portions", attachments: [image] }).command).toBe("photo");
  });

  it("an image with no caption, or an ordinary caption, is still a photo", () => {
    expect(parseCommand({ text: null, attachments: [image] }).command).toBe("photo");
    expect(parseCommand({ text: "leftover sandwiches", attachments: [image] }).command).toBe("photo");
  });

  it("the same STOP text without an image is an opt-out", () => {
    expect(parseCommand(text("please stop sending me these")).command).toBe("stop");
  });
});
