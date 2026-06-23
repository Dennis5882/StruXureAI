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
      });
    } else if (m.type === 'WALL' && m.shape === 'line') {
      walls.push({
        id: `W${++wId}`, i: nodeId(a), j: nodeId(b),
        thickness: Math.round(m.properties?.thickness_mm ?? 200),
        thicknessMeasured: m.properties?.thickness_measured_mm,
        gridLine: m.properties?.gridLine,
        singleLine: !!m.properties?.singleLine,
      });
    } else if (m.type === 'BEAM' && m.shape === 'line') {
      beams.push({
        id: `B${++bId}`, i: nodeId(a), j: nodeId(b),
        width: Math.round(m.properties?.width_mm ?? 300),
        singleLine: !!m.properties?.singleLine,
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
