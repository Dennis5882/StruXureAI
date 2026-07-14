// ── 정식 구조모델 스키마 (월드 mm, 절점-부재 그래프) ──────────
// 캔버스 px의 StructureLineData(렌더/편집용)와 분리된, 해석·층조립·MIDAS의 단일 진실 소스.
// 모든 좌표 mm. 부재는 절점(Node) id를 참조 → 진짜 그래프(접합부 절점 공유).

export interface Vec2 { x: number; y: number; } // 월드 mm

export interface SNode {
  id: string;          // 'n1', 'n2' …
  x: number; y: number; // 월드 mm
  gridRef?: string;     // 'X3-Y5' (격자 교점일 때)
}

export interface SColumn {
  id: string;
  node: string;         // 기둥 중심 절점 id
  width: number;        // 단면 b (mm)
  depth: number;        // 단면 h (mm)
  rotation: number;     // deg
  gridRef?: string;
  sectionName?: string; // 'C1' 등(추후)
  lineId?: string;      // 원본 캔버스 line id (삭제 시 동기화)
}

export interface SWall {
  id: string;
  i: string; j: string; // 양 끝 절점 id
  thickness: number;    // mm (양자화/측정)
  thicknessMeasured?: number;
  gridLine?: string;    // 'X3' 등(축 위 벽)
  singleLine?: boolean; // 단일선 벽(두께 추정)
  lineId?: string;      // 원본 캔버스 line id (삭제 시 동기화)
}

export interface SBeam {
  id: string;
  i: string; j: string;
  width: number;        // mm
  depth?: number;       // mm — 평법 집중표주(라벨)에서만 얻을 수 있음(평면 기하로는 불가)
  mark?: string;        // 설계 부호 (KL1, L2, KZL-1 …) → MIDAS 단면명
  fromLabel?: boolean;  // 단면이 도면 라벨(설계 명시값) 출처 = 측정 추정보다 신뢰
  widthMeasured?: number; // 라벨이 덮어쓰기 전 기하 측정 폭 — 라벨(정답)과 대조해 매칭 품질 검증용
  gridLine?: string;
  singleLine?: boolean;
  lineId?: string;      // 원본 캔버스 line id (삭제 시 동기화)
}

export interface SGridAxis {
  id: string;
  label: string;        // 'X1', 'Y3'
  dir: 'X' | 'Y';       // X축선=수직선(상수 x), Y축선=수평선(상수 y)
  position: number;     // 월드 mm (dir X→x, dir Y→y)
}

export interface FloorModel {
  units: 'mm';
  id?: string;          // 다층 관리용 안정 식별자 (building.floors)
  name: string;         // 'B1F' 등
  elevation?: number;   // 바닥 레벨(mm)
  height?: number;      // 층고(mm)
  nodes: SNode[];
  columns: SColumn[];
  walls: SWall[];
  beams: SBeam[];
  grid: SGridAxis[];
  sourceFile?: string;
  bbox?: { minX: number; minY: number; maxX: number; maxY: number }; // mm
}

export interface BuildingModel {
  units: 'mm';
  floors: FloorModel[];
}
