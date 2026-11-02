// Container inspection only. This module does not validate signatures or discover remote manifests.
const encoder = new TextEncoder();
const signature = [0x63, 0x32, 0x70, 0x61, 0, 0x11, 0, 0x10, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
const fail = message => { throw new Error(message); };
const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const be = (bytes, offset) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
const le = (bytes, offset) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
const equal = (bytes, offset, values) => values.every((value, i) => bytes[offset + i] === value);

export function concat(parts) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function c2paBox(bytes) {
  let offset = 0;
  let found = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('Khối JUMBF bị cắt ngắn.');
    let size = be(bytes, offset), header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) fail('Header JUMBF không đầy đủ.');
      const wide = new DataView(bytes.buffer, bytes.byteOffset + offset + 8, 8).getBigUint64(0);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) fail('Khối JUMBF quá lớn.');
      size = Number(wide); header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) fail('Kích thước JUMBF không hợp lệ.');
    if (ascii(bytes, offset + 4, 4) === 'jumb') {
      const child = offset + header;
      if (child + 25 <= offset + size && ascii(bytes, child + 4, 4) === 'jumd'
        && be(bytes, child) >= 25 && child + be(bytes, child) <= offset + size
        && equal(bytes, child + 8, signature)) found = true;
    }
    offset += size;
  }
  return found;
}

function png(bytes) {
  const ranges = [];
  let offset = 8, chunks = 0, ended = false, hasData = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('PNG bị cắt ngắn.');
    const size = be(bytes, offset), end = offset + size + 12;
    if (end > bytes.length) fail('Kích thước chunk PNG không hợp lệ.');
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) fail('Tên chunk PNG không hợp lệ.');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== be(bytes, end - 4)) fail(`PNG có CRC không hợp lệ (${type}).`);
    if (!chunks && (type !== 'IHDR' || size !== 13)) fail('PNG thiếu IHDR hợp lệ.');
    if (chunks && type === 'IHDR') fail('PNG có nhiều IHDR.');
    if (type === 'caBX' && c2paBox(bytes.subarray(offset + 8, end - 4))) ranges.push([offset, end]);
    if (type === 'IDAT') hasData = true;
    chunks++;
    offset = end;
    if (type === 'IEND') { if (size !== 0) fail('IEND không hợp lệ.'); ended = true; break; }
  }
  if (!ended || !hasData || offset !== bytes.length) fail('PNG thiếu dữ liệu ảnh hoặc có dữ liệu ngoài IEND.');
  return { format: 'PNG', mime: 'image/png', extension: 'png', ranges };
}

function webp(bytes) {
  if (bytes.length < 20 || le(bytes, 4) + 8 !== bytes.length) fail('Kích thước RIFF/WebP không hợp lệ.');
  const ranges = [];
  let offset = 12, image = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('Header WebP bị cắt ngắn.');
    const type = ascii(bytes, offset, 4), size = le(bytes, offset + 4);
    const end = offset + 8 + size + (size & 1);
    if (end > bytes.length) fail('Chunk WebP bị cắt ngắn.');
    if (type === 'C2PA') ranges.push([offset, end]);
    if (['VP8 ', 'VP8L', 'ANMF'].includes(type)) image = true;
    offset = end;
  }
  if (!image) fail('WebP thiếu dữ liệu ảnh.');
  return { format: 'WebP', mime: 'image/webp', extension: 'webp', ranges };
}

