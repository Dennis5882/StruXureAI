import { StructureLineData, Point2D, StructureType } from '../types/drawing';
import { DxfTransform } from '../store/useDrawingStore';

// ── 벡터 헬퍼 ──────────────────────────────────────────────
const getDistance = (p1: Point2D, p2: Point2D) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
const getAngle = (p1: Point2D, p2: Point2D) => Math.atan2(p2.y - p1.y, p2.x - p1.x);
const getMidpoint = (p1: Point2D, p2: Point2D): Point2D => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
const sub = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point2D, b: Point2D) => a.x * b.x + a.y * b.y;
const perpFoot = (p: Point2D, a: Point2D, b: Point2D): Point2D => {
  const ab = sub(b, a);
  const t = dot(sub(p, a), ab) / (dot(ab, ab) || 1);
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
};
const projParam = (p: Point2D, a: Point2D, b: Point2D) => {
  const ab = sub(b, a);
  return dot(sub(p, a), ab) / (dot(ab, ab) || 1);
};
// 정렬된 값들을 tol 이내로 묶어 대표값(평균) 배열 반환
const clusterValues = (vals: number[], tol: number): number[] => {
  const sorted = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  let bucket: number[] = [];
  for (const v of sorted) {
    if (bucket.length === 0 || v - bucket[bucket.length - 1] <= tol) bucket.push(v);
    else { out.push(bucket.reduce((s, x) => s + x, 0) / bucket.length); bucket = [v]; }
  }
  if (bucket.length) out.push(bucket.reduce((s, x) => s + x, 0) / bucket.length);
  return out;
};
const nearest = (v: number, arr: number[]): { val: number; dist: number } => {
  let best = Infinity, bv = v;
  for (const a of arr) { const d = Math.abs(a - v); if (d < best) { best = d; bv = a; } }
  return { val: bv, dist: best };
};

// ── 레이어 분류 ─────────────────────────────────────────────
// 조적벽(비내력)은 구조 부재에서 제외 (벽 키워드보다 먼저 판정)
const classifyLayer = (name: string): StructureType | null => {
  const u = (name || '').toUpperCase();
  if (/MASONRY|조적|벽돌|BRICK|磚|砌/.test(u)) return null;
  if (/COL|기둥|柱/.test(u)) return 'COLUMN';
  if (/WALL|옹벽|벽|墙|牆|RC|SHEAR/.test(u)) return 'WALL';
  return null;
};
// 통심선(축/그리드) 레이어
const isAxisLayer = (name: string): boolean => /AXIS|AXN|축|GRID|軸|通り|通リ/i.test(name || '');

const entityPoints = (e: any): Point2D[] => {
  if (Array.isArray(e.vertices) && e.vertices.length) return e.vertices;
  if (e.center && typeof e.radius === 'number')
    return [{ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius }];
  if (e.startPoint && e.endPoint) return [e.startPoint, e.endPoint];
  return [];
};

// ── 그리드(통심선) 추출: 축선 레이어의 수직/수평 선에서 x/y 격자값 산출 ──
const extractGrid = (entities: any[], tx: (x: number) => number, ty: (y: number) => number) => {
  const xs: number[] = [], ys: number[] = [];
  for (const e of entities) {
    if (!isAxisLayer(e.layer)) continue;
    const v = entityPoints(e);
    if (v.length < 2) continue;
    const a = { x: tx(v[0].x), y: ty(v[0].y) };
    const b = { x: tx(v[v.length - 1].x), y: ty(v[v.length - 1].y) };
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx < 2 && dy > 20) xs.push((a.x + b.x) / 2);        // 수직 축선 → x 격자
    else if (dy < 2 && dx > 20) ys.push((a.y + b.y) / 2);   // 수평 축선 → y 격자
  }
  return { xs: clusterValues(xs, 4), ys: clusterValues(ys, 4) };
};

export interface ExtractResult {
  members: StructureLineData[];
  counts: { wall: number; column: number };
  truncated: boolean;
}

/**
 * 보이는 구조 레이어(벽/기둥)의 DXF 엔티티를 편집 가능한 구조 부재로 변환.
 * - 벽: 선분 단위. 조적벽 제외.
 * - 기둥: 외곽 bbox → 중심점+단면 사각형. 그리드 교점에 스냅 + 중복 제거.
 */
