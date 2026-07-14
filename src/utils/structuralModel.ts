import { StructureLineData, Point2D } from '../types/drawing';
import { DxfTransform } from '../store/useDrawingStore';
import { GridLabeled } from './geometry';
import { FloorModel, SNode, SColumn, SWall, SBeam, SGridAxis, Vec2 } from '../types/structural';

// ── 좌표 가교 유틸 (단일 출처) ──────────────────────────────
// 캔버스 px ↔ 월드 mm. 변환은 반드시 여기로 통일(설계서 §2).
export const canvasToWorld = (p: Point2D, t: DxfTransform): Vec2 => ({
  x: t.minX + (p.x - t.pad) / t.scale,
  y: t.maxY - (p.y - t.pad) / t.scale, // DXF Y는 위로
});
export const worldToCanvas = (v: Vec2, t: DxfTransform): Point2D => ({
  x: t.pad + (v.x - t.minX) * t.scale,
  y: t.pad + (t.maxY - v.y) * t.scale,
});

/**
 * 추출된 구조부재(캔버스 px) + 그리드 → 정식 FloorModel(월드 mm, 절점-부재 그래프).
 * 끝점/기둥중심을 절점으로 통합(1mm 반올림 키) → 접합부에서 절점 공유(그래프 연결).
 */
export const buildStructuralModel = (
  members: StructureLineData[],
  grid: GridLabeled,
  t: DxfTransform,
  opts?: { name?: string; sourceFile?: string },
): FloorModel => {
  const nodes: SNode[] = [];
  const nmap = new Map<string, string>();
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const nodeId = (p: Point2D): string => {
    const w = canvasToWorld(p, t);
    const key = `${Math.round(w.x)},${Math.round(w.y)}`; // 1mm 반올림 통합
    const hit = nmap.get(key); if (hit) return hit;
    const id = `n${nodes.length + 1}`; nmap.set(key, id);
    nodes.push({ id, x: r1(w.x), y: r1(w.y) }); return id;
  };

  const columns: SColumn[] = [];
  const walls: SWall[] = [];
  const beams: SBeam[] = [];
  let cId = 0, wId = 0, bId = 0;

  for (const m of members) {
    if (m.source !== 'CAD' || !m.coordinates || m.coordinates.length < 2) continue;
    const a = m.coordinates[0], b = m.coordinates[1];
    if (m.type === 'COLUMN' && m.shape === 'rect') {
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const node = nodeId(center);
      const ref = m.properties?.gridRef;
      if (ref) { const nd = nodes.find((n) => n.id === node); if (nd && !nd.gridRef) nd.gridRef = ref; }
      columns.push({
        id: `C${++cId}`, node,
        width: Math.round(m.properties?.width_mm ?? 0),
        depth: Math.round(m.properties?.depth_mm ?? 0),
        rotation: Math.round(m.properties?.rotation_deg ?? 0),
        gridRef: ref,
        lineId: m.id,
      });
    } else if (m.type === 'WALL' && m.shape === 'line') {
      const ni = nodeId(a), nj = nodeId(b);
      if (ni === nj) continue; // 두 끝점이 같은 절점으로 병합 = 퇴화 부재(길이0) → 제외
      walls.push({
        id: `W${++wId}`, i: ni, j: nj,
        thickness: Math.round(m.properties?.thickness_mm ?? 200),
        thicknessMeasured: m.properties?.thickness_measured_mm,
        gridLine: m.properties?.gridLine,
        singleLine: !!m.properties?.singleLine,
        lineId: m.id,
      });
    } else if (m.type === 'BEAM' && m.shape === 'line') {
      const ni = nodeId(a), nj = nodeId(b);
      if (ni === nj) continue; // 길이0 보(분할 슬리버 등) 제외 → MIDAS 내보내기 오류 방지
      beams.push({
        id: `B${++bId}`, i: ni, j: nj,
        width: Math.round(m.properties?.width_mm ?? 300),
        depth: typeof m.properties?.depth_mm === 'number' ? Math.round(m.properties.depth_mm) : undefined,
        mark: m.properties?.mark,
        fromLabel: !!m.properties?.fromLabel,
        singleLine: !!m.properties?.singleLine,
        lineId: m.id,
      });
    }
  }

  // 그리드 px → 월드 mm 축선. xs=수직선(상수 x)→dir X, ys=수평선(상수 y)→dir Y.
  const gridAxes: SGridAxis[] = [];
  let gId = 0;
  for (const x of grid.xs) gridAxes.push({ id: `g${++gId}`, label: x.label, dir: 'X', position: r1(canvasToWorld({ x: x.pos, y: 0 }, t).x) });
  for (const y of grid.ys) gridAxes.push({ id: `g${++gId}`, label: y.label, dir: 'Y', position: r1(canvasToWorld({ x: 0, y: y.pos }, t).y) });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) { if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y; }

  return {
    units: 'mm', name: opts?.name ?? 'Floor', sourceFile: opts?.sourceFile,
    nodes, columns, walls, beams, grid: gridAxes,
    bbox: isFinite(minX) ? { minX: r1(minX), minY: r1(minY), maxX: r1(maxX), maxY: r1(maxY) } : undefined,
  };
};

