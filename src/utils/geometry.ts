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
// 두 무한직선(p1p2, p3p4)의 교점. 평행이면 null.
const lineIntersect = (p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D | null => {
  const d1 = sub(p2, p1), d2 = sub(p4, p3);
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2.y - (p3.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
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

// 볼록껍질 (Andrew's monotone chain) — 반시계
const convexHull = (pts: Point2D[]): Point2D[] => {
  const p = [...pts].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (p.length < 3) return p;
  const cross = (o: Point2D, a: Point2D, b: Point2D) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2D[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Point2D[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
};

// 최소면적 직사각형 (회전 캘리퍼스: 껍질 각 변 방향으로 투영해 최소 면적 탐색)
// 반환: 중심(cx,cy), 변(w,h), 각도(deg, 캔버스 기준 (-45,45], 직교는 0으로 스냅)
export const minAreaRect = (
  pts: Point2D[],
): { cx: number; cy: number; w: number; h: number; deg: number } | null => {
  const hull = convexHull(pts);
  if (hull.length < 2) {
    // 점이 2개뿐이면 AABB 폴백
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; }
    if (!isFinite(mnx)) return null;
    return { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2, w: mxx - mnx, h: mxy - mny, deg: 0 };
  }
  let best: { area: number; cx: number; cy: number; w: number; h: number; ang: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = { x: b.x - a.x, y: b.y - a.y }; const len = Math.hypot(ex.x, ex.y) || 1;
    const ux = { x: ex.x / len, y: ex.y / len }; const uy = { x: -ux.y, y: ux.x };
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const du = p.x * ux.x + p.y * ux.y, dv = p.x * uy.x + p.y * uy.y;
      if (du < minU) minU = du; if (du > maxU) maxU = du; if (dv < minV) minV = dv; if (dv > maxV) maxV = dv;
    }
    const w = maxU - minU, h = maxV - minV, area = w * h;
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      best = { area, cx: cu * ux.x + cv * uy.x, cy: cu * ux.y + cv * uy.y, w, h, ang: Math.atan2(ux.y, ux.x) };
    }
  }
  if (!best) return null;
  // 각도를 (-45,45]로 정규화 (90° 회전 = w/h 교환과 동치) + 직교 스냅
  let deg = best.ang * 180 / Math.PI, w = best.w, h = best.h;
  while (deg > 45) { deg -= 90; [w, h] = [h, w]; }
  while (deg <= -45) { deg += 90; [w, h] = [h, w]; }
  if (Math.abs(deg) < 1.5) deg = 0;
  return { cx: best.cx, cy: best.cy, w, h, deg };
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
// 통심선(축/그리드) 레이어 — CEN(centerline), 통심선/通芯/通り芯 등 관례 포함
const isAxisLayer = (name: string): boolean => /AXIS|AXN|GRID|CEN|축|통|軸|通/i.test(name || '');
// 축 버블(통심부호) 레이어
const isBubbleLayer = (name: string): boolean => /BUBBLE|버블|통.?부호|軸符|通り符/i.test(name || '');
const cleanText = (s: string): string => (s || '').replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim();

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

// 그리드 라벨 정합: CEN 그리드 선(정확 위치) + 버블 TEXT(정확 라벨) 결합.
// 버블을 가장 가까운 선에 매칭 → 라벨 부여, 버블 있는 선만 정규 그리드로 채택.
// 버블이 없으면 선을 정렬 자동번호로 폴백.
export interface GridLabeled {
  xs: { pos: number; label: string }[]; // 캔버스 px
  ys: { pos: number; label: string }[];
}
const extractGridLabeled = (entities: any[], tx: (x: number) => number, ty: (y: number) => number): GridLabeled => {
  const lines = extractGrid(entities, tx, ty); // 정확한 px 위치
  // 버블 텍스트 수집
  const bubbles: { raw: string; cx: number; cy: number }[] = [];
  for (const e of entities) {
    const et = (e.type || '').toUpperCase();
    if (et !== 'TEXT' && et !== 'MTEXT') continue;
    const raw = cleanText(e.text);
    if (!raw || /[,]/.test(raw)) continue; // 치수 숫자(쉼표 포함) 제외
    if (!(isBubbleLayer(e.layer) || /^[XY]\d{1,3}$/i.test(raw))) continue;
    const pos = e.startPoint || e.position; if (!pos) continue;
    bubbles.push({ raw, cx: tx(pos.x), cy: ty(pos.y) });
  }
  // 접두(X/Y)로 분류, 없으면 위치로 분류(상단=X세로축, 좌측=Y가로축)
  let bx = bubbles.filter((b) => /^X/i.test(b.raw));
  let by = bubbles.filter((b) => /^Y/i.test(b.raw));
  if (!bx.length && !by.length && bubbles.length) {
    const minCy = Math.min(...bubbles.map((b) => b.cy)), minCx = Math.min(...bubbles.map((b) => b.cx));
    bx = bubbles.filter((b) => b.cy - minCy < 80); // 상단대 = 세로(X)축
    by = bubbles.filter((b) => b.cx - minCx < 80); // 좌측대 = 가로(Y)축
  }
  const TOL = 18;
  const labelLines = (linePos: number[], bub: { raw: string; cx: number; cy: number }[], key: 'cx' | 'cy') => {
    const m = new Map<string, { pos: number; label: string }>();
    for (const b of bub) {
      if (!linePos.length) break;
      const n = nearest(b[key], linePos);
      if (n.dist <= TOL && !m.has(b.raw)) m.set(b.raw, { pos: n.val, label: b.raw });
    }
    return [...m.values()].sort((a, c) => a.pos - c.pos);
  };
  const xs = labelLines(lines.xs, bx, 'cx');
  const ys = labelLines(lines.ys, by, 'cy');
  if (xs.length || ys.length) return { xs, ys };
  // 폴백: 버블 없음 → 선 자동번호 (X 좌→우, Y 하→상)
  return {
    xs: lines.xs.slice().sort((a, b) => a - b).map((pos, i) => ({ pos, label: `X${i + 1}` })),
    ys: lines.ys.slice().sort((a, b) => b - a).map((pos, i) => ({ pos, label: `Y${i + 1}` })),
  };
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

// ── P1: 정밀 구조모델 추출 (벽=축선+두께, 기둥=gridRef+단면) ──
export interface StructModelResult {
  members: StructureLineData[];
  grid: GridLabeled;
  counts: {
    wallAxes: number; columns: number; columnsTagged: number; unpairedFaces: number;
    nodes: number; extended: number; snappedCol: number; wallsLabeled: number;
  };
}

export const extractStructuralModel = (
  entities: any[],
  layers: { name: string; visible: boolean }[],
  t: DxfTransform,
  opts?: { wallMinMm?: number; wallMaxMm?: number; topology?: boolean; extendMm?: number; nodeMm?: number },
): StructModelResult => {
  const visible = new Map(layers.map((l) => [l.name, l.visible]));
  const tx = (x: number) => t.pad + (x - t.minX) * t.scale;
  const ty = (y: number) => t.pad + (t.maxY - y) * t.scale;
  const scale = t.scale || 1;
  const toMm = (px: number) => px / scale;
  const round5 = (mm: number) => Math.round(mm / 5) * 5;
  const minPx = (opts?.wallMinMm ?? 60) * scale;
  const maxPx = (opts?.wallMaxMm ?? 600) * scale;
  let idc = 0; const nid = (p: string) => `${p}_${Date.now().toString(36)}_${idc++}`;

  // 그리드 + 라벨 (버블 TEXT 정합, 없으면 자동번호)
  const grid = extractGridLabeled(entities, tx, ty);
  const { xs, ys } = grid;
  const REF_TOL = 28;
  const gridRefOf = (cx: number, cy: number): string | undefined => {
    let xl: string | undefined, yl: string | undefined;
    if (xs.length) { const n = xs.reduce((b, a) => Math.abs(a.pos - cx) < Math.abs(b.pos - cx) ? a : b); if (Math.abs(n.pos - cx) <= REF_TOL) xl = n.label; }
    if (ys.length) { const n = ys.reduce((b, a) => Math.abs(a.pos - cy) < Math.abs(b.pos - cy) ? a : b); if (Math.abs(n.pos - cy) <= REF_TOL) yl = n.label; }
    return xl && yl ? `${xl}-${yl}` : (xl || yl);
  };

  // 엔티티 수집: 벽 면선(px), 기둥 최소면적사각형(px, 회전 포함)
  const faces: { a: Point2D; b: Point2D }[] = [];
  type Col = { cx: number; cy: number; w: number; h: number; deg: number; layer: string };
  const cols: Col[] = [];
  for (const e of entities) {
    const cls = classifyLayer(e.layer);
    if (!cls) continue;
    if (visible.get(e.layer) === false) continue;
    if (cls === 'COLUMN') {
      const pts = entityPoints(e); if (pts.length < 2) continue;
      // 캔버스 px로 변환 후 최소면적 직사각형 → 사선 기둥도 정확한 단면·회전
      const r = minAreaRect(pts.map((p) => ({ x: tx(p.x), y: ty(p.y) })));
      if (!r || r.w < 1e-6 || r.h < 1e-6) continue;
      cols.push({ cx: r.cx, cy: r.cy, w: r.w, h: r.h, deg: r.deg, layer: e.layer });
      continue;
    }
    const et = (e.type || '').toUpperCase();
    const add = (p1: Point2D, p2: Point2D) => faces.push({ a: { x: tx(p1.x), y: ty(p1.y) }, b: { x: tx(p2.x), y: ty(p2.y) } });
    if (et === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2) add(e.vertices[0], e.vertices[1]);
    else if ((et === 'LWPOLYLINE' || et === 'POLYLINE') && Array.isArray(e.vertices) && e.vertices.length >= 2) {
      for (let i = 0; i < e.vertices.length - 1; i++) add(e.vertices[i], e.vertices[i + 1]);
      if (e.shape === true || e.closed === true) add(e.vertices[e.vertices.length - 1], e.vertices[0]);
    }
  }

  // 벽 면쌍 → 축선 + 두께(mm)
  const rawAxes: StructureLineData[] = [];
  const used = new Set<number>();
  let unpaired = 0;
  for (let i = 0; i < faces.length; i++) {
    if (used.has(i)) continue;
    const A = faces[i]; const angA = getAngle(A.a, A.b); const midA = getMidpoint(A.a, A.b);
    let bj = -1, bd = Infinity;
    for (let j = 0; j < faces.length; j++) {
      if (j === i || used.has(j)) continue;
      const B = faces[j];
      let ad = Math.abs(angA - getAngle(B.a, B.b)); if (ad > Math.PI / 2) ad = Math.PI - ad;
      if (ad > 0.08) continue;
      const d = getDistance(midA, perpFoot(midA, B.a, B.b));
      if (d < minPx || d > maxPx || d >= bd) continue;
      const t1 = projParam(A.a, B.a, B.b), t2 = projParam(A.b, B.a, B.b);
      const ov = Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0);
      if (ov <= 0.05) continue;
      bd = d; bj = j;
    }
    if (bj >= 0) {
      used.add(i); used.add(bj);
      const B = faces[bj];
      rawAxes.push({
        id: nid('wall'), source: 'CAD', type: 'WALL', shape: 'line',
        coordinates: [getMidpoint(A.a, perpFoot(A.a, B.a, B.b)), getMidpoint(A.b, perpFoot(A.b, B.a, B.b))],
        thickness: 2, properties: { fromCad: true, isAxis: true, thickness_mm: round5(toMm(bd)) },
      });
    } else unpaired++;
  }
  const wallAxes = mergeCollinearLines(rawAxes, Math.max(4, maxPx * 0.5), Math.max(30, maxPx * 8));

  // 기둥: 그리드 스냅 + 중복 제거 + gridRef/단면(mm)
  const SNAP = 20, DEDUP = 10;
  const xpos = xs.map((o) => o.pos), ypos = ys.map((o) => o.pos);
  for (const c of cols) {
    if (xpos.length) { const n = nearest(c.cx, xpos); if (n.dist <= SNAP) c.cx = n.val; }
    if (ypos.length) { const n = nearest(c.cy, ypos); if (n.dist <= SNAP) c.cy = n.val; }
  }
  const kept: Col[] = [];
  for (const c of cols) {
    const dup = kept.find((k) => Math.hypot(k.cx - c.cx, k.cy - c.cy) <= DEDUP);
    if (dup) { dup.w = Math.max(dup.w, c.w); dup.h = Math.max(dup.h, c.h); }
    else kept.push({ ...c });
  }

  // 위상 정리(P3): 벽 축선 끝점 → 기둥/교차점 연결 + 절점 그래프 (기둥 mm 산출 전, 벽만 변형)
  const topo = opts?.topology === false
    ? { extended: 0, snappedCol: 0, nodes: 0 }
    : cleanupTopology(wallAxes, kept, scale, { extendMm: opts?.extendMm, nodeMm: opts?.nodeMm });

  // 벽 축선 통심선(gridLine) 라벨링: 축에 평행·근접한 그리드선 매칭 (수직벽→X통심, 수평벽→Y통심)
  const GLINE_TOL = 14;
  const nearestLabel = (v: number, arr: { pos: number; label: string }[]): string | undefined => {
    if (!arr.length) return undefined;
    const n = arr.reduce((b, a) => (Math.abs(a.pos - v) < Math.abs(b.pos - v) ? a : b));
    return Math.abs(n.pos - v) <= GLINE_TOL ? n.label : undefined;
  };
  let wallsLabeled = 0;
  for (const w of wallAxes) {
    const a = w.coordinates[0], b = w.coordinates[1]; if (!a || !b) continue;
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    const gl = dy >= dx ? nearestLabel((a.x + b.x) / 2, xs) : nearestLabel((a.y + b.y) / 2, ys);
    if (gl) { w.properties = { ...(w.properties || {}), gridLine: gl }; wallsLabeled++; }
  }

  const members: StructureLineData[] = [...wallAxes];
  let tagged = 0;
  for (const c of kept) {
    const ref = gridRefOf(c.cx, c.cy); if (ref) tagged++;
    members.push({
      id: nid('col'), source: 'CAD', type: 'COLUMN', shape: 'rect',
      coordinates: [{ x: c.cx - c.w / 2, y: c.cy - c.h / 2 }, { x: c.cx + c.w / 2, y: c.cy + c.h / 2 }],
      thickness: 2, properties: { fromCad: true, gridRef: ref, width_mm: round5(toMm(c.w)), depth_mm: round5(toMm(c.h)), rotation_deg: c.deg },
    });
  }

  return {
    members, grid,
    counts: {
      wallAxes: wallAxes.length, columns: kept.length, columnsTagged: tagged, unpairedFaces: unpaired,
      nodes: topo.nodes, extended: topo.extended, snappedCol: topo.snappedCol, wallsLabeled,
    },
  };
};

// ── P3: 위상 정리 (벽 축선 trim/extend + 기둥/교차점 절점화) ──
// 벽 StructureLineData(line)의 끝점 좌표를 in-place로 수정하고 절점 ID(n0/n1)를 부여한다.
export interface TopoStats { extended: number; snappedCol: number; nodes: number; }
export const cleanupTopology = (
  walls: StructureLineData[],
  columns: { cx: number; cy: number; w: number; h: number }[],
  scale: number,
  opts?: { extendMm?: number; nodeMm?: number },
): TopoStats => {
  const s = scale || 1;
  const EXT = (opts?.extendMm ?? 600) * s;   // 끝점 연장 허용 거리
  const NODE = (opts?.nodeMm ?? 150) * s;    // 절점 클러스터 반경
  const lineWalls = walls.filter((w) => (w.shape === 'line' || !w.shape) && w.coordinates.length >= 2);
  const ends = (w: StructureLineData) => w.coordinates;
  let extended = 0, snappedCol = 0;

  // 1) 끝점 → 가까운 기둥 중심 스냅 (기둥 = 강한 절점). 스냅된 끝점은 잠금.
  const lockedPos = new Map<string, Point2D>();
  lineWalls.forEach((w, wi) => {
    const c = ends(w);
    for (let ei = 0; ei < 2; ei++) {
      const p = c[ei];
      let best = -1, bestD = Infinity;
      columns.forEach((col, ci) => {
        const tol = Math.max(col.w, col.h) / 2 + NODE;
        const d = Math.hypot(col.cx - p.x, col.cy - p.y);
        if (d <= tol && d < bestD) { bestD = d; best = ci; }
      });
      if (best >= 0) {
        const col = columns[best];
        c[ei] = { x: col.cx, y: col.cy };
        lockedPos.set(`${wi}:${ei}`, { x: col.cx, y: col.cy });
        snappedCol++;
      }
    }
  });

  // 2) 끝점 → 다른 축선과의 교점으로 extend/trim (L/T/+ 접합). 잠긴 끝점은 제외.
  lineWalls.forEach((w, wi) => {
    const c = ends(w);
    for (let ei = 0; ei < 2; ei++) {
      if (lockedPos.has(`${wi}:${ei}`)) continue;
      const E = c[ei], F = c[1 - ei];
      const angW = getAngle(E, F);
      let bestX: Point2D | null = null, bestD = Infinity;
      lineWalls.forEach((v, vi) => {
        if (vi === wi) return;
        const vc = ends(v);
        let ad = Math.abs(angW - getAngle(vc[0], vc[1])); if (ad > Math.PI / 2) ad = Math.PI - ad;
        if (ad < 0.15) return; // 거의 평행 → 동일선상 병합이 담당
        const X = lineIntersect(E, F, vc[0], vc[1]);
        if (!X) return;
        const dE = Math.hypot(X.x - E.x, X.y - E.y);
        if (dE > EXT || dE >= bestD) return;             // 연장거리 한계 / 더 가까운 후보 우선
        if (Math.hypot(X.x - F.x, X.y - F.y) <= dE) return; // X가 E쪽이어야(반대끝 넘어가면 제외)
        const lenV = getDistance(vc[0], vc[1]) || 1;
        const u = projParam(X, vc[0], vc[1]);
        const slack = EXT / lenV;
        if (u < -slack || u > 1 + slack) return;          // X가 상대 축선 몸통/근처에 있어야
        bestD = dE; bestX = { x: X.x, y: X.y };
      });
      if (bestX) { c[ei] = bestX; extended++; }
    }
  });

  // 3) 끝점 클러스터 → 절점. 기둥에 잠긴 끝점이 포함되면 그 중심을 절점 위치로 고정.
  type EP = { wi: number; ei: number };
  const eps: EP[] = [];
  lineWalls.forEach((_, wi) => { eps.push({ wi, ei: 0 }, { wi, ei: 1 }); });
  const pos = (e: EP) => ends(lineWalls[e.wi])[e.ei];
  const m = eps.length;
  const parent = Array.from({ length: m }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
    const pi = pos(eps[i]), pj = pos(eps[j]);
    if (Math.hypot(pi.x - pj.x, pi.y - pj.y) <= NODE) parent[find(i)] = find(j);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < m; i++) { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); }
  let nodeId = 0, nodes = 0;
  for (const idxs of groups.values()) {
    let np: Point2D | null = null;
    for (const i of idxs) { const lp = lockedPos.get(`${eps[i].wi}:${eps[i].ei}`); if (lp) { np = lp; break; } }
    if (!np) np = { x: idxs.reduce((a, i) => a + pos(eps[i]).x, 0) / idxs.length, y: idxs.reduce((a, i) => a + pos(eps[i]).y, 0) / idxs.length };
    const nid = `n${nodeId++}`;
    if (idxs.length >= 2) nodes++;
    for (const i of idxs) {
      const w = lineWalls[eps[i].wi];
      w.coordinates[eps[i].ei] = { x: np.x, y: np.y };
      w.properties = { ...(w.properties || {}), [eps[i].ei === 0 ? 'n0' : 'n1']: nid };
    }
  }
  return { extended, snappedCol, nodes };
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

  const avgThickMm = (idxs: number[]): number | undefined => {
    const vals = idxs.map((i) => lines[i].properties?.thickness_mm).filter((v) => typeof v === 'number') as number[];
    return vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : undefined;
  };

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
    const base = lines[dirI];
    merged.push({
      id: `${base.type === 'WALL' ? 'wall' : 'center'}_${Date.now().toString(36)}_m${merged.length}`,
      source: 'CAD', type: base.type, shape: 'line',
      coordinates: [loP, hiP], thickness: base.thickness ?? 2,
      properties: { ...(base.properties || {}), merged: idxs.length, thickness_mm: avgThickMm(idxs) ?? base.properties?.thickness_mm },
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
