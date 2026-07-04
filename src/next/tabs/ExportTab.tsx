import React from 'react';
import { Check, Circle, Download } from 'lucide-react';
import { useDrawingStore } from '../../store/useDrawingStore';
import { MidasExport } from '../../components/MidasExport';
import { hasCadStructure } from '../workflow';
import { useNext } from '../strings';
import { buildDxfFromModel, buildBuildingDxf } from '../../utils/dxfExport';
import { FloorsPanel } from '../FloorsPanel';

const Row: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <div className="flex items-center space-x-2 text-[11px]">
    {ok ? <Check size={13} className="text-emerald-400" /> : <Circle size={13} className="text-zinc-600" />}
    <span className={ok ? 'text-zinc-300' : 'text-zinc-500'}>{label}</span>
  </div>
);

export const ExportTab: React.FC = () => {
  const { n } = useNext();
  const backgroundImage = useDrawingStore((s) => s.backgroundImage);
  const dxfEntities = useDrawingStore((s) => s.dxfEntities);
  const lines = useDrawingStore((s) => s.lines);
  const model = useDrawingStore((s) => s.model);
  const floors = useDrawingStore((s) => s.floors);

  const hasFile = !!backgroundImage || dxfEntities.length > 0;
  const extracted = hasCadStructure(lines);
  const hasModel = !!model && model.nodes.length > 0;

  const downloadDxf = (name: string, dxf: string) => {
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportDxf = () => { if (model) downloadDxf(`${model.name || 'struxure'}_model.dxf`, buildDxfFromModel(model)); };
  const exportBuildingDxf = () => { if (floors.length) downloadDxf('struxure_building_3d.dxf', buildBuildingDxf(floors)); };

  return (
    <div className="flex flex-col">
      <div className="p-2.5 space-y-1.5 border-b border-zinc-800">
        <div className="text-xs font-bold text-zinc-300">{n('ckTitle')}</div>
        <Row ok={hasFile} label={n('ckFile')} />
        <Row ok={extracted} label={n('ckExtract')} />
        <Row ok={hasModel} label={n('ckModel')} />
        <p className="text-[10px] text-zinc-600 pt-1">{n('ckReady')}</p>
      </div>

      {/* 다층 구성 (Building) */}
      <FloorsPanel />

      {/* DXF 내보내기 (편집 반영된 model 소비) */}
      <div className="p-2.5 border-b border-zinc-800">
        <button
          onClick={exportDxf}
          disabled={!hasModel}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-2 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed border border-zinc-700"
        >
          <Download size={13} />
          <span>{n('exDxf')}</span>
        </button>
        <p className="text-[9px] text-zinc-600 pt-1">{n('exDxfHint')}</p>
        {floors.length > 0 && (
          <button
            onClick={exportBuildingDxf}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-2 rounded bg-zinc-800 text-indigo-300 hover:bg-zinc-700 border border-zinc-700"
          >
            <Download size={13} />
            <span>{n('exBldgDxf')} ({floors.length})</span>
          </button>
        )}
      </div>
      {/* 기존 MIDAS 전송 패널 그대로 재사용 (store.model 소비) */}
      <MidasExport />
    </div>
  );
};
