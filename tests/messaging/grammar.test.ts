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
