import React from 'react';
import { Layers, ClipboardCheck, Server } from 'lucide-react';
import { useNext } from './strings';
import { useDrawingStore } from '../store/useDrawingStore';
import { ThicknessProfile } from '../utils/geometry';
import { modelQuality } from './workflow';
import { LayersTab } from './tabs/LayersTab';
import { ReviewTab } from './tabs/ReviewTab';
import { ExportTab } from './tabs/ExportTab';
import type { LayerTypeOverrides, LineLayerIncludes } from './AppNext';
import type { StructureType } from '../types/drawing';
import type { CropBBox } from './CropPanel';

export type TabKey = 'layers' | 'review' | 'export';

interface Props {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  onExtract: () => void;
  profile: ThicknessProfile;
  setProfile: (p: ThicknessProfile) => void;
  layerTypeOverrides: LayerTypeOverrides;
  setLayerOverride: (name: string, type: StructureType | 'EXCLUDE' | 'AUTO') => void;
  lineLayerIncludes: LineLayerIncludes;
  setLineInclude: (name: string, include: boolean) => void;
  cropBBox: CropBBox | null;
  setCropBBox: (bbox: CropBBox | null) => void;
}

export const RightDock: React.FC<Props> = ({ tab, setTab, onExtract, profile, setProfile, layerTypeOverrides, setLayerOverride, lineLayerIncludes, setLineInclude, cropBBox, setCropBBox }) => {
  const { n } = useNext();
  const model = useDrawingStore((s) => s.model);
  const q = modelQuality(model);
  const freeEnds = q?.freeEnds ?? 0;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'layers', label: n('tabLayers'), icon: <Layers size={14} /> },
    { key: 'review', label: n('tabReview'), icon: <ClipboardCheck size={14} />, badge: freeEnds },
    { key: 'export', label: n('tabExport'), icon: <Server size={14} /> },
  ];

  return (
    <div className="w-72 shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col h-full text-zinc-300 select-none z-10 shadow-xl">
      {/* 탭 헤더 */}
      <div className="flex border-b border-zinc-800 bg-zinc-900">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`relative flex-1 flex items-center justify-center space-x-1.5 text-xs py-2.5 transition-colors border-b-2 ${
              tab === tb.key ? 'border-indigo-500 text-indigo-300 bg-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tb.icon}<span>{tb.label}</span>
            {tb.badge ? (
              <span className="ml-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30" title={n('qFreeHint')}>{tb.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'layers' && <LayersTab onExtract={onExtract} profile={profile} setProfile={setProfile} layerTypeOverrides={layerTypeOverrides} setLayerOverride={setLayerOverride} lineLayerIncludes={lineLayerIncludes} setLineInclude={setLineInclude} cropBBox={cropBBox} setCropBBox={setCropBBox} />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'export' && <ExportTab />}
      </div>
    </div>
  );
};
