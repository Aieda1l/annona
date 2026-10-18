import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "@/features/intake/strip-metadata";
import {
  GPS_MARKER,
  HEIC_PIXELS,
  JPEG_SCAN,
  PNG_IDAT,
  PNG_SIG,
  WEBP_PIXELS,
  concat,
  contains,
  exifSegmentsOf,
  heicWithExif,
  jpegWithExif,
  jpegWithOrientation,
  jpegWithoutMetadata,
  pngWithMetadata,
  webpWithMetadata,
} from "./doubles/images";

// Messaging photos arrive with whatever the phone wrote, GPS included. Web uploads lose it in the browser re-encode;
// nothing else did. The service strips location-bearing metadata from every accepted photo, and fails closed when
// the container cannot be read (we then cannot say it is gone). The pictures here are structural stand-ins.

const ok = (mime: string, bytes: Uint8Array) => {
  const r = stripImageMetadata(mime, bytes);
  if (!r.ok) throw new Error(`strip failed: ${r.error.code}`);
  return r.data;
};
const refused = (mime: string, bytes: Uint8Array) => {
  const r = stripImageMetadata(mime, bytes);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
};

describe("input sanity", () => {
  it.each([
    ["jpeg", jpegWithExif()],
    ["png", pngWithMetadata()],
    ["webp", webpWithMetadata()],
    ["heic", heicWithExif()],
  ])("the %s fixture really carries the marker", (_n, bytes) => {
    expect(contains(bytes, GPS_MARKER)).toBe(true);
  });
});

describe("JPEG", () => {
  it("removes Exif, XMP, Photoshop and comment segments and keeps the picture data", () => {
    const out = ok("image/jpeg", jpegWithExif());
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, "Exif")).toBe(false);
    expect(contains(out, "http://ns.adobe.com")).toBe(false);
    expect(Array.from(out.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(contains(out, concat(JPEG_SCAN, Uint8Array.of(0xff, 0xd9)))).toBe(true); // scan data and EOI intact
    expect(contains(out, "JFIF")).toBe(true);
    expect(contains(out, "ICC_PROFILE")).toBe(true); // colour profile is not location data
  });

  it("returns a file with no metadata byte for byte", () => {
    const clean = jpegWithoutMetadata();
    expect(Array.from(ok("image/jpeg", clean))).toEqual(Array.from(clean));
  });

  it("a stripped file strips to itself", () => {
    const once = ok("image/jpeg", jpegWithExif());
    expect(Array.from(ok("image/jpeg", once))).toEqual(Array.from(once));
  });

  it("refuses a segment that runs past the end of the file", () => {
    const bad = jpegWithExif().subarray(0, 40);
    refused("image/jpeg", bad);
  });

  it("refuses a file with no start-of-image marker", () => {
    refused("image/jpeg", Uint8Array.of(0x00, 0x01, 0x02, 0x03));
  });

  it("refuses a file that ends before any scan data", () => {
    refused("image/jpeg", Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00));
  });
});

