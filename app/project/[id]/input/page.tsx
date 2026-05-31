'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from '@/stores/project-store';
import { InputStepIndicator } from '@/components/flow/InputStepIndicator';
import type { UploadedFile } from '@/types/project';

/**
 * Step 4/4 — Input.
 *
 * Final step: upload the architect's plan (DWG/DXF/PDF) and optionally
 * the unit list (CSV/Excel). The niveau choice happens earlier in
 * /project/[id]/niveau and is read-only here.
 *
 * On submit we:
 *   - upload both files to the existing API routes,
 *   - attach them to the project,
 *   - markDraftComplete(),
 *   - flip status to 'analyzing' and route to /validatie (existing).
 */

type UploadState = 'idle' | 'uploading' | 'done';

type PlanFormat = 'dxf' | 'dwg' | 'pdf';

interface CsvUploadResult {
  fileId: string;
  unitCount: number;
  typeGroups: string[];
  errors: string[];
}

const FORMAT_META: Record<
  PlanFormat,
  {
    title: string;
    tagline: string;
    accept: string;
    extensions: string[];
    why: string;
  }
> = {
  dxf: {
    title: 'DXF',
    tagline: 'Beste resultaat',
    accept: '.dxf',
    extensions: ['dxf'],
    why: 'Volledige muurgeometrie blijft behouden, hoogste detectie-nauwkeurigheid.',
  },
  dwg: {
    title: 'DWG',
    tagline: 'Ook prima',
    accept: '.dwg',
    extensions: ['dwg'],
    why: 'Native AutoCAD-formaat. We zetten het intern om voor verwerking.',
  },
  pdf: {
    title: 'PDF',
    tagline: 'Werkt ook',
    accept: '.pdf',
    extensions: ['pdf'],
    why: 'Lezen we als vector wanneer mogelijk, anders als afbeelding.',
  },
};