// 절점 차수(연결 부재 수) — 그래프 연결성 점검/리포트용.
export const nodeDegrees = (m: FloorModel): Map<string, number> => {
  const deg = new Map<string, number>();
  const inc = (id: string) => deg.set(id, (deg.get(id) || 0) + 1);
  for (const c of m.columns) inc(c.node);
  for (const w of m.walls) { inc(w.i); inc(w.j); }
  for (const b of m.beams) { inc(b.i); inc(b.j); }
  return deg;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const nextId = (arr: { id: string }[], pre: string): string => {
  let mx = 0;
  for (const it of arr) { const m = new RegExp(`^${pre}(\\d+)$`).exec(it.id); if (m) mx = Math.max(mx, +m[1]); }
  return `${pre}${mx + 1}`;
};

// 수동으로 그린 캔버스 line(px)을 모델(월드 mm)에 부재로 편입한다.
// 절점은 기존 절점과 1mm 이내면 병합. lineId로 캔버스 line과 연결(삭제 동기).
export const incorporateLine = (model: FloorModel, line: StructureLineData, t: DxfTransform): FloorModel => {
  if (!line.coordinates || line.coordinates.length < 2) return model;
  const a = line.coordinates[0], b = line.coordinates[1];
  const nodes = model.nodes.map((n) => ({ ...n }));
  let maxN = 0;
  for (const n of nodes) { const m = /^n(\d+)$/.exec(n.id); if (m) maxN = Math.max(maxN, +m[1]); }
  const findOrAdd = (p: Point2D): string => {
    const w = canvasToWorld(p, t);
    for (const n of nodes) { if (Math.hypot(n.x - w.x, n.y - w.y) < 1) return n.id; }
    const id = `n${++maxN}`; nodes.push({ id, x: r1(w.x), y: r1(w.y) }); return id;
  };
  const out: FloorModel = { ...model, nodes };
  if (line.type === 'COLUMN' && line.shape === 'rect') {
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const node = findOrAdd(center);
    const wA = canvasToWorld(a, t), wB = canvasToWorld(b, t);
    out.columns = [...model.columns, {
      id: nextId(model.columns, 'C'), node,
      width: Math.round(Math.abs(wB.x - wA.x)) || 400,
      depth: Math.round(Math.abs(wA.y - wB.y)) || 400,
      rotation: 0, lineId: line.id,
    }];
  } else if (line.type === 'BEAM') {
    out.beams = [...model.beams, {
      id: nextId(model.beams, 'B'), i: findOrAdd(a), j: findOrAdd(b),
      width: Math.round(line.properties?.width_mm ?? 300), lineId: line.id,
    }];
  } else { // WALL (기본)
    out.walls = [...model.walls, {
      id: nextId(model.walls, 'W'), i: findOrAdd(a), j: findOrAdd(b),
      thickness: Math.round(line.properties?.thickness_mm ?? 200), lineId: line.id,
    }];
  }
  return out;
};

// 자유단(벽/보 차수 ≤1 끝점) 연결. 2단계:
//  Pass 1) 근접 절점(≤thresh)에 병합 — 형제 절점 제외로 부재 붕괴 방지.
//  Pass 2) 남은 자유단이 다른 벽의 선분 내부(끝점 아님)에 닿으면 그 벽을 분할해 T자 접합.
export const autoConnectFreeEnds = (model: FloorModel, thresh = 300): { model: FloorModel; connected: number } => {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const degWB = new Map<string, number>();
  const inc = (id: string) => degWB.set(id, (degWB.get(id) || 0) + 1);
  model.walls.forEach((w) => { inc(w.i); inc(w.j); });
  model.beams.forEach((b) => { inc(b.i); inc(b.j); });
  const nbr = new Map<string, Set<string>>();
  const addN = (x: string, y: string) => { if (!nbr.has(x)) nbr.set(x, new Set()); nbr.get(x)!.add(y); };
  model.walls.forEach((w) => { addN(w.i, w.j); addN(w.j, w.i); });
  model.beams.forEach((b) => { addN(b.i, b.j); addN(b.j, b.i); });

  // ── Pass 1: 근접 절점 병합 ──
  const freeIds = [...degWB.entries()].filter(([, d]) => d <= 1).map(([id]) => id);
  const remap = new Map<string, string>();
  const resolve = (id: string): string => { let x = id; while (remap.has(x)) x = remap.get(x)!; return x; };
  let connected = 0;
  for (const fid of freeIds) {
    if (remap.has(fid)) continue;
    const f = nodeById.get(fid); if (!f) continue;
    const siblings = nbr.get(fid) || new Set();
    let best: string | null = null, bestD = thresh;
    for (const n of model.nodes) {
      if (n.id === fid || siblings.has(n.id)) continue;
      if (resolve(n.id) === resolve(fid)) continue;
      const d = Math.hypot(n.x - f.x, n.y - f.y);
      if (d <= bestD) { bestD = d; best = n.id; }
    }
    if (best) { remap.set(fid, best); connected++; }
  }

  const nodes = model.nodes.map((n) => ({ ...n })); // 위치 이동 가능하도록 복제
  let walls = model.walls.map((w) => ({ ...w, i: resolve(w.i), j: resolve(w.j) })).filter((w) => w.i !== w.j);
  const beams = model.beams.map((b) => ({ ...b, i: resolve(b.i), j: resolve(b.j) })).filter((b) => b.i !== b.j);
  const columns = model.columns.map((c) => ({ ...c, node: resolve(c.node) }));

  // ── Pass 2: 자유단 → 벽 선분 내부 접합(T자) ──
  const nmap = new Map(nodes.map((n) => [n.id, n]));
  const colNodes = new Set(columns.map((c) => c.node)); // 기둥 절점은 이동 금지
  let maxW = 0; walls.forEach((w) => { const m = /^W(\d+)$/.exec(w.id); if (m) maxW = Math.max(maxW, +m[1]); });
  const degOf = () => {
    const d = new Map<string, number>(); const i2 = (id: string) => d.set(id, (d.get(id) || 0) + 1);
    walls.forEach((w) => { i2(w.i); i2(w.j); }); beams.forEach((b) => { i2(b.i); i2(b.j); });
    return d;
  };
  const freeIds2 = [...degOf().entries()].filter(([, d]) => d <= 1).map(([id]) => id);
  for (const fid of freeIds2) {
    if (colNodes.has(fid)) continue;
    if ((degOf().get(fid) || 0) > 1) continue; // 앞 단계에서 이미 연결됨
    const f = nmap.get(fid); if (!f) continue;
    let bestIdx = -1, bestD = thresh, bestPx = 0, bestPy = 0;
    for (let idx = 0; idx < walls.length; idx++) {
      const w = walls[idx];
      if (w.i === fid || w.j === fid) continue;
      const a = nmap.get(w.i), b = nmap.get(w.j); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy; if (L2 < 1) continue;
      const t = ((f.x - a.x) * dx + (f.y - a.y) * dy) / L2;
      if (t <= 0.15 || t >= 0.85) continue; // 내부만(끝점 근처는 Pass 1 담당)
      const px = a.x + t * dx, py = a.y + t * dy;
      const d = Math.hypot(f.x - px, f.y - py);
      if (d <= bestD) { bestD = d; bestIdx = idx; bestPx = px; bestPy = py; }
    }
    if (bestIdx >= 0) {
      const w = walls[bestIdx];
      f.x = bestPx; f.y = bestPy; // 자유단을 선분 위로 정합
      walls.splice(bestIdx, 1,
        { ...w, id: `W${++maxW}`, i: w.i, j: fid },
        { ...w, id: `W${++maxW}`, i: fid, j: w.j });
      connected++;
    }
  }

  if (connected === 0) return { model, connected: 0 };
  const used = new Set<string>();
  walls.forEach((w) => { used.add(w.i); used.add(w.j); });
  beams.forEach((b) => { used.add(b.i); used.add(b.j); });
  columns.forEach((c) => used.add(c.node));
  const outNodes = nodes.filter((n) => used.has(n.id));
  return { model: { ...model, nodes: outNodes, walls, beams, columns }, connected };
};
