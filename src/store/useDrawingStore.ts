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
  
  // 📏 단위 및 축척 상태 추가
  unit: string;
  scaleRatio: number;

  setMode: (mode: DrawingMode) => void;
  setType: (type: StructureType) => void;
  setOrthoMode: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setUnit: (unit: string) => void;
  setScaleRatio: (ratio: number) => void;
  
  addLine: (line: Omit<StructureLineData, 'id'>) => void;
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
  
  unit: 'mm', // 기본 단위
  scaleRatio: 10, // 기본 축척 (1px = 10mm)

  setMode: (mode) => set({ currentMode: mode, selectedLineId: mode !== 'SELECT' ? null : undefined }),
  setType: (type) => set({ currentType: type }),
  setOrthoMode: (enabled) => set({ isOrthoMode: enabled }),
  setGridSize: (size) => set({ gridSize: size }),
  setUnit: (unit) => set({ unit }),
  setScaleRatio: (scaleRatio) => set({ scaleRatio }),

  addLine: (line) => set((state) => {
    const newLine: StructureLineData = {
      ...line,
      id: `str_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };
    return { lines: [...state.lines, newLine] };
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
  clearLines: () => set({ lines: [], selectedLineId: null }),
}));
