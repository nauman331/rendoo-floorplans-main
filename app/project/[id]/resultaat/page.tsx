'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import { findExample } from '@/lib/style-examples';
import PlanRenderer, { type PlanRendererHandle } from '@/components/render/PlanRenderer';
import { parseFeedback } from '@/lib/render/parse-feedback';
import { layoutRoomsForUnit, classifyRoom } from '@/lib/render/room-layout';
import type { AnnotationShape, DetectedUnit, PlanEdit } from '@/types/project';

/**
 * Reduce a unit list to one representative per typeGroup.
 *
 * Mirrors and variants are visually almost identical to their hoofdtype
 * (gespiegeld = horizontally flipped, variant = ~90% identical), so
 * showing them as separate entries clutters the UI. We pick the first
 * hoofdtype per group, and if there's no hoofdtype we fall back to
 * the first unit of the group.
 */
function pickUniqueTypes(units: DetectedUnit[]): DetectedUnit[] {
  const byGroup = new Map<string, DetectedUnit>();
  for (const u of units) {
    const key = u.typeGroup ?? u.label;
    const existing = byGroup.get(key);
    if (!existing) {
      byGroup.set(key, u);
      continue;
    }
    // Prefer hoofdtype over mirror/variant
    if (
      u.classification === 'hoofdtype' &&
      existing.classification !== 'hoofdtype'
    ) {
      byGroup.set(key, u);
    }
  }
  return Array.from(byGroup.values());
}

/**
 * Result page — generated plan + feedback iteration (max 5 rounds).
 *
 * Annotation interaction:
 *  - Toggle the shape (circle or rectangle) before placing
 *  - Tap empty space on the plan to drop the shape there
 *  - Drag the shape itself to reposition (mouse + touch)
 *  - Use the +/- buttons to resize
 *  - "Wissen" removes the annotation
 *
 * NB: the displayed plan image is currently a stand-in (the chosen
 * stijl-example) — there's no real generator pipeline yet. See the
 * planImage assignment below.
 */

const MAX_FEEDBACK = 5;

const DEFAULT_CIRCLE_R = 0.06;
const DEFAULT_RECT_W = 0.16;
const DEFAULT_RECT_H = 0.12;

const SIZE_STEP = 0.02;
const MIN_DIM = 0.02;
const MAX_DIM = 0.6;

type ExportFormat = 'png' | 'svg' | 'pdf';

type ShapeKind = AnnotationShape['kind'];

/**
 * What the user is doing with the annotation shape:
 *  - 'move'        — drag the body to reposition
 *  - 'resize-r'    — drag the circle's edge to grow/shrink the radius
 *                    (single direction; we use the cardinal handle the
 *                    user grabs to decide initial direction but treat
 *                    them all the same way)
 *  - 'resize-tl'/'tr'/'bl'/'br' — drag a rect corner to resize, with
 *                    the opposite corner staying anchored
 */
type DragKind = 'move' | 'resize-r' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';

