'use client';

import { useRouter, useParams } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import Image from 'next/image';

const styleOptions = [
  {
    id: 'basic',
    label: 'APPARTEMENT',
    title: 'Basic',
    description: 'Professionele commerciele plattegrond — warm, helder en overzichtelijk',
    image: '/references/2d-basic/basic-type-a.png',
  },
  {
    id: 'premium',
    label: 'APPARTEMENT',
    title: 'Premium',
    description: 'Rijke luxe uitstraling met diepere kleuren en elegante textures',
    image: '/references/2d-luxe/luxe-type-a.png',
  },
  {
    id: 'minimalistisch',
    label: 'APPARTEMENT',
    title: 'Minimalistisch',
    description: 'Strak zonder decoratie — enkel essentieel lijnen en tonen',
    image: '/references/2d-basic/basic-type-c.png',
  },
];

export default function GenererenPage() {
  const router = useRouter();
  const params = useParams();
  const { project } = useProjectStore();

  const firstUnit = project?.analysis?.units[0];
  const unitLabel = firstUnit?.label || 'APP. AG.1';

  const handleSelect = (styleId: string) => {
    router.push(`/project/${params.id}/editor`);
  };

  return (
    <div className="flex flex-1 flex-col px-8 py-6">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-rendoo-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Terug
      </button>

      <h1 className="text-xl font-semibold text-gray-900">
        Kies een verkoopsplan voor <span className="text-rendoo-600">{unitLabel}</span>
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        AI-gegenereerde planaflbeeldingen klaar — kies je favoriete stijl
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {styleOptions.map((style) => (
          <div
            key={style.id}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-white transition-all hover:border-rendoo-400 hover:shadow-md"
          >
            {/* Preview */}
            <div className="relative aspect-[5/4] overflow-hidden bg-gray-50">
              <Image
                src={style.image}
                alt={style.title}
                fill
                className="object-contain p-4"
              />
              <div className="absolute left-3 top-3 rounded bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500 shadow-sm">
                {style.label}
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col p-4">
              <h3 className="text-base font-semibold text-gray-900">
                {style.title}
              </h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-gray-500">
                {style.description}
              </p>
              <button
                onClick={() => handleSelect(style.id)}
                className="mt-4 flex items-center gap-1 text-sm font-medium text-rendoo-600 transition-colors hover:text-rendoo-700"
              >
                Dit ontwerp kiezen
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
