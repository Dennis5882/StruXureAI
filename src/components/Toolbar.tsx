import React, { useRef } from 'react';
import { MousePointer, PenTool, Square, Circle, Triangle, ToggleLeft, ToggleRight, Sparkles, Layers, Ruler, Undo2, ImagePlus, Bot, Loader2, PanelRightOpen, FileArchive } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { DrawingMode, StructureType } from '../types/drawing';
import { extractCenterLinesFromWalls } from '../utils/geometry';
import { fetchAIAnalysis } from '../utils/api';
// @ts-ignore
import DxfParser from 'dxf-parser';

export const Toolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cadInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    currentMode, currentType, isOrthoMode, lines, unit, scaleRatio, backgroundImage, isAnalyzing, isSidebarOpen,
    setMode, setType, setOrthoMode, clearLines, setUnit, setScaleRatio, undoLine, setBackgroundImage, setAiPolygons, setIsAnalyzing, setDxfLayers, toggleSidebar
  } = useDrawingStore();

  const modes: { id: DrawingMode; label: string; icon: React.ReactNode }[] = [
    { id: 'SELECT', label: '이동/선택', icon: <MousePointer size={18} /> },
    { id: 'DRAW_LINE', label: '선', icon: <PenTool size={18} /> },
    { id: 'DRAW_RECT', label: '사각형', icon: <Square size={18} /> },
    { id: 'DRAW_CIRCLE', label: '원', icon: <Circle size={18} /> },
    { id: 'DRAW_TRIANGLE', label: '삼각형', icon: <Triangle size={18} /> },
  ];

  const structureTypes: { id: StructureType; label: string; color: string }[] = [
    { id: 'WALL', label: '벽체 (Wall)', color: 'bg-red-500' },
    { id: 'COLUMN', label: '기둥 (Column)', color: 'bg-blue-500' },
    { id: 'BEAM', label: '보 (Beam)', color: 'bg-green-500' },
    { id: 'CENTER_LINE', label: '중심선 (Center)', color: 'bg-amber-500' },
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackgroundImage(URL.createObjectURL(file));
  };

  // 📐 DWG 및 DXF 통합 업로드 핸들러
  const handleCadUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    // 🔄 DWG 파일인 경우: 백엔드 변환 시뮬레이션
    if (fileName.endsWith('.dwg')) {
      alert(`DWG 파일(${file.name})이 감지되었습니다.\n백엔드 서버로 전송하여 DXF 포맷으로 자동 변환합니다. (약 2초 소요)`);
      setIsAnalyzing(true);
      
      setTimeout(() => {
        // 실제로는 백엔드가 변환 후 DXF 레이어 정보를 내려줍니다.
        // 현재는 변환이 성공했다고 가정하고 모의(Mock) 구조 레이어 데이터 세팅
        const mockLayers = [
          { name: 'S-WALL-CORE', visible: true },
          { name: 'S-COLUMN', visible: true },
          { name: 'A-FURNITURE', visible: true },
          { name
cat << 'EOF' > src/components/Toolbar.tsx
import React, { useRef } from 'react';
import { MousePointer, PenTool, Square, Circle, Triangle, ToggleLeft, ToggleRight, Sparkles, Layers, Ruler, Undo2, ImagePlus, Bot, Loader2, PanelRightOpen } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { DrawingMode, StructureType } from '../types/drawing';
import { extractCenterLinesFromWalls } from '../utils/geometry';
import { fetchAIAnalysis } from '../utils/api';
// @ts-ignore
import DxfParser from 'dxf-parser';

export const Toolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    currentMode, currentType, isOrthoMode, lines, unit, scaleRatio, backgroundImage, isAnalyzing, isSidebarOpen,
    setMode, setType, setOrthoMode, clearLines, setUnit, setScaleRatio, undoLine, setBackgroundImage, setAiPolygons, setIsAnalyzing, setDxfLayers, toggleSidebar
  } = useDrawingStore();

  const modes: { id: DrawingMode; label: string; icon: React.ReactNode }[] = [
    { id: 'SELECT', label: '이동/선택', icon: <MousePointer size={18} /> },
    { id: 'DRAW_LINE', label: '선', icon: <PenTool size={18} /> },
    { id: 'DRAW_RECT', label: '사각형', icon: <Square size={18} /> },
    { id: 'DRAW_CIRCLE', label: '원', icon: <Circle size={18} /> },
    { id: 'DRAW_TRIANGLE', label: '삼각형', icon: <Triangle size={18} /> },
  ];

  const structureTypes: { id: StructureType; label: string; color: string }[] = [
    { id: 'WALL', label: '벽체 (Wall)', color: 'bg-red-500' },
    { id: 'COLUMN', label: '기둥 (Column)', color: 'bg-blue-500' },
    { id: 'BEAM', label: '보 (Beam)', color: 'bg-green-500' },
    { id: 'CENTER_LINE', label: '중심선 (Center)', color: 'bg-amber-500' },
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackgroundImage(URL.createObjectURL(file));
  };

  const handleDxfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parser = new DxfParser();
        const dxf = parser.parseSync(evt.target?.result as string);
        
        if (dxf && dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
          const layers = Object.keys(dxf.tables.layer.layers).map(name => ({
            name, visible: true
          }));
          setDxfLayers(layers);
          if (!isSidebarOpen) toggleSidebar(); // 사이드바가 닫혀있으면 자동으로 열기
        }
      } catch (err) { alert("DXF 파일을 읽는 데 실패했습니다."); }
    };
    reader.readAsText(file);
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
      </div>

      <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800">
        {modes.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} title={m.label} className={`flex items-center justify-center p-1.5 px-2 rounded-md transition-all ${currentMode === m.id ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>{m.icon}</button>
        ))}
      </div>

      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1 bg-zinc-950 p-1 px-2 rounded-lg border border-zinc-800 text-xs">
          <Ruler size={14} className="text-zinc-400" />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-transparent text-amber-400 font-bold outline-none cursor-pointer">
            <option value="px">px</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
          </select>
          <div className="w-px h-3 bg-zinc-700 mx-1"></div>
          <span className="text-zinc-500">1px=</span>
          <input type="number" value={scaleRatio} onChange={(e) => setScaleRatio(Number(e.target.value) || 1)} className="w-8 bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded outline-none text-center appearance-none"/>
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
