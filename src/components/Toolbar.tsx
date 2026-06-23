import React, { useRef } from 'react';
import { MousePointer, PenTool, Square, Circle, Triangle, Eraser, Sparkles, Layers, Ruler, Undo2, ImagePlus, Bot, Loader2, PanelRightOpen, Grid3x3, HelpCircle } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { DrawingMode, StructureType } from '../types/drawing';
import { extractCenterLinesFromWalls } from '../utils/geometry';
import { fetchAIAnalysis } from '../utils/api';
import { loadFile } from '../utils/fileLoader';

export const Toolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  
  const {
    currentMode, currentType, lines, unit, scaleRatio, backgroundImage, isAnalyzing, isSidebarOpen, isHelpOpen, gridSize,
    setMode, setType, setUnit, setScaleRatio, undoLine, addLine, setAiPolygons, setIsAnalyzing, toggleSidebar, toggleHelp, setGridSize
  } = useDrawingStore();

  // 🪄 벽체 쌍에서 중심선 자동 생성 (CAD 추출 벽은 px=mm×scale 이므로 두께 임계값을 scale로 환산)
  const handleGenerateCenterLines = () => {
    const s = useDrawingStore.getState().dxfTransform?.scale ?? 1;
    // 실무 벽두께 약 60~600mm 범위를 캔버스 px로 변환 (수동 벽은 s=1로 적당한 px 범위)
    const centers = extractCenterLinesFromWalls(lines, 60 * s, 600 * s);
    if (centers.length === 0) {
      alert('중심선을 생성할 벽체(WALL) 쌍을 찾지 못했습니다.\nCAD라면 먼저 "구조 부재 추출"로 벽을 가져오거나, 마주보는 벽 두 개를 그려주세요.');
      return;
    }
    centers.forEach((c) => addLine(c));
    alert(`중심선 ${centers.length}개 생성 완료`);
  };

  const modes: { id: DrawingMode; label: string; icon: React.ReactNode }[] = [
    { id: 'SELECT', label: '이동/선택', icon: <MousePointer size={18} /> },
    { id: 'DRAW_LINE', label: '선', icon: <PenTool size={18} /> },
    { id: 'DRAW_RECT', label: '사각형', icon: <Square size={18} /> },
    { id: 'DRAW_CIRCLE', label: '원', icon: <Circle size={18} /> },
    { id: 'DRAW_TRIANGLE', label: '삼각형', icon: <Triangle size={18} /> },
    { id: 'DELETE', label: '지우개 (클릭하여 삭제)', icon: <Eraser size={18} /> },
  ];

  const structureTypes: { id: StructureType; label: string; color: string }[] = [
    { id: 'WALL', label: '벽체 (Wall)', color: 'bg-red-500' },
    { id: 'COLUMN', label: '기둥 (Column)', color: 'bg-blue-500' },
    { id: 'BEAM', label: '보 (Beam)', color: 'bg-green-500' },
    { id: 'CENTER_LINE', label: '중심선 (Center)', color: 'bg-amber-500' },
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = ''; // 같은 파일 재선택 가능하도록 초기화
  };

  const handleDxfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const handleAIAnalysis = async () => {
    if (!backgroundImage) return alert("도면 이미지를 먼저 불러와주세요.");
    setIsAnalyzing(true);
    try {
      const result = await fetchAIAnalysis(backgroundImage);
      setAiPolygons(result);
    } catch (error) { alert("AI 서버 통신 오류"); } finally { setIsAnalyzing(false); }
  };

  return (
    <div className="w-full h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 select-none z-20">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 mr-2">
          <Layers className="text-indigo-500 w-5 h-5" />
          <span className="text-zinc-100 font-bold text-sm tracking-wider">StruXureAI</span>
        </div>

        <button onClick={toggleHelp} title="도움말 / 릴리즈 노트" className={`flex items-center space-x-1.5 text-xs px-2 py-1.5 rounded-md transition-colors ${isHelpOpen ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'}`}>
          <HelpCircle size={14} /><span>도움말</span>
        </button>
        
        <input type="file" ref={fileInputRef} accept="image/*" hidden onChange={handleImageUpload} />
        <input type="file" ref={dxfInputRef} accept=".dxf,.dwg" hidden onChange={handleDxfUpload} />
        
        <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-md border border-zinc-800">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center space-x-1.5 text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded hover:bg-zinc-700 hover:text-white transition-colors"><ImagePlus size={14} /><span>이미지</span></button>
          <button onClick={() => dxfInputRef.current?.click()} className="flex items-center space-x-1.5 text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded hover:bg-zinc-700 hover:text-white transition-colors"><Layers size={14} /><span>CAD</span></button>
        </div>

        <button onClick={handleAIAnalysis} disabled={isAnalyzing || !backgroundImage} className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded-md transition-all ${isAnalyzing ? 'bg-zinc-700 text-zinc-400' : !backgroundImage ? 'bg-emerald-900/30 text-emerald-700/50' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
          {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
          <span>{isAnalyzing ? 'AI 분석 중...' : 'AI 인식'}</span>
        </button>

        <button onClick={handleGenerateCenterLines} disabled={lines.length === 0} title="벽체 쌍에서 중심선 자동 생성" className={`flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded-md transition-all ${lines.length === 0 ? 'bg-amber-900/30 text-amber-700/50' : 'bg-amber-600/90 text-white hover:bg-amber-500'}`}>
          <Sparkles size={14} />
          <span>중심선 자동</span>
        </button>
      </div>

      <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800">
        {modes.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} title={m.label} className={`flex items-center justify-center p-1.5 px-2 rounded-md transition-all ${currentMode === m.id ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>{m.icon}</button>
        ))}
      </div>

      <div className="flex items-center space-x-2">
        {/* 🧱 부재 선택 메뉴 (그리기 모드에서만 표시) — 벽체/기둥/보/중심선 */}
        {currentMode.startsWith('DRAW_') && (
          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            {structureTypes.map((t) => (
              <button key={t.id} onClick={() => setType(t.id)} className={`px-2 py-1 rounded transition-all flex items-center space-x-1.5 ${currentType === t.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <span className={`w-2 h-2 rounded-full ${t.color}`} /><span>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 📏 그리드 스냅 (격자 간격 선택, 0=끄기) */}
        <div className="flex items-center space-x-1 bg-zinc-950 p-1 px-2 rounded-lg border border-zinc-800 text-xs" title="그리기/이동 시 격자에 맞춤(스냅)">
          <Grid3x3 size={14} className={gridSize > 0 ? 'text-indigo-400' : 'text-zinc-500'} />
          <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} className={`bg-transparent font-bold outline-none cursor-pointer ${gridSize > 0 ? 'text-indigo-400' : 'text-zinc-500'}`}>
            <option value={0}>끄기</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="flex items-center space-x-1 bg-zinc-950 p-1 px-2 rounded-lg border border-zinc-800 text-xs">
          <Ruler size={14} className="text-zinc-400" />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-transparent text-amber-400 font-bold outline-none cursor-pointer">
            <option value="px">px</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
          </select>
          <div className="w-px h-3 bg-zinc-700 mx-1"></div>
          <span className="text-zinc-500">1px=</span>
          <input type="number" value={scaleRatio} onChange={(e) => setScaleRatio(Number(e.target.value) || 1)} className="w-14 bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded outline-none text-center appearance-none"/>
        </div>

        <button onClick={undoLine} disabled={lines.length === 0} className={`p-1.5 rounded-md transition-colors ${lines.length === 0 ? 'text-zinc-700' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}><Undo2 size={16} /></button>

        <div className="w-px h-5 bg-zinc-800 mx-1"></div>

        {/* 🚨 여기 toggleSidebar 이벤트 연결! */}
        <button onClick={toggleSidebar} className={`p-1.5 rounded-md transition-colors ${isSidebarOpen ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`} title="레이어 사이드바 열기/닫기">
          <PanelRightOpen size={16} />
        </button>
      </div>
    </div>
  );
};
