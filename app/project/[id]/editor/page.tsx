'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';

type Tool = 'select' | 'maten' | 'label';
type FurnitureTab = 'woonkamer' | 'eetkamer' | 'slaapkamer';

interface FurnitureItem {
  id: string;
  name: string;
  dimensions: string;
  tab: FurnitureTab;
}

const furnitureItems: FurnitureItem[] = [
  { id: 'sofa-3', name: 'Sofa 3-zit', dimensions: '2200 x 900mm', tab: 'woonkamer' },
  { id: 'sofa-2', name: 'Sofa 2-zit', dimensions: '1600 x 900mm', tab: 'woonkamer' },
  { id: 'hoeksofa', name: 'Hoeksofa', dimensions: '2600 x 2000mm', tab: 'woonkamer' },
  { id: 'fauteuil', name: 'Fauteuil', dimensions: '800 x 800mm', tab: 'woonkamer' },
  { id: 'chaise', name: 'Chaise longue', dimensions: '1800 x 800mm', tab: 'woonkamer' },
  { id: 'salontafel', name: 'Salontafel', dimensions: '1200 x 600mm', tab: 'woonkamer' },
  { id: 'ronde-tafel', name: 'Ronde salontafel', dimensions: '800mm', tab: 'woonkamer' },
  { id: 'tv-meubel', name: 'TV-meubel', dimensions: '1800 x 400mm', tab: 'woonkamer' },
  { id: 'dressoir', name: 'Dressoir', dimensions: '1600 x 450mm', tab: 'woonkamer' },
  { id: 'vloerlamp', name: 'Vloerlamp', dimensions: '400mm', tab: 'woonkamer' },
  { id: 'bijzettafel', name: 'Bijzettafel', dimensions: '500 x 500mm', tab: 'woonkamer' },
  { id: 'eettafel-rect', name: 'Eettafel rechthoekig', dimensions: '1800 x 900mm', tab: 'eetkamer' },
  { id: 'eettafel-rond', name: 'Eettafel rond', dimensions: '1200mm', tab: 'eetkamer' },
  { id: 'eetstoel', name: 'Eetstoel', dimensions: '450 x 450mm', tab: 'eetkamer' },
  { id: 'buffetkast', name: 'Buffetkast', dimensions: '1400 x 450mm', tab: 'eetkamer' },
  { id: 'bed-2p', name: 'Tweepersoonsbed', dimensions: '1800 x 2000mm', tab: 'slaapkamer' },
  { id: 'bed-1p', name: 'Eenpersoonsbed', dimensions: '900 x 2000mm', tab: 'slaapkamer' },
  { id: 'nachtkastje', name: 'Nachtkastje', dimensions: '450 x 400mm', tab: 'slaapkamer' },
  { id: 'kledingkast', name: 'Kledingkast', dimensions: '2000 x 600mm', tab: 'slaapkamer' },
  { id: 'bureau', name: 'Bureau', dimensions: '1200 x 600mm', tab: 'slaapkamer' },
];

function FurnitureIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded bg-rendoo-50">
      <svg className="h-5 w-5 text-rendoo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="8" width="18" height="8" rx="2" />
        <path d="M5 8V6a2 2 0 012-2h10a2 2 0 012 2v2" />
        <path d="M5 16v2M19 16v2" />
      </svg>
    </div>
  );
}

