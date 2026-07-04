import { create } from 'zustand';
import { DrawingMode, StructureType, StructureLineData, Point2D } from '../types/drawing';
import { FloorModel, SColumn, SWall, SBeam } from '../types/structural';
import { incorporateLine, autoConnectFreeEnds as autoConnectFreeEndsPure } from '../utils/structuralModel';

// 검토→수정: 선택된 모델 부재(C1/W1/B1)에 적용할 부분 패치
export type MemberPatch = Partial<SColumn> & Partial<SWall> & Partial<SBeam>;

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

// 📦 추출 범위 (world mm). 미니맵 또는 캔버스 CROP 모드에서 지정.
export interface CropRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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
  cropBBox: CropRegion | null; // 추출 범위 (미니맵/캔버스 CROP 공유)
  isSidebarOpen: boolean;
  isHelpOpen: boolean;
  lang: 'ko' | 'en' | 'zh';
  model: FloorModel | null; // 정식 구조모델(월드 mm, 절점-부재 그래프) — 현재 작업 층
  selectedMemberId: string | null; // 검토 탭에서 선택된 부재(C1/W1/B1) — 캔버스 강조
  floors: FloorModel[]; // 다층(BuildingModel) — 저장된 층 스냅샷들

  // ⏳ 파일 로딩(DWG 변환 등) 상태
  isLoadingFile: boolean;
  loadingMessage: string;
  loadingProgress: number; // 0~1 (단계별)

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
  setCropBBox: (b: CropRegion | null) => void;
  toggleDxfLayer: (name: string) => void;
  toggleSidebar: () => void;
  toggleHelp: () => void;
  setLang: (lang: 'ko' | 'en' | 'zh') => void;
  setModel: (model: FloorModel | null) => void;
  setSelectedMemberId: (id: string | null) => void;
  updateMember: (id: string, patch: MemberPatch) => void; // 모델 부재 두께/단면 등 인라인 수정
  deleteMember: (id: string) => void; // 모델 부재 삭제 + 원본 캔버스 line 동기 제거
  addLineToModel: (line: StructureLineData) => void; // 수동 그린 부재를 모델에 편입
  autoConnectFreeEnds: (thresh?: number) => void; // 근접 자유단 자동 연결
  saveCurrentAsFloor: () => void; // 현재 model을 building 층으로 스냅샷 저장
  updateFloor: (id: string, patch: Partial<Pick<FloorModel, 'name' | 'elevation' | 'height'>>) => void;
  removeFloor: (id: string) => void;
  setLoadingFile: (loading: boolean, message?: string) => void;
  setLoadingProgress: (progress: number, message?: string) => void;

  addLine: (line: Omit<StructureLineData, 'id'> | StructureLineData) => void;
  addLines: (lines: StructureLineData[]) => void;
  undoLine: () => void;
  updateLine: (id: string, updatedData: Partial<StructureLineData>) => void;
  deleteLine: (id: string) => void;
  setSelectedLineId: (id: string | null) => void;
  clearCadLines: () => void; // CAD 추출 부재만 제거 (수동 편집은 보존) — 재추출 시 중복 방지
  
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
  cropBBox: null,
  isSidebarOpen: false,
  isHelpOpen: false,
  lang: 'ko',
  model: null,
  selectedMemberId: null,
  floors: [],
  isLoadingFile: false,
  loadingMessage: '',
  loadingProgress: 0,

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
  setCropBBox: (cropBBox) => set({ cropBBox }),
  toggleDxfLayer: (name) => set((state) => ({
    dxfLayers: state.dxfLayers.map((layer) =>
      layer.name === name ? { ...layer, visible: !layer.visible } : layer
    ),
  })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleHelp: () => set((state) => ({ isHelpOpen: !state.isHelpOpen })),
  setLang: (lang) => set({ lang }),
  setModel: (model) => set({ model, selectedMemberId: null }),
  setSelectedMemberId: (selectedMemberId) => set({ selectedMemberId }),
  updateMember: (id, patch) => set((state) => {
    if (!state.model) return state;
    const m = state.model;
    const apply = <T extends { id: string }>(arr: T[]) =>
      arr.map((it) => (it.id === id ? { ...it, ...patch } : it));
    return {
      model: {
        ...m,
        columns: apply(m.columns),
        walls: apply(m.walls),
        beams: apply(m.beams),
      },
    };
  }),
  deleteMember: (id) => set((state) => {
    if (!state.model) return state;
    const m = state.model;
    const hit = [...m.columns, ...m.walls, ...m.beams].find((it) => it.id === id);
    const lineId = (hit as any)?.lineId as string | undefined;
    return {
      model: {
        ...m,
        columns: m.columns.filter((c) => c.id !== id),
        walls: m.walls.filter((w) => w.id !== id),
        beams: m.beams.filter((b) => b.id !== id),
      },
      // 원본 캔버스 line 도 함께 제거 (있으면)
      lines: lineId ? state.lines.filter((l) => l.id !== lineId) : state.lines,
      selectedMemberId: state.selectedMemberId === id ? null : state.selectedMemberId,
    };
  }),
  addLineToModel: (line) => set((state) => {
    if (!state.model || !state.dxfTransform) return state;
    const model = incorporateLine(state.model, line, state.dxfTransform);
    const added = [...model.columns, ...model.walls, ...model.beams].find((it: any) => it.lineId === line.id);
    return { model, selectedMemberId: added ? added.id : state.selectedMemberId };
  }),
  autoConnectFreeEnds: (thresh = 300) => set((state) => {
    if (!state.model) return state;
    const { model, connected } = autoConnectFreeEndsPure(state.model, thresh);
    return connected > 0 ? { model, selectedMemberId: null } : state;
  }),
  saveCurrentAsFloor: () => set((state) => {
    if (!state.model) return state;
    const idx = state.floors.length;
    // 다음 층 레벨 = 기존 층들의 최고 상단(elevation+height)
    const prevTop = state.floors.reduce((z, f) => Math.max(z, (f.elevation ?? 0) + (f.height ?? 3000)), 0);
    const floor: FloorModel = {
      ...state.model,
      id: `fl_${Date.now()}_${idx}`,
      name: `${idx + 1}F`,
      elevation: prevTop,
      height: 3000,
    };
    return { floors: [...state.floors, floor] };
  }),
  updateFloor: (id, patch) => set((state) => ({
    floors: state.floors.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  })),
  removeFloor: (id) => set((state) => ({ floors: state.floors.filter((f) => f.id !== id) })),
  setLoadingFile: (isLoadingFile, loadingMessage = '') => set({ isLoadingFile, loadingMessage, loadingProgress: isLoadingFile ? 0 : 0 }),
  setLoadingProgress: (loadingProgress, message) => set((s) => ({ loadingProgress, loadingMessage: message ?? s.loadingMessage })),

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
  clearCadLines: () => set((state) => ({ lines: state.lines.filter((l) => l.source !== 'CAD') })),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(zoom, 20)) }),
  setPan: (pan) => set({ pan }),
  resetViewport: () => set({ zoom: 1.0, pan: { x: 0, y: 0 } }),
  clearLines: () => set({ lines: [], aiPolygons: [], selectedLineId: null, backgroundImage: null }), 
}));
