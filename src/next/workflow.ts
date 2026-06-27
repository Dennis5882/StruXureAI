// 워크플로 파생 상태 + 모델 품질 지표 (순수 함수).
// 기존 store 를 수정하지 않고, 스냅샷을 받아 "지금 어디인지 / 다음 한 수"를 계산한다.
import { FloorModel } from '../types/structural';
import { StructureLineData } from '../types/drawing';

export type StepState = 'done' | 'current' | 'todo';
export type NextKey = 'open' | 'extract' | 'review' | 'send';

export interface WorkflowSnap {
  hasFile: boolean;       // 도면(이미지 or DXF) 로드됨
  hasEntities: boolean;   // DXF 엔티티 있음
  hasModel: boolean;      // FloorModel 추출됨
}

export interface WorkflowResult {
  current: number;                 // 0..4 (현재 단계 인덱스)
  states: StepState[];             // 5단계 상태
  next: NextKey;                   // 다음 추천 행동
}

// 5단계: 0 열기 · 1 레이어 · 2 추출 · 3 검토 · 4 GenNX
export function deriveWorkflow(s: WorkflowSnap): WorkflowResult {
  const states: StepState[] = ['todo', 'todo', 'todo', 'todo', 'todo'];
  let current = 0;
  let next: NextKey = 'open';

  if (!s.hasFile) {
    current = 0; next = 'open';
  } else if (!s.hasModel) {
    // 파일은 있고 모델은 아직 → 레이어 검토 후 추출
    states[0] = 'done';
    states[1] = 'done'; // 로드 직후 레이어는 일단 보이는 상태
    current = 2; next = 'extract';
  } else {
    states[0] = 'done'; states[1] = 'done'; states[2] = 'done';
    current = 3; next = 'review';
  }

  // 현재 단계 표시
  if (states[current] === 'todo') states[current] = 'current';
  // 모델이 있으면 검토/전송 단계는 활성(현재) 표기
  if (s.hasModel) { states[3] = states[3] === 'todo' ? 'current' : states[3]; }
  return { current, states, next };
}

export interface ModelQuality {
  nodes: number;
  members: number;
  walls: number;
  columns: number;
  beams: number;
  grid: number;
  sharedNodes: number; // 차수 ≥ 2 (접합부)
  freeEnds: number;    // 벽/보 끝점 중 차수 1 (어디에도 연결 안 됨)
}

export function modelQuality(m: FloorModel | null): ModelQuality | null {
  if (!m) return null;
  // 전체 차수(기둥 포함)
  const degAll = new Map<string, number>();
  const inc = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) || 0) + 1);
  for (const c of m.columns) inc(degAll, c.node);
  for (const w of m.walls) { inc(degAll, w.i); inc(degAll, w.j); }
  for (const b of m.beams) { inc(degAll, b.i); inc(degAll, b.j); }

  // 벽/보 전용 차수 (자유단 판정 — 기둥 단독 절점은 제외)
  const degWB = new Map<string, number>();
  for (const w of m.walls) { inc(degWB, w.i); inc(degWB, w.j); }
  for (const b of m.beams) { inc(degWB, b.i); inc(degWB, b.j); }

  let shared = 0;
  degAll.forEach((d) => { if (d >= 2) shared++; });
  let free = 0;
  degWB.forEach((d) => { if (d <= 1) free++; });

  return {
    nodes: m.nodes.length,
    members: m.columns.length + m.walls.length + m.beams.length,
    walls: m.walls.length,
    columns: m.columns.length,
    beams: m.beams.length,
    grid: m.grid.length,
    sharedNodes: shared,
    freeEnds: free,
  };
}

// 도면에 CAD 추출 부재가 있는지 (라인 기반 빠른 판정)
export const hasCadStructure = (lines: StructureLineData[]) => lines.some((l) => l.source === 'CAD');
