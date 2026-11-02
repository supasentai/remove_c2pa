# Clearframe

Công cụ xóa C2PA nhúng khỏi JPEG, PNG và WebP ngay trong trình duyệt. Giao diện tiếng Việt, không tài khoản, không API, không tải ảnh lên máy chủ. Không cần cài thư viện ngoài.

## Chạy cục bộ

Cần Node.js 20 trở lên.

```powershell
cd C:\Users\ADMIN\Documents\DANDANKOREA\remove_c2pa
npm run dev
```

Mở http://127.0.0.1:4173. Chọn hoặc thả ảnh, chọn cách xuất, bấm **Xử lý ảnh**, xem trước và tải từng ảnh hoặc tải ZIP. Dừng máy chủ bằng Ctrl+C. Không mở `index.html` qua `file://`, vì ứng dụng dùng ES modules và Web Worker.

## Tính năng

- **Giữ định dạng gốc**: xóa các APP11 chứa C2PA/JUMBF của JPEG, chunk `caBX` chứa C2PA của PNG và chunk `C2PA` của WebP. Không giải mã hoặc nén lại dữ liệu ảnh. Metadata khác được giữ nguyên; RIFF size của WebP được cập nhật.
- **Xuất JPG mới**: giải mã vào Canvas và xuất JPEG với chất lượng 60–100%. Không sao chép metadata gốc; nền trong suốt thành trắng, ảnh động chỉ còn một khung hình. Màu sắc có thể thay đổi và JPEG vẫn có nén mất dữ liệu kể cả khi chọn 100%.
- Kiểm tra lại cấu trúc đầu ra; xử lý riêng lỗi từng file; xem trước trước/sau; tải ZIP có tên UTF-8.
- Tối đa 20 ảnh, 50 MiB/ảnh, 200 MiB/lượt. Xuất JPG tối đa 40 megapixel. Giới hạn bộ nhớ thực tế còn tùy thiết bị.
- Giao diện responsive, hỗ trợ bàn phím và trạng thái lỗi/đang xử lý. Phần đọc cấu trúc chạy trong Web Worker.
- CSP chặn kết nối của ứng dụng (`connect-src 'none'`), không analytics, CDN hay font bên ngoài. Máy chủ chỉ phục vụ file tĩnh và không có endpoint nhận ảnh.

## Giới hạn chính xác

Ứng dụng chỉ xác định và xóa **manifest C2PA nhúng trong các container được hỗ trợ**. Không xác minh chữ ký, không gọi dịch vụ dò nguồn gốc và không bảo đảm loại bỏ nhãn AI của nền tảng khác.

Chế độ giữ định dạng gốc **giữ XMP/EXIF/IPTC**, kể cả liên kết C2PA tới manifest bên ngoài trong XMP. Không xóa manifest bên ngoài, fingerprint hoặc watermark vô hình. Không xóa watermark nhìn thấy trong pixel.

PNG/WebP có hoạt ảnh được giữ nguyên dữ liệu ở chế độ gốc. JPEG MPF/MPO, một số ảnh HDR, file có dữ liệu sau EOI của JPEG hoặc sau IEND của PNG, các file bị cắt ngắn/CRC PNG lỗi sẽ bị từ chối để tránh xuất file có cấu trúc không an toàn. Chưa hỗ trợ HEIC, AVIF, video hoặc PDF. Bộ kiểm tra container không phải bộ giải mã ảnh đầy đủ.

## Build và triển khai tĩnh

```powershell
npm test
npm run build
npm start
```

`dist/` là bản phân phối độc lập, có thể phục vụ bằng bất kỳ static host nào qua HTTPS. Không có backend và không chứa ảnh mẫu kiểm thử. Chưa đăng ký hoặc triển khai lên dịch vụ hosting nào.

## Kiểm thử

`npm test` chạy unit test cho CRC, loại bỏ C2PA của ba định dạng, JUMBF nhiều segment với header lặp, JPEG nhiều scan, bảo toàn metadata/hoạt ảnh, từ chối dữ liệu lỗi, tính lặp lại và cấu trúc ZIP.

Ảnh mẫu tích hợp là tùy chọn, không được commit hoặc đưa vào bản build:

```powershell
npm run fixtures
npm test
npm run test:browser
```

Mở http://127.0.0.1:4174/__tests/browser.html. Trang QA lấy ảnh mẫu qua máy chủ cục bộ, tự chạy hai chế độ, kiểm tra xem trước, thay đổi chế độ, kết quả ba ảnh và lỗi một ảnh. Dòng **PASS** báo hoàn tất. Test này không kiểm tra hộp thoại chọn file của hệ điều hành. Máy chủ QA chỉ dành cho phát triển; chỉ bind `127.0.0.1` và không được đưa lên hosting.

Nguồn fixture công khai: [C.jpg của Content Authenticity](https://github.com/contentauth/c2patool/blob/main/sample/C.jpg), [libpng-test.png](https://github.com/contentauth/c2pa-rs/blob/main/sdk/tests/fixtures/libpng-test.png), [sample1.webp](https://github.com/contentauth/c2pa-rs/blob/main/sdk/tests/fixtures/sample1.webp). Các mẫu `with-c2pa.png` và `with-c2pa.webp` gắn lại manifest của JPEG để kiểm tra cấu trúc; **chữ ký không hợp lệ với nội dung mới**, không được coi là ảnh đã ký hợp lệ. Tôn trọng điều khoản và bản quyền của các kho nguồn nếu phân phối lại fixture.

## Cấu trúc

```text
public/                 Ứng dụng tĩnh
  lib/c2pa.js           Đọc container, xóa C2PA và tạo ZIP
  worker.js             Xử lý cấu trúc ngoài luồng giao diện
  app.js                Hàng đợi, Canvas, xem trước, tải xuống
scripts/                Máy chủ cục bộ, build và chuẩn bị fixture
test/                   Unit/integration test và trang browser QA
dist/                   Bản build (không commit)
```

Tài liệu kỹ thuật: [C2PA specification](https://spec.c2pa.org/specifications/specifications/2.5/specs/C2PA_Specification.html), [JPEG handler của SDK tham chiếu](https://github.com/contentauth/c2pa-rs/blob/main/sdk/src/asset_handlers/jpeg_io.rs), [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).
