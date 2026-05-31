'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { DetectedUnit, Point, WallLine } from '@/types/project';
import { useCorrectionLogger } from '@/hooks/useCorrectionLogger';

// Simple canvas-based plan viewer with polygon editing
// Uses plain HTML Canvas + mouse events — no library conflicts

// Hoofdtype colors with paired tint variants for mirrors and variants.
// Same hue as the hoofdtype, different saturation/lightness so the eye
// can immediately tell them apart at a glance.
const TYPE_COLORS: Record<
  string,
  { main: string; mirror: string; variant: string }
> = {
  'Type A': { main: '#1d4ed8', mirror: '#7eb4ff', variant: '#3f86ff' },
  'Type B': { main: '#15803d', mirror: '#7ce0a0', variant: '#3aae62' },
  'Type C': { main: '#7e22ce', mirror: '#d4a8f0', variant: '#a456d8' },
  'Type D': { main: '#b45309', mirror: '#f8c772', variant: '#e08e26' },
  'Type E': { main: '#be185d', mirror: '#f4a4c4', variant: '#df4f8a' },
  'Type F': { main: '#0f766e', mirror: '#6fdcd2', variant: '#2ca59b' },
};
const DEFAULT_COLOR = { main: '#374151', mirror: '#a8b1bf', variant: '#6b7280' };
const SELECTED_COLOR = '#d28c3c';

function getUnitColor(unit: DetectedUnit): string {
  const typeColors = TYPE_COLORS[unit.typeGroup] || DEFAULT_COLOR;
  if (unit.classification === 'gespiegeld') return typeColors.mirror;
  if (unit.classification === 'variant') return typeColors.variant;
  return typeColors.main;
}

function getTypeMainColor(typeGroup: string): string {
  return (TYPE_COLORS[typeGroup] || DEFAULT_COLOR).main;
}
const HANDLE_RADIUS = 10;
const MIDPOINT_RADIUS = 5;
const WALL_SNAP_DISTANCE_PX = 8;

interface PlanCanvasProps {
  imageUrl: string;
  units: DetectedUnit[];
  selectedUnitId: string | null;
  onSelectUnit: (id: string | null) => void;
  onUpdatePolygon: (unitId: string, polygon: Point[]) => void;
  wallLines?: WallLine[];
  showWallLines?: boolean;
  // Correction logging props (optional)
  projectId?: string;
  fileId?: string;
  inputFileType?: 'dwg' | 'dxf' | 'pdf';
  moodId?: string;
  operatorEmail?: string;
}

