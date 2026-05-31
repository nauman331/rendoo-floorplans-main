'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import type { InputStep } from '@/types/project';

interface StepDef {
  n: InputStep;
  label: string;
  sub: string;
  path: (id: string) => string;
}

const STEPS: StepDef[] = [
  {
    n: 1,
    label: 'Niveau',
    sub: 'Op welk niveau wil je plannen maken?',
    path: (id) => `/project/${id}/niveau`,
  },
  {
    n: 2,
    label: 'Stijl',
    sub: 'Welke stijl spreekt je het meeste aan?',
    path: (id) => `/project/${id}/stijl`,
  },
  {
    n: 3,
    label: 'Branding',
    sub: 'Kleuren & logo (optioneel)',
    path: (id) => `/project/${id}/branding`,
  },
  {
    n: 4,
    label: 'Uploaden',
    sub: 'Tekeningen & unitlijst',
    path: (id) => `/project/${id}/input`,
  },
];

/**
 * Top-of-page step indicator used on /niveau, /stijl, /branding and /input.
 *
 * Shows Stap X/4, the current label, and lets users jump back to previous
 * steps. Forward-jumping is blocked — users can only revisit completed
 * steps or the one they're on.
 *
 * For 2D Luxe projects Step 3 (branding) is skipped — we still show the
 * dot for reference but label it "overgeslagen" and do not allow clicking.
 */
export function InputStepIndicator({
  projectId,
  current,
}: {
  projectId: string;
  current: InputStep;
}) {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const isLuxe = project?.outputType === '2d-luxe';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between pb-6">
        {/* Back arrow — uses browser history so users return exactly where they came from */}
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-rendoo-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Terug
        </button>

        {/* Current-step text */}
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rendoo-600">
            Stap {current}/4
          </p>
          <p className="text-xs text-gray-500">{STEPS[current - 1]?.sub}</p>
        </div>
      </div>

      {/* Dot/connector row */}
      <ol className="relative flex items-center justify-between">
        {/* connector line behind the dots */}
        <div className="absolute left-0 right-0 top-1/2 -z-0 h-[2px] -translate-y-1/2 bg-gray-200">
          <div
            className="h-full bg-rendoo-500 transition-all"
            style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {STEPS.map((step) => {
          const isActive = step.n === current;
          const isDone = step.n < current;
          const isSkipped = step.n === 3 && isLuxe;
          const canClick = (isDone || isActive) && !isSkipped;

          const circleClasses = [
            'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all',
            isActive
              ? 'border-rendoo-600 bg-white text-rendoo-700 shadow-lg shadow-rendoo-200/50 ring-4 ring-rendoo-100'
              : isDone
              ? 'border-rendoo-500 bg-rendoo-500 text-white'
              : isSkipped
              ? 'border-dashed border-gray-300 bg-gray-50 text-gray-400'
              : 'border-gray-300 bg-white text-gray-400',
          ].join(' ');

          const inner = (
            <>
              <span className={circleClasses}>
                {isDone ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.n
                )}
              </span>
              <span className="mt-2 block text-center text-[11px] font-medium text-gray-700">
                {step.label}
              </span>
              {isSkipped && (
                <span className="block text-center text-[10px] text-gray-400">
                  (overgeslagen bij luxe)
                </span>
              )}
            </>
          );

          return (
            <li key={step.n} className="flex flex-col items-center">
              {canClick && step.n !== current ? (
                <Link href={step.path(projectId)} className="flex flex-col items-center">
                  {inner}
                </Link>
              ) : (
                <div className="flex flex-col items-center">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
