#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const uploadsDir = path.join(process.cwd(), 'uploads');
const cacheDir = path.join(uploadsDir, 'cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

function listFiles(dir) {
    return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile());
}

function runPdfExtraction(filePath, outPath) {
    console.log('Running extraction for', filePath);
    const r = spawnSync('node', [path.join(process.cwd(), 'scripts', 'test-ocr.mjs'), filePath], { encoding: 'utf8' });
    const result = {
        file: path.basename(filePath),
        exitCode: r.status,
        stdout: r.stdout || '',
        stderr: r.stderr || '',
    };
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log('Saved result to', outPath);
}

function main() {
    if (!fs.existsSync(uploadsDir)) {
        console.error('uploads/ directory not found at', uploadsDir);
        process.exit(2);
    }

    const files = listFiles(uploadsDir);
    if (files.length === 0) {
        console.log('No files found in uploads/.');
        return;
    }

    for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        const abs = path.join(uploadsDir, f);
        const out = path.join(cacheDir, `${f}.extract.json`);
        if (ext === '.pdf') {
            runPdfExtraction(abs, out);
        } else {
            // Not handling DXF/DWG in this simple harness — just note presence
            const note = { file: f, note: 'skipped (non-pdf)', ext };
            fs.writeFileSync(out, JSON.stringify(note, null, 2));
            console.log('Skipped', f, '- non-PDF');
        }
    }
}

main();
