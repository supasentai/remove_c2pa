// Authored test harness. Fixtures arrive over this local test server, not browser file access.
const frame = document.querySelector('iframe'), status = document.querySelector('#status');
const waitFor = async predicate => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Timeout waiting for browser processing.');
};
try {
  await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  const doc = frame.contentDocument;
  await waitFor(() => doc.querySelector('#choose'));
  const transfer = new DataTransfer();
  for (const name of ['C.jpg', 'with-c2pa.png', 'with-c2pa.webp', 'broken.png']) {
    const response = await fetch(`./fixtures/${name}`);
    if (!response.ok) throw new Error('Run npm run fixtures first.');
    transfer.items.add(new File([await response.arrayBuffer()], name));
  }
  const input = doc.querySelector('#files'); input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  doc.querySelector('#process').click();
  await waitFor(() => doc.querySelector('#notice').textContent.startsWith('Hoàn tất'));
  if (!doc.querySelector('#notice').textContent.includes('3/4')) throw new Error('Expected 3 successful images and one rejected image.');
  if (doc.querySelectorAll('.file-status.error').length !== 1) throw new Error('Error state missing.');
  if (!doc.querySelector('#result-state').textContent.includes('Đã xóa')) throw new Error('Removal report missing.');
  await waitFor(() => doc.querySelector('#after-image').complete && doc.querySelector('#after-image').naturalWidth > 0);
  const beforeWidth = doc.querySelector('#before-image').naturalWidth;
  if (beforeWidth !== doc.querySelector('#after-image').naturalWidth) throw new Error('Output dimensions changed.');
  doc.querySelector('input[value=jpeg]').click();
  if (!doc.querySelector('#preview').hidden) throw new Error('Stale preview retained after mode change.');
  doc.querySelector('#process').click();
  await waitFor(() => doc.querySelector('#notice').textContent.startsWith('Hoàn tất'));
  if (!doc.querySelector('#notice').textContent.includes('3/4')) throw new Error('JPG conversion failed.');
  if (!doc.querySelector('#after-size').textContent.startsWith('JPEG')) throw new Error('JPG result type incorrect.');
  await waitFor(() => doc.querySelector('#after-image').complete && doc.querySelector('#after-image').naturalWidth > 0);
  if (doc.querySelector('#download-all').hidden) throw new Error('ZIP download unavailable.');
  status.textContent = 'PASS: xóa C2PA JPEG/PNG/WebP, xuất JPG, đọc lại đầu ra, xem trước, đổi chế độ và từ chối file lỗi.';
  document.body.dataset.result = 'passed';
} catch (error) { status.textContent = `FAIL: ${error.message}`; document.body.dataset.result = 'failed'; }