function StyledFloorplan() {
  return (
    <svg viewBox="0 0 600 480" className="h-full w-full">
      {/* Background */}
      <rect width="600" height="480" fill="#f5f0e8" />

      {/* Terras/garden area */}
      <rect x="350" y="20" width="220" height="180" fill="#d4e8c4" rx="4" />
      <circle cx="420" cy="60" r="15" fill="#b8d4a0" opacity="0.6" />
      <circle cx="520" cy="80" r="20" fill="#a8c890" opacity="0.5" />
      <circle cx="480" cy="150" r="12" fill="#b8d4a0" opacity="0.7" />
      <text x="460" y="110" textAnchor="middle" fontSize="14" fill="#6b8f6b">Tuin</text>

      {/* Main walls */}
      <rect x="30" y="20" width="340" height="440" fill="none" stroke="#3d3d3d" strokeWidth="4" />

      {/* Interior walls */}
      <line x1="30" y1="200" x2="200" y2="200" stroke="#3d3d3d" strokeWidth="3" />
      <line x1="200" y1="20" x2="200" y2="300" stroke="#3d3d3d" strokeWidth="3" />
      <line x1="200" y1="300" x2="370" y2="300" stroke="#3d3d3d" strokeWidth="3" />
      <line x1="30" y1="340" x2="200" y2="340" stroke="#3d3d3d" strokeWidth="3" />

      {/* Room fills */}
      <rect x="32" y="22" width="166" height="176" fill="#f0e8d8" /> {/* Slaapkamer 1 */}
      <rect x="202" y="22" width="166" height="276" fill="#ede5d0" /> {/* Leefruimte */}
      <rect x="32" y="202" width="166" height="136" fill="#e8e0d0" /> {/* Slaapkamer 2 */}
      <rect x="32" y="342" width="166" height="116" fill="#dce8e0" /> {/* Badkamer */}
      <rect x="202" y="302" width="166" height="156" fill="#e0d8c8" /> {/* Keuken */}

      {/* Door openings */}
      <line x1="120" y1="200" x2="160" y2="200" stroke="#f5f0e8" strokeWidth="4" />
      <line x1="200" y1="120" x2="200" y2="160" stroke="#f5f0e8" strokeWidth="4" />
      <line x1="120" y1="340" x2="160" y2="340" stroke="#f5f0e8" strokeWidth="4" />
      <line x1="200" y1="340" x2="200" y2="380" stroke="#f5f0e8" strokeWidth="4" />

      {/* Furniture - Bed in Slaapkamer 1 */}
      <rect x="55" y="50" width="120" height="90" rx="4" fill="#c8b896" opacity="0.5" />
      <rect x="60" y="55" width="110" height="25" rx="3" fill="#b8a886" opacity="0.6" />

      {/* Furniture - Sofa in Leefruimte */}
      <rect x="230" y="80" width="100" height="40" rx="4" fill="#c8b896" opacity="0.4" />
      <rect x="230" y="120" width="30" height="30" rx="3" fill="#c8b896" opacity="0.3" />

      {/* Furniture - Dining table */}
      <ellipse cx="290" cy="220" rx="35" ry="25" fill="#b8a886" opacity="0.3" />
      {/* Chairs */}
      <circle cx="260" cy="205" r="8" fill="#c8b896" opacity="0.3" />
      <circle cx="320" cy="205" r="8" fill="#c8b896" opacity="0.3" />
      <circle cx="260" cy="235" r="8" fill="#c8b896" opacity="0.3" />
      <circle cx="320" cy="235" r="8" fill="#c8b896" opacity="0.3" />

      {/* Kitchen counter */}
      <rect x="205" y="305" width="160" height="15" fill="#a89878" opacity="0.5" />
      <rect x="205" y="320" width="15" height="100" fill="#a89878" opacity="0.5" />

      {/* Bathroom fixtures */}
      <rect x="50" y="360" width="60" height="30" rx="3" fill="#c8d0c8" opacity="0.4" />
      <ellipse cx="150" cy="400" rx="20" ry="25" fill="#c8d0c8" opacity="0.3" />
      <rect x="40" y="420" width="30" height="25" rx="2" fill="#c8d0c8" opacity="0.4" />

      {/* Bed in Slaapkamer 2 */}
      <rect x="55" y="230" width="80" height="70" rx="4" fill="#c8b896" opacity="0.4" />

      {/* Room labels */}
      <text x="115" y="160" textAnchor="middle" fontSize="11" fill="#555" fontWeight="500">Slaapkamer 1</text>
      <text x="285" y="160" textAnchor="middle" fontSize="11" fill="#555" fontWeight="500">Leefruimte</text>
      <text x="115" y="310" textAnchor="middle" fontSize="11" fill="#555" fontWeight="500">Slaapkamer 2</text>
      <text x="115" y="410" textAnchor="middle" fontSize="11" fill="#555" fontWeight="500">Badkamer</text>
      <text x="290" y="400" textAnchor="middle" fontSize="11" fill="#555" fontWeight="500">Keuken</text>

      {/* Dimension lines */}
      {/* Width */}
      <line x1="30" y1="475" x2="370" y2="475" stroke="#999" strokeWidth="0.5" />
      <line x1="30" y1="470" x2="30" y2="480" stroke="#999" strokeWidth="0.5" />
      <line x1="370" y1="470" x2="370" y2="480" stroke="#999" strokeWidth="0.5" />
      <text x="200" y="473" textAnchor="middle" fontSize="8" fill="#999">10.80 m</text>

      {/* Height */}
      <line x1="385" y1="20" x2="385" y2="460" stroke="#999" strokeWidth="0.5" />
      <line x1="380" y1="20" x2="390" y2="20" stroke="#999" strokeWidth="0.5" />
      <line x1="380" y1="460" x2="390" y2="460" stroke="#999" strokeWidth="0.5" />
      <text x="395" y="240" fontSize="8" fill="#999" transform="rotate(90, 395, 240)">13.20 m</text>

      {/* Compass */}
      <g transform="translate(550, 420)">
        <circle r="15" fill="none" stroke="#999" strokeWidth="0.5" />
        <text y="-5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#555">N</text>
        <line x1="0" y1="3" x2="0" y2="12" stroke="#999" strokeWidth="1" />
      </g>
    </svg>
  );
}

