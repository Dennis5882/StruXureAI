import React, { useState } from 'react';
import { AlertTriangle, Pencil, Trash2, Plus, Link2, Copy } from 'lucide-react';
import { useDrawingStore, MemberPatch } from '../../store/useDrawingStore';
import { modelQuality } from '../workflow';
import { useNext } from '../strings';

// 편집 필드가 이전에 가지고 있던 값과 같은 값을 가진 다른 부재들 — "유사 패턴 일괄 적용" 후보.
type BulkCandidate = { anchorId: string; ids: string[]; patch: MemberPatch; oldVal: number; newVal: number };

// 판정 근거: 원본 레이어명 + 라벨/단일선/양자화 여부. 데이터는 이미 추출 단계에서 갖고 있던 것을
// 검토 탭에 노출만 하는 것 — 새로 만든 "신뢰도 점수"가 아니라 실제 근거 그대로.
const Evidence: React.FC<{ n: (k: any) => string; layer?: string; lines: string[] }> = ({ n, layer, lines }) => {
  if (!layer && !lines.length) return null;
  return (
    <div className="w-full px-2 pb-1.5 pt-1 mt-0.5 border-t border-zinc-800/70 text-[10px] text-zinc-500 space-y-0.5">
      {layer && <div>{n('evFrom').replace('{layer}', layer)}</div>}
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
};

// 유사값 일괄 적용 배너: 방금 바꾼 값과 이전에 같은 값을 가졌던 다른 부재가 있으면 제안.
const BulkBanner: React.FC<{ n: (k: any) => string; c: BulkCandidate; onApply: () => void; onDismiss: () => void }> = ({ n, c, onApply, onDismiss }) => (
  <div className="w-full mx-2 mb-1.5 flex items-start gap-1.5 text-[10px] text-indigo-200/90 bg-indigo-500/10 border border-indigo-500/25 rounded px-2 py-1.5">
    <Copy size={11} className="mt-0.5 shrink-0" />
    <span className="flex-1">{n('bulkAsk').replace('{n}', String(c.ids.length)).replace('{old}', String(c.oldVal)).replace('{new}', String(c.newVal))}</span>
    <div className="flex gap-1 shrink-0">
      <button onClick={onApply} className="text-indigo-200 font-medium hover:text-indigo-100 underline underline-offset-2">{n('bulkApply')}</button>
      <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300">{n('bulkDismiss')}</button>
    </div>
  </div>
);

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
  const updateMembers = useDrawingStore((s) => s.updateMembers);
  const deleteMember = useDrawingStore((s) => s.deleteMember);
  const setType = useDrawingStore((s) => s.setType);
  const setMode = useDrawingStore((s) => s.setMode);
  const autoConnectFreeEnds = useDrawingStore((s) => s.autoConnectFreeEnds);
  const q = modelQuality(model);

  // 방금 값을 바꾼 부재와, 바꾸기 전 같은 값을 가졌던 다른 부재들(있으면 일괄 적용 제안).
  const [pendingBulk, setPendingBulk] = useState<BulkCandidate | null>(null);
  // arr = 같은 종류의 부재 목록(columns/walls/beams), field = 이번에 바뀐 숫자 필드.
  const editField = <T extends { id: string }>(arr: T[], id: string, field: string, prevVal: number, v: number) => {
    updateMember(id, { [field]: v } as MemberPatch);
    if (v === prevVal) return;
    const ids = arr.filter((it) => it.id !== id && (it as any)[field] === prevVal).map((it) => it.id);
    setPendingBulk(ids.length ? { anchorId: id, ids, patch: { [field]: v } as MemberPatch, oldVal: prevVal, newVal: v } : null);
  };
  const applyBulk = () => {
    if (!pendingBulk) return;
    updateMembers(pendingBulk.ids, pendingBulk.patch);
    setPendingBulk(null);
  };

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

      {/* 정상인 끝점은 경고에서 분리해 별도 표시 — 헛경고로 진짜 문제가 묻히지 않게 */}
      {(q.endsAtColumn > 0 || q.openEnds > 0) && (
        <div className="flex gap-2 text-[10px] text-zinc-500">
          {q.endsAtColumn > 0 && (
            <span title={n('qAtColumnHint')} className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
              {n('qAtColumn')} <span className="text-zinc-300 font-medium">{q.endsAtColumn}</span>
            </span>
          )}
          {q.openEnds > 0 && (
            <span title={n('qOpenEndHint')} className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
              {n('qOpenEnd')} <span className="text-zinc-300 font-medium">{q.openEnds}</span>
            </span>
          )}
        </div>
      )}

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
                    <>
                      <div className="flex flex-wrap gap-2 px-2 pb-2 pt-0.5">
                        <NumField label={n('edWidth')} value={c.width} onChange={(v) => editField(model.columns, c.id, 'width', c.width, v)} />
                        <NumField label={n('edDepth')} value={c.depth} onChange={(v) => editField(model.columns, c.id, 'depth', c.depth, v)} />
                        <NumField label={n('edRot')} value={c.rotation} onChange={(v) => updateMember(c.id, { rotation: v })} />
                        {delBtn(c.id)}
                      </div>
                      {pendingBulk?.anchorId === c.id && <BulkBanner n={n} c={pendingBulk} onApply={applyBulk} onDismiss={() => setPendingBulk(null)} />}
                      <Evidence n={n} layer={c.sourceLayer} lines={[]} />
                    </>
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
                    <>
                      <div className="flex flex-wrap gap-2 px-2 pb-2 pt-0.5">
                        <NumField label={n('edThick')} value={w.thickness} onChange={(v) => editField(model.walls, w.id, 'thickness', w.thickness, v)} />
                        {delBtn(w.id)}
                      </div>
                      {pendingBulk?.anchorId === w.id && <BulkBanner n={n} c={pendingBulk} onApply={applyBulk} onDismiss={() => setPendingBulk(null)} />}
                      <Evidence n={n} layer={w.sourceLayer} lines={[
                        ...(w.singleLine ? [n('evSingle')] : []),
                        ...(typeof w.thicknessMeasured === 'number' && w.thicknessMeasured !== w.thickness
                          ? [n('evQuantized').replace('{m}', String(w.thicknessMeasured)).replace('{v}', String(w.thickness))] : []),
                      ]} />
                    </>
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
                    <span className="text-zinc-300">
                      {b.id}
                      {/* 도면 부호(KL1 등) = 설계 명시값 → 측정 추정과 구분해 강조 */}
                      {b.mark && <span className="ml-1 text-emerald-400 font-medium">{b.mark}</span>}
                      {b.singleLine ? ` · ${n('qSingle')}` : ''}
                    </span>
                    <span className={b.fromLabel ? 'text-emerald-300' : 'text-zinc-500'}>
                      {b.width}{b.depth ? `×${b.depth}` : ''}
                    </span>
                  </button>
                  {sel && (
                    <>
                      <div className="flex flex-wrap gap-2 px-2 pb-2 pt-0.5">
                        <NumField label={n('edBeamW')} value={b.width} onChange={(v) => editField(model.beams, b.id, 'width', b.width, v)} />
                        <NumField label={n('edBeamD')} value={b.depth ?? 0} onChange={(v) => editField(model.beams, b.id, 'depth', b.depth ?? 0, v)} />
                        {delBtn(b.id)}
                      </div>
                      {pendingBulk?.anchorId === b.id && <BulkBanner n={n} c={pendingBulk} onApply={applyBulk} onDismiss={() => setPendingBulk(null)} />}
                      <Evidence n={n} layer={b.sourceLayer} lines={[
                        ...(b.fromLabel ? [n('evLabel')] : []),
                        ...(b.singleLine ? [n('evSingle')] : []),
                        ...(typeof b.widthMeasured === 'number' && b.widthMeasured !== b.width
                          ? [n('evQuantized').replace('{m}', String(b.widthMeasured)).replace('{v}', String(b.width))] : []),
                      ]} />
                    </>
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
