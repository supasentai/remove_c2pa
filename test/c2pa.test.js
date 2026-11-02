import test from 'node:test';
import assert from 'node:assert/strict';
import { concat, crc32, inspect, removeC2pa, makeZip } from '../public/lib/c2pa.js';

const text = value => new TextEncoder().encode(value);
const u32 = value => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value); return b; };
const uintLE = value => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); return b; };
const uuid = Uint8Array.from([0x63, 0x32, 0x70, 0x61, 0, 0x11, 0, 0x10, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71]);
const box = (type, data) => concat([u32(data.length + 8), text(type), data]);
const manifest = (extra = new Uint8Array()) => box('jumb', concat([box('jumd', concat([uuid, new Uint8Array([3]), text('c2pa\0')])), extra]));
const foreign = box('jumb', box('jumd', new Uint8Array(25)));
function chunk(type, data) { const content = concat([text(type), data]); return concat([u32(data.length), content, u32(crc32(content))]); }
const pngHeader = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const makePng = chunks => concat([pngHeader, chunk('IHDR', ihdr), ...chunks, chunk('IDAT', new Uint8Array([1, 2, 3])), chunk('IEND', new Uint8Array())]);
function segment(marker, data) { const size = data.length + 2; return concat([Uint8Array.from([255, marker, size >> 8, size & 255]), data]); }
const scan = segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
const entropy = Uint8Array.from([1, 255, 0, 235, 2, 255, 208, 3]);
const makeJpeg = segments => concat([new Uint8Array([255, 216]), ...segments, scan, entropy, new Uint8Array([255, 217])]);
function packets(data, split = data.length, instance = 2) {
  const result = [];
  for (let start = 0, n = 1; start < data.length; start += split, n++) {
    const prefix = concat([text('JP'), Uint8Array.from([instance >> 8, instance & 255]), u32(n)]);
    result.push(segment(0xeb, concat([prefix, ...(n > 1 ? [data.subarray(0, 8)] : []), data.subarray(start, start + split)])));
  }
  return result;
}
function riffChunk(type, data) { return concat([text(type), uintLE(data.length), data, new Uint8Array(data.length & 1)]); }
function makeWebp(chunks) { const data = concat([text('WEBP'), ...chunks]); return concat([text('RIFF'), uintLE(data.length), data]); }

