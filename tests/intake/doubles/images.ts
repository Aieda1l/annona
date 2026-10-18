// Minimal, structurally valid image containers with a recognizable "GPS" marker hidden in the metadata, so tests can
// prove the marker is gone while the picture data is untouched. They are not decodable pictures.

export const GPS_MARKER = "GPS-LAT-47.6062-LON--122.3321";
const marker = new TextEncoder().encode(GPS_MARKER);
const ascii = (s: string) => new TextEncoder().encode(s);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
const u16 = (n: number) => Uint8Array.of((n >> 8) & 0xff, n & 0xff);
const u32 = (n: number) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const u32le = (n: number) => Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);

export const contains = (haystack: Uint8Array, needle: Uint8Array | string): boolean => {
  const n = typeof needle === "string" ? ascii(needle) : needle;
  outer: for (let i = 0; i + n.length <= haystack.length; i++) {
    for (let j = 0; j < n.length; j++) if (haystack[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
};

// ---- JPEG ----
const jpegSegment = (marker2: number, payload: Uint8Array) => concat(Uint8Array.of(0xff, marker2), u16(payload.length + 2), payload);
export const JPEG_SCAN = Uint8Array.of(0x11, 0x22, 0x33, 0xff, 0x00, 0x44, 0x55); // entropy data incl. a stuffed 0xFF
export function jpegWithExif(): Uint8Array {
  return concat(
    Uint8Array.of(0xff, 0xd8),
    jpegSegment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xe1, concat(ascii("Exif\0\0"), marker)),
    jpegSegment(0xe1, concat(ascii("http://ns.adobe.com/xap/1.0/\0"), marker)),
    jpegSegment(0xe2, concat(ascii("ICC_PROFILE\0"), Uint8Array.of(1, 1, 9, 9))),
    jpegSegment(0xed, concat(ascii("Photoshop 3.0\0"), marker)),
    jpegSegment(0xfe, marker),
    jpegSegment(0xdb, new Uint8Array(65).fill(3)),
    jpegSegment(0xc0, Uint8Array.of(8, 0, 4, 0, 4, 1, 1, 0x11, 0)),
    jpegSegment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    JPEG_SCAN,
    Uint8Array.of(0xff, 0xd9),
  );
}
export const jpegWithoutMetadata = (): Uint8Array =>
  concat(
    Uint8Array.of(0xff, 0xd8),
    jpegSegment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xe2, concat(ascii("ICC_PROFILE\0"), Uint8Array.of(1, 1, 9, 9))),
    jpegSegment(0xdb, new Uint8Array(65).fill(3)),
    jpegSegment(0xc0, Uint8Array.of(8, 0, 4, 0, 4, 1, 1, 0x11, 0)),
    jpegSegment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    JPEG_SCAN,
    Uint8Array.of(0xff, 0xd9),
  );

/** A readable JPEG with `scanBytes` of picture data; different `fill` values make different photos. */
export function jpegOfSize(scanBytes: number, fill = 1): Uint8Array {
  return concat(
    Uint8Array.of(0xff, 0xd8),
    jpegSegment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xdb, new Uint8Array(65).fill(3)),
    jpegSegment(0xc0, Uint8Array.of(8, 0, 4, 0, 4, 1, 1, 0x11, 0)),
    jpegSegment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    new Uint8Array(scanBytes).fill(fill & 0x7f),
    Uint8Array.of(0xff, 0xd9),
  );
}


