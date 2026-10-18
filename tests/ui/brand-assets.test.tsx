// The Annona mark as a browser-tab icon, an iPhone home-screen icon and a header image. Next.js serves
// src/app/icon.png, src/app/apple-icon.png and src/app/favicon.ico automatically. The logo was generated with ChatGPT
// (disclosed in the handoff); these files are derived crops and resizes of it, with no metadata.
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Home from "@/app/page";

afterEach(cleanup);

const file = (p: string) => readFileSync(join(process.cwd(), p));

function png(p: string) {
  const b = file(p);
  expect(Array.from(b.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks: string[] = [];
  for (let i = 8; i < b.length; ) {
    const n = b.readUInt32BE(i);
    chunks.push(b.subarray(i + 4, i + 8).toString("latin1"));
    i += 12 + n;
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), chunks, bytes: b.length };
}

describe("icons", () => {
  it.each([
    ["src/app/icon.png", 512, 200_000],
    ["src/app/apple-icon.png", 180, 120_000],
  ])("%s is a square %i px PNG with no metadata", (p, size, maxBytes) => {
    const img = png(p);
    expect(img).toMatchObject({ width: size, height: size });
    expect(img.chunks.filter((c) => ["tEXt", "zTXt", "iTXt", "eXIf", "tIME"].includes(c))).toEqual([]);
    expect(img.bytes).toBeLessThan(maxBytes);
  });

  it("src/app/favicon.ico holds 16, 32 and 48 px images", () => {
    const b = file("src/app/favicon.ico");
    expect([b.readUInt16LE(0), b.readUInt16LE(2)]).toEqual([0, 1]); // reserved, type 1 = icon
    const count = b.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
    expect(sizes).toEqual([16, 32, 48]);
    // Next.js decodes the icon at build time and refuses an embedded PNG that is not RGBA ("The PNG is not in RGBA format").
    for (let i = 0; i < count; i++) {
      const offset = b.readUInt32LE(6 + i * 16 + 12);
      expect(Array.from(b.subarray(offset, offset + 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(b[offset + 25]).toBe(6); // PNG colour type 6 = RGBA
    }
    expect(b.length).toBeLessThan(60_000);
  });

  it("the header image is a small copy of the full logo, not the 1 MB original", () => {
    const img = png("public/annona-logo-512.png");
    expect(img.width).toBe(512);
    expect(img.height).toBe(341);
    expect(img.chunks.filter((c) => ["tEXt", "zTXt", "iTXt", "eXIf", "tIME"].includes(c))).toEqual([]);
    expect(statSync(join(process.cwd(), "public/annona-logo-512.png")).size).toBeLessThan(120_000);
  });
});

describe("home page", () => {
  it("shows the logo as a decorative image above the h1, which still carries the name", () => {
    const { container } = render(<Home />);
    const img = container.querySelector('img[src="/annona-logo-512.png"]');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("alt", ""); // the h1 below names the product, so the image is decorative
    expect(screen.getByRole("heading", { level: 1, name: "Annona" })).toBeInTheDocument();
  });
});
