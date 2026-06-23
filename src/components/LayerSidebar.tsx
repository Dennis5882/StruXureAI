import React, { useState } from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { extractStructuralModel, ThicknessProfile } from '../utils/geometry';
import { buildStructuralModel } from '../utils/structuralModel';
import { MidasExport } from './MidasExport';
import { useT } from '../i18n';
import { Eye, EyeOff, Layers, Filter, X, Shapes } from 'lucide-react';

export const LayerSidebar: React.FC = () => {
  const { dxfLayers, dxfEntities, isSidebarOpen, toggleDxfLayer, toggleSidebar, setDxfLayers } = useDrawingStore();
  const [thicknessProfile, setThicknessProfile] = useState<ThicknessProfile>('raw');
  const { t } = useT();

  if (!isSidebarOpen) return null;

  // 🪄 구조 레이어 자동 필터링 (Phase 3 핵심 요구사항)
  const handleAutoFilter = () => {
    const structuralKeywords = ['S-', 'COL', 'WALL', 'CONC', '기둥', '옹벽'];
    setDxfLayers(dxfLayers.map(layer => {
      const isStructural = structuralKeywords.some(kw => layer.name.toUpperCase().includes(kw));
      return { ...layer, visible: isStructural };
    }));
  };

  // 🧱 정밀 구조모델 추출: 벽=축선+두께(mm), 기둥=gridRef+단면(mm)
  const handleExtract = () => {
    const st = useDrawingStore.getState();
    if (!st.dxfEntities.length || !st.dxfTransform) {
      alert(t('ls.loadFirst'));
      return;
    }
    const { members, grid, counts } = extractStructuralModel(st.dxfEntities, st.dxfLayers, st.dxfTransform, { thicknessProfile });
    if (members.length === 0) {
      alert(t('ls.noStruct'));
      return;
    }
    st.addLines(members);
    // 정식 구조모델(월드 mm, 절점-부재 그래프)로 승격해 저장 — 층/해석/MIDAS의 단일 진실 소스
    const model = buildStructuralModel(members, grid, st.dxfTransform, { name: 'B1F' });
    st.setModel(model);
    st.setMode('SELECT');
    const qLine = thicknessProfile === 'raw' ? '' : `\n${t('ls.rQuant', thicknessProfile, counts.quantized)}`;
    alert(
      `${t('ls.extractDone')}\n` +
      `${t('ls.rWall', counts.wallAxes, counts.wallsLabeled)}\n` +
      `${t('ls.rCol', counts.columns, counts.columnsTagged)}\n` +
      `${t('ls.rBeam', counts.beams)}\n` +
      `${t('ls.rUnpaired', counts.unpairedFaces)}\n` +
      `${t('ls.rTopo', counts.nodes, counts.extended, counts.snappedCol)}${qLine}\n` +
      `${t('ls.rModel', model.nodes.length, model.columns.length + model.walls.length + model.beams.length)}`,
    );
  };

  return (
    <div className="w-64 shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col h-full text-zinc-300 select-none z-10 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center space-x-2">
          <Layers size={16} className="text-indigo-400" />
          <span className="font-bold text-sm">{t('ls.title')}</span>
        </div>
        <button onClick={toggleSidebar} className="text-zinc-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Action Bar */}
      <div className="p-2 border-b border-zinc-800 bg-zinc-900/50 space-y-1.5">
        <button
          onClick={handleAutoFilter}
          className="w-full flex items-center justify-center space-x-1.5 text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-2 rounded hover:bg-indigo-600/40 transition-colors"
        >
          <Filter size={14} />
          <span>{t('ls.autofilter')}</span>
        </button>
        <button
          onClick={handleExtract}
          disabled={dxfEntities.length === 0}
          title={t('ls.extractTip')}
          className={`w-full flex items-center justify-center space-x-1.5 text-xs px-2 py-2 rounded border transition-colors ${dxfEntities.length === 0 ? 'bg-zinc-800/40 text-zinc-600 border-zinc-800' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/40'}`}
        >
          <Shapes size={14} />
          <span>{t('ls.extract')}</span>
        </button>
        <label className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
          <span title={t('ls.thicknessTip')}>{t('ls.thicknessStd')}</span>
          <select
            value={thicknessProfile}
            onChange={(e) => setThicknessProfile(e.target.value as ThicknessProfile)}
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-emerald-500/50"
          >
            <option value="raw">{t('ls.profRaw')}</option>
            <option value="TW-Standard">{t('ls.profTW')}</option>
            <option value="KR-Standard">{t('ls.profKR')}</option>
          </select>
        </label>
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {dxfLayers.length === 0 ? (
          <div className="text-xs text-zinc-600 text-center mt-10 leading-relaxed whitespace-pre-line">
            {t('ls.empty')}
          </div>
        ) : (
          dxfLayers.map((layer) => (
            <div key={layer.name} className="flex items-center justify-between p-1.5 hover:bg-zinc-800 rounded group transition-colors">
              <span className={`text-xs truncate w-40 ${layer.visible ? 'text-zinc-200' : 'text-zinc-600'}`} title={layer.name}>
                {layer.name}
              </span>
              <button onClick={() => toggleDxfLayer(layer.name)} className="text-zinc-500 group-hover:text-zinc-300">
                {layer.visible ? <Eye size={14} className="text-emerald-400"/> : <EyeOff size={14} />}
              </button>
            </div>
          ))
        )}
      </div>

      {/* MIDAS Gen NX 내보내기 */}
      <MidasExport />
    </div>
  );
};