// ---- JPEG with a realistic Exif: orientation in IFD0 plus a GPS sub-IFD that carries the marker ----
export type ExifOrder = "MM" | "II";
function tiffWithOrientation(orientation: number, order: ExifOrder, extra: { omitOrientation?: boolean; badIfdOffset?: boolean } = {}): Uint8Array {
  const be = order === "MM";
  const w16 = (n: number) => (be ? u16(n) : Uint8Array.of(n & 0xff, (n >> 8) & 0xff));
  const w32 = (n: number) => (be ? u32(n) : u32le(n));
  const entries: Uint8Array[] = [];
  if (!extra.omitOrientation) entries.push(concat(w16(0x0112), w16(3), w32(1), w16(orientation), w16(0)));
  entries.push(concat(w16(0x8825), w16(4), w32(1), w32(8 + 2 + (entries.length + 1) * 12 + 4))); // GPS IFD pointer
  const gpsIfdAt = 8 + 2 + entries.length * 12 + 4;
  const dataAt = gpsIfdAt + 2 + 12 + 4;
  const gpsEntry = concat(w16(0x0002), w16(2), w32(marker.length + 1), w32(dataAt));
  return concat(
    ascii(order),
    w16(42),
    w32(extra.badIfdOffset ? 0x00ffffff : 8),
    w16(entries.length),
    ...entries,
    w32(0),
    w16(1),
    gpsEntry,
    w32(0),
    marker,
    Uint8Array.of(0),
  );
}
/** A JPEG whose Exif holds an orientation tag and a GPS sub-IFD. */
export function jpegWithOrientation(
  orientation: number,
  order: ExifOrder = "MM",
  extra: { omitOrientation?: boolean; badIfdOffset?: boolean; secondExifOrientation?: number } = {},
): Uint8Array {
  return concat(
    Uint8Array.of(0xff, 0xd8),
    jpegSegment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xe1, concat(ascii("Exif\0\0"), tiffWithOrientation(orientation, order, extra))),
    ...(extra.secondExifOrientation === undefined
      ? []
      : [jpegSegment(0xe1, concat(ascii("Exif\0\0"), tiffWithOrientation(extra.secondExifOrientation, order)))]),
    jpegSegment(0xdb, new Uint8Array(65).fill(3)),
    jpegSegment(0xc0, Uint8Array.of(8, 0, 4, 0, 4, 1, 1, 0x11, 0)),
    jpegSegment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    JPEG_SCAN,
    Uint8Array.of(0xff, 0xd9),
  );
}

/** Every Exif APP1 segment in a JPEG: its orientation (or null) and how many IFD0 entries it has. */
export function exifSegmentsOf(b: Uint8Array): Array<{ at: number; length: number; orientation: number | null; entries: number }> {
  const found: Array<{ at: number; length: number; orientation: number | null; entries: number }> = [];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] !== 0xda && b[i + 1] !== 0xd9) {
    const length = (b[i + 2]! << 8) | b[i + 3]!;
    if (b[i + 1] === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 10)) === "Exif\0\0") {
      const t = i + 10;
      const be = b[t] === 0x4d;
      const r16 = (k: number) => (be ? (b[k]! << 8) | b[k + 1]! : b[k]! | (b[k + 1]! << 8));
      const r32 = (k: number) => (be ? ((b[k]! << 24) | (b[k + 1]! << 16) | (b[k + 2]! << 8) | b[k + 3]!) >>> 0 : (b[k]! | (b[k + 1]! << 8) | (b[k + 2]! << 16) | (b[k + 3]! << 24)) >>> 0);
      const ifd = t + r32(t + 4);
      const entries = r16(ifd);
      let orientation: number | null = null;
      for (let k = 0; k < entries; k++) if (r16(ifd + 2 + k * 12) === 0x0112) orientation = r16(ifd + 2 + k * 12 + 8);
      found.push({ at: i, length: length + 2, orientation, entries });
    }
    i += 2 + length;
  }
  return found;
}

// ---- PNG ----
const pngChunk = (type: string, data: Uint8Array) => concat(u32(data.length), ascii(type), data, u32(0xdeadbeef)); // CRC not checked
export const PNG_IDAT = Uint8Array.of(1, 2, 3, 4, 5);
export const PNG_SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
export function pngWithMetadata(): Uint8Array {
  return concat(
    PNG_SIG,
    pngChunk("IHDR", new Uint8Array(13).fill(1)),
    pngChunk("eXIf", marker),
    pngChunk("tEXt", concat(ascii("Comment\0"), marker)),
    pngChunk("iTXt", concat(ascii("XML:com.adobe.xmp\0"), marker)),
    pngChunk("tIME", new Uint8Array(7)),
    pngChunk("IDAT", PNG_IDAT),
    pngChunk("IEND", new Uint8Array(0)),
    ascii("TRAILING-" + GPS_MARKER),
  );
}

