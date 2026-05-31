'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useProjectStore } from '@/stores/project-store';
import { InputStepIndicator } from '@/components/flow/InputStepIndicator';
import { getExamplesFor } from '@/lib/style-examples';

/**
 * Step 2/4 part 2 — Voorbeeld kiezen.
 *
 * Pure gallery page. The category (2D Basic vs 2D Luxe) was picked on
 * /stijl. This page shows the example gallery for that category and
 * lets the user pick a favourite. Picking advances to /branding (Basic)
 * or /input (Luxe — branding is skipped).
 *
 * Always-visible "Andere richting kiezen" link at the top sends the
 * user back to /stijl to switch between Basic and Luxe.
 */

const PAGE_SIZE = 6;

export default function StijlVoorbeeldenPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, setExampleId, setStatus } = useProjectStore();
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Boot guard: must have a niveau AND a category before we get here
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
    if (project.status !== 'stijl') setStatus('stijl');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.level, project?.outputType]);

  if (!project || !project.level || !project.outputType) return null;

  const examples = getExamplesFor(project.outputType, project.level);
  const visible = examples.slice(0, visibleCount);
  const canLoadMore = visibleCount < examples.length;
  const selectedId = project.exampleId;
  const categoryLabel = project.outputType === '2d-luxe' ? '2D Luxe' : '2D Basic';

  const handleToggleSelect = (id: string) => {
    setExampleId(selectedId === id ? null : id);
  };

  const handleContinue = () => {
    if (!selectedId) return;
    const nextStep = project.outputType === '2d-luxe' ? 'input' : 'branding';
    setStatus(nextStep);
    router.push(`/project/${projectId}/${nextStep}`);
  };

  return (
    <div className="flex flex-1 flex-col px-4 py-8">
      <InputStepIndicator projectId={projectId} current={2} />

      <div className="mx-auto mt-8 w-full max-w-5xl">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rendoo-600">
            {categoryLabel}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Welk voorbeeld spreekt je het meeste aan?
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-500">
            Klik op een afbeelding om hem groter te bekijken. Klik op
            &ldquo;Kies deze stijl&rdquo; om te selecteren.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}/stijl`)}
            className="mt-3 text-xs font-medium text-rendoo-600 underline-offset-2 hover:underline"
          >
            ← Andere richting kiezen
          </button>
        </div>

        {/* Gallery */}
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {visible.map((ex) => {
            const isSelected = selectedId === ex.id;
            return (
              <div
                key={ex.id}
                className={`group relative overflow-hidden rounded-2xl border-[3px] bg-white shadow-sm transition-all ${
                  isSelected
                    ? 'border-rendoo-600 shadow-xl shadow-rendoo-300/30'
                    : 'border-transparent ring-1 ring-border hover:ring-rendoo-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setLightbox(ex.image)}
                  className="relative block aspect-[3/2] w-full overflow-hidden bg-white"
                  aria-label={`${ex.label} vergroot bekijken`}
                >
                  <Image
                    src={ex.image}
                    alt={ex.label}
                    fill
                    className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.02]"
                    sizes="(min-width: 640px) 45vw, 90vw"
                  />
                  <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zm-7-3v6m-3-3h6" />
                    </svg>
                    Vergroten
                  </span>
                </button>

                <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-gray-900">
                      {ex.label}
                    </p>
                    {ex.caption && (
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">
                        {ex.caption}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSelect(ex.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition-all ${
                      isSelected
                        ? 'bg-rendoo-600 text-white shadow-rendoo-300/40 hover:bg-rendoo-700'
                        : 'bg-gradient-to-r from-rendoo-600 to-rendoo-500 text-white shadow-rendoo-300/40 hover:from-rendoo-700 hover:to-rendoo-600 active:scale-[0.98]'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Gekozen
                      </>
                    ) : (
                      'Kies deze stijl'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {canLoadMore && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-rendoo-300 hover:bg-rendoo-50 hover:text-rendoo-700"
            >
              Laad meer voorbeelden
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-gray-400">
          {visible.length} van {examples.length} voorbeelden getoond
        </p>

        {/* Sticky continue */}
        <div className="sticky bottom-4 mt-10 flex justify-center">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selectedId}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-rendoo-400/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            Kies deze stijl en voeg verdere voorkeuren toe
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </div>

      {lightbox && (
        <Lightbox image={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Lightbox({ image, onClose }: { image: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg transition-colors hover:bg-gray-100"
          aria-label="Sluiten"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="Voorbeeld"
          className="max-h-[85vh] max-w-full rounded-xl shadow-2xl"
        />
      </div>
    </div>
  );
}
