import { create } from 'zustand';
import { DrawingMode, StructureType, StructureLineData, Point2D } from '../types/drawing';

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
  
  // 🤖 AI 분석 상태 추가
  aiPolygons: { id: string, type: string, points: Point2D[] }[];
  isAnalyzing: boolean;

  setMode: (mode: DrawingMode) => void;
  setType: (type: StructureType) => void;
  setOrthoMode: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setUnit: (unit: string) => void;
  setScaleRatio: (ratio: number) => void;
  setBackgroundImage: (url: string | null) => void;
  
  setAiPolygons: (polys: { id: string, type: string, points: Point2D[] }[]) => void;
  setIsAnalyzing: (status: boolean) => void;
  
  addLine: (line: Omit<StructureLineData, 'id'> | StructureLineData) => void;
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
  
  aiPolygons: [],
  isAnalyzing: false,

  setMode: (mode) => set({ currentMode: mode, selectedLineId: mode !== 'SELECT' ? null : undefined }),
  setType: (type) => set({ currentType: type }),
  setOrthoMode: (enabled) => set({ isOrthoMode: enabled }),
  setGridSize: (size) => set({ gridSize: size }),
  setUnit: (unit) => set({ unit }),
  setScaleRatio: (scaleRatio) => set({ scaleRatio }),
  setBackgroundImage: (url) => set({ backgroundImage: url }),
  
  setAiPolygons: (aiPolygons) => set({ aiPolygons }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  addLine: (line) => set((state) => {
    const newLine = { ...line, id: ('id' in line) ? line.id : `str_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` } as StructureLineData;
    return { lines: [...state.lines, newLine] };
  }),
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
