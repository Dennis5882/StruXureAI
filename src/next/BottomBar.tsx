import React from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { modelQuality } from './workflow';
import { useNext } from './strings';

// 하단 상태바 — 현재 상태를 항상 보이게 (전문가 조언: persistent workflow visibility).
export const BottomBar: React.FC = () => {
  const { n } = useNext();
  const dxfEntities = useDrawingStore((s) => s.dxfEntities);
  const model = useDrawingStore((s) => s.model);
  const zoom = useDrawingStore((s) => s.zoom);
  const q = modelQuality(model);

  const Item: React.FC<{ label: string; value: React.ReactNode; warn?: boolean }> = ({ label, value, warn }) => (
    <span className="flex items-center space-x-1">
      <span className="text-zinc-600">{label}</span>
      <span className={warn ? 'text-amber-300 font-semibold' : 'text-zinc-300'}>{value}</span>
    </span>
  );

  return (
    <div className="h-6 shrink-0 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 space-x-4 text-[10px] select-none">
      <Item label="DXF" value={dxfEntities.length} />
      {q ? (
        <>
          <Item label={n('qNodes')} value={q.nodes} />
          <Item label={n('qMembers')} value={q.members} />
          <Item label={n('qFree')} value={q.freeEnds} warn={q.freeEnds > 0} />
        </>
      ) : (
        <span className="text-zinc-600">{n('qEmpty').split('\n')[0]}</span>
      )}
      <span className="flex-1" />
      <Item label="zoom" value={`${Math.round(zoom * 100)}%`} />
    </div>
  );
};