export const extractMembersFromDxf = (
  entities: any[],
  layers: { name: string; visible: boolean }[],
  t: DxfTransform,
  cap: number = 4000,
): ExtractResult => {
  const visible = new Map(layers.map((l) => [l.name, l.visible]));
  const tx = (x: number) => t.pad + (x - t.minX) * t.scale;
  const ty = (y: number) => t.pad + (t.maxY - y) * t.scale; // DXF Y축 반전
  const members: StructureLineData[] = [];
  let wall = 0, idc = 0, truncated = false;
  const nid = () => `cad_${Date.now().toString(36)}_${idc++}`;

  const grid = extractGrid(entities, tx, ty); // 축선 레이어는 숨겨도 그리드는 사용

  // 기둥 후보 수집 (캔버스 좌표 bbox)
  type Col = { cx: number; cy: number; w: number; h: number; layer: string };
  const cols: Col[] = [];

  const pushSeg = (a: Point2D, b: Point2D, layer: string) => {
    members.push({
      id: nid(), source: 'CAD', type: 'WALL', shape: 'line',
      coordinates: [{ x: tx(a.x), y: ty(a.y) }, { x: tx(b.x), y: ty(b.y) }],
      thickness: 3, properties: { fromCad: true, layer },
    });
  };

  for (const e of entities) {
    if (members.length + cols.length >= cap) { truncated = true; break; }
    const cls = classifyLayer(e.layer);
    if (!cls) continue;
    if (visible.get(e.layer) === false) continue;

    if (cls === 'COLUMN') {
      const pts = entityPoints(e);
      if (pts.length < 2) continue;
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; }
      if (mxx - mnx < 1e-6 || mxy - mny < 1e-6) continue;
      const x1 = tx(mnx), x2 = tx(mxx), y1 = ty(mxy), y2 = ty(mny); // 캔버스(Y반전)
      cols.push({ cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), layer: e.layer });
      continue;
    }

    const etype = (e.type || '').toUpperCase();
    const before = members.length;
    if (etype === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2) {
      pushSeg(e.vertices[0], e.vertices[1], e.layer);
    } else if ((etype === 'LWPOLYLINE' || etype === 'POLYLINE') && Array.isArray(e.vertices) && e.vertices.length >= 2) {
      for (let i = 0; i < e.vertices.length - 1; i++) pushSeg(e.vertices[i], e.vertices[i + 1], e.layer);
      if (e.shape === true || e.closed === true) pushSeg(e.vertices[e.vertices.length - 1], e.vertices[0], e.layer);
    }
    if (members.length > before) wall++;
  }

  // 1) 그리드 스냅: 기둥 중심을 가까운 교점으로 (가까울 때만)
  const SNAP = 20;
  for (const c of cols) {
    if (grid.xs.length) { const nx = nearest(c.cx, grid.xs); if (nx.dist <= SNAP) c.cx = nx.val; }
    if (grid.ys.length) { const ny = nearest(c.cy, grid.ys); if (ny.dist <= SNAP) c.cy = ny.val; }
  }
  // 2) 중복 제거: 중심이 매우 가까운 기둥은 하나로 (크기는 최대 bbox 유지)
  const DEDUP = 10;
  const kept: Col[] = [];
  for (const c of cols) {
    const dup = kept.find((k) => Math.hypot(k.cx - c.cx, k.cy - c.cy) <= DEDUP);
    if (dup) { dup.w = Math.max(dup.w, c.w); dup.h = Math.max(dup.h, c.h); }
    else kept.push({ ...c });
  }
  for (const c of kept) {
    members.push({
      id: nid(), source: 'CAD', type: 'COLUMN', shape: 'rect',
      coordinates: [{ x: c.cx - c.w / 2, y: c.cy - c.h / 2 }, { x: c.cx + c.w / 2, y: c.cy + c.h / 2 }],
      thickness: 2, properties: { fromCad: true, layer: c.layer, snapped: true },
    });
  }

  return { members, counts: { wall, column: kept.length }, truncated };
};

