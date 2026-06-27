import React from 'react';
import { Check, Circle } from 'lucide-react';
import { useDrawingStore } from '../../store/useDrawingStore';
import { MidasExport } from '../../components/MidasExport';
import { hasCadStructure } from '../workflow';
import { useNext } from '../strings';

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

  const hasFile = !!backgroundImage || dxfEntities.length > 0;
  const extracted = hasCadStructure(lines);
  const hasModel = !!model && model.nodes.length > 0;

  return (
    <div className="flex flex-col">
      <div className="p-2.5 space-y-1.5 border-b border-zinc-800">
        <div className="text-xs font-bold text-zinc-300">{n('ckTitle')}</div>
        <Row ok={hasFile} label={n('ckFile')} />
        <Row ok={extracted} label={n('ckExtract')} />
        <Row ok={hasModel} label={n('ckModel')} />
        <p className="text-[10px] text-zinc-600 pt-1">{n('ckReady')}</p>
      </div>
      {/* 기존 MIDAS 전송 패널 그대로 재사용 (store.model 소비) */}
      <MidasExport />
    </div>
  );
};
