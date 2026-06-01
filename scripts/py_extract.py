#!/usr/bin/env python3
import sys
import json
import fitz  # PyMuPDF

# Usage: py_extract.py /abs/path/to/file.pdf
# Outputs JSON with width, height, lines, texts, wallLines

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Missing pdf path'}))
        sys.exit(2)
    pdf_path = sys.argv[1]
    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(0)
        rect = page.rect
        width = rect.width
        height = rect.height

        # Extract drawings (lines, shapes)
        drawings = page.get_drawings()
        lines = []
        for d in drawings:
            # d is a dict with 'items' including path commands and 'width'
            w = d.get('width', 1)
            # Some drawings include 'items' where line segments are explicit
            items = d.get('items', [])
            # items can include tuples like ('l', x1, y1) or ('re', x, y, w, h) etc.
            # Simplest approach: for path-like items, extract moveTo/lineTo segments
            path_points = []
            x = y = None
            for it in items:
                if not isinstance(it, tuple):
                    continue
                opcode = it[0]
                if opcode in ('m', 'l') and len(it) >= 3:
                    # move or line to
                    x = it[1]
                    y = it[2]
                    path_points.append((x, y))
                elif opcode == 're' and len(it) >= 5:
                    rx, ry, rw, rh = it[1], it[2], it[3], it[4]
                    # rectangle: push four corners
                    path_points.extend([
                        (rx, ry),
                        (rx + rw, ry),
                        (rx + rw, ry + rh),
                        (rx, ry + rh),
                    ])
            # Convert consecutive point pairs to line segments
            if len(path_points) >= 2:
                for i in range(len(path_points) - 1):
                    x1, y1 = path_points[i]
                    x2, y2 = path_points[i + 1]
                    # flip y similar to pdfjs expectation (origin bottom)
                    lines.append({
                        'x1': x1,
                        'y1': height - y1,
                        'x2': x2,
                        'y2': height - y2,
                        'width': w,
                    })

        # Extract text blocks
        text_blocks = page.get_text('blocks')
        texts = []
        for b in text_blocks:
            # b: (x0, y0, x1, y1, "text", block_no, block_type)
            x0, y0, x1, y1, text, _, _ = b
            if not text or not text.strip():
                continue
            texts.append({
                'text': text.strip(),
                'x': x0,
                'y': height - y1,  # use top-left y
                'fontSize': max(8, (y1 - y0))
            })

        # Wall lines heuristic: width >= threshold
        wall_threshold = 0.8
        wall_lines = [l for l in lines if l.get('width', 1) >= wall_threshold]

        # Vector flag: True when we found drawing lines
        is_vector = len(lines) > 0

        out = {
            'width': width,
            'height': height,
            'lines': lines,
            'texts': texts,
            'wallLines': wall_lines,
            'vector': is_vector,
        }
        print(json.dumps(out))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
