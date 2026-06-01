'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic_import from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import type { DetectedUnit, FloorplanAnalysis, Point, WallLine } from '@/types/project';
import { useCorrectionLogger } from '@/hooks/useCorrectionLogger';

const PlanCanvas = dynamic_import(() => import('@/components/viewer/PlanCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-100">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-rendoo-200 border-t-rendoo-600" />
    </div>
  ),
});

interface UniqueType {
  representative: DetectedUnit;
  count: number;
  mirrorCount: number;
  variantCount: number;
}

function isSelfIntersecting(points: { x: number; y: number }[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(
  p: { x: number; y: number },
  p2: { x: number; y: number },
  q: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  const d1 = direction(q, q2, p);
  const d2 = direction(q, q2, p2);
  const d3 = direction(p, p2, q);
  const d4 = direction(p, p2, q2);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  return false;
}

function direction(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

function sortPolygonClockwise(points: Point[]): Point[] {
  if (points.length < 4) return points;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return [...points].sort((a, b) => {
    const angA = Math.atan2(a.y - cy, a.x - cx);
    const angB = Math.atan2(b.y - cy, b.x - cx);
    return angA - angB;
  });
}

function fixBowtiesInAnalysis(
  analysis: FloorplanAnalysis
): FloorplanAnalysis | null {
  let touched = false;
  const newUnits = analysis.units.map((u) => {
    if (!u.polygon || u.polygon.length < 4) return u;
    if (isSelfIntersecting(u.polygon)) {
      touched = true;
      return { ...u, polygon: sortPolygonClockwise(u.polygon) };
    }
    return u;
  });
  if (!touched) return null;
  return { ...analysis, units: newUnits };
}

function summarizeUniqueTypes(units: DetectedUnit[]): UniqueType[] {
  const byGroup = new Map<string, UniqueType>();
  for (const u of units) {
    const key = u.typeGroup ?? u.label ?? 'unknown';
    let bucket = byGroup.get(key);
    if (!bucket) {
      bucket = {
        representative: u,
        count: 0,
        mirrorCount: 0,
        variantCount: 0,
      };
      byGroup.set(key, bucket);
    }
    if (
      u.classification === 'hoofdtype' &&
      bucket.representative.classification !== 'hoofdtype'
    ) {
      bucket.representative = u;
    }
    bucket.count += 1;
    if (u.classification === 'gespiegeld') bucket.mirrorCount += 1;
    if (u.classification === 'variant') bucket.variantCount += 1;
  }
  return Array.from(byGroup.values());
}

export default function ValidatiePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, setAnalysis } = useProjectStore();
  const uploadedFile = project?.files[0];
  const correctionLogger = useCorrectionLogger({
    projectId: project?.id ?? '',
    fileId: uploadedFile?.id ?? '',
    inputFileType: (uploadedFile?.type as 'dwg' | 'dxf' | 'pdf') || 'pdf',
    operatorEmail: undefined,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [wallLines, setWallLines] = useState<WallLine[]>([]);
  const [showWallLines, setShowWallLines] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [editedUnitIds, setEditedUnitIds] = useState<Set<string>>(new Set());
  const analysisRequestForFile = useRef<string | null>(null);



  const analysis = project?.analysis;
  const pipelineSource = analysis?.source ?? 'gpt4_vision';
  const pipelineModel = analysis?.aiModel ?? 'gpt-5';

  useEffect(() => {
    if (!project) {
      router.replace('/nieuw');
      return;
    }
    if (analysis) {
      const fixed = fixBowtiesInAnalysis(analysis);
      if (fixed) setAnalysis(fixed);
      setIsAnalyzing(false);
      return;
    }
    const currentFileId = uploadedFile?.id ?? null;
    if (analysisRequestForFile.current === currentFileId) {
      return;
    }
    analysisRequestForFile.current = currentFileId;

    const run = async () => {
      try {
        const csvFileId =
          typeof window !== 'undefined'
            ? sessionStorage.getItem('rendoo-csv-file-id')
            : null;
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: uploadedFile?.id,
            rasterUrl: uploadedFile?.rasterUrl,
            csvFileId,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
          ? await res.json()
          : { error: await res.text() };

        if (!res.ok && !data.error) {
          throw new Error(`Analyse mislukt (${res.status})`);
        }

        if (data.error) {
          setAnalysisError(data.error || 'AI analysis failed');
        } else if (data.analysis) {
          setAnalysis(data.analysis);
          setAnalysisError(null);
        } else {
          setAnalysisError('No analysis data returned from pipeline');
        }
        if (data.dxfWalls) setWallLines(data.dxfWalls);
      } catch (err) {
        console.error('Analysis failed:', err);
        setAnalysisError(`Analysis pipeline error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      setIsAnalyzing(false);
    };
    run();
  }, [analysis, project, router, setAnalysis, uploadedFile?.id, uploadedFile?.rasterUrl]);

  useEffect(() => {
    const fileId = uploadedFile?.id;
    if (!fileId || uploadedFile?.type !== 'pdf') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId }),
        });
        const data = await res.json();
        if (
          !cancelled &&
          data.status === 'complete' &&
          data.extraction?.wallLines
        ) {
          setWallLines(data.extraction.wallLines);
        }
      } catch (err) {
        console.error('Wall extraction failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadedFile]);

  const handleReanalyze = async () => {
    setReanalyzing(true);
    setAnalysisError(null); // Clear errors on re-run
    try {
      const csvFileId =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('rendoo-csv-file-id')
          : null;
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: uploadedFile?.id,
          forceRefresh: true,
          csvFileId,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setAnalysisError(data.error);
      } else if (data.analysis) {
        setAnalysis(data.analysis);
      }

      if (data.dxfWalls) setWallLines(data.dxfWalls);
    } catch (err) {
      console.error('Reanalysis failed:', err);
      setAnalysisError(`Reanalysis error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setReanalyzing(false);
  };

  const handleUpdatePolygon = useCallback(
    (unitId: string, polygon: Point[]) => {
      if (!analysis) return;
      const fixed = isSelfIntersecting(polygon)
        ? sortPolygonClockwise(polygon)
        : polygon;
      const newUnits = analysis.units.map((u) =>
        u.id === unitId ? { ...u, polygon: fixed } : u
      );
      setAnalysis({ ...analysis, units: newUnits });
      setEditedUnitIds((prev) => {
        if (prev.has(unitId)) return prev;
        const next = new Set(prev);
        next.add(unitId);
        return next;
      });
    },
    [analysis, setAnalysis]
  );

  // Classification change handler — updates analysis and logs the correction
  const handleChangeClassification = useCallback(
    async (unitId: string, newClassification: 'hoofdtype' | 'gespiegeld' | 'variant') => {
      if (!analysis) return;
      const unit = analysis.units.find((u) => u.id === unitId);
      if (!unit) return;
      const original = unit.classification;

      // Update analysis state
      const newUnits = analysis.units.map((u) =>
        u.id === unitId ? { ...u, classification: newClassification } : u
      );
      setAnalysis({ ...analysis, units: newUnits });
      setEditedUnitIds((prev) => {
        if (prev.has(unitId)) return prev;
        const next = new Set(prev);
        next.add(unitId);
        return next;
      });

      // Log the correction (non-blocking)
      try {
        await correctionLogger.logClassificationChange(unit, original, newClassification);
      } catch (err) {
        console.warn('Failed to log classification change', err);
      }
    },
    [analysis, setAnalysis, correctionLogger]
  );

  const handleTrainCorrection = async () => {
    if (!analysis || !selectedUnitId) return;
    const unit = analysis.units.find((u) => u.id === selectedUnitId);
    if (!unit) return;

    setTrainingStatus('saving');
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: unit.label,
          typeGroup: unit.typeGroup,
          polygon: unit.polygon,
          notes: `Correctie via /validatie — ${unit.classification ?? 'hoofdtype'}`,
          sourceFile: uploadedFile?.id,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTrainingStatus('saved');
      setTimeout(() => setTrainingStatus('idle'), 2500);
    } catch (err) {
      console.error('Training save failed:', err);
      setTrainingStatus('error');
      setTimeout(() => setTrainingStatus('idle'), 3500);
    }
  };

  const selectedUnit = analysis?.units.find((u) => u.id === selectedUnitId) ?? null;
  const isSelectedEdited = selectedUnit
    ? editedUnitIds.has(selectedUnit.id)
    : false;

  if (isAnalyzing) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-rendoo-200 border-t-rendoo-600" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            AI analyseert je plattegrond…
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            We detecteren wooneenheden, kamers en spiegelingen
          </p>
        </div>
      </div>
    );
  }

  // ADDED: Display the error state to the user instead of rendering a blank screen
  if (analysisError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 max-w-md">
          <h2 className="text-lg font-bold">Analyse Mislukt</h2>
          <p className="mt-2 text-sm">{analysisError}</p>
          <p className="mt-3 text-[11px] text-red-600/80">
            Pipeline: {pipelineSource} · model: {pipelineModel}
          </p>
          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="mt-4 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {reanalyzing ? 'Bezig...' : 'Probeer opnieuw'}
          </button>
        </div>
      </div>
    );
  }

  if (!analysis || !project) return null;

  const uniqueTypes = summarizeUniqueTypes(analysis.units);
  const totalUnits = analysis.units.length;
  const hoofdtypes = uniqueTypes.length;
  const totalMirrored = analysis.units.filter(
    (u) => u.classification === 'gespiegeld'
  ).length;

  const imageUrl =
    uploadedFile?.rasterUrl ?? uploadedFile?.url ?? '/demo/demo-plan.png';

  const handleConfirm = () => {
    router.push(`/project/${projectId}/resultaat`);
  };

  return (
    <div className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rendoo-600">
              Type-validatie
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
              Klopt onze analyse?
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              <strong className="text-gray-900">{hoofdtypes} unieke woningtypes</strong>{' '}
              herkend in {totalUnits} units (waarvan {totalMirrored} gespiegeld).
              Klik op een unit in het plan om te corrigeren — sleep de oranje
              bolletjes om de polygon aan te passen.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Pipeline: {pipelineSource} · model: {pipelineModel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {wallLines.length > 0 && (
              <button
                type="button"
                onClick={() => setShowWallLines((v) => !v)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${showWallLines
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-border bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                title="Toon de extracted muurlijnen uit de DXF/PDF"
              >
                {showWallLines ? '✕ Verberg muurlijnen' : 'Toon muurlijnen'}
              </button>
            )}
            <button
              type="button"
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {reanalyzing ? (
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {reanalyzing ? 'Analyseren…' : 'Opnieuw analyseren'}
            </button>
          </div>
        </div>

        {/* Main canvas */}
        <div className="relative mt-5 flex h-[65vh] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <PlanCanvas
            imageUrl={imageUrl}
            units={analysis.units}
            selectedUnitId={selectedUnitId}
            onSelectUnit={setSelectedUnitId}
            onUpdatePolygon={handleUpdatePolygon}
            wallLines={wallLines}
            showWallLines={showWallLines}
          />

          {/* Floating selection toolbar */}
          {selectedUnit && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-white/95 px-4 py-2 shadow-xl backdrop-blur">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rendoo-600 text-[11px] font-bold text-white">
                  {selectedUnit.label}
                </span>
                <div className="text-[11px] leading-tight">
                  <p className="font-semibold text-gray-900">
                    {selectedUnit.typeGroup}
                  </p>
                  <p className="text-gray-500">
                    {selectedUnit.classification === 'gespiegeld'
                      ? '↔ Gespiegeld'
                      : selectedUnit.classification === 'variant'
                        ? '~ Variant'
                        : 'Hoofdtype'}
                    {isSelectedEdited && (
                      <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                        ✏ aangepast
                      </span>
                    )}
                  </p>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleChangeClassification(selectedUnit.id, 'hoofdtype')}
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${selectedUnit.classification === 'hoofdtype' ? 'bg-sky-50 text-sky-700 border border-sky-100' : 'bg-white text-gray-600 border border-border hover:bg-gray-50'}`}
                    title="Markeer als hoofdtype"
                  >
                    Hoofdtype
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeClassification(selectedUnit.id, 'gespiegeld')}
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${selectedUnit.classification === 'gespiegeld' ? 'bg-sky-50 text-sky-700 border border-sky-100' : 'bg-white text-gray-600 border border-border hover:bg-gray-50'}`}
                    title="Markeer als gespiegeld"
                  >
                    Gespiegeld
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeClassification(selectedUnit.id, 'variant')}
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${selectedUnit.classification === 'variant' ? 'bg-sky-50 text-sky-700 border border-sky-100' : 'bg-white text-gray-600 border border-border hover:bg-gray-50'}`}
                    title="Markeer als variant"
                  >
                    Variant
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleTrainCorrection}
                  disabled={trainingStatus === 'saving'}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${trainingStatus === 'saved'
                    ? 'bg-emerald-100 text-emerald-700'
                    : trainingStatus === 'error'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-rendoo-600 text-white hover:bg-rendoo-700'
                    } disabled:opacity-50`}
                  title="Sla deze polygon op als trainingsvoorbeeld voor de AI"
                >
                  {trainingStatus === 'saving' && (
                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {trainingStatus === 'saved' ? (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Opgeslagen als training
                    </>
                  ) : trainingStatus === 'error' ? (
                    'Mislukt — probeer opnieuw'
                  ) : trainingStatus === 'saving' ? (
                    'Opslaan…'
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      Train AI met deze correctie
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUnitId(null)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Sluit selectie"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Edit indicator chip */}
          {editedUnitIds.size > 0 && (
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800 shadow-md ring-1 ring-amber-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              {editedUnitIds.size} unit{editedUnitIds.size > 1 && 's'} aangepast
              — wordt automatisch meegenomen
            </div>
          )}
        </div>

        {/* Unique-types summary bar */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Gedetecteerde woningtypes
            </h2>
            <span className="text-[10px] text-gray-400">
              Klik om in het plan te focussen
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {uniqueTypes.map((t) => {
              const isFocused = selectedUnitId === t.representative.id;
              return (
                <button
                  key={t.representative.id ?? t.representative.label}
                  type="button"
                  onClick={() => setSelectedUnitId(t.representative.id)}
                  className={`group flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition-all ${isFocused
                    ? 'border-rendoo-600 shadow-md shadow-rendoo-200/40'
                    : 'border-border hover:border-rendoo-300 hover:shadow-sm'
                    }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isFocused
                      ? 'bg-rendoo-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                      }`}
                  >
                    {t.representative.label}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {t.representative.typeGroup}
                      </p>
                      <span className="rounded-full bg-rendoo-50 px-2 py-0.5 text-[9px] font-semibold text-rendoo-700">
                        {t.count}× in project
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
                      {t.representative.area > 0 && (
                        <span>{t.representative.area} m²</span>
                      )}
                      {t.mirrorCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                          {t.mirrorCount} gespiegeld
                        </span>
                      )}
                      {t.variantCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                          {t.variantCount} variant{t.variantCount > 1 && 'en'}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Continue */}
        <div className="sticky bottom-4 mt-6 flex justify-center">
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-rendoo-400/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 active:scale-[0.98]"
          >
            Ja, dit klopt — toon de gestileerde versie
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}