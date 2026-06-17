import React from 'react';
import { MousePointer, PenTool, Square, Trash2, ToggleLeft, ToggleRight, Sparkles, Layers } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { DrawingMode, StructureType } from '../types/drawing';
import { extractCenterLinesFromWalls } from '../utils/geometry';

export const Toolbar: React.FC = () => {
  const { currentMode, currentType, isOrthoMode, lines, setMode, setType, setOrthoMode, clearLines } = useDrawingStore();

  const modes: { id: DrawingMode; label: string; icon: React.ReactNode }[] = [
    { id: 'SELECT', label: '선택 및 이동', icon: <MousePointer size={18} /> },
    { id: 'DRAW_LINE', label: '선 그리기', icon: <PenTool size={18} /> },
    { id: 'DRAW_RECT', label: '사각형 그리기', icon: <Square size={18} /> },
    { id: 'DELETE', label: '삭제 모드', icon: <Trash2 size={18} /> },
  ];

  const structureTypes: { id: StructureType; label: string; color: string }[] = [
    { id: 'WALL', label: '벽체 (Wall)', color: 'bg-red-500' },
    { id: 'COLUMN', label: '기둥 (Column)', color: 'bg-blue-500' },
    { id: 'BEAM', label: '보 (Beam)', color: 'bg-green-500' },
    { id: 'CENTER_LINE', label: '중심선 (Center)', color: 'bg-amber-500' },
  ];

  const handleAutoCenterLine = () => {
    const generated = extractCenterLinesFromWalls(lines);
    if (generated.length === 0) {
      alert('중심선을 추출할 수 있는 평행한 벽체(WALL) 데이터가 부족합니다.');
      return;
    }
    const store = useDrawingStore.getState();
    useDrawingStore.setState({ lines: [...store.lines, ...generated] });
    alert(`성공적으로 ${generated.length}개의 중심선을 자동 생성했습니다!`);
  };

  return (
    <div className="w-full h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 select-none z-20">
      <div className="flex items-center space-x-2">
        <Layers className="text-indigo-500 w-5 h-5" />
        <span className="text-zinc-100 font-bold text-sm tracking-wider">StruXureAI</span>
        <span className="text-xs bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded border border-indigo-800/50">Phase 1</span>
      </div>

      <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            title={m.label}
            className={`flex items-center justify-center p-2 rounded-md transition-all ${
              currentMode === m.id ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {m.icon}
          </button>
        ))}
      </div>

      <div className="flex items-center space-x-4">
        {(currentMode === 'DRAW_LINE' || currentMode === 'DRAW_RECT') && (
          <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            {structureTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`px-2.5 py-1 rounded transition-all flex items-center space-x-1.5 ${
                  currentType === t.id ? 'bg-zinc-800 text-zinc-100 font-medium border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${t.color}`} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setOrthoMode(!isOrthoMode)}
          className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all ${
            isOrthoMode ? 'bg-amber-950/40 text-amber-400 border-amber-800/60' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-300'
          }`}
        >
          <span>직교 가이드 (Ortho)</span>
          {isOrthoMode ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>

        <button
          onClick={handleAutoCenterLine}
          className="flex items-center space-x-1.5 text-xs bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3 py-1.5 rounded-md font-medium hover:from-indigo-500 hover:to-purple-500 transition-all shadow-md active:scale-95"
        >
          <Sparkles size={14} />
          <span>중심선 자동 생성</span>
        </button>

        <button
          onClick={() => { if(confirm('그려진 모든 구조 라인 데이터를 초기화하시겠습니까?')) clearLines(); }}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors pl-2 border-l border-zinc-800"
        >
          전체 비우기
        </button>
      </div>
    </div>
  );
};
