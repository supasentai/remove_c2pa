import { makeZip } from './lib/c2pa.js';

const $ = id => document.getElementById(id);
const MAX_FILE = 50 * 1024 * 1024, MAX_TOTAL = 200 * 1024 * 1024;
const items = [];
let busy = false, nextId = 0, requestId = 0, selectedId = null;
let previewUrls = [], workerError = '';
const requests = new Map();
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

function rejectRequests(message) {
  for (const task of requests.values()) { clearTimeout(task.timer); task.reject(new Error(message)); }
  requests.clear();
}
worker.onmessage = ({ data }) => {
  const task = requests.get(data.id);
  if (!task) return;
  requests.delete(data.id); clearTimeout(task.timer);
  if (data.error) task.reject(new Error(data.error)); else task.resolve(data);
};
worker.onerror = () => {
  workerError = 'Không khởi tạo được bộ xử lý. Hãy tải lại trang bằng máy chủ HTTP cục bộ.';
  rejectRequests(workerError); notice(workerError, true);
};
function clean(buffer) {
  return new Promise((resolve, reject) => {
    if (workerError) { reject(new Error(workerError)); return; }
    const id = ++requestId;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('Xử lý quá lâu. Hãy thử ảnh nhỏ hơn hoặc tải lại trang.')); }, 60000);
    requests.set(id, { resolve, reject, timer });
    worker.postMessage({ id, buffer }, [buffer]);
  });
}

function size(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}
function notice(message = '', error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function safeName(name, extension) {
  const base = name.replace(/\.[^.]*$/, '').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 100).replace(/[. ]+$/, '') || 'image';
  return `${base}-clean.${extension}`;
}
function resetPreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
  $('before-image').removeAttribute('src'); $('after-image').removeAttribute('src');
  $('preview-download').removeAttribute('href'); $('preview').hidden = true; selectedId = null;
}
function showPreview(item) {
  resetPreview();
  if (!item.result) return;
  selectedId = item.id;
  const result = item.result;
  previewUrls = [URL.createObjectURL(item.file), URL.createObjectURL(result.blob)];
  $('before-image').src = previewUrls[0]; $('after-image').src = previewUrls[1];
  $('preview-title').textContent = item.file.name;
  $('before-size').textContent = `${result.before.format} · ${size(item.file.size)}`;
  $('after-size').textContent = `${result.format} · ${size(result.blob.size)}`;
  $('preview-download').href = previewUrls[1]; $('preview-download').download = result.name;
  $('result-state').textContent = result.before.blocks ? 'Đã xóa C2PA nhúng và kiểm tra lại đầu ra.' : 'Không tìm thấy C2PA nhúng trong ảnh đầu vào.';
  $('result-detail').textContent = result.mode === 'jpeg'
    ? `Đã xuất JPG mới ở chất lượng ${result.quality}%. Đầu ra không có khối C2PA nhúng được hỗ trợ. JPG có nén mất dữ liệu; nền trong suốt chuyển trắng và ảnh động được làm phẳng.`
    : `Đã loại bỏ ${result.before.blocks} khối chứa C2PA (${size(result.before.metadataBytes)}). Dữ liệu ảnh và metadata khác được giữ nguyên. Liên kết XMP, watermark và manifest bên ngoài không nằm trong phép kiểm tra này.`;
  $('preview').hidden = false;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function render() {
  $('queue-panel').hidden = !items.length;
  $('queue-count').textContent = items.length;
  $('queue').replaceChildren();
  for (const item of items) {
    const row = document.createElement('li'); row.className = 'queue-item';
    const kind = document.createElement('span'); kind.className = 'file-kind'; kind.textContent = item.result?.before.format || 'ẢNH';
    const info = document.createElement('div'); info.className = 'file-info';
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = item.file.name; name.title = item.file.name;
    const status = document.createElement('span'); status.className = `file-status${item.error ? ' error' : ''}`;
    status.textContent = item.error || item.status || `${size(item.file.size)} · Chờ xử lý`;
    info.append(name, status);
    const actions = document.createElement('div'); actions.className = 'file-actions';
    if (item.result) {
      const view = document.createElement('button'); view.className = 'text-button'; view.textContent = 'Xem'; view.type = 'button';
      view.setAttribute('aria-label', `Xem kết quả ${item.file.name}`); view.onclick = () => showPreview(item); actions.append(view);
      const save = document.createElement('button'); save.className = 'text-button'; save.textContent = 'Tải'; save.type = 'button';
      save.setAttribute('aria-label', `Tải ${item.file.name}`); save.onclick = () => download(item.result.blob, item.result.name); actions.append(save);
    }
    const remove = document.createElement('button'); remove.className = 'text-button remove-button'; remove.textContent = '×'; remove.type = 'button';
    remove.setAttribute('aria-label', `Bỏ ${item.file.name}`); remove.disabled = busy;
    remove.onclick = () => { if (selectedId === item.id) resetPreview(); items.splice(items.indexOf(item), 1); render(); notice(); };
    actions.append(remove); row.append(kind, info, actions); $('queue').append(row);
  }
  $('choose').disabled = busy; $('clear').disabled = busy; $('mode-fieldset').disabled = busy; $('quality').disabled = busy;
  $('process').disabled = busy || !items.length;
  $('process').textContent = busy ? 'Đang xử lý…' : items.some(item => item.result) ? 'Xử lý lại' : 'Xử lý ảnh →';
  $('download-all').hidden = busy || !items.some(item => item.result);
  $('dropzone').setAttribute('aria-busy', String(busy));
}

function addFiles(files) {
  if (busy) { notice('Đợi lượt xử lý hiện tại hoàn tất rồi thêm ảnh.'); return; }
  const errors = [];
  let total = items.reduce((sum, item) => sum + item.file.size, 0), added = 0;
  for (const file of files) {
    if (items.length >= 20) { errors.push('Tối đa 20 ảnh mỗi lượt.'); break; }
    if (!file.size || file.size > MAX_FILE) { errors.push(`${file.name}: ảnh phải lớn hơn 0 và không quá 50 MB.`); continue; }
    if (total + file.size > MAX_TOTAL) { errors.push(`${file.name}: tổng dung lượng vượt 200 MB.`); continue; }
    // Signature detection in the worker is authoritative, not extension or supplied MIME type.
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { errors.push(`${file.name}: chỉ hỗ trợ JPEG, PNG, WebP.`); continue; }
    if (items.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    items.push({ id: ++nextId, file }); total += file.size; added++;
  }
  notice(errors.length ? errors.join(' ') : added ? `Đã thêm ${added} ảnh. Chọn cách xuất rồi bấm Xử lý ảnh.` : 'Ảnh đã có trong danh sách.', !!errors.length);
  render();
}

async function asJpeg(buffer, mime, quality) {
  const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Xuất JPG hỗ trợ tối đa 40 megapixel. Hãy dùng chế độ giữ định dạng gốc.');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không thể xuất JPG. Thử ảnh nhỏ hơn.')), 'image/jpeg', quality / 100));
    canvas.width = 0; canvas.height = 0;
    if (blob.type !== 'image/jpeg') throw new Error('Trình duyệt không hỗ trợ xuất JPG.');
    return blob;
  } finally { bitmap.close(); }
}