test('CRC32 agrees with the standard test vector', () => assert.equal(crc32(text('123456789')), 0xcbf43926));
test('PNG removes C2PA and keeps all other chunks byte for byte', () => {
  const extras = [chunk('tEXt', text('Comment\0Keep me')), chunk('caBX', foreign), chunk('acTL', new Uint8Array(8))];
  const clean = makePng(extras), input = makePng([chunk('caBX', manifest()), ...extras, chunk('caBX', manifest())]);
  const result = removeC2pa(input);
  assert.equal(result.before.blocks, 2); assert.equal(result.after.blocks, 0); assert.deepEqual(result.output, clean);
  assert.deepEqual(removeC2pa(result.output).output, clean);
});
test('PNG rejects bad CRC, chunk bounds, missing IEND and trailing data', () => {
  const clean = makePng([]);
  const corrupt = clean.slice(); corrupt[30] ^= 1;
  assert.throws(() => inspect(corrupt), /CRC/);
  assert.throws(() => inspect(clean.subarray(0, clean.length - 3)));
  assert.throws(() => inspect(concat([clean, text('trailer')])));
  const bad = clean.slice(); bad.set(u32(0xffffffff), 8); assert.throws(() => inspect(bad));
});
test('PNG refuses a truncated JUMBF instead of reporting success', () => {
  assert.throws(() => removeC2pa(makePng([chunk('caBX', manifest().subarray(0, 20))])), /JUMBF/);
});
test('JPEG removes multipart APP11 with repeated headers, preserving EXIF and foreign APP11', () => {
  const keep = [segment(0xe1, text('Exif\0\0preserve-orientation-and-icc')), ...packets(foreign, foreign.length, 3), segment(0xeb, text('non-JUMBF APP11'))];
  const input = makeJpeg([...keep, ...packets(manifest(new Uint8Array(140000)), 64000)]);
  const result = removeC2pa(input);
  assert.equal(result.before.blocks, 3); assert.deepEqual(result.output, makeJpeg(keep));
  assert.equal(result.after.blocks, 0);
});
test('JPEG supports C2PA between scans in progressive image structure', () => {
  const input = makeJpeg([scan, entropy, ...packets(manifest())]);
  assert.deepEqual(removeC2pa(input).output, makeJpeg([scan, entropy]));
});
test('JPEG rejects truncated, missing and reordered JUMBF segments', () => {
  const parts = packets(manifest(new Uint8Array(100)), 50);
  assert.throws(() => inspect(makeJpeg([parts[0], parts[2]])), /Thứ tự/);
  assert.throws(() => inspect(makeJpeg([parts[1], parts[0]])));
  assert.throws(() => inspect(makeJpeg([parts[0]])), /JUMBF/);
  assert.throws(() => inspect(makeJpeg([]).subarray(0, 8)));
});
test('JPEG recognizes a C2PA description without an optional label', () => {
  assert.equal(inspect(makeJpeg(packets(box('jumb', box('jumd', concat([uuid, new Uint8Array([0])])))))).blocks, 1);
});
test('JPEG refuses MPF offsets and unparsed trailers to avoid corrupting multi-image files', () => {
  assert.throws(() => removeC2pa(makeJpeg([segment(0xe2, text('MPF\0offsets'))])), /MPF/);
  assert.throws(() => removeC2pa(concat([makeJpeg([]), text('trailer')])), /EOI/);
});
test('WebP removes odd-sized C2PA chunks and updates RIFF size; animation/EXIF intact', () => {
  const keep = [riffChunk('VP8X', new Uint8Array(10)), riffChunk('ANIM', new Uint8Array(6)), riffChunk('ANMF', new Uint8Array(18)), riffChunk('EXIF', text('keep'))];
  const input = makeWebp([...keep, riffChunk('C2PA', text('abc'))]);
  const result = removeC2pa(input);
  assert.deepEqual(result.output, makeWebp(keep)); assert.equal(result.after.blocks, 0);
});
test('WebP rejects malformed RIFF lengths and missing image data', () => {
  const input = makeWebp([riffChunk('VP8 ', new Uint8Array(4))]);
  assert.throws(() => inspect(input.subarray(0, input.length - 1)));
  const bad = input.slice(); bad.set(uintLE(0xffffffff), 16); assert.throws(() => inspect(bad));
  assert.throws(() => inspect(makeWebp([riffChunk('C2PA', text('a'))])), /dữ liệu ảnh/);
});
test('clean files are identical after removal across supported formats', () => {
  for (const input of [makePng([]), makeJpeg([]), makeWebp([riffChunk('VP8 ', text('data'))])]) {
    assert.equal(inspect(input).blocks, 0); assert.deepEqual(removeC2pa(input).output, input);
  }
});
test('unknown file types and empty input are rejected', () => {
  for (const input of [new Uint8Array(), text('not an image'), text('<svg></svg>')]) assert.throws(() => inspect(input), /Chỉ hỗ trợ/);
});
test('ZIP stores UTF-8 filenames, file bytes, CRC and central directory offsets', async () => {
  const files = [{ name: '01-ảnh.png', bytes: text('hello') }, { name: '02-other.jpg', bytes: text('world') }];
  const zip = new Uint8Array(await makeZip(files).arrayBuffer()), view = new DataView(zip.buffer);
  let offset = 0;
  for (const file of files) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    assert.equal(view.getUint16(offset + 6, true), 0x800);
    assert.equal(view.getUint32(offset + 14, true), crc32(file.bytes));
    const length = view.getUint16(offset + 26, true);
    assert.equal(new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + length)), file.name);
    assert.deepEqual(zip.subarray(offset + 30 + length, offset + 30 + length + file.bytes.length), file.bytes);
    offset += 30 + length + file.bytes.length;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(zip.length - 6, true), offset);
  assert.equal(view.getUint16(zip.length - 12, true), 2);
});