// ── 동일선상 인접 중심선 병합 (연결성) ──────────────────────
const mergeCollinearLines = (
  lines: StructureLineData[],
  perpTol = 4,
  gapTol = 30,
  angleTol = 0.1,
): StructureLineData[] => {
  const n = lines.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seg = (l: StructureLineData) => ({ a: l.coordinates[0], b: l.coordinates[1] });

  for (let i = 0; i < n; i++) {
    const A = seg(lines[i]);
    const angA = getAngle(A.a, A.b);
    for (let j = i + 1; j < n; j++) {
      const B = seg(lines[j]);
      let ad = Math.abs(angA - getAngle(B.a, B.b));
      if (ad > Math.PI / 2) ad = Math.PI - ad;
      if (ad > angleTol) continue;
      // B의 양 끝이 A의 직선 위에 있나(동일선상)
      if (getDistance(B.a, perpFoot(B.a, A.a, A.b)) > perpTol) continue;
      if (getDistance(B.b, perpFoot(B.b, A.a, A.b)) > perpTol) continue;
      // 길이방향으로 겹치거나 가까운가
      const L = getDistance(A.a, A.b) || 1;
      const ts = [0, 1, projParam(B.a, A.a, A.b), projParam(B.b, A.a, A.b)];
      const aLo = 0, aHi = 1, bLo = Math.min(ts[2], ts[3]), bHi = Math.max(ts[2], ts[3]);
      const gap = Math.max(aLo - bHi, bLo - aHi) * L; // 음수면 겹침
      if (gap > gapTol) continue;
      parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)!).push(i); }

  const merged: StructureLineData[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length === 1) { merged.push(lines[idxs[0]]); continue; }
    // 그룹 내 가장 긴 선분의 방향을 기준으로 모든 끝점을 투영 → 최소/최대 스팬
    let dirI = idxs[0], dirLen = -1;
    for (const i of idxs) { const s = seg(lines[i]); const l = getDistance(s.a, s.b); if (l > dirLen) { dirLen = l; dirI = i; } }
    const D = seg(lines[dirI]);
    let lo = Infinity, hi = -Infinity, loP = D.a, hiP = D.b;
    for (const i of idxs) {
      for (const p of [seg(lines[i]).a, seg(lines[i]).b]) {
        const t = projParam(p, D.a, D.b);
        const foot = perpFoot(p, D.a, D.b);
        if (t < lo) { lo = t; loP = foot; }
        if (t > hi) { hi = t; hiP = foot; }
      }
    }
    merged.push({
      id: `center_${Date.now().toString(36)}_m${merged.length}`,
      source: 'CAD', type: 'CENTER_LINE', shape: 'line',
      coordinates: [loP, hiP], thickness: 2,
      properties: { isAutoGenerated: true, merged: idxs.length },
    });
  }
  return merged;
};

// ── 벽 쌍 → 중심선 자동 생성 (+ 연결성 병합) ────────────────
// thickness 범위는 좌표와 같은 단위(px). CAD 추출 벽은 호출부에서 scale 환산.
export const extractCenterLinesFromWalls = (
  lines: StructureLineData[],
  minThickness: number = 100,
  maxThickness: number = 400,
  angleTolerance: number = 0.08,
): StructureLineData[] => {
  const wallLines = lines.filter((l) => l.type === 'WALL' && l.coordinates.length >= 2);
  const raw: StructureLineData[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < wallLines.length; i++) {
    const A = wallLines[i];
    if (processed.has(A.id)) continue;
    const a1 = A.coordinates[0], a2 = A.coordinates[1];
    const angleA = getAngle(a1, a2);
    const midA = getMidpoint(a1, a2);

    let best: StructureLineData | null = null;
    let bestDist = Infinity;
    for (let j = 0; j < wallLines.length; j++) {
      if (j === i) continue;
      const B = wallLines[j];
      if (processed.has(B.id)) continue;
      const b1 = B.coordinates[0], b2 = B.coordinates[1];
      let angleDiff = Math.abs(angleA - getAngle(b1, b2));
      if (angleDiff > Math.PI / 2) angleDiff = Math.PI - angleDiff;
      if (angleDiff > angleTolerance) continue;
      const d = getDistance(midA, perpFoot(midA, b1, b2));
      if (d < minThickness || d > maxThickness || d >= bestDist) continue;
      const t1 = projParam(a1, b1, b2), t2 = projParam(a2, b1, b2);
      const overlap = Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0);
      if (overlap <= 0.05) continue;
      bestDist = d; best = B;
    }

    if (best) {
      processed.add(A.id); processed.add(best.id);
      const b1 = best.coordinates[0], b2 = best.coordinates[1];
      raw.push({
        id: `center_${Date.now().toString(36)}_${raw.length}`,
        source: 'CAD', type: 'CENTER_LINE', shape: 'line',
        coordinates: [getMidpoint(a1, perpFoot(a1, b1, b2)), getMidpoint(a2, perpFoot(a2, b1, b2))],
        thickness: 2, properties: { isAutoGenerated: true, wallThickness: Math.round(bestDist) },
      });
    }
  }

  // 3) 동일선상 인접 중심선 병합 → 연속 축선 (gap은 벽두께의 수 배까지 연결)
  return mergeCollinearLines(raw, Math.max(4, maxThickness * 0.5), Math.max(30, maxThickness * 8));
};