describe("JPEG orientation survives, and nothing else from the Exif does", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])("keeps orientation %i as the only Exif entry", (orientation) => {
    const out = ok("image/jpeg", jpegWithOrientation(orientation));
    expect(contains(out, GPS_MARKER)).toBe(false);
    const segments = exifSegmentsOf(out);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ orientation, entries: 1, length: 36 });
  });

  it.each(["MM", "II"] as const)("reads a %s Exif and keeps the value", (order) => {
    const out = ok("image/jpeg", jpegWithOrientation(6, order));
    expect(exifSegmentsOf(out)[0]).toMatchObject({ orientation: 6, entries: 1 });
    expect(contains(out, GPS_MARKER)).toBe(false);
  });

  it("drops the GPS pointer and sub-IFD: the tag 0x8825 is not in the new segment", () => {
    const out = ok("image/jpeg", jpegWithOrientation(6));
    const seg = exifSegmentsOf(out)[0]!;
    const body = out.subarray(seg.at, seg.at + seg.length);
    expect(contains(body, Uint8Array.of(0x88, 0x25))).toBe(false);
    expect(contains(body, Uint8Array.of(0x25, 0x88))).toBe(false);
  });

  it("puts the orientation segment where the Exif was: after JFIF, before the picture tables", () => {
    const out = ok("image/jpeg", jpegWithOrientation(6));
    const seg = exifSegmentsOf(out)[0]!;
    expect(out.indexOf(0xe0, 2)).toBeLessThan(seg.at); // APP0 first
    expect(contains(out.subarray(seg.at + seg.length), Uint8Array.of(0xff, 0xdb))).toBe(true); // DQT after
  });

  it("writes nothing for orientation 1 (already upright) and for values outside 1 to 8", () => {
    for (const value of [1, 0, 9, 255, 65535]) {
      const out = ok("image/jpeg", jpegWithOrientation(value));
      expect(exifSegmentsOf(out)).toHaveLength(0);
      expect(contains(out, GPS_MARKER)).toBe(false);
    }
  });

  it("writes nothing when the Exif has no orientation tag", () => {
    const out = ok("image/jpeg", jpegWithOrientation(6, "MM", { omitOrientation: true }));
    expect(exifSegmentsOf(out)).toHaveLength(0);
    expect(contains(out, GPS_MARKER)).toBe(false);
  });

  it("an Exif that cannot be read still strips (orientation is best effort, removal is not)", () => {
    const out = ok("image/jpeg", jpegWithOrientation(6, "MM", { badIfdOffset: true }));
    expect(exifSegmentsOf(out)).toHaveLength(0);
    expect(contains(out, GPS_MARKER)).toBe(false);
  });

  it("only the first Exif segment counts; a second one is dropped with everything else", () => {
    const out = ok("image/jpeg", jpegWithOrientation(6, "MM", { secondExifOrientation: 8 }));
    const segments = exifSegmentsOf(out);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.orientation).toBe(6);
  });

  it("strips to itself", () => {
    const once = ok("image/jpeg", jpegWithOrientation(6));
    expect(Array.from(ok("image/jpeg", once))).toEqual(Array.from(once));
  });

  it("keeps the picture data byte for byte", () => {
    const out = ok("image/jpeg", jpegWithOrientation(6));
    expect(contains(out, concat(JPEG_SCAN, Uint8Array.of(0xff, 0xd9)))).toBe(true);
  });
});

describe("PNG", () => {
  it("removes eXIf, text, XMP and time chunks and anything after IEND, keeping the image chunks", () => {
    const out = ok("image/png", pngWithMetadata());
    expect(contains(out, GPS_MARKER)).toBe(false);
    for (const t of ["eXIf", "tEXt", "iTXt", "tIME", "TRAILING"]) expect(contains(out, t)).toBe(false);
    expect(Array.from(out.subarray(0, 8))).toEqual(Array.from(PNG_SIG));
    for (const t of ["IHDR", "IDAT", "IEND"]) expect(contains(out, t)).toBe(true);
    expect(contains(out, PNG_IDAT)).toBe(true);
  });

  it("refuses a chunk that runs past the end", () => {
    refused("image/png", pngWithMetadata().subarray(0, 30));
  });

  it("refuses a file with no IEND", () => {
    refused("image/png", concat(PNG_SIG, pngWithMetadata().subarray(8, 33)));
  });

  it("refuses a bad signature", () => {
    refused("image/png", Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9));
  });
});

describe("WebP", () => {
  it("removes EXIF and XMP chunks, clears their VP8X flags and fixes the RIFF size", () => {
    const out = ok("image/webp", webpWithMetadata());
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, "EXIF")).toBe(false);
    expect(contains(out, "XMP ")).toBe(false);
    expect(contains(out, WEBP_PIXELS)).toBe(true);
    const size = out[4]! | (out[5]! << 8) | (out[6]! << 16) | (out[7]! << 24);
    expect(size).toBe(out.length - 8);
    const vp8x = out.indexOf(0x56, 12); // 'V' of VP8X, first chunk
    expect(String.fromCharCode(...out.subarray(vp8x, vp8x + 4))).toBe("VP8X");
    expect(out[vp8x + 8]! & 0x0c).toBe(0); // Exif (0x08) and XMP (0x04) flags cleared
    expect(out[vp8x + 8]! & 0x20).toBe(0x20); // ICC flag kept
  });

  it("refuses a chunk that runs past the end", () => {
    refused("image/webp", webpWithMetadata().subarray(0, 40));
  });

  it("refuses a missing WEBP signature", () => {
    refused("image/webp", Uint8Array.of(...new TextEncoder().encode("RIFF"), 4, 0, 0, 0, ...new TextEncoder().encode("WAVE")));
  });
});

