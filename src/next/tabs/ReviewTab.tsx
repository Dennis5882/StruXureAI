import React from 'react';
import { AlertTriangle, Pencil, Trash2, Plus, Link2 } from 'lucide-react';
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

// 인라인 정수 입력 (mm 등) — 0 이상으로 보정
const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <label className="flex items-center gap-1 text-[10px] text-zinc-400">
    <span className="whitespace-nowrap">{label}</span>
    <input
      type="number"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
      className="w-14 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-zinc-100 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
    />
  </label>
);

export const ReviewTab: React.FC = () => {
  const { n } = useNext();
  const model = useDrawingStore((s) => s.model);
  const selectedMemberId = useDrawingStore((s) => s.selectedMemberId);
  const setSelectedMemberId = useDrawingStore((s) => s.setSelectedMemberId);
  const updateMember = useDrawingStore((s) => s.updateMember);
  const deleteMember = useDrawingStore((s) => s.deleteMember);
  const setType = useDrawingStore((s) => s.setType);
  const setMode = useDrawingStore((s) => s.setMode);
  const autoConnectFreeEnds = useDrawingStore((s) => s.autoConnectFreeEnds);
  const q = modelQuality(model);

  const startAdd = (type: 'WALL' | 'COLUMN') => {
    setType(type);
    setMode(type === 'COLUMN' ? 'DRAW_RECT' : 'DRAW_LINE');
  };

  if (!model || !q) {
    return <div className="text-xs text-zinc-600 text-center mt-12 leading-relaxed whitespace-pre-line px-4">{n('qEmpty')}</div>;
  }

  const rowCls = (sel: boolean) =>
    `rounded ${sel ? 'bg-indigo-500/10 ring-1 ring-indigo-500/40' : 'bg-zinc-900/60'}`;
  const toggle = (id: string) => setSelectedMemberId(selectedMemberId === id ? null : id);
  const delBtn = (id: string) => (
    <button
      onClick={(e) => { e.stopPropagation(); deleteMember(id); }}
      className="flex items-center gap-0.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 ml-auto"
    >
      <Trash2 size={11} /><span>{n('edDelete')}</span>
    </button>
  );

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
        <div className="space-y-1.5">
          <div className="flex items-start space-x-1.5 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{n('qFreeHint')}</span>
          </div>
          <button
            onClick={() => autoConnectFreeEnds()}
            title={n('autoConnectHint')}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 border border-amber-500/30"
          >
            <Link2 size={12} />
            <span>{n('autoConnect')}</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qWalls')}</div><div className="text-sm font-bold text-red-300">{q.walls}</div></div>
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qColumns')}</div><div className="text-sm font-bold text-sky-300">{q.columns}</div></div>
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qBeams')}</div><div className="text-sm font-bold text-emerald-300">{q.beams}</div></div>
        <div className="bg-zinc-900 rounded py-1.5"><div className="text-[9px] text-zinc-500">{n('qGrid')}</div><div className="text-sm font-bold text-amber-300">{q.grid}</div></div>
      </div>

      <div className="flex items-start space-x-1.5 text-[10px] text-indigo-300/80 bg-indigo-500/10 border border-indigo-500/20 rounded px-2 py-1.5">
        <Pencil size={11} className="mt-0.5 shrink-0" />
        <span>{n('editHint')}</span>
      </div>

      {/* 부재 추가 */}
      <div className="space-y-1">
        <div className="flex gap-1.5">
          <button
            onClick={() => startAdd('WALL')}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded bg-zinc-800 text-red-300 hover:bg-zinc-700 border border-zinc-700"
          >
            <Plus size={12} /><span>{n('addWall')}</span>
          </button>
          <button
            onClick={() => startAdd('COLUMN')}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded bg-zinc-800 text-sky-300 hover:bg-zinc-700 border border-zinc-700"
          >
            <Plus size={12} /><span>{n('addColumn')}</span>
          </button>
        </div>
        <p className="text-[9px] text-zinc-600 px-0.5">{n('addHint')}</p>
      </div>

      {/* 기둥 목록 */}
      {model.columns.length > 0 && (
        <details open className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 font-semibold py-1">{n('listCols')} ({model.columns.length})</summary>
          <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
            {model.columns.map((c) => {
              const sel = selectedMemberId === c.id;
              return (
                <div key={c.id} className={rowCls(sel)}>
                  <button onClick={() => toggle(c.id)} className="w-full flex justify-between items-center px-2 py-1 text-left">
                    <span className="text-zinc-300">{c.id}{c.gridRef ? ` · ${c.gridRef}` : ''}</span>
                    <span className="text-zinc-500">{c.width}×{c.depth}{c.rotation ? ` · ${c.rotation}°` : ''}</span>
                  </button>
                  {sel && (
                    <div className="flex flex-wrap gap-2 px-2 pb-2 pt-0.5">
                      <NumField label={n('edWidth')} value={c.width} onChange={(v) => updateMember(c.id, { width: v })} />
                      <NumField label={n('edDepth')} value={c.depth} onChange={(v) => updateMember(c.id, { depth: v })} />
                      <NumField label={n('edRot')} value={c.rotation} onChange={(v) => updateMember(c.id, { rotation: v })} />
                      {delBtn(c.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 벽 목록 */}
      {model.walls.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 font-semibold py-1">{n('listWalls')} ({model.walls.length})</summary>
          <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
            {model.walls.map((w) => {
              const sel = selectedMemberId === w.id;
              return (
                <div key={w.id} className={rowCls(sel)}>
                  <button onClick={() => toggle(w.id)} className="w-full flex justify-between items-center px-2 py-1 text-left">
                    <span className="text-zinc-300">{w.id}{w.gridLine ? ` · ${w.gridLine}` : ''}{w.singleLine ? ` · ${n('qSingle')}` : ''}</span>
                    <span className="text-zinc-500">t{w.thickness}</span>
                  </button>
                  {sel && (
                    <div className="flex flex-wrap gap-2 px-2 pb-2 pt-0.5">
                      <NumField label={n('edThick')} value={w.thickness} onChange={(v) => updateMember(w.id, { thickness: v })} />
                      {delBtn(w.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 보 목록 */}
      {model.beams.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 font-semibold py-1">{n('listBeams')} ({model.beams.length})</summary>
          <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
            {model.beams.map((b) => {
              const sel = selectedMemberId === b.id;
              return (
                <div key={b.id} className={rowCls(sel)}>
                  <button onClick={() => toggle(b.id)} className="w-full flex justify-between items-center px-2 py-1 text-left">
                    <span className="text-zinc-300">{b.id}{b.singleLine ? ` · ${n('qSingle')}` : ''}</span>
                    <span className="text-zinc-500">w{b.width}</span>
                  </button>
                  {sel && (
                    <div className="flex flex-wrap gap-2 px-2 pb-2 pt-0.5">
                      <NumField label={n('edBeamW')} value={b.width} onChange={(v) => updateMember(b.id, { width: v })} />
                      {delBtn(b.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};
