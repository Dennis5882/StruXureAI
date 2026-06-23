import { create } from 'zustand';
import { DrawingMode, StructureType, StructureLineData, Point2D } from '../types/drawing';

// 📐 DXF 레이어 정보
export interface DxfLayer {
  name: string;
  visible: boolean;
  color?: string;
}

// 📐 DXF → 캔버스 좌표 변환 파라미터 (구조 부재 추출 시 화면 정합용)
//    canvasX = pad + (x - minX) * scale,  canvasY = pad + (maxY - y) * scale
export interface DxfTransform {
  scale: number;
  minX: number;
  maxY: number;
  pad: number;
}

interface DrawingState {
  currentMode: DrawingMode;
  currentType: StructureType;
  lines: StructureLineData[];
  selectedLineId: string | null;
  zoom: number;
  pan: Point2D;
  isOrthoMode: boolean;
  gridSize: number;
  
  unit: string;
  scaleRatio: number;
  backgroundImage: string | null;
  bgScale: number; // 배경 이미지가 캔버스에 맞춰 렌더링될 때 적용된 스케일 (AI 폴리곤 좌표 정합용)
  
  // 🤖 AI 분석 상태 추가
  aiPolygons: { id: string, type: string, points: Point2D[] }[];
  isAnalyzing: boolean;

  // 📐 DXF 레이어 / 사이드바 상태 (Phase 3)
  dxfLayers: DxfLayer[];
  dxfEntities: any[];
  dxfTransform: DxfTransform | null;
  isSidebarOpen: boolean;
  isHelpOpen: boolean;

  // ⏳ 파일 로딩(DWG 변환 등) 상태
  isLoadingFile: boolean;
  loadingMessage: string;

  setMode: (mode: DrawingMode) => void;
  setType: (type: StructureType) => void;
  setOrthoMode: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setUnit: (unit: string) => void;
  setScaleRatio: (ratio: number) => void;
  setBackgroundImage: (url: string | null) => void;
  setBgScale: (scale: number) => void;

  setAiPolygons: (polys: { id: string, type: string, points: Point2D[] }[]) => void;
  setIsAnalyzing: (status: boolean) => void;

  setDxfLayers: (layers: DxfLayer[]) => void;
  setDxfEntities: (entities: any[]) => void;
  setDxfTransform: (t: DxfTransform | null) => void;
  toggleDxfLayer: (name: string) => void;
  toggleSidebar: () => void;
  toggleHelp: () => void;
  setLoadingFile: (loading: boolean, message?: string) => void;

  addLine: (line: Omit<StructureLineData, 'id'> | StructureLineData) => void;
  addLines: (lines: StructureLineData[]) => void;
  undoLine: () => void;
  updateLine: (id: string, updatedData: Partial<StructureLineData>) => void;
  deleteLine: (id: string) => void;
  setSelectedLineId: (id: string | null) => void;
  
  setZoom: (zoom: number) => void;
  setPan: (pan: Point2D) => void;
  resetViewport: () => void;
  clearLines: () => void;
}

export const useDrawingStore = create<DrawingState>((set) => ({
  currentMode: 'SELECT',
  currentType: 'WALL',
  lines: [],
  selectedLineId: null,
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  isOrthoMode: false,
  gridSize: 0,
  unit: 'mm',
  scaleRatio: 10,
  backgroundImage: null,
  bgScale: 1,
  
  aiPolygons: [],
  isAnalyzing: false,

  dxfLayers: [],
  dxfEntities: [],
  dxfTransform: null,
  isSidebarOpen: false,
  isHelpOpen: false,
  isLoadingFile: false,
  loadingMessage: '',

  setMode: (mode) => set({ currentMode: mode, selectedLineId: mode !== 'SELECT' ? null : undefined }),
  setType: (type) => set({ currentType: type }),
  setOrthoMode: (enabled) => set({ isOrthoMode: enabled }),
  setGridSize: (size) => set({ gridSize: size }),
  setUnit: (unit) => set({ unit }),
  setScaleRatio: (scaleRatio) => set({ scaleRatio }),
  setBackgroundImage: (url) => set({ backgroundImage: url, bgScale: url ? undefined : 1 }),
  setBgScale: (bgScale) => set({ bgScale }),
  
  setAiPolygons: (aiPolygons) => set({ aiPolygons }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  setDxfLayers: (dxfLayers) => set({ dxfLayers }),
  setDxfEntities: (dxfEntities) => set({ dxfEntities }),
  setDxfTransform: (dxfTransform) => set({ dxfTransform }),
  toggleDxfLayer: (name) => set((state) => ({
    dxfLayers: state.dxfLayers.map((layer) =>
      layer.name === name ? { ...layer, visible: !layer.visible } : layer
    ),
  })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleHelp: () => set((state) => ({ isHelpOpen: !state.isHelpOpen })),
  setLoadingFile: (isLoadingFile, loadingMessage = '') => set({ isLoadingFile, loadingMessage }),

  addLine: (line) => set((state) => {
    const newLine = { ...line, id: ('id' in line) ? line.id : `str_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` } as StructureLineData;
    return { lines: [...state.lines, newLine] };
  }),
  addLines: (newLines) => set((state) => ({ lines: [...state.lines, ...newLines] })),
  undoLine: () => set((state) => {
    if (state.lines.length === 0) return state;
    return { lines: state.lines.slice(0, -1) };
  }),
  updateLine: (id, updatedData) => set((state) => ({
    lines: state.lines.map((line) => line.id === id ? { ...line, ...updatedData } : line),
  })),
  deleteLine: (id) => set((state) => ({
    lines: state.lines.filter((line) => line.id !== id),
    selectedLineId: state.selectedLineId === id ? null : state.selectedLineId,
  })),
  setSelectedLineId: (id) => set({ selectedLineId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(zoom, 20)) }),
  setPan: (pan) => set({ pan }),
  resetViewport: () => set({ zoom: 1.0, pan: { x: 0, y: 0 } }),
  clearLines: () => set({ lines: [], aiPolygons: [], selectedLineId: null, backgroundImage: null }), 
}));