export default function InputPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const {
    project,
    addFile,
    setStatus,
    markDraftComplete,
  } = useProjectStore();

  const [file, setFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<CsvUploadResult | null>(null);
  const [dragFormat, setDragFormat] = useState<PlanFormat | null>(null);
  const [dragCsv, setDragCsv] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const dwgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Boot guard — niveau and stijl must already be picked
  useEffect(() => {
    if (!project) {
      router.replace('/nieuw');
      return;
    }
    if (!project.level) {
      router.replace(`/project/${projectId}/niveau`);
      return;
    }
    if (!project.outputType) {
      router.replace(`/project/${projectId}/stijl`);
      return;
    }
    if (project.status !== 'input') setStatus('input');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.level, project?.outputType]);

  if (!project) return null;

  const level = project.level;

  const getFileType = (name: string): 'dwg' | 'dxf' | 'pdf' | null => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'dwg') return 'dwg';
    if (ext === 'dxf') return 'dxf';
    if (ext === 'pdf') return 'pdf';
    return null;
  };

  /**
   * Accept a file into a specific format slot. The slot guards the
   * extension so dropping a PDF onto the DXF zone is rejected with a
   * clear message instead of silently slipping through.
   */
  const handleFile = useCallback((f: File, expected: PlanFormat) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !FORMAT_META[expected].extensions.includes(ext)) {
      alert(
        `Dit veld accepteert alleen .${FORMAT_META[expected].extensions.join(
          ' / .'
        )} bestanden.`
      );
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      alert('Bestand is te groot. Maximum 50MB per bestand.');
      return;
    }
    setFile(f);
    setUploadError(null);
  }, []);

  const handleCsvFile = useCallback((f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      alert('Ongeldig bestandstype. Upload een CSV of Excel bestand.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      alert('Bestand is te groot. Maximum 10MB.');
      return;
    }
    setCsvFile(f);
    setCsvResult(null);
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const canSubmit = !!file && uploadState !== 'uploading';

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    const type = getFileType(file.name);
    if (!type) return;

    setUploadError(null);
    setUploadState('uploading');
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((p) => (p >= 95 ? p : p + Math.random() * 12 + 5));
    }, 250);

    try {
      // Plan upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectName', project.name);
      const endpoint = type === 'dxf' ? '/api/upload-dxf' : '/api/upload';
      const res = await fetch(endpoint, { method: 'POST', body: formData });

      // Handle structured error responses (e.g. DWG conversion not
      // available, complex PDF couldn't be rendered) — surface them in
      // the UI instead of silently moving on to mock data.
      if (!res.ok) {
        let body: { error?: string; message?: string } = {};
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        clearInterval(interval);
        setProgress(0);
        setUploadState('idle');
        setUploadError({
          code: body.error ?? `http_${res.status}`,
          message:
            body.message ??
            'Het bestand kon niet worden verwerkt. Probeer een ander formaat.',
        });
        return;
      }

      const uploadResponse = (await res.json()) as {
        fileId?: string;
        rasterUrl?: string;
      };

      // CSV/Excel (optional)
      let csvUploadResult: CsvUploadResult | null = null;
      if (csvFile) {
        const csvFormData = new FormData();
        csvFormData.append('file', csvFile);
        const csvRes = await fetch('/api/upload-csv', {
          method: 'POST',
          body: csvFormData,
        });
        csvUploadResult = (await csvRes.json()) as CsvUploadResult;
        setCsvResult(csvUploadResult);
      }

      clearInterval(interval);
      setProgress(100);
      setUploadState('done');

      const fileId = uploadResponse.fileId || uuidv4();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const uploaded: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type,
        url: `/api/files/${fileId}.${ext}`,
        rasterUrl: uploadResponse.rasterUrl,
      };
      addFile(uploaded);

      if (csvUploadResult?.fileId) {
        sessionStorage.setItem('rendoo-csv-file-id', csvUploadResult.fileId);
      }

      markDraftComplete();
      setStatus('analyzing');
      setTimeout(() => {
        router.push(`/project/${projectId}/validatie`);
      }, 600);
    } catch (err) {
      console.error('Upload failed', err);
      clearInterval(interval);
      setProgress(0);
      setUploadState('idle');
      setUploadError({
        code: 'network_error',
        message:
          'Kon geen verbinding maken met de server. Controleer je verbinding ' +
          'en probeer het opnieuw.',
      });
    }
  };

  return (
    <div className="flex flex-1 flex-col px-4 py-6 pb-28">
      <InputStepIndicator projectId={projectId} current={4} />

      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Bijna klaar — upload je materiaal
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">2 stappen:</span>{' '}
            tekening + woninglijst (optioneel).
            {level && (
              <>
                {' '}· Niveau:{' '}
                <span className="font-medium text-gray-700">
                  {level === 'woningtype'
                    ? 'woningtype'
                    : level === 'verdieping'
                    ? 'verdieping'
                    : 'project'}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Upload error banner — shown when /api/upload returns a
            structured error (DWG converter missing, PDF render failed,
            etc.) so the user knows what to do instead of silently
            moving on to a mock analysis. */}
        {uploadError && (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50/70 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900">
                  {uploadError.code === 'dwg_parse_failed'
                    ? 'DWG kon niet worden ingelezen'
                    : uploadError.code === 'pdf_render_failed'
                    ? 'Deze PDF kan niet worden gelezen'
                    : 'Upload mislukt'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-red-800">
                  {uploadError.message}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    setFile(null);
                  }}
                  className="mt-2 text-[11px] font-medium text-red-700 underline-offset-2 hover:underline"
                >
                  Bestand verwijderen en opnieuw proberen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Block A: Plan upload */}
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <header className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                1. Upload de tekening
                <span className="ml-2 text-[11px] font-normal text-gray-400">
                  Voorkeur: DXF &gt; DWG &gt; PDF · max 50MB
                </span>
              </h2>
            </div>
            {file && (
              <span className="rounded-full bg-rendoo-100 px-2.5 py-1 text-[10px] font-semibold text-rendoo-700">
                ✓ Toegevoegd
              </span>
            )}
          </header>

          {/* Three separate drop zones — only one can hold a file at a time */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(['dxf', 'dwg', 'pdf'] as const).map((fmt) => {
              const meta = FORMAT_META[fmt];
              const isActive = file && getFileType(file.name) === fmt;
              const isDragging = dragFormat === fmt;
              const inputRef =
                fmt === 'dxf'
                  ? dxfInputRef
                  : fmt === 'dwg'
                  ? dwgInputRef
                  : pdfInputRef;

              return (
                <div
                  key={fmt}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragFormat(fmt);
                  }}
                  onDragLeave={() => setDragFormat(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragFormat(null);
                    if (e.dataTransfer.files?.[0]) {
                      handleFile(e.dataTransfer.files[0], fmt);
                    }
                  }}
                  onClick={() => inputRef.current?.click()}
                  className={`flex cursor-pointer flex-col rounded-xl border-2 border-dashed px-3 py-3 transition-all ${
                    isActive
                      ? 'border-rendoo-500 bg-rendoo-50 shadow-lg shadow-rendoo-200/40'
                      : isDragging
                      ? 'border-rendoo-400 bg-rendoo-50'
                      : 'border-gray-300 bg-white hover:border-rendoo-300 hover:bg-rendoo-50/40'
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={meta.accept}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFile(e.target.files[0], fmt);
                    }}
                  />

                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          isActive
                            ? 'bg-rendoo-600 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {meta.title}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          isActive ? 'text-rendoo-700' : 'text-gray-500'
                        }`}
                      >
                        {meta.tagline}
                      </span>
                    </div>
                    {isActive && (
                      <svg className="h-4 w-4 text-rendoo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                    {meta.why}
                  </p>

                  {/* Body */}
                  {isActive && file ? (
                    <div className="mt-3 rounded-lg border border-rendoo-200 bg-white/60 p-2.5">
                      <p className="truncate text-[11px] font-medium text-gray-900">
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {formatSize(file.size)}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="mt-1.5 text-[10px] font-medium text-red-600 hover:text-red-700"
                      >
                        Verwijderen
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-2.5 text-center">
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <p className="mt-1 text-[10px] text-gray-500">
                        Sleep .{fmt} of klik
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* If a file is selected in another format, hint that switching clears it */}
          {file && (
            <p className="mt-3 text-[10px] text-gray-400">
              Je kan altijd een ander formaat kiezen — we vervangen het
              geüploade bestand automatisch.
            </p>
          )}
        </section>

        {/* Block B: Unit list — compact horizontal layout so it fits on one screen */}
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              2. Woninglijst{' '}
              <span className="text-[11px] font-normal text-gray-400">
                (optioneel · +30% nauwkeurigheid)
              </span>
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              CSV of Excel met kolommen{' '}
              <code className="rounded bg-gray-100 px-1 text-[10px]">
                Bouwnummer, Type, Verdieping, Oppervlakte
              </code>
            </p>
          </header>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragCsv(true);
            }}
            onDragLeave={() => setDragCsv(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragCsv(false);
              if (e.dataTransfer.files?.[0]) handleCsvFile(e.dataTransfer.files[0]);
            }}
            onClick={() => csvInputRef.current?.click()}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
              csvFile
                ? 'border-rendoo-400 bg-rendoo-50'
                : dragCsv
                ? 'border-rendoo-400 bg-rendoo-50'
                : 'border-gray-300 bg-white hover:border-rendoo-300 hover:bg-rendoo-50/40'
            }`}
          >
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleCsvFile(e.target.files[0]);
              }}
            />
            {csvFile ? (
              <>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rendoo-100">
                  <svg className="h-5 w-5 text-rendoo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-900">
                    {csvFile.name}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {formatSize(csvFile.size)}
                    {csvResult && (
                      <span className="ml-2 text-rendoo-700">
                        · {csvResult.unitCount} woningen in{' '}
                        {csvResult.typeGroups.length} types
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCsvFile(null);
                    setCsvResult(null);
                  }}
                  className="text-[10px] font-medium text-red-600 hover:text-red-700"
                >
                  Verwijderen
                </button>
              </>
            ) : (
              <>
                <svg className="h-6 w-6 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <div className="flex-1 text-[11px]">
                  <p className="font-medium text-gray-700">
                    Sleep je woninglijst hier of klik om te bladeren
                  </p>
                  <p className="text-gray-400">CSV / XLSX · max 10MB</p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Progress */}
        {uploadState !== 'idle' && (
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">
              {file?.name.endsWith('.dxf')
                ? 'DXF wordt geparsed. Wandgeometrie en tekst worden geëxtraheerd voor unit-detectie.'
                : file?.name.endsWith('.pdf')
                ? 'PDF wordt gerenderd. Tekst en vectorlijnen worden geëxtraheerd voor unit-detectie.'
                : 'Bestand wordt verwerkt...'}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-[11px] text-gray-600">
                {uploadState === 'done' ? 'Klaar' : 'Uploaden...'}
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-rendoo-600 transition-all duration-300"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-600">
                {Math.min(Math.round(progress), 100)}%
              </span>
            </div>
          </div>
        )}

      </div>

      {/* Fixed bottom action bar — always visible, doesn't depend on
          scroll. Gradient fade above it hints at content above when the
          page is scrolled. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        {/* Fade-out gradient so content doesn't visually butt against the bar */}
        <div className="h-12 bg-gradient-to-t from-white via-white/80 to-transparent" />

        <div className="pointer-events-auto border-t border-border bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="text-[11px] text-gray-500">
              {file ? (
                <>
                  <span className="font-medium text-gray-900">
                    {file.name}
                  </span>
                  {csvFile && (
                    <span className="text-gray-400">
                      {' '}· met woninglijst
                    </span>
                  )}
                </>
              ) : (
                'Voeg eerst een tekening toe om te starten'
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-rendoo-400/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {uploadState === 'uploading' ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verwerken…
                </>
              ) : (
                <>
                  Start de analyse
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
