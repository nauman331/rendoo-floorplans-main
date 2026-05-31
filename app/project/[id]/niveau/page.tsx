'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useProjectStore } from '@/stores/project-store';
import { InputStepIndicator } from '@/components/flow/InputStepIndicator';
import type { ProjectLevel } from '@/types/project';

/**
 * Step 1/4 — Niveau.
 *
 * The very first question: what kind of plans do you want? This was
 * previously baked into the upload step but Nick wants it as a real
 * up-front choice.
 *
 * For this iteration only "woningtype" is enabled — verdieping and
 * project show "Binnenkort" badges and are not clickable. The dashed-card
 * styling makes it obvious they exist but aren't yet supported.
 */

interface NiveauOption {
  value: ProjectLevel;
  title: string;
  description: string;
  image: string;
  popular?: boolean;
  enabled: boolean;
}

const NIVEAUS: NiveauOption[] = [
  {
    value: 'woningtype',
    title: 'Op niveau van woningtype',
    description:
      'Individuele plattegronden per woningtype. Ideaal voor verkoopbrochures en websites — dit is wat we vandaag het beste ondersteunen.',
    image: '/references/niveau/woningtype.jpg',
    popular: true,
    enabled: true,
  },
  {
    value: 'verdieping',
    title: 'Op niveau van verdieping',
    description:
      'Plattegrond per verdieping met alle units zichtbaar. Toont de indeling per bouwlaag.',
    image: '/references/niveau/verdieping.jpg',
    enabled: false,
  },
  {
    value: 'project',
    title: 'Op niveau van project',
    description:
      'Inplantingsplan / situatietekening van het volledige project met omgeving.',
    image: '/references/niveau/project.png',
    enabled: false,
  },
];

export default function NiveauPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, setLevel, setStatus } = useProjectStore();

  useEffect(() => {
    if (!project) {
      router.replace('/nieuw');
      return;
    }
    if (project.status !== 'niveau') setStatus('niveau');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!project) return null;

  const handleSelect = (value: ProjectLevel, enabled: boolean) => {
    if (!enabled) return;
    setLevel(value);
    setStatus('stijl');
    router.push(`/project/${projectId}/stijl`);
  };

  return (
    <div className="flex flex-1 flex-col px-4 py-8">
      <InputStepIndicator projectId={projectId} current={1} />

      <div className="mx-auto mt-8 w-full max-w-5xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Wat wil je laten opmaken?
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
            Kies het niveau waarop je commerciële plattegronden wilt
            genereren. We focussen voorlopig op het niveau van woningtype —
            verdiepingen en projecten volgen binnenkort.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {NIVEAUS.map((n) => {
            const isSelected = project.level === n.value && n.enabled;
            const baseClass =
              'group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition-all';
            const stateClass = !n.enabled
              ? 'border-dashed border-gray-200 opacity-60 cursor-not-allowed'
              : isSelected
              ? 'border-rendoo-600 shadow-2xl shadow-rendoo-200/40 ring-4 ring-rendoo-100 cursor-pointer'
              : 'border-border shadow-sm hover:-translate-y-1 hover:border-rendoo-400 hover:shadow-2xl hover:shadow-rendoo-200/40 cursor-pointer';

            return (
              <button
                key={n.value}
                type="button"
                disabled={!n.enabled}
                onClick={() => handleSelect(n.value, n.enabled)}
                className={`${baseClass} ${stateClass}`}
              >
                {n.popular && n.enabled && !isSelected && (
                  <div className="absolute right-3 top-3 z-10 rounded-full bg-rendoo-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-lg">
                    Populair
                  </div>
                )}
                {!n.enabled && (
                  <div className="absolute right-3 top-3 z-10 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 shadow-sm">
                    Binnenkort
                  </div>
                )}
                {isSelected && (
                  <div className="absolute right-3 top-3 z-10 rounded-full bg-rendoo-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rendoo-700">
                    ✓ Gekozen
                  </div>
                )}

                {/* Preview */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-rendoo-50 to-gray-100">
                  <Image
                    src={n.image}
                    alt={n.title}
                    fill
                    className={`object-contain p-2 transition-transform duration-500 ${
                      n.enabled ? 'group-hover:scale-105' : ''
                    }`}
                    sizes="(min-width: 640px) 30vw, 90vw"
                  />
                  {!n.enabled && (
                    <div className="absolute inset-0 bg-white/40" />
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-rendoo-700">
                    {n.title}
                  </h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-500">
                    {n.description}
                  </p>
                  {n.enabled ? (
                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-rendoo-600 opacity-0 transition-opacity group-hover:opacity-100">
                      Kiezen
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  ) : (
                    <p className="mt-4 text-[10px] italic text-gray-400">
                      Laat het ons weten als dit voor jou belangrijk is —
                      dan zetten we het naar boven op de roadmap.
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
