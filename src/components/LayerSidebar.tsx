import React from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { Eye, EyeOff, Layers, Filter, X } from 'lucide-react';

export const LayerSidebar: React.FC = () => {
  const { dxfLayers, isSidebarOpen, toggleDxfLayer, toggleSidebar, setDxfLayers } = useDrawingStore();

  if (!isSidebarOpen) return null;

  // 🪄 구조 레이어 자동 필터링 (Phase 3 핵심 요구사항)
  const handleAutoFilter = () => {
    const structuralKeywords = ['S-', 'COL', 'WALL', 'CONC', '기둥', '옹벽'];
    setDxfLayers(dxfLayers.map(layer => {
      const isStructural = structuralKeywords.some(kw => layer.name.toUpperCase().includes(kw));
      return { ...layer, visible: isStructural };
    }));
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
      <div className="p-2 border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={handleAutoFilter}
          className="w-full flex items-center justify-center space-x-1.5 text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-2 rounded hover:bg-indigo-600/40 transition-colors"
        >
          <Filter size={14} />
          <span>구조 부재 자동 필터링</span>
        </button>
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
