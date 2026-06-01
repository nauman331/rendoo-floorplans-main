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

function postFileCurl(filePath, url) {
    console.log('POST', path.basename(filePath), '->', url);
    const r = spawnSync('curl', ['-s', '-X', 'POST', '-F', `file=@${filePath}`, url], { encoding: 'utf8' });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function main() {
    if (!fs.existsSync(uploadsDir)) {
        console.error('uploads/ directory not found');
        process.exit(2);
    }

    const files = listFiles(uploadsDir);
    for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        const abs = path.join(uploadsDir, f);
        if (ext === '.dwg') {
            const res = postFileCurl(abs, 'http://localhost:3000/api/upload');
            fs.writeFileSync(path.join(cacheDir, `${f}.upload.json`), JSON.stringify(res, null, 2));
            console.log('Saved', `${f}.upload.json`);
        } else if (ext === '.dxf') {
            const res = postFileCurl(abs, 'http://localhost:3000/api/upload-dxf');
            fs.writeFileSync(path.join(cacheDir, `${f}.upload.json`), JSON.stringify(res, null, 2));
            console.log('Saved', `${f}.upload.json`);
        } else {
            console.log('Skipping', f);
        }
    }
}

main();
