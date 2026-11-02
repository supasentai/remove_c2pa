# Clearframe

A browser-based tool for removing embedded C2PA metadata from JPEG, PNG, and WebP images. The interface is in Vietnamese. No account, API, or image uploads are required. No third-party dependencies need to be installed.

## Run locally

Requires Node.js 20 or later.

```powershell
cd C:\Users\ADMIN\Documents\DANDANKOREA\remove_c2pa
npm run dev
```

Open http://127.0.0.1:4173. Select or drop images, choose an output mode, click **Xử lý ảnh** (Process images), preview the results, and download individual images or a ZIP archive. Press Ctrl+C to stop the server. Do not open `index.html` through `file://`; the application uses ES modules and a Web Worker.

## Features

- **Keep the original format**: removes JPEG APP11 segments containing C2PA/JUMBF, PNG `caBX` chunks containing C2PA, and WebP `C2PA` chunks. Image data is neither decoded nor recompressed. Other metadata is preserved, and the WebP RIFF size is updated.
- **Export a new JPG**: decodes the image into a Canvas and exports a JPEG at 60–100% quality. Original metadata is not copied. Transparency becomes white, and animated images are flattened to a single frame. Colors may change, and JPEG compression remains lossy even at 100% quality.
- Checks the output structure again, handles errors per file, provides before/after previews, and creates ZIP downloads with UTF-8 filenames.
- Supports up to 20 images, 50 MiB per image, and 200 MiB per batch. JPG export supports up to 40 megapixels. Actual memory limits depend on the device.
- Responsive interface with keyboard support and loading/error states. Container parsing runs in a Web Worker.
- The Content Security Policy blocks application connections (`connect-src 'none'`). No analytics, CDNs, or external fonts are used. The server serves static files only and has no image upload endpoint.

## Scope and limitations

The application only detects and removes **C2PA manifests embedded in supported containers**. It does not validate signatures, contact provenance discovery services, or guarantee removal of AI labels on other platforms.

The original-format mode **preserves XMP/EXIF/IPTC**, including XMP links to external C2PA manifests. It does not remove external manifests, fingerprints, invisible watermarks, or visible watermarks in image pixels.

Animated PNG/WebP data is preserved in original-format mode. JPEG MPF/MPO files, some HDR images, files with data after JPEG EOI or PNG IEND, truncated files, and PNG files with invalid CRCs are rejected to avoid producing structurally unsafe output. HEIC, AVIF, video, and PDF are not supported. The container checker is not a full image decoder.

## Build and static deployment

```powershell
npm test
npm run build
npm start
```

`dist/` is a self-contained distribution that can be served by any static host over HTTPS. It has no backend and contains no test images. The application has not been registered with or deployed to a hosting service.

## Testing

`npm test` runs unit tests for CRCs, C2PA removal across all three formats, multipart JUMBF with repeated headers, multi-scan JPEGs, metadata/animation preservation, malformed input rejection, idempotency, and ZIP structure.

Integration test fixtures are optional and are not committed or included in the build:

```powershell
npm run fixtures
npm test
npm run test:browser
```

Open http://127.0.0.1:4174/__tests/browser.html. The QA page loads fixtures through the local server, automatically runs both modes, and checks previews, mode changes, successful results for three images, and an error for one image. A **PASS** message indicates completion. This test does not cover the operating system's file picker. The QA server is for development only, binds exclusively to `127.0.0.1`, and must not be deployed to a hosting service.

Public fixture sources: [Content Authenticity's C.jpg](https://github.com/contentauth/c2patool/blob/main/sample/C.jpg), [libpng-test.png](https://github.com/contentauth/c2pa-rs/blob/main/sdk/tests/fixtures/libpng-test.png), and [sample1.webp](https://github.com/contentauth/c2pa-rs/blob/main/sdk/tests/fixtures/sample1.webp). The `with-c2pa.png` and `with-c2pa.webp` fixtures reuse the JPEG manifest to test container structure. **Their signatures are invalid for the new content**, so they must not be treated as validly signed images. Respect the source repositories' terms and copyrights if redistributing fixtures.

## Project structure

```text
public/                 Static application
  lib/c2pa.js           Container parsing, C2PA removal, and ZIP creation
  worker.js             Container processing off the UI thread
  app.js                Queue, Canvas, previews, and downloads
scripts/                Local server, build, and fixture preparation
test/                   Unit/integration tests and browser QA page
dist/                   Build output (not committed)
```

Technical references: [C2PA specification](https://spec.c2pa.org/specifications/specifications/2.5/specs/C2PA_Specification.html), [reference SDK JPEG handler](https://github.com/contentauth/c2pa-rs/blob/main/sdk/src/asset_handlers/jpeg_io.rs), and [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).
