import { err, ok, type Result } from "@/contracts";

// Removes location-bearing metadata (Exif GPS, XMP, IPTC, text chunks) from an accepted photo before it is stored or
// sent to a model. Pure byte surgery, no image library. Messaging photos arrive exactly as the phone wrote them; web
// uploads were already re-encoded by the browser. If a container cannot be read we cannot say the metadata is gone,
// so the photo is refused (fail closed). Picture data is never touched. The one thing kept from a JPEG's Exif is its orientation, in a segment of its own.

const TEXT = new TextDecoder("latin1");
const cc = (b: Uint8Array, at: number) => TEXT.decode(b.subarray(at, at + 4));
const be16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const be32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const le16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const le32 = (b: Uint8Array, at: number) => ((b[at + 3]! << 24) | (b[at + 2]! << 16) | (b[at + 1]! << 8) | b[at]!) >>> 0;

class Unreadable extends Error {}
const fail = (what: string): never => {
  throw new Unreadable(what);
};

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

// ---- JPEG ----

/** APP0 (JFIF), an ICC colour profile and APP14 (Adobe colour transform) stay; every other APPn and comment goes. */
function keepJpegSegment(marker: number, segment: Uint8Array): boolean {
  if (marker === 0xe0 || marker === 0xee) return true;
  if (marker === 0xe2) return TEXT.decode(segment.subarray(4, 16)) === "ICC_PROFILE\0";
  if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return false;
  return true;
}

/**
 * The Exif orientation (2 to 8) from an APP1 segment, or null. Orientation says how to turn the picture upright; losing
 * it leaves a portrait phone photo sideways for the model. This is best effort and never throws: an unreadable Exif
 * just yields null, and the Exif is dropped either way.
 */
function readExifOrientation(segment: Uint8Array): number | null {
  const tiff = 10; // marker (2) + length (2) + "Exif\0\0" (6)
  if (segment.length < tiff + 8 || TEXT.decode(segment.subarray(4, tiff)) !== "Exif\0\0") return null;
  const big = segment[tiff] === 0x4d && segment[tiff + 1] === 0x4d;
  if (!big && !(segment[tiff] === 0x49 && segment[tiff + 1] === 0x49)) return null;
  const r16 = (at: number) => (big ? be16(segment, at) : le16(segment, at));
  const r32 = (at: number) => (big ? be32(segment, at) : le32(segment, at));
  if (r16(tiff + 2) !== 42) return null;
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > segment.length) return null;
  const count = Math.min(r16(ifd), 64);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > segment.length) return null;
    if (r16(entry) !== 0x0112) continue;
    if (r16(entry + 2) !== 3 || r32(entry + 4) !== 1) return null; // SHORT, one value
    const value = r16(entry + 8);
    return value >= 2 && value <= 8 ? value : null; // 1 is already upright and is not written
  }
  return null;
}

/** A complete APP1 Exif segment holding only the orientation tag: no GPS, no timestamps, no device. */
function orientationSegment(orientation: number): Uint8Array {
  return Uint8Array.of(
    0xff, 0xe1, 0x00, 0x22, // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1 value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  );
}

function stripJpeg(b: Uint8Array): Uint8Array {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) fail("jpeg start");
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let seenExif = false;
  let i = 2;
  for (;;) {
    if (i + 2 > b.length) fail("jpeg truncated");
    if (b[i] !== 0xff) fail("jpeg marker");
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      out.push(b.subarray(i, i + 2)); // EOI: whatever follows (a second image, MPF payload, trailers) is dropped
      return concat(out);
    }
    if (marker === 0xda) {
      if (i + 4 > b.length) fail("jpeg scan header");
      const headerEnd = i + 2 + be16(b, i + 2);
      if (be16(b, i + 2) < 2 || headerEnd > b.length) fail("jpeg scan header");
      // Entropy-coded data runs to the next marker that is not a stuffed FF00, a fill FFFF or a restart RSTn.
      let j = headerEnd;
      while (j + 1 < b.length && !(b[j] === 0xff && b[j + 1] !== 0x00 && b[j + 1] !== 0xff && !(b[j + 1]! >= 0xd0 && b[j + 1]! <= 0xd7))) j++;
      if (j + 1 >= b.length) fail("jpeg without EOI");
      out.push(b.subarray(i, j));
      i = j;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) fail("jpeg segment header");
    const length = be16(b, i + 2);
    if (length < 2 || i + 2 + length > b.length) fail("jpeg segment length");
    const segment = b.subarray(i, i + 2 + length);
    if (keepJpegSegment(marker, segment)) out.push(segment);
    else if (marker === 0xe1 && !seenExif && TEXT.decode(segment.subarray(4, 10)) === "Exif\0\0") {
      // Only the first Exif counts. Its orientation is re-emitted in a segment that has nothing else in it.
      seenExif = true;
      const orientation = readExifOrientation(segment);
      if (orientation !== null) out.push(orientationSegment(orientation));
    }
    i += 2 + length;
  }
}

