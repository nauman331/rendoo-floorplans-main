'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useProjectStore } from '@/stores/project-store';
import { InputStepIndicator } from '@/components/flow/InputStepIndicator';
import type { OutputType } from '@/types/project';

/**
 * Step 2/4 part 1 — Stijl-richting kiezen.
 *
 * Just the category picker: 2D Basic vs 2D Luxe. Picking one navigates
 * to /stijl/voorbeelden where the gallery lives. Splitting these into
 * two separate pages makes the choice unambiguous and gives each step
 * room to breathe.
 */

const CATEGORY_OPTIONS: {
  value: OutputType;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  feelWords: string[];
  exampleCount: string;
}[] = [
  {
    value: '2d-basic',
    title: '2D Basic',
    subtitle: 'Helder & brandable',
    description:
      'Helder, overzichtelijk en warm. Makkelijk door te trekken in jullie huisstijl — ideaal voor verkoopbrochures en websites.',
    image: '/references/2d-basic-examples/02-type-s-flow.jpg',
    feelWords: ['Warm', 'Clean', 'Brandable'],
    exampleCount: '6 voorbeelden',
  },
  {
    value: '2d-luxe',
    title: '2D Luxe',
    subtitle: 'Premium sfeer',
    description:
      'Rijke uitstraling met diepere kleuren, donkere lijnen en verfijnde materialen. Tien sfeer-stijlen om uit te kiezen — van Warm tot Moody tot Scandi.',
    image: '/references/2d-luxe-examples/warm.jpg',
    feelWords: ['Premium', 'Diep', 'Sfeervol'],
    exampleCount: '10 sfeer-stijlen',
  },
];

export default function StijlPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, setOutputCategory, setOutputType, setExampleId, setStatus } =
    useProjectStore();

  // Boot guard — niveau must be set first
  useEffect(() => {
    if (!project) {
      router.replace('/nieuw');
      return;
    }
    if (!project.level) {
      router.replace(`/project/${projectId}/niveau`);
      return;
    }
    if (project.status !== 'stijl') setStatus('stijl');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.level]);

  if (!project || !project.level) return null;

  const handlePick = (type: OutputType) => {
    // Reset example selection when switching category — the new gallery
    // is a different set of images
    if (project.outputType !== type) {
      setExampleId(null);
    }
    setOutputCategory('2d');
    setOutputType(type);
    router.push(`/project/${projectId}/stijl/voorbeelden`);
  };

  return (
    <div className="flex flex-1 flex-col px-4 py-8">
      <InputStepIndicator projectId={projectId} current={2} />

      <div className="mx-auto mt-10 w-full max-w-5xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Welke richting wil je op?
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-500">
            Kies eerst de hoofdrichting — Basic of Luxe. In de volgende
            stap zie je dan de specifieke voorbeelden om uit te kiezen.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {CATEGORY_OPTIONS.map((opt) => {
            const isCurrent = project.outputType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePick(opt.value)}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border-2 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-rendoo-200/40 ${
                  isCurrent
                    ? 'border-rendoo-600 shadow-2xl shadow-rendoo-300/40 ring-4 ring-rendoo-100'
                    : 'border-border hover:border-rendoo-400'
                }`}
              >
                {isCurrent && (
                  <span className="absolute right-4 top-4 z-10 rounded-full bg-rendoo-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-md">
                    Eerder gekozen
                  </span>
                )}

                {/* Big preview */}
                <div className="relative aspect-[5/3] w-full overflow-hidden bg-white">
                  <Image
                    src={opt.image}
                    alt={opt.title}
                    fill
                    className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]"
                    sizes="(min-width: 640px) 45vw, 90vw"
                    priority
                  />
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-rendoo-600">
                    {opt.subtitle}
                  </p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 group-hover:text-rendoo-700">
                    {opt.title}
                  </h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-500">
                    {opt.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {opt.feelWords.map((w) => (
                      <span
                        key={w}
                        className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600"
                      >
                        {w}
                      </span>
                    ))}
                  </div>

                  {/* CTA bar */}
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
                    <span className="text-[11px] text-gray-400">
                      {opt.exampleCount}
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm group-hover:shadow-md">
                      Bekijk voorbeelden
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