export default function EditorPage() {
  const router = useRouter();
  const params = useParams();
  const { project } = useProjectStore();
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(100);
  const [activeTab, setActiveTab] = useState<FurnitureTab>('woonkamer');
  const [showDimensions, setShowDimensions] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);

  const firstUnit = project?.analysis?.units[0];
  const unitLabel = firstUnit?.label || 'APP. AG.1';

  const tabs: FurnitureTab[] = ['woonkamer', 'eetkamer', 'slaapkamer'];
  const filteredFurniture = furnitureItems.filter((f) => f.tab === activeTab);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-white px-4 py-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-rendoo-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Terug
        </button>

        <div className="mx-4 h-6 w-px bg-border" />

        {/* Tools */}
        {(['select', 'maten', 'label'] as Tool[]).map((tool) => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTool === tool
                ? 'bg-rendoo-50 text-rendoo-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tool === 'select' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            )}
            {tool === 'maten' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
            {tool === 'label' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            )}
            {tool.charAt(0).toUpperCase() + tool.slice(1)}
          </button>
        ))}

        <div className="mx-4 h-6 w-px bg-border" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(100)}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <span className="w-10 text-center text-xs text-gray-600">{zoom}%</span>
          <button
            onClick={() => setZoom(Math.max(25, zoom - 25))}
            className="rounded px-1 py-1 text-gray-500 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button
            onClick={() => setZoom(Math.min(400, zoom + 25))}
            className="rounded px-1 py-1 text-gray-500 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        </div>

        <div className="flex-1" />

        {/* Export buttons */}
        <button className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          PNG
        </button>
        <button className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          PDF
        </button>

        <div className="mx-2 h-6 w-px bg-border" />

        <span className="text-xs text-gray-400">Stijl</span>
        <span className="text-xs text-gray-400">Instellingen</span>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex w-52 flex-col border-r border-border bg-white p-4">
          <div className="rounded-md bg-rendoo-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-rendoo-600">
              PLAN 2 — BEGANE GROND
            </p>
            <p className="mt-1 text-sm font-semibold text-rendoo-800">
              {unitLabel}
            </p>
            <p className="text-xs text-gray-500">
              {firstUnit?.area || 0} m2
            </p>
          </div>

          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Afmetingen
            </h4>
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Breedte</span>
                <span>0.18 m</span>
              </div>
              <div className="flex justify-between">
                <span>Diepte</span>
                <span>0.13 m</span>
              </div>
              <div className="flex justify-between">
                <span>Oppervlakte</span>
                <span>0.0 m2</span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Lagen
            </h4>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={showDimensions}
                  onChange={(e) => setShowDimensions(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-rendoo-600 focus:ring-rendoo-500"
                />
                Maatvoeringen
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={showFurniture}
                  onChange={(e) => setShowFurniture(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-rendoo-600 focus:ring-rendoo-500"
                />
                Meubels
              </label>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Noordpijl (0deg)
            </h4>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border">
                <svg className="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3 9h-6l3-9z" />
                  <path d="M12 22l-3-9h6l-3 9z" opacity="0.3" />
                </svg>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Vrije hoogte (m)
            </h4>
            <input
              type="text"
              defaultValue="bv. 2.60"
              className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-rendoo-400"
            />
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Main SVG Canvas */}
          <div className="flex-1 overflow-auto bg-gray-100 p-8">
            <div
              className="mx-auto rounded-lg bg-white shadow-sm"
              style={{
                width: `${600 * (zoom / 100)}px`,
                height: `${480 * (zoom / 100)}px`,
              }}
            >
              <StyledFloorplan />
            </div>
          </div>

          {/* Bottom Info Panel */}
          <div className="flex items-center gap-8 border-t border-border bg-white px-6 py-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                Gelijkvloers
              </span>
              <p className="text-sm font-medium text-gray-900">
                PLAN 2 — begane grond
              </p>
              <p className="text-xs text-gray-500">{unitLabel}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                Eenheidsgegevens
              </span>
              <div className="mt-1 flex items-center gap-4 text-xs text-gray-600">
                <span>opp. {firstUnit?.area || 0} m2</span>
                <div className="flex items-center gap-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3 9h-6l3-9z" />
                  </svg>
                  <span>Noord: 0deg</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Furniture Catalog */}
        <div className="flex w-56 flex-col border-l border-border bg-white">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-2 py-2.5 text-xs font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-rendoo-600 text-rendoo-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'woonkamer' ? 'Woonkamer' : tab === 'eetkamer' ? 'Eetkamer' : 'Slaapkamer'}
              </button>
            ))}
          </div>

          {/* Furniture List */}
          <div className="flex-1 overflow-y-auto">
            {filteredFurniture.map((item) => (
              <div
                key={item.id}
                draggable
                className="flex cursor-grab items-center gap-3 border-b border-border px-3 py-2.5 transition-colors hover:bg-gray-50 active:cursor-grabbing"
              >
                <FurnitureIcon />
                <div>
                  <p className="text-xs font-medium text-gray-900">{item.name}</p>
                  <p className="text-[10px] text-gray-400">{item.dimensions}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
