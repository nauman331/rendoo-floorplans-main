#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

async function run() {
    const pdf = process.argv[2];
    if (!pdf) {
        console.error('Usage: node scripts/test-ocr.mjs <pdf-path>');
        process.exit(2);
    }

    // Strict: require Python extractor (PyMuPDF). No JS fallback.
    const script = path.join(process.cwd(), 'scripts', 'py_extract.py');
    if (!existsSync(script)) {
        console.error('Python extractor not found:', script);
        process.exit(2);
    }
    const py = spawnSync('python3', [script, pdf], { encoding: 'utf8' });
    if (py.status !== 0) {
        console.error('Python extractor failed:', py.stderr || py.stdout);
        process.exit(3);
    }
    let parsed;
    try {
        parsed = JSON.parse(py.stdout);
    } catch (err) {
        console.error('Failed to parse Python extractor output:', err);
        process.exit(4);
    }
    console.log('PYTHON_EXTRACT_OUTPUT:');
    console.log(JSON.stringify(parsed, null, 2));

    // If not vector, run system Tesseract OCR on rendered PNG
    if (!parsed.vector) {
        const outPrefix = path.join(process.cwd(), 'uploads', `__ocr_test_${Date.now()}`);
        const cmd = `pdftoppm -png -r 300 -singlefile -f 1 -l 1 "${pdf}" "${outPrefix}"`;
        const r = spawnSync(cmd, { shell: true });
        if (r.status !== 0) {
            console.error('pdftoppm failed. Install poppler to render PDFs for OCR.');
            process.exit(5);
        }
        const pngPath = `${outPrefix}.png`;
        if (!existsSync(pngPath)) {
            console.error('Rendered PNG not found:', pngPath);
            process.exit(6);
        }

        const tess = spawnSync('tesseract', [pngPath, 'stdout', '-l', 'eng'], { encoding: 'utf8' });
        if (tess.status !== 0) {
            console.error('Tesseract CLI failed:', tess.stderr || tess.stdout);
            process.exit(7);
        }
        console.log('TESSERACT OCR TEXT:');
        console.log(tess.stdout);
        try { unlinkSync(pngPath); } catch { }
    }
}

run();