// ---- PNG ----

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(b: Uint8Array): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 8 || sig.some((v, k) => b[k] !== v)) fail("png signature");
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i < b.length) {
    if (i + 12 > b.length) fail("png chunk header");
    const length = be32(b, i);
    const end = i + 12 + length;
    if (end > b.length) fail("png chunk length");
    const type = cc(b, i + 4);
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(out); // bytes after IEND are dropped
  }
  return fail("png without IEND");
}

// ---- WebP ----

function stripWebp(b: Uint8Array): Uint8Array {
  if (b.length < 12 || cc(b, 0) !== "RIFF" || cc(b, 8) !== "WEBP") fail("webp header");
  const riffEnd = 8 + le32(b, 4);
  if (riffEnd > b.length || riffEnd < 12) fail("webp size");
  const out: Uint8Array[] = [];
  let i = 12;
  while (i < riffEnd) {
    if (i + 8 > riffEnd) fail("webp chunk header");
    const fourcc = cc(b, i);
    const size = le32(b, i + 4);
    const end = i + 8 + size + (size % 2);
    if (end > riffEnd) fail("webp chunk length");
    const chunk = b.subarray(i, end);
    if (fourcc === "EXIF" || fourcc === "XMP ") {
      // dropped
    } else if (fourcc === "VP8X") {
      if (size < 10) fail("webp VP8X");
      const copy = chunk.slice();
      copy[8] = copy[8]! & ~0x0c; // clear the Exif (0x08) and XMP (0x04) flags
      out.push(copy);
    } else {
      out.push(chunk);
    }
    i = end;
  }
  const body = concat(out);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 4), 0);
  const total = 4 + body.length;
  header[4] = total & 0xff;
  header[5] = (total >>> 8) & 0xff;
  header[6] = (total >>> 16) & 0xff;
  header[7] = (total >>> 24) & 0xff;
  header.set(b.subarray(8, 12), 8);
  return concat([header, body]);
}

// ---- HEIC / HEIF (ISO base media file format) ----

type Box = { type: string; start: number; payload: number; end: number };

function readBoxes(b: Uint8Array, from: number, to: number): Box[] {
  const boxes: Box[] = [];
  let i = from;
  while (i < to) {
    if (i + 8 > to) fail("box header");
    let size = be32(b, i);
    let header = 8;
    if (size === 1) {
      if (i + 16 > to) fail("box large size");
      if (be32(b, i + 8) !== 0) fail("box too large");
      size = be32(b, i + 12);
      header = 16;
    } else if (size === 0) {
      size = to - i;
    }
    if (size < header || i + size > to) fail("box size");
    boxes.push({ type: cc(b, i + 4), start: i, payload: i + header, end: i + size });
    i += size;
  }
  return boxes;
}

function readUint(b: Uint8Array, at: number, size: number): number {
  if (size === 0) return 0;
  if (size !== 4 && size !== 8) fail("field size");
  if (at + size > b.length) fail("field past end");
  if (size === 8 && be32(b, at) !== 0) fail("field too large");
  return be32(b, at + (size === 8 ? 4 : 0));
}

function cstringEnd(b: Uint8Array, from: number, to: number): number {
  for (let i = from; i < to; i++) if (b[i] === 0) return i;
  return fail("unterminated string");
}

/** Item ids whose payload is location-bearing metadata: Exif, and XMP stored as a mime item. */
function metadataItemIds(b: Uint8Array, iinf: Box): Set<number> {
  const ids = new Set<number>();
  const version = b[iinf.payload]!;
  if (version > 1) fail("iinf version");
  const entries = iinf.payload + 4 + (version === 0 ? 2 : 4);
  for (const infe of readBoxes(b, entries, iinf.end)) {
    if (infe.type !== "infe") continue;
    const v = b[infe.payload]!;
    if (v < 2) continue; // no item type: cannot be Exif or XMP
    if (v > 3) fail("infe version");
    let p = infe.payload + 4;
    const id = v === 2 ? be16(b, p) : be32(b, p);
    p += v === 2 ? 2 : 4;
    p += 2; // protection index
    const type = cc(b, p);
    p += 4;
    if (type === "Exif") ids.add(id);
    else if (type === "mime") {
      const nameEnd = cstringEnd(b, p, infe.end);
      const contentEnd = cstringEnd(b, nameEnd + 1, infe.end);
      const contentType = TEXT.decode(b.subarray(nameEnd + 1, contentEnd)).toLowerCase();
      if (contentType.includes("xmp") || contentType.includes("rdf+xml")) ids.add(id);
    }
  }
  return ids;
}