describe("HEIC / HEIF", () => {
  it.each(["image/heic", "image/heif"])("zeroes the Exif and XMP items in place for %s and changes nothing else", (mime) => {
    const input = heicWithExif();
    const out = ok(mime, input);
    expect(out.length).toBe(input.length); // offsets stay valid
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, HEIC_PIXELS)).toBe(true);
    expect(contains(out, "heic")).toBe(true); // ftyp untouched
    expect(contains(out, "Exif")).toBe(true); // the item_type label in iinf, which holds no data
    let changed = 0;
    for (let i = 0; i < input.length; i++) if (input[i] !== out[i]) changed++;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(80); // only the two payloads
  });

  it("zeroes an Exif item stored in idat (construction method 1)", () => {
    const out = ok("image/heic", heicWithExif({ exifInIdat: true }));
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, HEIC_PIXELS)).toBe(true);
  });

  it("refuses an item extent that runs past the end of the file", () => {
    const input = heicWithExif();
    refused("image/heic", input.subarray(0, input.length - 30));
  });

  it("refuses a file with no meta box", () => {
    refused("image/heic", concat(Uint8Array.of(0, 0, 0, 16), new TextEncoder().encode("ftypheic"), new Uint8Array(4)));
  });

  it("refuses a box whose size overruns its parent", () => {
    const input = heicWithExif();
    const bad = input.slice();
    bad[24] = 0x7f; // ftyp is 24 bytes; corrupt the size of the meta box that follows
    refused("image/heic", bad);
  });
});

describe("hostile containers", () => {
  it("drops a second JPEG after the first EOI (iPhone MPO) along with its GPS", () => {
    const out = ok("image/jpeg", concat(jpegWithExif(), jpegWithExif()));
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, JPEG_SCAN)).toBe(true);
    expect(out.subarray(out.length - 2)).toEqual(Uint8Array.of(0xff, 0xd9));
  });

  it("refuses a JPEG with no EOI", () => {
    const input = jpegWithExif();
    refused("image/jpeg", input.subarray(0, input.length - 2));
  });

  it("refuses an iloc whose item count is larger than the box can hold", () => {
    const input = heicWithExif();
    const iloc = new TextDecoder("latin1").decode(input).indexOf("iloc");
    const version = input[iloc + 4]!;
    const at = iloc + 4 + 4 + 2; // fourcc, version+flags, size nibbles
    const bad = input.slice();
    bad.fill(0xff, at, at + (version < 2 ? 2 : 4));
    refused("image/heic", bad);
  });

  it("refuses a HEIC with a top-level uuid box", () => {
    const uuid = concat(Uint8Array.of(0, 0, 0, 24), new TextEncoder().encode("uuid"), new Uint8Array(16));
    refused("image/heic", concat(heicWithExif(), uuid));
  });
});

describe("other types", () => {
  it("refuses a type it does not know how to read, rather than passing it through", () => {
    refused("image/gif", Uint8Array.of(1, 2, 3));
  });
});

describe("a real iPhone photo (local only)", () => {
  const path = process.env.HEIC_SAMPLE;
  // Finds the Exif payload by its TIFF header ("MM\0*" or "II*\0"), then checks it is zeroed in the output.
  const tiffHeaders = (b: Uint8Array) => {
    const hits: number[] = [];
    for (let i = 0; i + 4 <= b.length; i++) {
      const be = b[i] === 0x4d && b[i + 1] === 0x4d && b[i + 2] === 0 && b[i + 3] === 0x2a;
      const le = b[i] === 0x49 && b[i + 1] === 0x49 && b[i + 2] === 0x2a && b[i + 3] === 0;
      if (be || le) hits.push(i);
    }
    return hits;
  };

  it.skipIf(!path)("strips the file named by HEIC_SAMPLE: same size, Exif and XMP zeroed, nothing else touched", () => {
    const input = new Uint8Array(readFileSync(path!));
    const out = ok("image/heic", input);
    expect(out.length).toBe(input.length);
    const headers = tiffHeaders(input);
    expect(headers.length).toBeGreaterThan(0); // the sample must actually carry Exif for this check to mean anything
    for (const at of headers) expect(Array.from(out.subarray(at, at + 4))).toEqual([0, 0, 0, 0]);
    expect(contains(input, "<x:xmpmeta") ? contains(out, "<x:xmpmeta") : false).toBe(false);
    let changed = 0;
    for (let i = 0; i < input.length; i++) if (input[i] !== out[i]) changed++;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(input.length / 20); // metadata only, not picture data
  });
});
