#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const cacheDir = path.join(process.cwd(), 'uploads', 'cache');
if (!fs.existsSync(cacheDir)) {
    console.error('Cache dir missing:', cacheDir);
    process.exit(2);
}

function listUploadJsons() {
    return fs.readdirSync(cacheDir).filter(f => f.endsWith('.dwg.upload.json') || f.endsWith('.dxf.upload.json'));
}

function readFileId(uploadJsonPath) {
    const raw = fs.readFileSync(uploadJsonPath, 'utf8');
    try {
        const obj = JSON.parse(raw);
        // obj may be { code, stdout } from our curl wrapper
        if (obj.stdout) {
            const parsed = JSON.parse(obj.stdout);
            return parsed.fileId;
        }
        // or direct response
        return obj.fileId || obj.fileId;
    } catch (err) {
        console.error('Failed to parse upload json:', uploadJsonPath, err);
        return null;
    }
}

function postAnalyze(fileId) {
    console.log('Analyzing', fileId);
    const payload = JSON.stringify({ fileId });
    const r = spawnSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload, 'http://localhost:3000/api/analyze'], { encoding: 'utf8' });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function main() {
    const files = listUploadJsons();
    if (files.length === 0) {
        console.log('No upload JSON files found to analyze.');
        return;
    }
    for (const f of files) {
        const abs = path.join(cacheDir, f);
        const fileId = readFileId(abs);
        if (!fileId) {
            console.warn('No fileId found in', f);
            continue;
        }
        const res = postAnalyze(fileId);
        fs.writeFileSync(path.join(cacheDir, `${fileId}.analysis.json`), JSON.stringify(res, null, 2));
        console.log('Saved analysis for', fileId);
    }
}

main();