interface ViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export default function PlanCanvas({
  imageUrl,
  units,
  selectedUnitId,
  onSelectUnit,
  onUpdatePolygon,
  wallLines = [],
  showWallLines = false,
  projectId = '',
  fileId = '',
  inputFileType = 'pdf',
  moodId,
  operatorEmail,
}: PlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: 1 });
  const [, forceRender] = useState(0);

  // Initialize correction logger (V2 training data collection)
  const correctionLogger = useCorrectionLogger({
    projectId,
    fileId,
    inputFileType,
    moodId,
    operatorEmail,
  });

  // Interaction state
  const dragRef = useRef<{
    type: 'pan' | 'vertex';
    startX: number;
    startY: number;
    unitId?: string;
    vertexIndex?: number;
    startOffsetX?: number;
    startOffsetY?: number;
    startPct?: { x: number; y: number };
  } | null>(null);
  const rafRef = useRef<number>(0);
  const pendingDragPos = useRef<{ sx: number; sy: number; shiftKey?: boolean } | null>(null);

  // Wrapped polygon update handler that logs corrections
  const handleUpdatePolygonWithLogging = useCallback(
    async (unitId: string, newPolygon: Point[]) => {
      const unit = units.find(u => u.id === unitId);
      if (!unit) return;

      const originalPolygon = unit.polygon;

      // Call original handler
      onUpdatePolygon(unitId, newPolygon);

      // Log the correction if we have project context
      if (projectId && fileId) {
        try {
          await correctionLogger.logPolygonEdit(
            unit,
            originalPolygon,
            newPolygon,
            undefined, // operatorNotes
            0.95 // Operator-made edits are always high confidence
          );
        } catch (err) {
          console.warn('[PlanCanvas] Failed to log correction:', err);
          // Don't block UI — correction logging is async
        }
      }
    },
    [units, onUpdatePolygon, projectId, fileId, correctionLogger]
  );

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      fitToContainer();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Fit image to container
  const fitToContainer = useCallback(() => {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * 0.92;
    viewRef.current = {
      scale,
      offsetX: (cw - img.naturalWidth * scale) / 2,
      offsetY: (ch - img.naturalHeight * scale) / 2,
    };
    forceRender(n => n + 1);
  }, []);

  // Resize
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = containerRef.current;
      const canvas = canvasRef.current;
      if (c && canvas) {
        canvas.width = c.clientWidth * window.devicePixelRatio;
        canvas.height = c.clientHeight * window.devicePixelRatio;
        canvas.style.width = c.clientWidth + 'px';
        canvas.style.height = c.clientHeight + 'px';
        forceRender(n => n + 1);
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Convert percentage to screen pixel
  const pctToScreen = useCallback((pctX: number, pctY: number): [number, number] => {
    const img = imageRef.current;
    if (!img) return [0, 0];
    const v = viewRef.current;
    return [
      v.offsetX + (pctX / 100) * img.naturalWidth * v.scale,
      v.offsetY + (pctY / 100) * img.naturalHeight * v.scale,
    ];
  }, []);

  // Convert screen pixel to percentage
  const screenToPct = useCallback((sx: number, sy: number): Point => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };
    const v = viewRef.current;
    return {
      x: Math.max(0, Math.min(100, ((sx - v.offsetX) / v.scale / img.naturalWidth) * 100)),
      y: Math.max(0, Math.min(100, ((sy - v.offsetY) / v.scale / img.naturalHeight) * 100)),
    };
  }, []);

  // Find what's under the cursor
  const hitTest = useCallback((sx: number, sy: number): {
    type: 'vertex' | 'midpoint' | 'polygon' | 'none';
    unitId?: string;
    vertexIndex?: number;
  } => {
    const selectedUnit = units.find(u => u.id === selectedUnitId);

    // Check vertex handles first (selected unit only)
    if (selectedUnit) {
      for (let i = 0; i < selectedUnit.polygon.length; i++) {
        const [vx, vy] = pctToScreen(selectedUnit.polygon[i].x, selectedUnit.polygon[i].y);
        const dist = Math.hypot(sx - vx, sy - vy);
        if (dist <= HANDLE_RADIUS + 6) {
          return { type: 'vertex', unitId: selectedUnit.id, vertexIndex: i };
        }
      }
      // Check midpoint handles
      for (let i = 0; i < selectedUnit.polygon.length; i++) {
        const p1 = selectedUnit.polygon[i];
        const p2 = selectedUnit.polygon[(i + 1) % selectedUnit.polygon.length];
        const [mx, my] = pctToScreen((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        const dist = Math.hypot(sx - mx, sy - my);
        if (dist <= MIDPOINT_RADIUS + 6) {
          return { type: 'midpoint', unitId: selectedUnit.id, vertexIndex: i };
        }
      }
    }

    // Check polygon fills (point-in-polygon test)
    for (const unit of units) {
      const screenPoly = unit.polygon.map(p => pctToScreen(p.x, p.y));
      if (pointInPolygon(sx, sy, screenPoly)) {
        return { type: 'polygon', unitId: unit.id };
      }
    }

    return { type: 'none' };
  }, [units, selectedUnitId, pctToScreen]);

  // Zoom to unit
  const zoomToUnit = useCallback((unit: DetectedUnit) => {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const xs = unit.polygon.map(p => (p.x / 100) * img.naturalWidth);
    const ys = unit.polygon.map(p => (p.y / 100) * img.naturalHeight);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const uw = maxX - minX, uh = maxY - minY;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const pad = 2.2;
    const newScale = Math.min(cw / (uw * pad), ch / (uh * pad), 4);

    // Animate
    const startView = { ...viewRef.current };
    const endView = {
      scale: newScale,
      offsetX: cw / 2 - cx * newScale,
      offsetY: ch / 2 - cy * newScale,
    };
    const duration = 300;
    const startTime = Date.now();
    const animate = () => {
      const t = Math.min(1, (Date.now() - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      viewRef.current = {
        scale: startView.scale + (endView.scale - startView.scale) * ease,
        offsetX: startView.offsetX + (endView.offsetX - startView.offsetX) * ease,
        offsetY: startView.offsetY + (endView.offsetY - startView.offsetY) * ease,
      };
      forceRender(n => n + 1);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // Snap a percentage-coordinate point to the nearest wall line
  const snapToWall = useCallback((pct: Point): Point => {
    if (!wallLines || wallLines.length === 0) return pct;
    const img = imageRef.current;
    if (!img) return pct;

    // Convert snap distance from screen pixels to percentage
    const v = viewRef.current;
    const snapPctX = (WALL_SNAP_DISTANCE_PX / (img.naturalWidth * v.scale)) * 100;
    const snapPctY = (WALL_SNAP_DISTANCE_PX / (img.naturalHeight * v.scale)) * 100;

    let bestDist = Infinity;
    let snapped = pct;

    for (const wall of wallLines) {
      // Find closest point on the wall segment to pct
      const cp = closestPointOnSegment(pct.x, pct.y, wall.x1, wall.y1, wall.x2, wall.y2);
      const dx = (pct.x - cp.x) / snapPctX;
      const dy = (pct.y - cp.y) / snapPctY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1 && dist < bestDist) {
        bestDist = dist;
        snapped = cp;
      }
    }

    return snapped;
  }, [wallLines]);

  // --- Mouse handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);

    if (hit.type === 'vertex') {
      e.preventDefault();
      const unit = units.find(u => u.id === hit.unitId);
      const startPct = unit && hit.vertexIndex !== undefined ? { ...unit.polygon[hit.vertexIndex] } : undefined;
      dragRef.current = {
        type: 'vertex',
        startX: sx,
        startY: sy,
        unitId: hit.unitId,
        vertexIndex: hit.vertexIndex,
        startPct,
      };
      return;
    }

    if (hit.type === 'midpoint') {
      e.preventDefault();
      // Add a new vertex at the midpoint
      const unit = units.find(u => u.id === hit.unitId);
      if (!unit || hit.vertexIndex === undefined) return;
      const p1 = unit.polygon[hit.vertexIndex];
      const p2 = unit.polygon[(hit.vertexIndex + 1) % unit.polygon.length];
      const newPoly = [...unit.polygon];
      newPoly.splice(hit.vertexIndex + 1, 0, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
      handleUpdatePolygonWithLogging(unit.id, newPoly);
      // Start dragging the new vertex immediately
      dragRef.current = {
        type: 'vertex',
        startX: sx,
        startY: sy,
        unitId: hit.unitId,
        vertexIndex: hit.vertexIndex + 1,
      };
      return;
    }

    if (hit.type === 'polygon') {
      onSelectUnit(hit.unitId === selectedUnitId ? null : (hit.unitId || null));
      return;
    }

    // Pan
    dragRef.current = {
      type: 'pan',
      startX: sx,
      startY: sy,
      startOffsetX: viewRef.current.offsetX,
      startOffsetY: viewRef.current.offsetY,
    };
  }, [hitTest, units, selectedUnitId, onSelectUnit, handleUpdatePolygonWithLogging]);

  // Process vertex drag in rAF for smooth 60fps updates
  const processVertexDrag = useCallback(() => {
    const pos = pendingDragPos.current;
    const drag = dragRef.current;
    if (!pos || !drag || drag.type !== 'vertex') return;

    const { unitId, vertexIndex } = drag;
    if (!unitId || vertexIndex === undefined) return;
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;

    const pct = screenToPct(pos.sx, pos.sy);

    // Shift held = lock to horizontal or vertical movement only
    if (pos.shiftKey && drag.startPct) {
      const dx = Math.abs(pct.x - drag.startPct.x);
      const dy = Math.abs(pct.y - drag.startPct.y);
      if (dx > dy) {
        // Lock horizontal — keep original Y
        pct.y = drag.startPct.y;
      } else {
        // Lock vertical — keep original X
        pct.x = drag.startPct.x;
      }
    }

    // No automatic snapping — vertex follows mouse exactly
    // User can hold Shift for axis lock if needed

    const newPoly = [...unit.polygon];
    newPoly[vertexIndex] = pct;
    handleUpdatePolygonWithLogging(unitId, newPoly);
    pendingDragPos.current = null;
  }, [units, screenToPct, handleUpdatePolygonWithLogging]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!dragRef.current) {
      // Update cursor
      const hit = hitTest(sx, sy);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = hit.type === 'vertex' ? 'move' : hit.type === 'midpoint' ? 'cell' : hit.type === 'polygon' ? 'pointer' : 'grab';
      }
      return;
    }

    if (dragRef.current.type === 'pan') {
      viewRef.current.offsetX = dragRef.current.startOffsetX! + (sx - dragRef.current.startX);
      viewRef.current.offsetY = dragRef.current.startOffsetY! + (sy - dragRef.current.startY);
      forceRender(n => n + 1);
      return;
    }

    if (dragRef.current.type === 'vertex') {
      // Batch vertex updates via rAF for smooth 60fps dragging
      pendingDragPos.current = { sx, sy, shiftKey: e.shiftKey };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(processVertexDrag);
    }
  }, [hitTest, processVertexDrag]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    pendingDragPos.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = viewRef.current;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.max(0.05, Math.min(15, v.scale * factor));
    viewRef.current = {
      scale: newScale,
      offsetX: mx - ((mx - v.offsetX) / v.scale) * newScale,
      offsetY: my - ((my - v.offsetY) / v.scale) * newScale,
    };
    forceRender(n => n + 1);
  }, []);

  // Double-click to remove vertex
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);
    if (hit.type === 'vertex' && hit.unitId && hit.vertexIndex !== undefined) {
      const unit = units.find(u => u.id === hit.unitId);
      if (unit && unit.polygon.length > 3) {
        handleUpdatePolygonWithLogging(unit.id, unit.polygon.filter((_, i) => i !== hit.vertexIndex));
      }
    }
  }, [hitTest, units, handleUpdatePolygonWithLogging]);

  // --- Drawing ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio;
    const v = viewRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw image
    ctx.drawImage(img, v.offsetX, v.offsetY, img.naturalWidth * v.scale, img.naturalHeight * v.scale);

    // Draw wall lines overlay
    if (showWallLines && wallLines.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 50, 50, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const wall of wallLines) {
        const [sx1, sy1] = pctToScreen(wall.x1, wall.y1);
        const [sx2, sy2] = pctToScreen(wall.x2, wall.y2);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const selectedUnit = units.find(u => u.id === selectedUnitId);

    // Dim overlay when unit selected
    if (selectedUnit) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Cut out selected unit (draw it bright)
      ctx.save();
      ctx.beginPath();
      selectedUnit.polygon.forEach((p, i) => {
        const [sx, sy] = pctToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, v.offsetX, v.offsetY, img.naturalWidth * v.scale, img.naturalHeight * v.scale);
      ctx.restore();
    }

    // Draw all polygons
    for (const unit of units) {
      const isSelected = unit.id === selectedUnitId;
      const color = isSelected ? SELECTED_COLOR : getUnitColor(unit);
      const screenPoly = unit.polygon.map(p => pctToScreen(p.x, p.y));

      if (selectedUnitId && !isSelected) continue; // Skip non-selected when one is selected

      const isMirror = unit.classification === 'gespiegeld';
      const isVariant = unit.classification === 'variant';

      // Fill — mirror and variant get clearly more visible fills than
      // hoofdtype, with mirror being the most "highlighted" so the user
      // can immediately spot the pairing
      ctx.beginPath();
      screenPoly.forEach(([sx, sy], i) => { if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); });
      ctx.closePath();
      const fillAlphaHex = isSelected
        ? '00'
        : isMirror
          ? '38' // ~22%
          : isVariant
            ? '28' // ~16%
            : '12'; // ~7% — hoofdtype is the most subdued so mirrors stand out
      ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.08)' : color + fillAlphaHex;
      ctx.fill();

      // Stroke — mirror gets a dashed line, variant gets a dotted line,
      // hoofdtype is solid. Mirror line is also slightly thicker.
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2.5 : isMirror ? 2 : isVariant ? 1.5 : 1.2;
      if (isSelected) ctx.setLineDash([8, 4]);
      else if (isMirror) ctx.setLineDash([6, 3]);
      else if (isVariant) ctx.setLineDash([2, 3]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label (non-selected) — includes a small ↔ marker for mirrors
      // and a ~ marker for variants so they're identifiable even without
      // looking at colors
      if (!isSelected) {
        const cx = screenPoly.reduce((s, [x]) => s + x, 0) / screenPoly.length;
        const cy = screenPoly.reduce((s, [, y]) => s + y, 0) / screenPoly.length;
        const fontSize = Math.max(10, 14 / Math.sqrt(v.scale));
        ctx.font = `bold ${fontSize}px sans-serif`;
        const labelText = isMirror
          ? `↔ ${unit.label}`
          : isVariant
            ? `~ ${unit.label}`
            : unit.label;
        const tm = ctx.measureText(labelText);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(cx - tm.width / 2 - 5, cy - fontSize / 2 - 3, tm.width + 10, fontSize + 6);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, cx, cy);
      }

      // Selected: draw handles
      if (isSelected) {
        // Midpoint handles
        for (let i = 0; i < unit.polygon.length; i++) {
          const p1 = unit.polygon[i];
          const p2 = unit.polygon[(i + 1) % unit.polygon.length];
          const [mx, my] = pctToScreen((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          ctx.beginPath();
          ctx.arc(mx, my, MIDPOINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = SELECTED_COLOR;
          ctx.globalAlpha = 0.4;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = SELECTED_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Vertex handles
        for (let i = 0; i < unit.polygon.length; i++) {
          const [vx, vy] = pctToScreen(unit.polygon[i].x, unit.polygon[i].y);
          ctx.beginPath();
          ctx.arc(vx, vy, HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.strokeStyle = SELECTED_COLOR;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label badge above
        const minY = Math.min(...screenPoly.map(([, y]) => y));
        const cx = screenPoly.reduce((s, [x]) => s + x, 0) / screenPoly.length;
        const fontSize = Math.max(11, 13);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const tm = ctx.measureText(unit.label);
        const bx = cx - tm.width / 2 - 8;
        const by = minY - 30;
        ctx.fillStyle = '#3d5a40';
        roundRect(ctx, bx, by, tm.width + 16, fontSize + 10, 4);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.label, cx, by + (fontSize + 10) / 2);
      }
    }

    ctx.restore();
  });

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden bg-gray-200">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}

// --- Utilities ---

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function closestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number } {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