function jpeg(bytes) {
  const groups = new Map(), streams = [];
  let offset = 2, ended = false, hasScan = false;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) fail('Marker JPEG không hợp lệ.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) { ended = true; break; }
    if (marker === 0x00 || marker === 0xd8 || marker === undefined) fail('Cấu trúc JPEG không hợp lệ.');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail('JPEG bị cắt ngắn.');
    const size = bytes[offset] * 256 + bytes[offset + 1], end = offset + size;
    if (size < 2 || end > bytes.length) fail('Kích thước segment JPEG không hợp lệ.');
    const payload = offset + 2;
    if (marker === 0xe2 && ascii(bytes, payload, 4) === 'MPF\0') fail('JPEG nhiều ảnh (MPF/MPO, một số ảnh HDR) chưa được hỗ trợ.');
    if (marker === 0xeb && size >= 10 && ascii(bytes, payload, 2) === 'JP') {
      const instance = bytes[payload + 2] * 256 + bytes[payload + 3];
      const sequence = be(bytes, payload + 4);
      // An instance can be reused for a later, independent JUMBF stream.
      if (sequence === 1 || !groups.has(instance)) {
        const group = [];
        groups.set(instance, group);
        streams.push(group);
      }
      groups.get(instance).push({ sequence, data: bytes.subarray(payload + 8, end), range: [start, end] });
    }
    offset = end;
    if (marker === 0xda) {
      hasScan = true;
      // Walk entropy-coded data; escaped FF and restart markers are image bytes.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const boundary = offset++;
        while (bytes[offset] === 0xff) offset++;
        if (bytes[offset] === 0 || (bytes[offset] >= 0xd0 && bytes[offset] <= 0xd7)) { offset++; continue; }
        offset = boundary; break;
      }
    }
  }
  if (!ended || !hasScan) fail('JPEG thiếu scan ảnh hoặc marker kết thúc.');
  if (offset !== bytes.length) fail('JPEG có dữ liệu sau EOI hoặc chứa nhiều ảnh, chưa được hỗ trợ.');
  const ranges = [];
  for (const stream of streams) {
    if (!stream.every((part, i) => part.sequence === i + 1)) fail('Thứ tự các segment JUMBF không hợp lệ.');
    const first = stream[0].data;
    if (first.length < 8) fail('Header JUMBF trong JPEG bị cắt ngắn.');
    const headerSize = be(first, 0) === 1 ? 16 : 8;
    // JPEG XT repeats LBox/TBox (and XLBox, when present) in every APP11 packet.
    const content = stream.map((part, i) => {
      if (part.data.length < headerSize || !equal(part.data, 0, first.subarray(0, headerSize))) fail('Header JUMBF trong JPEG không nhất quán.');
      return i ? part.data.subarray(headerSize) : part.data;
    });
    if (c2paBox(concat(content))) ranges.push(...stream.map(part => part.range));
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return { format: 'JPEG', mime: 'image/jpeg', extension: 'jpg', ranges };
}

export function inspect(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let result;
  if (equal(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) result = png(bytes);
  else if (equal(bytes, 0, [255, 216])) result = jpeg(bytes);
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') result = webp(bytes);
  else fail('Chỉ hỗ trợ ảnh JPEG, PNG và WebP.');
  return { ...result, blocks: result.ranges.length, metadataBytes: result.ranges.reduce((sum, [start, end]) => sum + end - start, 0) };
}

export function removeC2pa(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const before = inspect(bytes), parts = [];
  let offset = 0;
  for (const [start, end] of before.ranges) { parts.push(bytes.subarray(offset, start)); offset = end; }
  parts.push(bytes.subarray(offset));
  const output = concat(parts);
  if (before.format === 'WebP') new DataView(output.buffer).setUint32(4, output.length - 8, true);
  const after = inspect(output);
  if (after.blocks) fail('Đầu ra vẫn còn khối C2PA nhúng.');
  return { output, before, after };
}

export function makeZip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const filename = encoder.encode(name);
    const header = new Uint8Array(30 + filename.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 0x21, true); view.setUint32(14, crc32(bytes), true);
    view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true);
    view.setUint16(26, filename.length, true); header.set(filename, 30);
    const entry = new Uint8Array(46 + filename.length), ev = new DataView(entry.buffer);
    ev.setUint32(0, 0x02014b50, true); ev.setUint16(4, 20, true); ev.setUint16(6, 20, true);
    ev.setUint16(8, 0x800, true); ev.setUint16(14, 0x21, true);
    ev.setUint32(16, crc32(bytes), true); ev.setUint32(20, bytes.length, true); ev.setUint32(24, bytes.length, true);
    ev.setUint16(28, filename.length, true); ev.setUint32(42, offset, true); entry.set(filename, 46);
    local.push(header, bytes); central.push(entry); offset += header.length + bytes.length;
  }
  const directory = concat(central), end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, directory.length, true); view.setUint32(16, offset, true);
  return new Blob([...local, directory, end], { type: 'application/zip' });
}