interface DragState {
  kind: DragKind;
  startX: number;
  startY: number;
  /** Snapshot of the shape at the moment the drag started. */
  startShape: AnnotationShape;
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export default function ResultaatPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, setStatus, addFeedback, addEdits } = useProjectStore();

  const [feedbackText, setFeedbackText] = useState('');
  const [shapeKind, setShapeKind] = useState<ShapeKind>('circle');
  const [annotation, setAnnotation] = useState<AnnotationShape | null>(null);
  const [generating, setGenerating] = useState(false);
  const [version, setVersion] = useState(1);
  const [activeTypeGroup, setActiveTypeGroup] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const imageBoxRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PlanRendererHandle>(null);
  const draggingRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!project) {
      router.replace('/nieuw');
      return;
    }
    if (project.status !== 'resultaat') setStatus('resultaat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const chosenExample = useMemo(
    () => (project ? findExample(project.outputType, project.exampleId) : undefined),
    [project]
  );
  const analysis = project?.analysis ?? null;
  const projectName = project?.name ?? 'floorplan';
  const projectOutputType = project?.outputType ?? '2d-basic';

  // Reduce to UNIQUE woningtypes — one representative per typeGroup.
  // Mirrors and variants are visually almost identical to their
  // hoofdtype, so we don't show them as separate cards. The user only
  // needs to confirm/edit each unique layout once.
  const uniqueTypes = analysis ? pickUniqueTypes(analysis.units) : [];

  // Determine which type the user is currently looking at
  const currentTypeGroup =
    activeTypeGroup ?? uniqueTypes[0]?.typeGroup ?? null;
  const renderUnit =
    uniqueTypes.find((u) => u.typeGroup === currentTypeGroup) ??
    uniqueTypes[0] ??
    null;

  const feedbackCount = project?.feedback.length ?? 0;
  const feedbackLeft = MAX_FEEDBACK - feedbackCount;
  const isLocked = feedbackLeft <= 0;
  const analysisSource = analysis?.source ?? 'gpt4_vision';
  const analysisModel = analysis?.aiModel ?? 'gpt-5';

  /* ---------------- Annotation handling ---------------- */

  const getRelativePoint = useCallback(
    (clientX: number, clientY: number) => {
      const box = imageBoxRef.current?.getBoundingClientRect();
      if (!box) return null;
      return {
        x: Math.max(0, Math.min(1, (clientX - box.left) / box.width)),
        y: Math.max(0, Math.min(1, (clientY - box.top) / box.height)),
      };
    },
    []
  );

  /** Click on empty plan area → drop the current shape there. */
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Skip if the click bubbled from the shape (we handle drag instead).
    if ((e.target as HTMLElement).closest('[data-annotation-shape]')) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    if (!p) return;

    if (shapeKind === 'circle') {
      setAnnotation({ kind: 'circle', cx: p.x, cy: p.y, r: DEFAULT_CIRCLE_R });
    } else {
      setAnnotation({
        kind: 'rect',
        cx: p.x,
        cy: p.y,
        w: DEFAULT_RECT_W,
        h: DEFAULT_RECT_H,
      });
    }
  };

  const adjustSize = (delta: number) => {
    setAnnotation((a) => {
      if (!a) return a;
      if (a.kind === 'circle') {
        return { ...a, r: clamp(a.r + delta, MIN_DIM, MAX_DIM / 2) };
      }
      // Rectangle: scale both dims proportionally.
      const ratio = a.h === 0 ? 1 : a.h / a.w;
      const nextW = clamp(a.w + delta * 2, MIN_DIM, MAX_DIM);
      return { ...a, w: nextW, h: clamp(nextW * ratio, MIN_DIM, MAX_DIM) };
    });
  };

  const clearAnnotation = () => setAnnotation(null);

  /**
   * Switch shape. If an annotation exists, convert it in-place at the
   * same center so users don't lose their position.
   */
  const handleShapeKindChange = (kind: ShapeKind) => {
    setShapeKind(kind);
    setAnnotation((a) => {
      if (!a) return a;
      if (a.kind === kind) return a;
      if (kind === 'circle') {
        return { kind: 'circle', cx: a.cx, cy: a.cy, r: DEFAULT_CIRCLE_R };
      }
      return {
        kind: 'rect',
        cx: a.cx,
        cy: a.cy,
        w: DEFAULT_RECT_W,
        h: DEFAULT_RECT_H,
      };
    });
  };

  /* --- Drag handlers (mouse + touch via pointer events) --- */
  /* The same handlers serve both the body (move) and the corner/edge */
  /* handles (resize). The DragState.kind tells us which.            */

  const startDrag = (
    e: React.PointerEvent<SVGElement>,
    kind: DragKind
  ) => {
    if (!annotation) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startShape: annotation,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const box = imageBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = (e.clientX - drag.startX) / box.width;
    const dy = (e.clientY - drag.startY) / box.height;

    setAnnotation((a) => {
      if (!a) return a;

      // MOVE — body drag, recenter the shape
      if (drag.kind === 'move') {
        return {
          ...a,
          cx: clamp(drag.startShape.cx + dx, 0, 1),
          cy: clamp(drag.startShape.cy + dy, 0, 1),
        };
      }

      // RESIZE CIRCLE — distance from center sets the radius
      if (drag.kind === 'resize-r' && drag.startShape.kind === 'circle') {
        const startR = drag.startShape.r;
        // Use the larger of |dx|, |dy| projected onto the box's short
        // edge so the circle scales smoothly regardless of which
        // cardinal handle was grabbed.
        // We approximate by adding the dominant axis component to the
        // starting radius.
        const minDim = 1; // we already work in 0..1 fractions
        const aspectFix = box.width < box.height ? box.width / box.height : box.height / box.width;
        const projection = Math.max(Math.abs(dx), Math.abs(dy)) * aspectFix;
        const sign =
          Math.abs(dx) > Math.abs(dy)
            ? Math.sign(dx)
            : Math.sign(dy);
        const next = clamp(startR + projection * sign, MIN_DIM, minDim * MAX_DIM / 2);
        return { ...a, r: next };
      }

      // RESIZE RECT — opposite corner stays anchored
      if (drag.kind.startsWith('resize-') && drag.startShape.kind === 'rect') {
        const start = drag.startShape;
        // Compute the four anchor points in 0..1 space
        const left = start.cx - start.w / 2;
        const right = start.cx + start.w / 2;
        const top = start.cy - start.h / 2;
        const bottom = start.cy + start.h / 2;

        let newLeft = left;
        let newRight = right;
        let newTop = top;
        let newBottom = bottom;

        switch (drag.kind) {
          case 'resize-tl':
            newLeft = clamp(left + dx, 0, right - MIN_DIM);
            newTop = clamp(top + dy, 0, bottom - MIN_DIM);
            break;
          case 'resize-tr':
            newRight = clamp(right + dx, left + MIN_DIM, 1);
            newTop = clamp(top + dy, 0, bottom - MIN_DIM);
            break;
          case 'resize-bl':
            newLeft = clamp(left + dx, 0, right - MIN_DIM);
            newBottom = clamp(bottom + dy, top + MIN_DIM, 1);
            break;
          case 'resize-br':
            newRight = clamp(right + dx, left + MIN_DIM, 1);
            newBottom = clamp(bottom + dy, top + MIN_DIM, 1);
            break;
        }

        const newW = newRight - newLeft;
        const newH = newBottom - newTop;
        return {
          ...a,
          cx: newLeft + newW / 2,
          cy: newTop + newH / 2,
          w: clamp(newW, MIN_DIM, MAX_DIM),
          h: clamp(newH, MIN_DIM, MAX_DIM),
        };
      }

      return a;
    });
  };

  const onPointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    draggingRef.current = null;
  };

  /* ---------------- Submit feedback ---------------- */

  const canSubmit = feedbackText.trim().length >= 5 && !generating && !isLocked;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setGenerating(true);

    const text = feedbackText.trim();
    const feedbackId = addFeedback({
      text,
      annotation: annotation ?? undefined,
    });

    // 1. Try the local heuristic parser first
    let edits: Omit<PlanEdit, 'id' | 'createdAt'>[] = parseFeedback({
      text,
      annotation,
      feedbackId,
    });

    // 2. Fall back to the Claude API for anything the parser missed
    if (edits.length === 0 && annotation && renderUnit) {
      try {
        const contextRooms = roomsUnderAnnotation(renderUnit, annotation);
        const res = await fetch('/api/apply-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedback: text,
            feedbackId,
            annotation,
            contextRooms,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            edits?: Omit<PlanEdit, 'id' | 'createdAt'>[];
          };
          if (data.edits?.length) edits = data.edits;
        }
      } catch (err) {
        console.error('apply-feedback API failed', err);
      }
    }

    if (edits.length > 0) {
      addEdits(edits);
    }

    setGenerating(false);
    setFeedbackText('');
    setAnnotation(null);
    setVersion((v) => v + 1);
  };

  const handleConfirm = () => {
    setStatus('exported');
    alert('Top — we sturen je het eindresultaat door.');
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!renderUnit) return;
    setExportingFormat(format);
    try {
      if (format === 'png') {
        const pngDataUrl = rendererRef.current?.toDataURL();
        if (!pngDataUrl) throw new Error('PNG render not ready');
        const response = await fetch(pngDataUrl);
        const blob = await response.blob();
        downloadBlob(blob, `${projectName}-${renderUnit.typeGroup}.png`);
        return;
      }

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawing: {
            units: [renderUnit],
            width: 1200,
            height: 1600,
          },
          options: {
            format,
            watermark: { text: projectName, opacity: 0.18 },
            mood: projectOutputType === '2d-luxe' ? 'luxe' : 'basic',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }

      if (format === 'svg') {
        const text = await response.text();
        downloadBlob(new Blob([text], { type: 'image/svg+xml' }), `${projectName}-${renderUnit.typeGroup}.svg`);
      } else {
        const blob = await response.blob();
        downloadBlob(blob, `${projectName}-${renderUnit.typeGroup}.pdf`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export mislukt voor ${format.toUpperCase()}. Probeer opnieuw.`);
    } finally {
      setExportingFormat(null);
    }
  };

  /**
   * Compute the rooms that the annotation overlaps. We pass these as
   * extra context to the Claude fallback so it knows whether the user
   * is pointing at the bedroom, kitchen, etc.
   */
  function roomsUnderAnnotation(
    unit: typeof renderUnit,
    shape: AnnotationShape
  ): { label: string; kind: string }[] {
    if (!unit) return [];
    const layout = layoutRoomsForUnit(unit);
    // Approximate: take the annotation rect in 0..1, then to 0..100 plan coords.
    // This is a rough mapping — the renderer pads the canvas, but the plan
    // sits in roughly the central 92% so we use 0..100 as-is.
    const rect =
      shape.kind === 'circle'
        ? {
          x: (shape.cx - shape.r) * 100,
          y: (shape.cy - shape.r) * 100,
          w: shape.r * 200,
          h: shape.r * 200,
        }
        : {
          x: (shape.cx - shape.w / 2) * 100,
          y: (shape.cy - shape.h / 2) * 100,
          w: shape.w * 100,
          h: shape.h * 100,
        };

    return layout
      .filter((room) => {
        return (
          room.x < rect.x + rect.w &&
          room.x + room.w > rect.x &&
          room.y < rect.y + rect.h &&
          room.y + room.h > rect.y
        );
      })
      .map((room) => ({
        label: room.source.label,
        kind: classifyRoom(room.source),
      }));
  }

  if (!project) return null;
  if (!analysis) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 text-lg">
          <p className="font-bold">No analysis data available</p>
          <p className="text-sm mt-2">Run the analysis pipeline first in the validation page</p>
        </div>
      </div>
    );
  }

  /* ---------------- Render ---------------- */

  return (
    <div className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rendoo-600">
              Resultaat · versie {version}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
              {project.name}
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {project.outputType === '2d-luxe' ? '2D Luxe' : '2D Basic'}
              {chosenExample && ` · ${chosenExample.label}`}
              {' · '}
              {feedbackCount === 0
                ? 'Nog geen feedback-rondes gebruikt'
                : `${feedbackCount} van ${MAX_FEEDBACK} feedback-rondes gebruikt`}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Pipeline: {analysisSource} · model: {analysisModel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}/validatie`)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-rendoo-600"
          >
            ← Terug naar type-validatie
          </button>
        </div>

        {/* Type tabs — one tab per unique woningtype */}
        {uniqueTypes.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <div className="inline-flex min-w-full gap-2 border-b border-border pb-0">
              {uniqueTypes.map((u) => {
                const isActive = u.typeGroup === currentTypeGroup;
                // Count how many real units belong to this typeGroup
                const groupCount = analysis.units.filter(
                  (au) => au.typeGroup === u.typeGroup
                ).length;
                return (
                  <button
                    key={u.typeGroup}
                    type="button"
                    onClick={() => {
                      setActiveTypeGroup(u.typeGroup);
                      setAnnotation(null);
                    }}
                    className={`group relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-xs font-medium transition-colors ${isActive
                      ? 'border-b-2 border-rendoo-600 bg-rendoo-50/60 text-rendoo-700'
                      : 'border-b-2 border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      }`}
                  >
                    <span className="font-semibold">{u.typeGroup}</span>
                    <span className="text-[10px] text-gray-400">
                      {groupCount}× in project
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Plan viewer */}
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div
              ref={imageBoxRef}
              onClick={handleImageClick}
              className="relative aspect-[3/2] w-full cursor-crosshair touch-none select-none bg-gray-50"
            >
              <PlanRenderer
                ref={rendererRef}
                unit={renderUnit}
                allUnits={analysis.units}
                baseImageUrl={
                  project.files[0]?.rasterUrl ?? project.files[0]?.url ?? null
                }
                exampleId={project.exampleId}
                branding={project.branding}
                isLuxe={project.outputType === '2d-luxe'}
                edits={project.edits}
                version={version}
              />

              {/* Annotation overlay */}
              {annotation && (
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'none' }}
                >
                  {annotation.kind === 'circle' ? (
                    <>
                      <circle
                        data-annotation-shape
                        cx={annotation.cx * 100}
                        cy={annotation.cy * 100}
                        r={annotation.r * 100}
                        fill="rgba(234, 88, 12, 0.15)"
                        stroke="#ea580c"
                        strokeWidth="0.6"
                        strokeDasharray="1 0.8"
                        style={{ pointerEvents: 'auto', cursor: 'move' }}
                        onPointerDown={(e) => startDrag(e, 'move')}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                      />
                      {/* Resize handles at N/S/E/W */}
                      {(
                        [
                          { x: annotation.cx, y: annotation.cy - annotation.r, cursor: 'ns-resize' },
                          { x: annotation.cx, y: annotation.cy + annotation.r, cursor: 'ns-resize' },
                          { x: annotation.cx - annotation.r, y: annotation.cy, cursor: 'ew-resize' },
                          { x: annotation.cx + annotation.r, y: annotation.cy, cursor: 'ew-resize' },
                        ] as const
                      ).map((h, i) => (
                        <circle
                          key={i}
                          data-annotation-shape
                          cx={h.x * 100}
                          cy={h.y * 100}
                          r={1.4}
                          fill="#ffffff"
                          stroke="#ea580c"
                          strokeWidth="0.5"
                          style={{ pointerEvents: 'auto', cursor: h.cursor }}
                          onPointerDown={(e) => startDrag(e, 'resize-r')}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      <rect
                        data-annotation-shape
                        x={(annotation.cx - annotation.w / 2) * 100}
                        y={(annotation.cy - annotation.h / 2) * 100}
                        width={annotation.w * 100}
                        height={annotation.h * 100}
                        rx="0.6"
                        ry="0.6"
                        fill="rgba(234, 88, 12, 0.15)"
                        stroke="#ea580c"
                        strokeWidth="0.6"
                        strokeDasharray="1 0.8"
                        style={{ pointerEvents: 'auto', cursor: 'move' }}
                        onPointerDown={(e) => startDrag(e, 'move')}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                      />
                      {/* Resize handles at the four corners */}
                      {(
                        [
                          { x: annotation.cx - annotation.w / 2, y: annotation.cy - annotation.h / 2, kind: 'resize-tl' as const, cursor: 'nwse-resize' },
                          { x: annotation.cx + annotation.w / 2, y: annotation.cy - annotation.h / 2, kind: 'resize-tr' as const, cursor: 'nesw-resize' },
                          { x: annotation.cx - annotation.w / 2, y: annotation.cy + annotation.h / 2, kind: 'resize-bl' as const, cursor: 'nesw-resize' },
                          { x: annotation.cx + annotation.w / 2, y: annotation.cy + annotation.h / 2, kind: 'resize-br' as const, cursor: 'nwse-resize' },
                        ] as const
                      ).map((h, i) => (
                        <rect
                          key={i}
                          data-annotation-shape
                          x={h.x * 100 - 1.4}
                          y={h.y * 100 - 1.4}
                          width={2.8}
                          height={2.8}
                          rx={0.4}
                          ry={0.4}
                          fill="#ffffff"
                          stroke="#ea580c"
                          strokeWidth="0.5"
                          style={{ pointerEvents: 'auto', cursor: h.cursor }}
                          onPointerDown={(e) => startDrag(e, h.kind)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        />
                      ))}
                    </>
                  )}
                </svg>
              )}

              {/* Hint */}
              {!annotation && (
                <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-medium text-gray-600 shadow-sm">
                  Tik op de plattegrond om een {shapeKind === 'circle' ? 'cirkel' : 'rechthoek'} te plaatsen
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-gray-50/50 px-4 py-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                {/* Shape toggle */}
                <div className="inline-flex overflow-hidden rounded-full border border-border bg-white">
                  <button
                    type="button"
                    onClick={() => handleShapeKindChange('circle')}
                    className={`flex items-center gap-1 px-2.5 py-1 font-medium transition-colors ${shapeKind === 'circle'
                      ? 'bg-rendoo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    aria-pressed={shapeKind === 'circle'}
                    title="Cirkelvormig"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    Cirkel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShapeKindChange('rect')}
                    className={`flex items-center gap-1 border-l border-border px-2.5 py-1 font-medium transition-colors ${shapeKind === 'rect'
                      ? 'bg-rendoo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    aria-pressed={shapeKind === 'rect'}
                    title="Rechthoekig"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    Rechthoek
                  </button>
                </div>

                {annotation ? (
                  <>
                    <span className="font-medium text-orange-700">
                      Gebied gemarkeerd
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustSize(-SIZE_STEP)}
                      className="rounded-full border border-border bg-white px-2 py-0.5 font-medium text-gray-600 hover:bg-gray-50"
                      title="Verkleinen"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustSize(SIZE_STEP)}
                      className="rounded-full border border-border bg-white px-2 py-0.5 font-medium text-gray-600 hover:bg-gray-50"
                      title="Vergroten"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={clearAnnotation}
                      className="text-gray-500 underline-offset-2 hover:text-red-600 hover:underline"
                    >
                      wissen
                    </button>
                  </>
                ) : (
                  <span className="text-gray-500">
                    Tik om te plaatsen — sleep om te verschuiven
                  </span>
                )}
              </div>
              <span className="text-gray-400">versie {version}</span>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Export</h2>
              <p className="mt-1 text-[11px] text-gray-500">
                Download de huidige woningtype-weergave als PNG, SVG of PDF.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(['png', 'svg', 'pdf'] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => handleExport(format)}
                    disabled={exportingFormat !== null}
                    className="rounded-full border border-rendoo-200 bg-white px-3 py-2 text-xs font-semibold text-rendoo-700 transition-colors hover:bg-rendoo-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exportingFormat === format ? 'Bezig…' : format.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback form */}
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Feedback voor versie {version + 1}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${feedbackLeft > 2
                    ? 'bg-rendoo-100 text-rendoo-700'
                    : feedbackLeft > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                    }`}
                >
                  {feedbackLeft} rondes over
                </span>
              </div>

              {isLocked ? (
                <div className="mt-3 rounded-xl bg-red-50 p-3 text-[11px] text-red-700">
                  Je hebt de 5 feedback-rondes benut. Laat ons je wensen even
                  rechtstreeks weten zodat we je persoonlijk kunnen helpen.
                  <a
                    href="mailto:contact@rendoo.studio"
                    className="mt-2 block font-semibold underline-offset-2 hover:underline"
                  >
                    contact@rendoo.studio
                  </a>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Beschrijf wat er moet veranderen. Hoe concreter, hoe beter.
                  </p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder='bv. "Ik wil hier een 2-persoons bank, geen 3-persoons"'
                    rows={4}
                    className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                  />

                  {/* Library alternative */}
                  <details className="mt-3 rounded-xl border border-border bg-gray-50 p-3">
                    <summary className="cursor-pointer text-[11px] font-medium text-gray-700">
                      …of kies direct uit de meubel-bibliotheek
                    </summary>
                    <p className="mt-1 text-[10px] text-gray-500">
                      We openen de bibliotheek zo je zelf een item kunt
                      vervangen (bank, bed, tafel, terras…). Coming soon in
                      deze view — voorlopig kan je het in woorden omschrijven
                      en wij nemen het mee.
                    </p>
                  </details>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rendoo-300/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  >
                    {generating ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Nieuwe versie wordt gemaakt…
                      </>
                    ) : (
                      <>
                        Genereer nieuwe versie met feedback
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Confirm */}
            <button
              type="button"
              onClick={handleConfirm}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-rendoo-200 bg-white px-4 py-3 text-xs font-semibold text-rendoo-700 shadow-sm transition-all hover:bg-rendoo-50"
            >
              ✓ Ziet er goed uit — afronden
            </button>

            {/* Feedback history */}
            {feedbackCount > 0 && (
              <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Feedback-geschiedenis
                </h3>
                <ol className="mt-3 space-y-3">
                  {project.feedback.map((f, idx) => (
                    <li
                      key={f.id}
                      className="rounded-xl border border-border bg-gray-50 p-3"
                    >
                      <p className="text-[10px] font-medium text-gray-500">
                        Ronde {idx + 1}
                        {f.annotation && ' · met gebied-markering'}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-700">{f.text}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
