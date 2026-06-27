import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDrawingStore } from '../../store/useDrawingStore';
import { modelQuality } from '../workflow';
import { useNext } from '../strings';

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'ok' | 'warn' | 'neutral' }> = ({ label, value, tone = 'neutral' }) => {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-zinc-100';
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`text-lg font-bold leading-tight ${color}`}>{value}</div>
    </div>
  );
};

export const ReviewTab: React.FC = () => {
  const { n } = useNext();
  const model = useDrawingStore((s) => s.model);
  const q = modelQuality(model);

  if (!model || !q) {
    return <div className="text-xs text-zinc-600 text-center mt-12 leading-relaxed whitespace-pre-line px-4">{n('qEmpty')}</div>;
  }

  return (
    <div className="p-2.5 space-y-3">
      <div className="text-xs font-bold text-zinc-300 px-0.5">{n('qTitle')} <span className="text-zinc-600">· {model.name}</span></div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={n('qNodes')} value={q.nodes} />
        <Stat label={n('qMembers')} value={q.members} />
        <Stat label={n('qShared')} value={q.sharedNodes} tone="ok" />
        <Stat label={n('qFree')} value={q.freeEnds} tone={q.freeEnds > 0 ? 'warn' : 'ok'} />
      </div>

      {q.freeEnds > 0 && (
        <div className="flex items-start space-x-1.5 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{n('qFreeHint')}</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qWalls')}</div><div className="text-sm font-bold text-red-300">{q.walls}</div></div>
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qColumns')}</div><div className="text-sm font-bold text-sky-300">{q.columns}</div></div>
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qBeams')}</div><div className="text-sm font-bold text-emerald-300">{q.beams}</div></div>
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qGrid')}</div><div className="text-sm font-bold text-amber-300">{q.grid}</div></div>
      </div>

      {/* 기둥 목록 */}
      {model.columns.length > 0 && (
        <details open className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 font-semibold py-1">{n('listCols')} ({model.columns.length})</summary>
          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
            {model.columns.map((c) => (
              <div key={c.id} className="flex justify-between bg-zinc-900/60 rounded px-2 py-1">
                <span className="text-zinc-300">{c.id}{c.gridRef ? ` · ${c.gridRef}` : ''}</span>
                <span className="text-zinc-500">{c.width}×{c.depth}{c.rotation ? ` · ${c.rotation}°` : ''}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 벽 목록 */}
      {model.walls.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 font-semibold py-1">{n('listWalls')} ({model.walls.length})</summary>
          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
            {model.walls.map((w) => (
              <div key={w.id} className="flex justify-between bg-zinc-900/60 rounded px-2 py-1">
                <span className="text-zinc-300">{w.id}{w.gridLine ? ` · ${w.gridLine}` : ''}{w.singleLine ? ` · ${n('qSingle')}` : ''}</span>
                <span className="text-zinc-500">t{w.thickness}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 보 목록 */}
      {model.beams.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 font-semibold py-1">{n('listBeams')} ({model.beams.length})</summary>
          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
            {model.beams.map((b) => (
              <div key={b.id} className="flex justify-between bg-zinc-900/60 rounded px-2 py-1">
                <span className="text-zinc-300">{b.id}{b.singleLine ? ` · ${n('qSingle')}` : ''}</span>
                <span className="text-zinc-500">w{b.width}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
