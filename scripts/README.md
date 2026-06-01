Test scripts
============

`test-ocr.mjs` — runs PDF geometry extraction including OCR fallback.

Usage:

```bash
# install dependencies
npm install

# run the OCR test on a PDF file
node scripts/test-ocr.mjs uploads/sample.pdf
```

- Notes:
- This pipeline requires the Python extractor (PyMuPDF) for vector PDF parsing. There is no JS fallback — if the Python extractor is missing, extraction will fail.
- Ensure system dependencies are installed on macOS:

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg poppler tesseract
```

- `poppler` provides `pdftoppm` used to render PDFs for OCR. `tesseract` is the system CLI used for scanned PDF OCR.
- Python extractor: to enable the PyMuPDF-based vector extractor, create a Python virtualenv and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

Then the Node extractor will call `python3 scripts/py_extract.py` when present.

Batch acceptance test:

```bash
# Run the Stage 01 acceptance harness which runs PDF extraction
node scripts/acceptance-stage01.mjs
```

Outputs are stored in `uploads/cache/*.extract.json`.
