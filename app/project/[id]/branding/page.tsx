'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useProjectStore } from '@/stores/project-store';
import { InputStepIndicator } from '@/components/flow/InputStepIndicator';
import { findExample } from '@/lib/style-examples';

/**
 * Step 3/4 — Branding.
 *
 * Only shown for 2D Basic projects. Fully optional: leaving everything
 * empty defaults to black & white. 2D Luxe projects are redirected to
 * Step 4 (input) on mount.
 *
 * Fields:
 *  - primary / secondary / accent color (hex / rgb)
 *  - free-text personality notes
 *
 * Logo upload is intentionally NOT here — it lives at the very end as
 * part of the optional "fact sheet template" service that runs after
 * the floorplans are generated.
 */
export default function BrandingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, updateBranding, setStatus } = useProjectStore();

  // 2D Luxe projects skip this step entirely.
  useEffect(() => {
    if (!project) {
      router.replace('/nieuw');
      return;
    }
    if (project.outputType === '2d-luxe') {
      router.replace(`/project/${projectId}/input`);
      return;
    }
    if (project.status !== 'branding') setStatus('branding');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!project || project.outputType === '2d-luxe') return null;

  const branding = project.branding ?? {
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    logoDataUrl: null,
    notes: null,
  };

  const handleColorChange = (
    key: 'primaryColor' | 'secondaryColor' | 'accentColor',
    value: string
  ) => {
    updateBranding({ [key]: value || null });
  };

  const handleClearColor = (
    key: 'primaryColor' | 'secondaryColor' | 'accentColor'
  ) => {
    updateBranding({ [key]: null });
  };

  const handleContinue = () => {
    setStatus('input');
    router.push(`/project/${projectId}/input`);
  };

  const handleSkip = () => {
    // Leaving branding untouched → app falls back to black & white
    updateBranding({
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
    });
    setStatus('input');
    router.push(`/project/${projectId}/input`);
  };

  const chosenExample = findExample(project.outputType, project.exampleId);
  const hasAnyBranding =
    branding.primaryColor ||
    branding.secondaryColor ||
    branding.accentColor ||
    branding.notes;

  return (
    <div className="flex flex-1 flex-col px-4 py-8">
      <InputStepIndicator projectId={projectId} current={3} />

      <div className="mx-auto mt-8 w-full max-w-5xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Voeg je huisstijl-kleuren toe
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
            We trekken jullie kleuren door in de 2D Basic stijl, zodat de
            commerciele plattegrond meteen in jullie huisstijl past.
            <br />
            <span className="text-gray-400">
              Deze stap is optioneel — laat je het leeg, dan gebruiken we
              zwart-wit als basis. Logo komt later, bij het opmaken van de
              fact sheet template.
            </span>
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* Left column: inputs */}
          <div className="space-y-6">
            {/* Colors */}
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  Huisstijl-kleuren
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  Optioneel
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Kies een primaire kleur voor muren/labels, een accentkleur
                voor highlights en optioneel een secundaire kleur voor vloeren.
              </p>

              <div className="mt-5 space-y-4">
                <ColorField
                  label="Primair"
                  helper="Belangrijkste kleur — muren, titels"
                  value={branding.primaryColor}
                  onChange={(v) => handleColorChange('primaryColor', v)}
                  onClear={() => handleClearColor('primaryColor')}
                />
                <ColorField
                  label="Secundair"
                  helper="Ondersteunend — vloeren, achtergronden"
                  value={branding.secondaryColor}
                  onChange={(v) => handleColorChange('secondaryColor', v)}
                  onClear={() => handleClearColor('secondaryColor')}
                />
                <ColorField
                  label="Accent"
                  helper="Opvallend — badges, highlights"
                  value={branding.accentColor}
                  onChange={(v) => handleColorChange('accentColor', v)}
                  onClear={() => handleClearColor('accentColor')}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  Stijl-notities
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  Optioneel
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Hoe voelt jullie merk? Warm en natuurlijk? Strak en urban?
                Hoe meer context, hoe beter we het kunnen nabootsen.
              </p>
              <textarea
                value={branding.notes ?? ''}
                onChange={(e) => updateBranding({ notes: e.target.value || null })}
                placeholder="bv. &quot;Natuurlijk en warm, zachte aardetinten, weinig harde contrasten&quot;"
                rows={3}
                className="mt-3 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
              />
            </div>
          </div>

          {/* Right column: chosen style reminder + preview */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-rendoo-200 bg-rendoo-50/40 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rendoo-700">
                Je gekozen stijl
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                2D Basic
              </p>
              {chosenExample ? (
                <>
                  <div className="relative mt-3 aspect-[3/2] w-full overflow-hidden rounded-xl border border-border bg-white">
                    <Image
                      src={chosenExample.image}
                      alt={chosenExample.label}
                      fill
                      className="object-contain p-2"
                      sizes="(min-width: 1024px) 25vw, 90vw"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">
                    {chosenExample.label}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  Geen voorbeeld geselecteerd.
                </p>
              )}
            </div>

            {/* Color preview */}
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Voorvertoning van je kleuren
              </p>
              <div className="mt-3 flex h-16 overflow-hidden rounded-xl">
                <div
                  className="flex-1"
                  style={{
                    background: branding.primaryColor ?? '#1f1f1f',
                  }}
                />
                <div
                  className="flex-1"
                  style={{
                    background: branding.secondaryColor ?? '#e5e5e5',
                  }}
                />
                <div
                  className="flex-1"
                  style={{
                    background: branding.accentColor ?? '#9ca3af',
                  }}
                />
              </div>
              {!hasAnyBranding && (
                <p className="mt-2 text-[10px] italic text-gray-400">
                  Nog niets ingesteld → we gebruiken zwart-wit.
                </p>
              )}
            </div>
          </aside>
        </div>

        {/* Actions */}
        <div className="sticky bottom-4 mt-10 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-full border border-border bg-white px-5 py-3 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
          >
            Sla over (zwart-wit)
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-rendoo-400/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 active:scale-[0.98]"
          >
            Verder naar uploaden
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Convert "#aabbcc" or "aabbcc" → {r,g,b} or null if not parseable. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Clamp 0..255 and convert to a 2-char hex pair. */
function toHexPair(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

function ColorField({
  label,
  helper,
  value,
  onChange,
  onClear,
}: {
  label: string;
  helper: string;
  value: string | null;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const display = value ?? '#000000';
  const isSet = !!value;
  const rgb = value ? hexToRgb(value) : null;

  // Local hex input state so users can type partial values like "#aa" without
  // it being immediately rejected. Sync from `value` whenever it changes
  // upstream (e.g. swatch click).
  const [hexInput, setHexInput] = useState<string>(value ?? '');
  useEffect(() => {
    setHexInput(value ?? '');
  }, [value]);

  const commitHex = (raw: string) => {
    let v = raw.trim();
    if (!v.startsWith('#')) v = `#${v}`;
    const parsed = hexToRgb(v);
    if (parsed) {
      onChange(v.toLowerCase());
    } else if (raw.trim() === '') {
      onClear();
    }
  };

  const handleRgbChange = (
    channel: 'r' | 'g' | 'b',
    raw: string
  ) => {
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    const base = rgb ?? { r: 0, g: 0, b: 0 };
    const next = { ...base, [channel]: Math.max(0, Math.min(255, num)) };
    onChange(rgbToHex(next.r, next.g, next.b));
  };

  return (
    <div className="rounded-xl border border-border bg-gray-50/50 p-3">
      <div className="flex items-start gap-4">
        {/* Swatch */}
        <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border shadow-sm">
          <span
            className="absolute inset-0"
            style={{
              background: isSet
                ? display
                : 'repeating-linear-gradient(45deg,#f3f4f6 0 6px,#ffffff 6px 12px)',
            }}
          />
          <input
            type="color"
            value={display}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} kleur kiezen`}
          />
        </label>

        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">{helper}</p>
            </div>
            {isSet && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] font-medium text-gray-400 hover:text-red-600"
              >
                Wissen
              </button>
            )}
          </div>

          {/* HEX + RGB inputs */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1.6fr]">
            {/* HEX */}
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                HEX
              </span>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onBlur={() => commitHex(hexInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitHex(hexInput);
                  }
                }}
                placeholder="#3d5a40"
                spellCheck={false}
                maxLength={7}
                className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 font-mono text-xs uppercase text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
              />
            </label>

            {/* RGB triplet */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                RGB
              </span>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {(['r', 'g', 'b'] as const).map((channel) => (
                  <label key={channel} className="block">
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={rgb ? rgb[channel] : ''}
                      onChange={(e) => handleRgbChange(channel, e.target.value)}
                      placeholder={channel.toUpperCase()}
                      className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-center font-mono text-xs text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