function stripHeic(b: Uint8Array): Uint8Array {
  const top = readBoxes(b, 0, b.length);
  if (top.some((x) => x.type === "uuid")) fail("top-level uuid box (possible XMP)");
  const metas = top.filter((x) => x.type === "meta");
  if (metas.length !== 1) return fail("meta box count");
  const meta = metas[0]!;
  const children = readBoxes(b, meta.payload + 4, meta.end);
  const iinf = children.find((x) => x.type === "iinf");
  const iloc = children.find((x) => x.type === "iloc");
  const idat = children.find((x) => x.type === "idat");
  if (!iinf) return fail("no item table"); // cannot say there is no Exif item
  const targets = metadataItemIds(b, iinf);
  if (targets.size === 0) return b.slice();
  if (!iloc) return fail("metadata item without iloc");

  const out = b.slice();
  let p = iloc.payload;
  const version = b[p]!;
  if (version > 2) fail("iloc version");
  p += 4;
  const offsetSize = b[p]! >> 4;
  const lengthSize = b[p]! & 15;
  const baseSize = b[p + 1]! >> 4;
  const indexSize = version >= 1 ? b[p + 1]! & 15 : 0;
  for (const size of [offsetSize, lengthSize, baseSize, indexSize]) if (size !== 0 && size !== 4 && size !== 8) fail("iloc field size");
  p += 2;
  const idSize = version < 2 ? 2 : 4;
  if (p + (version < 2 ? 2 : 4) > iloc.end) fail("iloc header");
  const count = version < 2 ? be16(b, p) : be32(b, p);
  p += version < 2 ? 2 : 4;
  const entryMin = idSize + (version >= 1 ? 2 : 0) + 2 + baseSize + 2;
  if (count * entryMin > iloc.end - p) fail("iloc count");
  const extentSize = indexSize + offsetSize + lengthSize;
  for (let n = 0; n < count; n++) {
    if (p + entryMin > iloc.end) fail("iloc entry past end");
    const id = version < 2 ? be16(b, p) : be32(b, p);
    p += version < 2 ? 2 : 4;
    let method = 0;
    if (version >= 1) {
      method = be16(b, p) & 0x0f;
      p += 2;
    }
    p += 2; // data reference index
    const base = readUint(b, p, baseSize);
    p += baseSize;
    const extents = be16(b, p);
    p += 2;
    if (extents > 0 && (extentSize === 0 || extents * extentSize > iloc.end - p)) fail("iloc extents");
    for (let e = 0; e < extents; e++) {
      p += indexSize;
      const offset = readUint(b, p, offsetSize);
      p += offsetSize;
      const length = readUint(b, p, lengthSize);
      p += lengthSize;
      if (!targets.has(id)) continue;
      if (length === 0) fail("metadata extent of unknown length");
      let from: number;
      if (method === 0) from = base + offset;
      else if (method === 1 && idat) from = idat.payload + base + offset;
      else return fail("metadata item construction method");
      if (from + length > b.length) fail("metadata extent past end");
      out.fill(0, from, from + length);
    }
  }
  return out;
}

const STRIPPERS: Record<string, (b: Uint8Array) => Uint8Array> = {
  "image/jpeg": stripJpeg,
  "image/png": stripPng,
  "image/webp": stripWebp,
  "image/heic": stripHeic,
  "image/heif": stripHeic,
};

/** Returns the photo without Exif, XMP, IPTC and text metadata, or VALIDATION_FAILED if it cannot be read. */
export function stripImageMetadata(mime: string, bytes: Uint8Array): Result<Uint8Array> {
  const strip = STRIPPERS[mime];
  const unreadable = () =>
    err("VALIDATION_FAILED", "The photo could not be processed. Please send it as a JPEG.", { details: { field: "image" } });
  if (!strip) return unreadable();
  try {
    return ok(strip(bytes));
  } catch (e) {
    if (e instanceof Unreadable || e instanceof RangeError) return unreadable();
    throw e;
  }
}