// ---- WebP ----
const webpChunk = (fourcc: string, data: Uint8Array) =>
  concat(ascii(fourcc), u32le(data.length), data, data.length % 2 ? Uint8Array.of(0) : new Uint8Array(0));
export const WEBP_PIXELS = Uint8Array.of(9, 8, 7, 6, 5);
export function webpWithMetadata(): Uint8Array {
  const body = concat(
    ascii("WEBP"),
    webpChunk("VP8X", Uint8Array.of(0x2c, 0, 0, 0, 3, 0, 0, 3, 0, 0)), // flags: ICC 0x20, Exif 0x08, XMP 0x04
    webpChunk("EXIF", marker),
    webpChunk("XMP ", concat(marker, Uint8Array.of(0))), // odd length, padded
    webpChunk("VP8 ", WEBP_PIXELS),
  );
  return concat(ascii("RIFF"), u32le(body.length), body);
}

// ---- HEIC (ISO base media file) ----
const box = (type: string, payload: Uint8Array) => concat(u32(payload.length + 8), ascii(type), payload);
const fullBox = (type: string, version: number, payload: Uint8Array) => box(type, concat(Uint8Array.of(version, 0, 0, 0), payload));
export const HEIC_PIXELS = Uint8Array.of(0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6);
const infe = (id: number, type: string, extra: Uint8Array = new Uint8Array(0)) =>
  fullBox("infe", 2, concat(u16(id), u16(0), ascii(type), ascii("\0"), extra));

/** items: 1 = image data, 2 = Exif, 3 = XMP (mime). Data lives in mdat (or idat for the Exif item when `exifInIdat`). */
export function heicWithExif(opts: { exifInIdat?: boolean } = {}): Uint8Array {
  const exifPayload = concat(u32(6), ascii("Exif\0\0"), marker);
  const xmpPayload = concat(marker, ascii("<x:xmpmeta/>"));
  const ftyp = box("ftyp", concat(ascii("heic"), u32(0), ascii("mif1"), ascii("heic")));
  const iinf = fullBox(
    "iinf",
    0,
    concat(u16(3), infe(1, "hvc1"), infe(2, "Exif"), infe(3, "mime", ascii("application/rdf+xml\0"))),
  );
  const idat = opts.exifInIdat ? box("idat", exifPayload) : new Uint8Array(0);
  const iloc = (fileOffsets: { img: number; exif: number; xmp: number }) =>
    fullBox(
      "iloc",
      opts.exifInIdat ? 1 : 0,
      concat(
        Uint8Array.of(0x44, 0x00), // offset_size 4, length_size 4, base_offset_size 0, index_size 0
        u16(3),
        // item 1: image in mdat
        u16(1), ...(opts.exifInIdat ? [u16(0)] : []), u16(0), u16(1), u32(fileOffsets.img), u32(HEIC_PIXELS.length),
        // item 2: Exif
        u16(2), ...(opts.exifInIdat ? [u16(1)] : []), u16(0), u16(1), u32(opts.exifInIdat ? 0 : fileOffsets.exif), u32(exifPayload.length),
        // item 3: XMP in mdat
        u16(3), ...(opts.exifInIdat ? [u16(0)] : []), u16(0), u16(1), u32(fileOffsets.xmp), u32(xmpPayload.length),
      ),
    );
  const metaOf = (offs: { img: number; exif: number; xmp: number }) =>
    fullBox("meta", 0, concat(fullBox("hdlr", 0, concat(u32(0), ascii("pict"), new Uint8Array(13))), iinf, idat, iloc(offs)));
  const sizeProbe = concat(ftyp, metaOf({ img: 0, exif: 0, xmp: 0 }));
  const mdatStart = sizeProbe.length + 8;
  const offs = { img: mdatStart, exif: mdatStart + HEIC_PIXELS.length, xmp: mdatStart + HEIC_PIXELS.length + exifPayload.length };
  const mdatPayload = opts.exifInIdat ? concat(HEIC_PIXELS, new Uint8Array(0), xmpPayload) : concat(HEIC_PIXELS, exifPayload, xmpPayload);
  if (opts.exifInIdat) offs.xmp = mdatStart + HEIC_PIXELS.length;
  return concat(ftyp, metaOf(offs), box("mdat", mdatPayload));
}
