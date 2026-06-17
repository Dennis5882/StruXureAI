import React from 'react';
import { MousePointer, PenTool, Square, Circle, Triangle, Trash2, ToggleLeft, ToggleRight, Sparkles, Layers, Ruler, Undo2 } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { DrawingMode, StructureType } from '../types/drawing';
import { extractCenterLinesFromWalls } from '../utils/geometry';

export const Toolbar: React.FC = () => {
  const { 
    currentMode, currentType, isOrthoMode, lines, unit, scaleRatio,
    setMode, setType, setOrthoMode, clearLines, setUnit, setScaleRatio, undoLine 
  } = useDrawingStore();

  // 🪄 도형 그리기 모드 추가
  const modes: { id: DrawingMode; label: string; icon: React.ReactNode }[] = [
    { id: 'SELECT', label: '선택 및 이동', icon: <MousePointer size={18} /> },
    { id: 'DRAW_LINE', label: '선 그리기', icon: <PenTool size={18} /> },
    { id: 'DRAW_RECT', label: '사각형 그리기', icon: <Square size={18} /> },
    { id: 'DRAW_CIRCLE', label: '원 그리기', icon: <Circle size={18} /> },
    { id: 'DRAW_TRIANGLE', label: '삼각형 그리기', icon: <Triangle size={18} /> },
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
  };

  return (
    <div className="w-full h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 select-none z-20">
      <div className="flex items-center space-x-2">
        <Layers className="text-indigo-500 w-5 h-5" />
        <span className="text-zinc-100 font-bold text-sm tracking-wider">StruXureAI</span>
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

      <div className="flex items-center space-x-3">
        {currentMode.startsWith('DRAW_') && (
          <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            {structureTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`px-2 py-1 rounded transition-all flex items-center space-x-1.5 ${
                  currentType === t.id ? 'bg-zinc-800 text-zinc-100 font-medium border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${t.color}`} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2 bg-zinc-950 p-1 px-2 rounded-lg border border-zinc-800 text-xs">
          <Ruler size={14} className="text-zinc-400" />
          <select 
            value={unit} 
            onChange={(e) => setUnit(e.target.value)}
            className="bg-transparent text-amber-400 font-bold outline-none cursor-pointer"
          >
            <option value="px">px</option>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
          <div className="w-px h-3 bg-zinc-700 mx-1"></div>
          <span className="text-zinc-500">1px=</span>
          <input 
            type="number" 
            value={scaleRatio} 
            onChange={(e) => setScaleRatio(Number(e.target.value) || 1)}
            className="w-10 bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded outline-none text-center appearance-none"
          />
        </div>

        <button
          onClick={() => setOrthoMode(!isOrthoMode)}
          className={`flex items-center space-x-1 text-xs px-2 py-1.5 rounded-md border transition-all ${
            isOrthoMode ? 'bg-amber-950/40 text-amber-400 border-amber-800/60' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-300'
          }`}
        >
          <span>Ortho</span>
        </button>

        <button
          onClick={handleAutoCenterLine}
          className="flex items-center space-x-1 text-xs bg-indigo-600 text-white px-2 py-1.5 rounded-md hover:bg-indigo-500 transition-all shadow-md active:scale-95"
        >
          <Sparkles size={14} />
          <span>추출</span>
        </button>

        <div className="w-px h-5 bg-zinc-800"></div>

        {/* ↩️ 취소하기 버튼 */}
        <button
          onClick={undoLine}
          disabled={lines.length === 0}
          className={`flex items-center space-x-1 text-xs px-2 py-1.5 rounded-md transition-colors ${
            lines.length === 0 ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
          }`}
          title="되돌리기 (Ctrl+Z)"
        >
          <Undo2 size={16} />
          <span>취소</span>
        </button>
        
        <button
          onClick={() => { if(confirm('모든 데이터를 초기화할까요?')) clearLines(); }}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors pl-1"
        >
          비우기
        </button>
      </div>
    </div>
  );
};
