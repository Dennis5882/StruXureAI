import React from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { useNext } from './strings';

// 작은 인라인 텍스트/숫자 필드
const Field: React.FC<{ value: string | number; onChange: (v: string) => void; w?: string; type?: string }> = ({ value, onChange, w = 'w-14', type = 'text' }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`${w} bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-zinc-100 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500`}
  />
);

export const FloorsPanel: React.FC = () => {
  const { n } = useNext();
  const model = useDrawingStore((s) => s.model);
  const floors = useDrawingStore((s) => s.floors);
  const saveCurrentAsFloor = useDrawingStore((s) => s.saveCurrentAsFloor);
  const updateFloor = useDrawingStore((s) => s.updateFloor);
  const removeFloor = useDrawingStore((s) => s.removeFloor);

  const hasModel = !!model && model.nodes.length > 0;
  const totalH = floors.reduce((z, f) => Math.max(z, (f.elevation ?? 0) + (f.height ?? 0)), 0);

  return (
    <div className="p-2.5 border-b border-zinc-800 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
          <Layers size={13} className="text-indigo-400" />
          <span>{n('flTitle')}</span>
        </div>
        {floors.length > 0 && (
          <span className="text-[10px] text-zinc-500">{floors.length}{n('flCount')} · {totalH.toLocaleString()}mm</span>
        )}
      </div>

      <button
        onClick={saveCurrentAsFloor}
        disabled={!hasModel}
        title={hasModel ? '' : n('flNoModel')}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={13} /><span>{n('flSave')}</span>
      </button>

      {floors.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-1">{n('flEmpty')}</p>
      ) : (
        <div className="space-y-1">
          {/* 위층이 위로 오도록 역순 표시 */}
          {[...floors].reverse().map((f) => (
            <div key={f.id} className="bg-zinc-900/60 rounded px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Field value={f.name} onChange={(v) => updateFloor(f.id!, { name: v })} w="w-14" />
                <span className="text-[10px] text-zinc-500 ml-auto">
                  {f.columns.length}C · {f.walls.length}W
                </span>
                <button
                  onClick={() => removeFloor(f.id!)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded p-0.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <label className="flex items-center gap-1">
                  <span>{n('flElev')}</span>
                  <Field type="number" value={f.elevation ?? 0} onChange={(v) => updateFloor(f.id!, { elevation: Math.round(Number(v) || 0) })} />
                </label>
                <label className="flex items-center gap-1">
                  <span>{n('flHeight')}</span>
                  <Field type="number" value={f.height ?? 0} onChange={(v) => updateFloor(f.id!, { height: Math.round(Number(v) || 0) })} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