$('choose').onclick = () => $('files').click();
$('files').onchange = event => { addFiles(event.target.files); event.target.value = ''; };
for (const eventName of ['dragenter', 'dragover']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); if (!busy) $('dropzone').classList.add('drag-over'); });
$('dropzone').addEventListener('dragleave', event => { if (!$('dropzone').contains(event.relatedTarget)) $('dropzone').classList.remove('drag-over'); });
$('dropzone').addEventListener('drop', event => { event.preventDefault(); $('dropzone').classList.remove('drag-over'); addFiles(event.dataTransfer.files); });
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('clear').onclick = () => { if (busy) return; resetPreview(); items.length = 0; notice(); render(); };
function settingsChanged() {
  $('quality-group').hidden = document.querySelector('input[name=mode]:checked').value !== 'jpeg';
  $('quality-value').textContent = `${$('quality').value}%`;
  resetPreview();
  for (const item of items) { delete item.result; delete item.error; delete item.status; }
  notice(items.length ? 'Đã đổi cách xuất. Bấm Xử lý ảnh để tạo kết quả mới.' : ''); render();
}
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', settingsChanged));
$('quality').addEventListener('input', settingsChanged);
$('process').onclick = async () => {
  if (busy || !items.length) return;
  busy = true; resetPreview();
  const mode = document.querySelector('input[name=mode]:checked').value, quality = Number($('quality').value);
  for (const item of items) { delete item.result; delete item.error; delete item.status; }
  render();
  let succeeded = 0;
  try {
    for (const [index, item] of items.entries()) {
      item.status = 'Đang đọc cấu trúc và xử lý…'; render(); notice(`Đang xử lý ${index + 1}/${items.length}: ${item.file.name}`);
      try {
        const first = await clean(await item.file.arrayBuffer());
        let blob = new Blob([first.output], { type: first.before.mime });
        let format = first.before.format, extension = first.before.extension;
        if (mode === 'jpeg') {
          blob = await asJpeg(first.output, first.before.mime, quality);
          const checked = await clean(await blob.arrayBuffer());
          if (checked.before.blocks) throw new Error('Ảnh JPG mới có C2PA nhúng ngoài dự kiến.');
          format = 'JPEG'; extension = 'jpg';
        }
        item.result = { blob, name: safeName(item.file.name, extension), before: first.before, format, mode, quality };
        item.status = `${first.before.blocks ? 'Đã xóa C2PA nhúng' : 'Không có C2PA nhúng'} · ${size(blob.size)}`;
        succeeded++;
        if (selectedId === null) showPreview(item);
      } catch (error) { item.error = error.message || 'Không thể xử lý ảnh này.'; delete item.status; }
      render();
    }
  } finally {
    busy = false; render();
    notice(`Hoàn tất ${succeeded}/${items.length} ảnh.${succeeded < items.length ? ' Xem thông báo tại từng ảnh bị lỗi.' : ' Bạn có thể xem và tải kết quả bên dưới.'}`, succeeded < items.length);
  }
};
$('download-all').onclick = async () => {
  if (busy) return;
  const ready = items.filter(item => item.result);
  if (!ready.length) return;
  busy = true; render(); notice('Đang đóng gói ZIP…');
  try {
    const files = [];
    for (const [index, item] of ready.entries()) files.push({ name: `${String(index + 1).padStart(2, '0')}-${item.result.name}`, bytes: new Uint8Array(await item.result.blob.arrayBuffer()) });
    download(makeZip(files), 'clearframe-images.zip'); notice(`Đã tạo ZIP gồm ${ready.length} ảnh.`);
  } catch (error) { notice(`Không tạo được ZIP: ${error.message}`, true); }
  finally { busy = false; render(); }
};
window.addEventListener('pagehide', () => { resetPreview(); rejectRequests('Đã đóng trang.'); worker.terminate(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
render();
