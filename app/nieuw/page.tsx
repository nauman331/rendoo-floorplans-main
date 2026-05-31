'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProjectStore } from '@/stores/project-store';

/**
 * Entry page for a new project.
 *
 * Previously this also did the file upload, but the flow now leads with the
 * fun visual style questions so users feel invested before they have to
 * gather and upload CAD files. This page therefore only collects a project
 * name and then routes the user to Step 1 (stijlkeuze).
 *
 * If there's an existing draft in the store (`isDraft: true`) we offer to
 * resume it instead of starting over.
 */
export default function NieuwProject() {
  const router = useRouter();
  const { project, createProject } = useProjectStore();
  const [projectName, setProjectName] = useState('');
  const [hasMounted, setHasMounted] = useState(false);

  // Zustand persistence rehydrates on mount — wait for it so we don't
  // briefly render the "start new" flow before we know there's a draft.
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const existingDraft = hasMounted && project?.isDraft ? project : null;

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    createProject(name);
    // createProject is synchronous — the new id is now in the store.
    const id = useProjectStore.getState().project?.id;
    if (id) router.push(`/project/${id}/niveau`);
  };

  const resumeDraft = () => {
    if (!existingDraft) return;
    const nextPath =
      existingDraft.status === 'input'
        ? `/project/${existingDraft.id}/input`
        : existingDraft.status === 'branding'
        ? `/project/${existingDraft.id}/branding`
        : existingDraft.status === 'stijl'
        ? `/project/${existingDraft.id}/stijl`
        : `/project/${existingDraft.id}/niveau`;
    router.push(nextPath);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Hero */}
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-rendoo-100 px-3 py-1 text-[11px] font-medium text-rendoo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rendoo-500" />
            Nieuw project
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Laten we je plattegrond tot leven brengen
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Begin met een naam voor je project. Daarna kies je het niveau,
            een stijl, voeg je optioneel je branding toe, en upload je pas
            op het einde je tekeningen.
          </p>
        </div>

        {/* Resume draft */}
        {existingDraft && (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  Je hebt een concept openstaan
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  <span className="font-medium">{existingDraft.name}</span> —{' '}
                  {existingDraft.status === 'niveau' && 'Stap 1: niveau kiezen'}
                  {existingDraft.status === 'stijl' && 'Stap 2: stijl kiezen'}
                  {existingDraft.status === 'branding' && 'Stap 3: branding'}
                  {existingDraft.status === 'input' && 'Stap 4: uploaden'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={resumeDraft}
                    className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
                  >
                    Verder waar ik gebleven was →
                  </button>
                  <Link
                    href={`/project/${existingDraft.id}/niveau`}
                    className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                  >
                    Vanaf begin
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New project form */}
        <form onSubmit={handleStart} className="mt-8">
          <label className="block text-sm font-medium text-gray-700">
            Projectnaam
          </label>
          <input
            type="text"
            autoFocus
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="bv. Maison Spencer"
            className="mt-2 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
          />
          <p className="mt-1.5 text-[11px] text-gray-400">
            Deze naam zien jullie terug in het dashboard en op exports.
          </p>

          <button
            type="submit"
            disabled={!projectName.trim()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-rendoo-300/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            Start
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </form>

        {/* Reassurance footer */}
        <div className="mt-6 grid grid-cols-2 gap-3 text-center text-[11px] text-gray-500 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="font-semibold text-gray-900">1. Niveau</p>
            <p className="mt-0.5">Woningtype, verdieping of project</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="font-semibold text-gray-900">2. Stijl</p>
            <p className="mt-0.5">2D Basic of 2D Luxe + voorbeeld</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="font-semibold text-gray-900">3. Branding</p>
            <p className="mt-0.5">Optioneel — kleuren & logo</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="font-semibold text-gray-900">4. Uploaden</p>
            <p className="mt-0.5">DWG, DXF of PDF + unitlijst</p>
          </div>
        </div>
      </div>
    </div>
  );
}
