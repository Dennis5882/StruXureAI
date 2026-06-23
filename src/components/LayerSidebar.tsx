import React, { useState } from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { extractStructuralModel, ThicknessProfile } from '../utils/geometry';
import { Eye, EyeOff, Layers, Filter, X, Shapes } from 'lucide-react';

export const LayerSidebar: React.FC = () => {
  const { dxfLayers, dxfEntities, isSidebarOpen, toggleDxfLayer, toggleSidebar, setDxfLayers } = useDrawingStore();
  const [thicknessProfile, setThicknessProfile] = useState<ThicknessProfile>('raw');

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
      alert('먼저 CAD(DXF/DWG) 파일을 불러와주세요.');
      return;
    }
    const { members, counts } = extractStructuralModel(st.dxfEntities, st.dxfLayers, st.dxfTransform, { thicknessProfile });
    if (members.length === 0) {
      alert('보이는 레이어에서 벽/기둥을 찾지 못했습니다.\n레이어명에 WALL/COL/벽/기둥 등이 포함돼야 합니다. (자동 필터링 먼저 시도)');
      return;
    }
    st.addLines(members);
    st.setMode('SELECT');
    const qLine = thicknessProfile === 'raw' ? '' : `\n· 두께 양자화(${thicknessProfile}): ${counts.quantized}개 표준치 스냅`;
    alert(`정밀 구조모델 추출 완료\n· 벽 축선 ${counts.wallAxes}개 (두께 측정, 통심선 라벨 ${counts.wallsLabeled}개)\n· 기둥 ${counts.columns}개 (그리드 태깅 ${counts.columnsTagged}개)\n· 보 ${counts.beams}개\n· 미매칭 벽 면선 ${counts.unpairedFaces}개 제외\n· 위상 정리: 절점 ${counts.nodes}개, 교차연장 ${counts.extended}, 기둥스냅 ${counts.snappedCol}${qLine}`);
  };

  return (
    <div className="w-64 shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col h-full text-zinc-300 select-none z-10 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center space-x-2">
          <Layers size={16} className="text-indigo-400" />
          <span className="font-bold text-sm">CAD 도면 레이어</span>
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
          <span>구조 부재 자동 필터링</span>
        </button>
        <button
          onClick={handleExtract}
          disabled={dxfEntities.length === 0}
          title="보이는 벽/기둥 레이어를 편집 가능한 구조 부재로 변환"
          className={`w-full flex items-center justify-center space-x-1.5 text-xs px-2 py-2 rounded border transition-colors ${dxfEntities.length === 0 ? 'bg-zinc-800/40 text-zinc-600 border-zinc-800' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/40'}`}
        >
          <Shapes size={14} />
          <span>정밀 구조모델 추출</span>
        </button>
        <label className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
          <span title="측정 두께를 지역 표준치로 스냅 (MIDAS 단면 정리용)">두께 표준</span>
          <select
            value={thicknessProfile}
            onChange={(e) => setThicknessProfile(e.target.value as ThicknessProfile)}
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-emerald-500/50"
          >
            <option value="raw">원본(측정값)</option>
            <option value="TW-Standard">대만/동남아</option>
            <option value="KR-Standard">한국</option>
          </select>
        </label>
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {dxfLayers.length === 0 ? (
          <div className="text-xs text-zinc-600 text-center mt-10 leading-relaxed">
            DXF 파일을 불러오면<br/>레이어 목록이 표시됩니다.
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
    </div>
  );
};
