// 워크플로 파생 상태 + 모델 품질 지표 (순수 함수).
// 기존 store 를 수정하지 않고, 스냅샷을 받아 "지금 어디인지 / 다음 한 수"를 계산한다.
import { FloorModel } from '../types/structural';
import { StructureLineData } from '../types/drawing';
import { classifyMemberEnds } from '../utils/structuralModel';

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
  sharedNodes: number;  // 차수 ≥ 2 (접합부)
  // ── 벽/보의 미연결 끝점을 성격별로 분리한다 ──
  // 예전엔 "벽/보 차수 ≤1"을 전부 freeEnds로 세어 경고했는데, B1F 38개를 뜯어보니
  // 5개는 기둥에 붙어 있었고(연결됨) 12개는 개구부·건물 끝(정상)이라 **45%가 헛경고**였다.
  // 정상인 것까지 amber로 띄우면 진짜 봐야 할 것이 묻힌다.
  freeEnds: number;     // 🔴 진짜 검토 대상: 근처(≤600mm)에 붙을 상대가 있는데 안 붙은 끝
  endsAtColumn: number; // ⚪ 기둥 절점에 붙은 끝 — 연결돼 있음(경고 아님)
  openEnds: number;     // ✅ 주변에 붙을 상대가 없는 끝 — 개구부/건물 외곽(정상)
}

export function modelQuality(m: FloorModel | null): ModelQuality | null {
  if (!m) return null;
  // 전체 차수(기둥 포함)
  const degAll = new Map<string, number>();
  const inc = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) || 0) + 1);
  for (const c of m.columns) inc(degAll, c.node);
  for (const w of m.walls) { inc(degAll, w.i); inc(degAll, w.j); }
  for (const b of m.beams) { inc(degAll, b.i); inc(degAll, b.j); }

  let shared = 0;
  degAll.forEach((d) => { if (d >= 2) shared++; });

  const ends = classifyMemberEnds(m);

  return {
    nodes: m.nodes.length,
    members: m.columns.length + m.walls.length + m.beams.length,
    walls: m.walls.length,
    columns: m.columns.length,
    beams: m.beams.length,
    grid: m.grid.length,
    sharedNodes: shared,
    freeEnds: ends.unresolved.size,
    endsAtColumn: ends.atColumn.size,
    openEnds: ends.open.size,
  };
}

// 도면에 CAD 추출 부재가 있는지 (라인 기반 빠른 판정)
export const hasCadStructure = (lines: StructureLineData[]) => lines.some((l) => l.source === 'CAD');
