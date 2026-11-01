# Research PDF reading — local draft

Elsie's existing per-request document context now includes selected uploads from
`/research`. This uses the existing `unpdf` dependency, the verified manager
session, and private Storage reads with the same user token and row policies.
The original upload, catalogue, preview, download and deletion paths are unchanged.
No text is saved, no external document service is called, and no access is added.

Ask, for example: `Read Manuscript.pdf pages 2-4`. With multiple PDFs, use an exact
filename or file UUID; duplicate filenames require a UUID. A sole PDF can be read
with `Read the manuscript`. Ordinary room questions list metadata without opening
PDFs. Selection covers at most the latest 200 Research uploads. A supplied missing
UUID does not fall back to another file. Continuation prompts include the file UUID.

Each answer reads one file, up to 8 MB, at most five physical PDF pages and 24,000
extracted characters. Page numbers refer to the PDF's physical order, which may
differ from printed page labels. Coverage includes filename, file UUID, saved
content hash and actual pages supplied. Requests exceeding the page/text bounds
are explicitly partial, with a continuation page. A page truncated by the character
limit needs an external text export to obtain its remaining text; there is no
within-page offset. Text-reading limits do not change original file access limits.
The existing Storage download API returns the whole original before extraction;
size metadata is checked first and returned Blob size is checked again.

Scanned/image-only pages have no OCR support. Blank pages, malformed/encrypted or
inaccessible files are reported honestly. Extraction does not read pictures,
handwriting or page layout and cannot establish that a manuscript has been fully
understood. PDF text and filenames are untrusted source material, not instructions.

Local verification uses synthetic, non-private PDFs:

- `tests/fixtures/research-seven-pages.pdf`: seven pages with distinct evidence A–G.
- `tests/fixtures/research-dense-and-blank.pdf`: dense overlapping text to exercise
  the character bound, a blank page, then a final text page.

The tests use the real parser for page selection, continuation, text bounds and
blank/malformed input. Storage fixtures cover access denial, oversized files,
ambiguous selection and OCR disclosure. Manager tests cover evidence reaching the
prompt and owner-denial preventing document reads. Existing document, file,
upload, Research component and room-snapshot regressions are included.

No production system was called or verified. Before accepting a release, test
signed-in Research on a laptop and phone with a real multi-page manuscript,
follow-up page requests, original preview/download, and an image-only PDF. Typed
Elsie is wired here; voice must be checked on-device through its existing Office
request path. No voice startup or audio behavior is changed.
