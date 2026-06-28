import React from 'react';
import { Eye, EyeOff, Filter, Shapes } from 'lucide-react';
import { useDrawingStore } from '../../store/useDrawingStore';
import { ThicknessProfile, classifyLayer } from '../../utils/geometry';
import { useNext } from '../strings';
import type { LayerTypeOverrides } from '../AppNext';
import type { StructureType } from '../../types/drawing';

type OverrideValue = StructureType | 'EXCLUDE' | 'AUTO';

interface Props {
  onExtract: () => void;
  profile: ThicknessProfile;
  setProfile: (p: ThicknessProfile) => void;
  layerTypeOverrides: LayerTypeOverrides;
  setLayerOverride: (name: string, type: OverrideValue) => void;
}

const TYPE_OPTIONS: { value: OverrideValue; label: string }[] = [
  { value: 'AUTO', label: '자동' },
  { value: 'WALL', label: '벽' },
  { value: 'COLUMN', label: '기둥' },
  { value: 'BEAM', label: '보' },
  { value: 'EXCLUDE', label: '제외' },
];

const TYPE_COLOR: Record<string, string> = {
  WALL:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  COLUMN:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  BEAM:    'bg-orange-500/20 text-orange-300 border-orange-500/30',
  CENTER_LINE: 'bg-zinc-600/30 text-zinc-400 border-zinc-600/30',
};

const TypeBadge: React.FC<{ type: StructureType | null; auto?: boolean }> = ({ type, auto }) => {
  if (!type) return null;
  const label = { WALL: '벽', COLUMN: '기둥', BEAM: '보', CENTER_LINE: '축' }[type];
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded border ${TYPE_COLOR[type]} ${auto ? 'opacity-50' : ''}`}>
      {auto ? `~${label}` : label}
    </span>
  );
};

export const LayersTab: React.FC<Props> = ({ onExtract, profile, setProfile, layerTypeOverrides, setLayerOverride }) => {
  const { n } = useNext();
  const dxfLayers = useDrawingStore((s) => s.dxfLayers);
  const dxfEntities = useDrawingStore((s) => s.dxfEntities);
  const toggleDxfLayer = useDrawingStore((s) => s.toggleDxfLayer);
  const setDxfLayers = useDrawingStore((s) => s.setDxfLayers);

  const autoFilter = () => {
    const kw = ['S-', 'COL', 'WALL', 'CONC', '기둥', '옹벽'];
    setDxfLayers(dxfLayers.map((l) => ({ ...l, visible: kw.some((k) => l.name.toUpperCase().includes(k)) })));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-zinc-800 bg-zinc-900/50 space-y-1.5">
        <button onClick={autoFilter} className="w-full flex items-center justify-center space-x-1.5 text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-2 rounded hover:bg-indigo-600/40">
          <Filter size={14} /><span>{n('autofilter')}</span>
        </button>
        <button
          onClick={onExtract}
          disabled={dxfEntities.length === 0}
          className={`w-full flex items-center justify-center space-x-1.5 text-xs px-2 py-2 rounded border ${
            dxfEntities.length === 0 ? 'bg-zinc-800/40 text-zinc-600 border-zinc-800' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/40'
          }`}
        >
          <Shapes size={14} /><span>{n('extract')}</span>
        </button>
        <label className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
          <span>{n('thickness')}</span>
          <select value={profile} onChange={(e) => setProfile(e.target.value as ThicknessProfile)} className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-emerald-500/50">
            <option value="raw">{n('profRaw')}</option>
            <option value="TW-Standard">TW-Standard</option>
            <option value="KR-Standard">KR-Standard</option>
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {dxfLayers.length === 0 ? (
          <div className="text-xs text-zinc-600 text-center mt-10 leading-relaxed whitespace-pre-line">{n('noLayers')}</div>
        ) : (
          dxfLayers.map((layer) => {
            const override = layerTypeOverrides[layer.name];
            const autoType = classifyLayer(layer.name);
            const effectiveType = override === 'EXCLUDE' ? null : (override as StructureType | undefined) ?? autoType;
            const isOverridden = !!override;

            return (
              <div key={layer.name} className={`flex items-center gap-1 px-1.5 py-1 hover:bg-zinc-800 rounded group ${!layer.visible ? 'opacity-50' : ''}`}>
                {/* 눈 토글 */}
                <button onClick={() => toggleDxfLayer(layer.name)} className="shrink-0 text-zinc-500 group-hover:text-zinc-300">
                  {layer.visible ? <Eye size={13} className="text-emerald-400" /> : <EyeOff size={13} />}
                </button>

                {/* 레이어명 */}
                <span className="flex-1 text-[11px] truncate text-zinc-300 min-w-0" title={layer.name}>{layer.name}</span>

                {/* 자동 감지 배지 (override 없을 때만) */}
                {!isOverridden && <TypeBadge type={autoType} auto />}

                {/* 타입 지정 드롭다운 */}
                <select
                  value={override ?? 'AUTO'}
                  onChange={(e) => setLayerOverride(layer.name, e.target.value as OverrideValue)}
                  className={`shrink-0 text-[10px] rounded px-1 py-0.5 border focus:outline-none ${
                    isOverridden
                      ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40'
                      : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'
                  }`}
                  title="부재 타입 지정"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          })
        )}
      </div>

      {/* 오버라이드 요약 */}
      {Object.keys(layerTypeOverrides).length > 0 && (
        <div className="shrink-0 border-t border-zinc-800 p-2 space-y-1">
          <div className="text-[10px] text-zinc-500 mb-1">지정된 타입 ({Object.keys(layerTypeOverrides).length})</div>
          {Object.entries(layerTypeOverrides).map(([name, type]) => (
            <div key={name} className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400 truncate w-36" title={name}>{name}</span>
              <span className={`px-1.5 py-0.5 rounded border text-[9px] ${type === 'EXCLUDE' ? 'bg-zinc-700/40 text-zinc-500 border-zinc-700' : TYPE_COLOR[type] ?? ''}`}>
                {{ WALL: '벽', COLUMN: '기둥', BEAM: '보', EXCLUDE: '제외' }[type]}
              </span>
            </div>
          ))}
          <button
            onClick={() => Object.keys(layerTypeOverrides).forEach((k) => setLayerOverride(k, 'AUTO'))}
            className="w-full text-[10px] text-zinc-600 hover:text-zinc-400 mt-1"
          >
            전체 초기화
          </button>
        </div>
      )}
    </div>
  );
};
