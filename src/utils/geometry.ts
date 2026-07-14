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
export const classifyLayer = (name: string): StructureType | null => {
  const u = (name || '').toUpperCase();
  if (/MASONRY|조적|벽돌|BRICK|磚|砌/.test(u)) return null;
  // 부정 키워드: 철근/치수/주석/해치/표제란/상세도 등 = 도형이 아닌 레이어. 부재 키워드보다 먼저 판정해
  //   柱钢筋(기둥철근)·柱尺寸(치수)·墙编号(벽번호)·梁集中标注(보주석) 같은 파생 레이어가 부재로 오분류되는 것 방지.
  //   (중국 시공도 세트는 한 도면에 철근도·상세도·표까지 섞여 있어 이 필터가 노이즈를 크게 줄임)
  if (/钢筋|鋼筋|配筋|筋|尺寸|标注|標註|标高|標高|文字|文本|中文|说明|說明|编号|編號|符号|符號|图号|圖號|图签|圖簽|图名|圖名|签名|簽名|填充|详图|詳圖|虚线|虛線|洞|钢筋表|表|철근|치수|문자|텍스트|해치|HATCH|\bTEXT\b|TEXT$|\bDIM\b|DIM_|\bNUM\b|NUM_|REIN|REBAR|DOTE|ELEV/.test(u)) return null;
  // 边缘构件/約束邊緣 = 전단벽 단부기둥(concealed/boundary column) → 기둥으로 취급(暗柱은 柱로 이미 매칭).
  if (/COL|기둥|柱|边缘构件|邊緣構件|約束邊緣|约束边缘/.test(u)) return 'COLUMN';
  if (/BEAM|GIRDER|보|梁|桁|大梁|小梁/.test(u)) return 'BEAM'; // 벽보다 먼저(RC_BEAM 등이 WALL로 오분류 방지)
  if (/WALL|옹벽|벽|墙|牆|RC|SHEAR/.test(u)) return 'WALL';
  return null;
};
// ── 평법(平法) 집중표주 파싱: "KL(1) 200X400" = 부호(KL) + 경간수(1) + 폭×춤(200×400) ──
// 중국/대만 구조도의 표준 보 표기. 설계자가 명시한 값이라 기하 측정보다 정확하고,
// 평면도 기하로는 절대 얻을 수 없는 '춤(depth)'을 준다(MIDAS 보 단면에 필수).
// 부호 예: KL=框架梁, L=次梁, LL=连梁, LLK=连梁(框架), KZL=框支梁, WKL=屋面框架梁, XL=悬挑梁.
// 철근/스터럽 표기("8@100/200(2)", "214;216")는 숫자로 시작하거나 형식이 달라 매칭되지 않는다.
export interface BeamLabel { mark: string; spans: string; width: number; depth: number; }
const BEAM_LABEL_RE = /^\s*([A-Z]{1,4}[A-Z0-9\-]*)\s*\(\s*(\d+[AB]?)\s*\)\s*(\d{2,4})\s*[xX×*]\s*(\d{2,4})/;
export const parseBeamLabel = (text: string): BeamLabel | null => {
  const m = BEAM_LABEL_RE.exec((text || '').trim());
  if (!m) return null;
  return { mark: m[1], spans: m[2], width: +m[3], depth: +m[4] };
};

// 통심선(축/그리드) 레이어 — CEN(centerline), 통심선/通芯/通り芯 등 관례 포함. 轴=간체·軸=번체 모두.
const isAxisLayer = (name: string): boolean => /AXIS|AXN|GRID|CEN|축|통|軸|轴|通|网/i.test(name || '');
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
    // 최소 길이 10px: 거대 도면 전체를 캔버스에 맞추면 축선이 짧아져 과거 임계(20)에 걸려 그리드가 0이 되던 문제 완화.
    if (dx < 2 && dy > 10) xs.push((a.x + b.x) / 2);        // 수직 축선 → x 격자
    else if (dy < 2 && dx > 10) ys.push((a.y + b.y) / 2);   // 수평 축선 → y 격자
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
    const cls = resolveLayer(e.layer);
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

// ── 두께 양자화 프리셋 (지역별 표준 부재두께, mm) ──
// 측정값을 가장 가까운 표준값으로 스냅(허용오차 내). 'raw'면 끔(측정+5mm반올림 유지).
export type ThicknessProfile = 'raw' | 'TW-Standard' | 'KR-Standard';
export const THICKNESS_PRESETS: Record<string, number[]> = {
  'TW-Standard': [120, 150, 180, 200, 240, 250, 300, 400], // 대만/동남아 RC
  'KR-Standard': [150, 200, 250, 300, 350, 400],
};
const quantizeTo = (mm: number, table: number[], tolMm: number): number => {
  if (!table || !table.length) return mm;
  const n = table.reduce((b, v) => (Math.abs(v - mm) < Math.abs(b - mm) ? v : b));
  return Math.abs(n - mm) <= tolMm ? n : mm;
};

// ── 면쌍 매칭: 근평행 + 두께범위 + 길이중첩인 두 면선 → 중심 축선 + 수직두께(px) ──
interface Face { a: Point2D; b: Point2D; }

// 동일선상으로 조각난 면선들을 하나의 긴 면선으로 병합 (CAD가 교차부/개구부에서 끊어 그린 것 복원).
// 매칭 '전'에 적용 → 짧은 조각들이 짝을 못 찾아 버려지던 문제 완화. perpTol < 최소 벽두께라 마주보는 면은 안 합쳐짐.
const mergeCollinearFaces = (faces: Face[], perpTol: number, gapTol: number, angleTol = 0.06): Face[] => {
  const n = faces.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    const A = faces[i], angA = getAngle(A.a, A.b);
    for (let j = i + 1; j < n; j++) {
      const B = faces[j];
      let ad = Math.abs(angA - getAngle(B.a, B.b)); if (ad > Math.PI / 2) ad = Math.PI - ad;
      if (ad > angleTol) continue;
      if (getDistance(B.a, perpFoot(B.a, A.a, A.b)) > perpTol) continue; // 동일선상(수직거리≈0)
      if (getDistance(B.b, perpFoot(B.b, A.a, A.b)) > perpTol) continue;
      const L = getDistance(A.a, A.b) || 1;
      const t1 = projParam(B.a, A.a, A.b), t2 = projParam(B.b, A.a, A.b);
      const gap = Math.max(Math.min(t1, t2) - 1, 0 - Math.max(t1, t2)) * L; // 음수=겹침
      if (gap > gapTol) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); }
  const out: Face[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length === 1) { out.push(faces[idxs[0]]); continue; }
    let dirI = idxs[0], dl = -1;
    for (const i of idxs) { const l = getDistance(faces[i].a, faces[i].b); if (l > dl) { dl = l; dirI = i; } }
    const D = faces[dirI];
    let lo = Infinity, hi = -Infinity, loP = D.a, hiP = D.b;
    for (const i of idxs) for (const p of [faces[i].a, faces[i].b]) {
      const tt = projParam(p, D.a, D.b), foot = perpFoot(p, D.a, D.b);
      if (tt < lo) { lo = tt; loP = foot; } if (tt > hi) { hi = tt; hiP = foot; }
    }
    out.push({ a: loP, b: hiP });
  }
  return out;
};
const pairFaces = (
  faces: Face[], minPx: number, maxPx: number,
): { axes: { p1: Point2D; p2: Point2D; thickPx: number }[]; unpaired: number; used: Set<number> } => {
  const n = faces.length;
  const angle = faces.map((f) => getAngle(f.a, f.b));
  const mid = faces.map((f) => getMidpoint(f.a, f.b));
  // i가 j를 면쌍 파트너로 볼 때의 수직거리(=두께). 평행·두께범위·길이중첩 아니면 Infinity.
  const pairD = (i: number, j: number): number => {
    let ad = Math.abs(angle[i] - angle[j]); if (ad > Math.PI / 2) ad = Math.PI - ad;
    if (ad > 0.08) return Infinity;
    const A = faces[i], B = faces[j];
    const d = getDistance(mid[i], perpFoot(mid[i], B.a, B.b));
    if (d < minPx || d > maxPx) return Infinity;
    const t1 = projParam(A.a, B.a, B.b), t2 = projParam(A.b, B.a, B.b);
    const ov = Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0);
    return ov <= 0.05 ? Infinity : d;
  };
  const used = new Array(n).fill(false);
  const axes: { p1: Point2D; p2: Point2D; thickPx: number }[] = [];
  const mkAxis = (i: number, j: number, d: number) => {
    used[i] = used[j] = true;
    const A = faces[i], B = faces[j];
    axes.push({ p1: getMidpoint(A.a, perpFoot(A.a, B.a, B.b)), p2: getMidpoint(A.b, perpFoot(A.b, B.a, B.b)), thickPx: d });
  };

  // 1) 상호 최근접(mutual-nearest) 반복: 서로가 서로의 가장 가까운 파트너일 때만 짝지어
  //    이웃 벽으로 잘못 짝지어 연쇄적으로 누락되던 문제 해결.
  let changed = true;
  while (changed) {
    changed = false;
    const best = new Array(n).fill(-1), bestD = new Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      for (let j = 0; j < n; j++) {
        if (j === i || used[j]) continue;
        const d = pairD(i, j); if (d < bestD[i]) { bestD[i] = d; best[i] = j; }
      }
    }
    for (let i = 0; i < n; i++) {
      if (used[i] || best[i] < 0) continue;
      const j = best[i];
      if (!used[j] && best[j] === i) { mkAxis(i, j, bestD[i]); changed = true; }
    }
  }
  // 2) 잔여 그리디: 아직 안 짝지은 면을 가장 가까운 파트너와 (커버리지 보강)
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    let bj = -1, bd = Infinity;
    for (let j = 0; j < n; j++) { if (j === i || used[j]) continue; const d = pairD(i, j); if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) mkAxis(i, bj, bd);
  }
  const usedSet = new Set<number>(); let unpaired = 0;
  for (let i = 0; i < n; i++) { if (used[i]) usedSet.add(i); else unpaired++; }
  return { axes, unpaired, used: usedSet };
};

// ── P1: 정밀 구조모델 추출 (벽=축선+두께, 기둥=gridRef+단면) ──
export interface StructModelResult {
  members: StructureLineData[];
  grid: GridLabeled;
  counts: {
    wallAxes: number; columns: number; columnsTagged: number; unpairedFaces: number;
    nodes: number; extended: number; snappedCol: number; wallsLabeled: number; beams: number;
    quantized: number; beamsLabeled: number;
  };
}

export const extractStructuralModel = (
  entities: any[],
  layers: { name: string; visible: boolean }[],
  t: DxfTransform,
  opts?: { wallMinMm?: number; wallMaxMm?: number; beamMinMm?: number; beamMaxMm?: number; topology?: boolean; extendMm?: number; nodeMm?: number; thicknessProfile?: ThicknessProfile; layerTypeOverrides?: Record<string, StructureType | 'EXCLUDE'>; lineLayerIncludes?: Record<string, boolean> },
): StructModelResult => {
  const visible = new Map(layers.map((l) => [l.name, l.visible]));
  const overrides = opts?.layerTypeOverrides ?? {};
  const lineIncludes = opts?.lineLayerIncludes ?? {};
  const resolveLayer = (name: string): StructureType | null => {
    const ov = overrides[name];
    if (ov === 'EXCLUDE') return null;
    if (ov) return ov as StructureType;
    return classifyLayer(name);
  };
  const tx = (x: number) => t.pad + (x - t.minX) * t.scale;
  const ty = (y: number) => t.pad + (t.maxY - y) * t.scale;
  const scale = t.scale || 1;
  const toMm = (px: number) => px / scale;
  const round5 = (mm: number) => Math.round(mm / 5) * 5;
  const minPx = (opts?.wallMinMm ?? 60) * scale;
  const maxPx = (opts?.wallMaxMm ?? 800) * scale; // 지하 옹벽 등 두꺼운 벽 포함
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

  // 엔티티 수집: 벽 면선(px), 보 면선(px), 기둥 최소면적사각형(px, 회전 포함)
  const faces: Face[] = [];
  const beamFaces: Face[] = [];
  type Col = { cx: number; cy: number; w: number; h: number; deg: number; layer: string };
  const cols: Col[] = [];
  for (const e of entities) {
    const cls = resolveLayer(e.layer);
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
    const target = cls === 'BEAM' ? beamFaces : faces;
    const add = (p1: Point2D, p2: Point2D) => target.push({ a: { x: tx(p1.x), y: ty(p1.y) }, b: { x: tx(p2.x), y: ty(p2.y) } });
    if (et === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2) add(e.vertices[0], e.vertices[1]);
    else if ((et === 'LWPOLYLINE' || et === 'POLYLINE') && Array.isArray(e.vertices) && e.vertices.length >= 2) {
      for (let i = 0; i < e.vertices.length - 1; i++) add(e.vertices[i], e.vertices[i + 1]);
      if (e.shape === true || e.closed === true) add(e.vertices[e.vertices.length - 1], e.vertices[0]);
    }
  }

  // LINE 엔티티 클러스터링 — 일부 DWG는 기둥을 닫힌 LWPOLYLINE 대신 LINE 여러 개로 표현함.
  // 끝점이 가까운 LINE들을 연결 컴포넌트로 묶고 전체 꼭짓점에 minAreaRect 적용.
  // 기둥으로 분류된 레이어에 LINE 엔티티가 있으면 자동 클러스터링(중국 PKPM/YJK 관례: COLU_BR 등 4선 사각형 기둥).
  // 닫힌 폴리라인 기둥은 위 메인 루프에서 이미 rect로 처리됨 → 여기선 LINE만 대상이라 중복 없음.
  // 사용자가 명시적으로 끈 레이어(lineIncludes[layer]===false)만 제외.
  const colLineLayers = new Set<string>();
  for (const e of entities) {
    if ((e.type || '').toUpperCase() !== 'LINE') continue;
    if (resolveLayer(e.layer) !== 'COLUMN') continue;
    if (visible.get(e.layer) === false) continue;
    if (lineIncludes[e.layer] === false) continue;
    colLineLayers.add(e.layer);
  }
  for (const layerName of colLineLayers) {
    const lineEnts = entities.filter((e) => e.layer === layerName && (e.type || '').toUpperCase() === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2);
    if (!lineEnts.length) continue;

    // 끝점 union-find 클러스터링 (5mm 허용오차)
    const TOL_W = 5; // world mm
    const allPts: { x: number; y: number }[] = [];
    const linePtIdx: [number, number][] = [];
    for (const e of lineEnts) {
      const [s, en] = e.vertices as { x: number; y: number }[];
      linePtIdx.push([allPts.length, allPts.length + 1]);
      allPts.push({ x: s.x, y: s.y }, { x: en.x, y: en.y });
    }
    const parent = allPts.map((_, i) => i);
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    // 1) 근접 끝점 병합
    for (let i = 0; i < allPts.length; i++)
      for (let j = i + 1; j < allPts.length; j++) {
        const dx = allPts[i].x - allPts[j].x, dy = allPts[i].y - allPts[j].y;
        if (dx * dx + dy * dy < TOL_W * TOL_W) union(i, j);
      }
    // 2) 같은 LINE의 두 끝점도 합침 — L자형에서 한 선이 두 클러스터로 분리되는 버그 방지
    for (const [si, ei] of linePtIdx) union(si, ei);

    // 클러스터별 꼭짓점 수집
    const clusters = new Map<number, Set<number>>();
    for (let li = 0; li < lineEnts.length; li++) {
      const [si] = linePtIdx[li];
      const root = find(si);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root)!.add(li);
    }

    for (const lineIdxSet of clusters.values()) {
      // 해당 클러스터의 모든 꼭짓점 수집 (중복 제거)
      const seen = new Set<string>();
      const pts: { x: number; y: number }[] = [];
      for (const li of lineIdxSet) {
        for (const pt of lineEnts[li].vertices as { x: number; y: number }[]) {
          const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
          if (!seen.has(key)) { seen.add(key); pts.push(pt); }
        }
      }
      if (pts.length < 2) continue;
      const r = minAreaRect(pts.map((p) => ({ x: tx(p.x), y: ty(p.y) })));
      if (!r || r.w < 1e-6 || r.h < 1e-6) continue;
      cols.push({ cx: r.cx, cy: r.cy, w: r.w, h: r.h, deg: r.deg, layer: layerName });
    }
  }

  // 벽 면쌍 → 축선 + 두께(mm). 매칭 전 동일선상 조각 병합(커버리지↑).
  // perpTol = '같은 직선의 조각인가' 판정용이라 월드(mm) 기준이어야 하고, 반드시 최소 부재두께보다 작아야 한다
  //   (안 그러면 부재의 '마주보는 두 면'까지 한 면으로 합쳐져 두께/폭 측정이 망가짐).
  // ⚠️ 과거 px 바닥값 `Math.max(2, …)`은 작은 scale(거대 도면)에서 2px=400mm+로 폭주해 이 불변식을 깼다:
  //   200mm 보의 두 면(0.95px)이 병합돼 엉뚱한 상대와 짝지어져 폭이 440/500/1000으로 측정됨.
  const fMergePerp = Math.max(30 * scale, 0.02), fMergeGap = 400 * scale;
  const wallFaces = mergeCollinearFaces(faces, fMergePerp, fMergeGap);
  const wp = pairFaces(wallFaces, minPx, maxPx);
  const rawAxes: StructureLineData[] = wp.axes.map((ax) => ({
    id: nid('wall'), source: 'CAD', type: 'WALL', shape: 'line',
    coordinates: [ax.p1, ax.p2],
    thickness: 2, properties: { fromCad: true, isAxis: true, thickness_mm: round5(toMm(ax.thickPx)) },
  }));

  // 단일선 벽 회복: 짝 못 찾은 '긴' 면선 중 기존 축선에 안 덮인 것 → 중심선으로 채택(기본두께=측정 중앙값).
  // 이미 추출된 벽의 반대 면(축선에서 ~두께만큼 떨어진 면)은 '덮임'으로 보고 제외해 중복 방지.
  const medThickPx = (() => { const v = wp.axes.map((a) => a.thickPx).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 200 * scale; })();
  const minSinglePx = 500 * scale; // 0.5m 미만은 노이즈로 간주
  // 이 면이 [minPx,maxPx] 내 평행·중첩 파트너를 가지는가 = 이중선 벽의 한 면 (단일선으로 오인 금지)
  const hasPartner = (idx: number): boolean => {
    const F = wallFaces[idx], fa = getAngle(F.a, F.b), fm = getMidpoint(F.a, F.b);
    for (let j = 0; j < wallFaces.length; j++) {
      if (j === idx) continue; const B = wallFaces[j];
      let ad = Math.abs(fa - getAngle(B.a, B.b)); if (ad > Math.PI / 2) ad = Math.PI - ad;
      if (ad > 0.08) continue;
      const d = getDistance(fm, perpFoot(fm, B.a, B.b)); if (d < minPx || d > maxPx) continue;
      const t1 = projParam(F.a, B.a, B.b), t2 = projParam(F.b, B.a, B.b);
      if ((Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0)) > 0.05) return true;
    }
    return false;
  };
  const coveredByAxis = (F: Face): boolean => {
    const fa = getAngle(F.a, F.b), fm = getMidpoint(F.a, F.b);
    return rawAxes.some((ax) => {
      const A = ax.coordinates[0], B = ax.coordinates[1];
      let ad = Math.abs(fa - getAngle(A, B)); if (ad > Math.PI / 2) ad = Math.PI - ad;
      if (ad > 0.1) return false;
      if (getDistance(fm, perpFoot(fm, A, B)) > maxPx) return false; // 두께 범위 내 = 그 벽의 면
      const t1 = projParam(F.a, A, B), t2 = projParam(F.b, A, B);
      return (Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0)) > 0.3;
    });
  };
  let singleLine = 0;
  for (let i = 0; i < wallFaces.length; i++) {
    if (wp.used.has(i)) continue;
    const F = wallFaces[i];
    if (getDistance(F.a, F.b) < minSinglePx) continue;
    if (hasPartner(i)) continue;   // 이중선 벽의 면 → 단일선으로 추가 금지(중복 방지)
    if (coveredByAxis(F)) continue;
    rawAxes.push({
      id: nid('wall'), source: 'CAD', type: 'WALL', shape: 'line',
      coordinates: [F.a, F.b],
      thickness: 2, properties: { fromCad: true, isAxis: true, singleLine: true, thickness_mm: round5(toMm(medThickPx)) },
    });
    singleLine++;
  }
  let unpaired = wp.unpaired - singleLine;
  // 병합 갭에 월드(mm) 상한: 작은 scale(거대 도면)에서 px 바닥값(30)이 수십~수백 m로 폭주해
  //   평면 간 동일선상 조각들이 하나로 병합되던 문제 방지. 정상 스케일에선 좌측값이 작아 상한 미적용(무회귀).
  const gapCap = 20000 * scale; // 20m 초과 갭은 같은 부재로 안 봄
  const wallAxes = mergeCollinearLines(rawAxes, Math.max(4, maxPx * 0.5), Math.min(Math.max(30, maxPx * 8), gapCap));

  // 보: 이중선(면쌍)→축선+폭, 짝 없는 보선→단일 중심선(플래그). 보 폭 범위는 벽보다 넓게.
  const beamMinPx = (opts?.beamMinMm ?? 150) * scale;
  const beamMaxPx = (opts?.beamMaxMm ?? 1200) * scale;
  const beamFacesM = mergeCollinearFaces(beamFaces, fMergePerp, fMergeGap);
  const bp = pairFaces(beamFacesM, beamMinPx, beamMaxPx);
  const rawBeams: StructureLineData[] = bp.axes.map((ax) => ({
    id: nid('beam'), source: 'CAD', type: 'BEAM', shape: 'line',
    coordinates: [ax.p1, ax.p2],
    thickness: 2, properties: { fromCad: true, isAxis: true, width_mm: round5(toMm(ax.thickPx)) },
  }));
  // 단일선 보의 폭 기본값 = 이 도면에서 실측된 이중선 보 폭의 중앙값(없으면 300).
  //   고정 300 대신 도면 실제 보 크기에 맞춰 추정 → 스팬 폭 일관성↑ (벽의 medThickPx와 동일 접근).
  const medBeamWidthMm = (() => {
    const v = bp.axes.map((a) => toMm(a.thickPx)).sort((a, b) => a - b);
    return v.length ? round5(v[Math.floor(v.length / 2)]) : 300;
  })();
  for (let i = 0; i < beamFacesM.length; i++) {
    if (bp.used.has(i)) continue; // 단일선 보 = 중심선 직접 사용
    const F = beamFacesM[i];
    rawBeams.push({
      id: nid('beam'), source: 'CAD', type: 'BEAM', shape: 'line',
      coordinates: [F.a, F.b],
      thickness: 2, properties: { fromCad: true, isAxis: true, singleLine: true, width_mm: medBeamWidthMm, widthEstimated: true },
    });
  }
  const beams = rawBeams.length ? mergeCollinearLines(rawBeams, Math.max(4, beamMaxPx * 0.5), Math.min(Math.max(30, beamMaxPx * 8), gapCap)) : [];

  // ── 평법 집중표주(라벨) → 보 부호·단면 부여 ──
  // 라벨 텍스트는 설계 명시값이라 면쌍 측정보다 정확하고, 춤(depth)까지 준다.
  // 라벨 레이어명이 관례마다 달라(예: 벽부호 Q-5가 '梁集中标注'에 섞임) 레이어로 거르지 않고
  // 모든 TEXT를 파싱 규칙으로 판별한다. 주석 레이어는 자동필터로 숨겨져도 읽는다(그리드와 동일 방침).
  // 분할(splitLinesAtColumns/splitWallsAtJunctions) '전'에 부여 → 분할 조각들이 속성을 그대로 상속.
  let beamsLabeled = 0;
  if (beams.length) {
    const marks: { L: BeamLabel; cx: number; cy: number }[] = [];
    for (const e of entities) {
      const et = (e.type || '').toUpperCase();
      if (et !== 'TEXT' && et !== 'MTEXT') continue;
      const L = parseBeamLabel(cleanText(e.text));
      if (!L) continue;
      const pos = e.startPoint || e.position;
      if (!pos) continue;
      marks.push({ L, cx: tx(pos.x), cy: ty(pos.y) });
    }
    const LTOL = 1500 * scale; // 집중표주는 보 바로 옆/위에 배치됨
    for (const bm of beams) {
      const A = bm.coordinates[0], B = bm.coordinates[1];
      if (!A || !B) continue;
      let best: BeamLabel | null = null, bestD = LTOL;
      for (const mk of marks) {
        const P = { x: mk.cx, y: mk.cy };
        const t = Math.max(0, Math.min(1, projParam(P, A, B)));
        const d = getDistance(P, { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
        if (d < bestD) { bestD = d; best = mk.L; }
      }
      if (best) {
        // 기하 측정값은 보존 → 라벨(정답)과 대조해 면쌍 매칭 품질을 검증할 수 있게 한다.
        const measured = bm.properties?.widthEstimated ? undefined : bm.properties?.width_mm;
        bm.properties = {
          ...(bm.properties || {}),
          mark: best.mark, width_mm: best.width, depth_mm: best.depth, fromLabel: true,
          ...(typeof measured === 'number' ? { width_measured_mm: measured } : {}),
        };
        delete (bm.properties as any).widthEstimated;
        beamsLabeled++;
      }
    }
  }

  // 두께 양자화(프리셋): 측정값을 지역 표준치로 스냅. 원본은 *_measured_mm 로 보존. (raw면 끔)
  const profile = opts?.thicknessProfile ?? 'raw';
  const presetTable = THICKNESS_PRESETS[profile];
  let quantized = 0;
  if (presetTable) {
    const QTOL = 50; // mm
    for (const w of wallAxes) {
      const m = w.properties?.thickness_mm; if (typeof m !== 'number') continue;
      const q = quantizeTo(m, presetTable, QTOL);
      if (q !== m) { w.properties = { ...w.properties, thickness_mm: q, thickness_measured_mm: m }; quantized++; }
    }
    for (const bm of beams) {
      if (bm.properties?.fromLabel) continue; // 라벨값 = 설계 명시값 → 양자화(스냅) 금지
      const m = bm.properties?.width_mm; if (typeof m !== 'number') continue;
      const q = quantizeTo(m, presetTable, QTOL);
      if (q !== m) { bm.properties = { ...bm.properties, width_mm: q, width_measured_mm: m }; quantized++; }
    }
  }

  // 기둥: 그리드 스냅 + 중복 제거 + gridRef/단면(mm)
  // ⚠️ mm 기반(scale 환산). 과거 px 고정값(20/10)은 축척에 따라 1m+로 과도 스냅돼 기둥을 오배치시켰음.
  const SNAP = 150 * scale, DEDUP = 120 * scale; // 그리드 근접(≤150mm)만 스냅, 중복(≤120mm)만 병합
  const xpos = xs.map((o) => o.pos), ypos = ys.map((o) => o.pos);
  for (const c of cols) {
    if (xpos.length) { const n = nearest(c.cx, xpos); if (n.dist <= SNAP) c.cx = n.val; }
    if (ypos.length) { const n = nearest(c.cy, ypos); if (n.dist <= SNAP) c.cy = n.val; }
  }
  // 기둥 타당성 필터: 벽구간·철근·치수선이 기둥으로 오인되는 것 차단. 단면(mm)으로 판정.
  //   · 최대변 > 3000mm = 기둥이 아니라 벽/전단벽 구간(边缘构件의 긴 것, tracing 800x4200 등)
  //   · 종횡비 > 6 = 가늘고 긴 선형 = 기둥 아님
  //   · 최소변 < 50mm = 단선/철근 조각 노이즈
  const plausibleCol = (c: { w: number; h: number }): boolean => {
    const wmm = toMm(c.w), hmm = toMm(c.h);
    const lo = Math.min(wmm, hmm), hi = Math.max(wmm, hmm);
    return hi <= 3000 && lo >= 50 && hi / Math.max(lo, 1) <= 6;
  };
  const kept: Col[] = [];
  for (const c of cols) {
    if (!plausibleCol(c)) continue;
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

  // T자 접합 절점화: 벽 끝점이 다른 벽 몸통에 닿으면 분할+스냅 → 접합부 좌표 공유(그래프/MIDAS 연결 완성)
  const wallsFinal = opts?.topology === false ? wallAxes : splitWallsAtJunctions(wallAxes, 220 * scale);

  // 보 절점 분할: (1) 기둥을 지나는 보를 기둥 중심에서 끊어 분할점=기둥 중심 → 절점 공유(보-기둥 연결),
  //   (2) 보-보 T자 접합 분할. 결과: 보가 그리드선 따라 한 덩어리로 병합돼 있던 것이 기둥/교차점 단위 스팬으로.
  const beamsFinal = opts?.topology === false ? beams
    : splitWallsAtJunctions(splitLinesAtColumns(beams, kept, 200 * scale), 220 * scale);

  const members: StructureLineData[] = [...wallsFinal, ...beamsFinal];
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
      wallAxes: wallsFinal.length, columns: kept.length, columnsTagged: tagged, unpairedFaces: unpaired,
      nodes: topo.nodes, extended: topo.extended, snappedCol: topo.snappedCol, wallsLabeled, beams: beams.length,
      quantized, beamsLabeled,
    },
  };
};

// ── T자 접합 절점화: 벽 끝점이 다른 벽 몸통(내부)에 닿으면 그 벽을 접합점에서 분할 + 끝점 스냅 ──
// 결과: 접합부에서 좌표가 공유돼 평면도 그래프·MIDAS 절점 연결이 완성됨. 새 벽 배열을 반환.
export const splitWallsAtJunctions = (walls: StructureLineData[], tol: number): StructureLineData[] => {
  const n = walls.length;
  const seg = (w: StructureLineData) => [w.coordinates[0], w.coordinates[1]] as [Point2D, Point2D];
  const cuts: number[][] = walls.map(() => []); // 벽별 분할 파라미터 t
  // 1) 각 벽 끝점을 가장 가까운 '다른 벽 내부'에 스냅하고, 그 벽에 분할점 기록
  for (let wi = 0; wi < n; wi++) {
    for (let ei = 0; ei < 2; ei++) {
      const E = walls[wi].coordinates[ei];
      let best = -1, bestD = tol, foot: Point2D | null = null;
      for (let j = 0; j < n; j++) {
        if (j === wi) continue;
        const [A, B] = seg(walls[j]);
        if (getDistance(E, A) < tol || getDistance(E, B) < tol) continue; // 끝점 근처는 코너(클러스터가 처리)
        const f = perpFoot(E, A, B); const d = getDistance(E, f);
        if (d >= bestD) continue;
        const t = projParam(E, A, B); if (t < 0.04 || t > 0.96) continue; // 내부만 = T자
        best = j; bestD = d; foot = f;
      }
      if (best >= 0 && foot) {
        walls[wi].coordinates[ei] = { x: foot.x, y: foot.y }; // 가지 끝점을 관통벽 위로 스냅
        cuts[best].push(projParam(foot, seg(walls[best])[0], seg(walls[best])[1]));
      }
    }
  }
  // 2) 기록된 분할점에서 관통벽을 분할
  const out: StructureLineData[] = [];
  for (let wi = 0; wi < n; wi++) {
    const [A, B] = seg(walls[wi]);
    const ts = [...new Set(cuts[wi].map((t) => Math.round(t * 1000) / 1000))].filter((t) => t > 0.01 && t < 0.99).sort((a, b) => a - b);
    if (!ts.length) { out.push(walls[wi]); continue; }
    const params = [0, ...ts, 1];
    for (let k = 0; k < params.length - 1; k++) {
      const at = (t: number): Point2D => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
      out.push({ ...walls[wi], id: `${walls[wi].id}_s${k}`, coordinates: [at(params[k]), at(params[k + 1])] });
    }
  }
  return out;
};

// ── 보를 기둥 중심에서 분할: 기둥을 관통하는 보 중심선을 기둥 위치에서 끊는다.
//    분할점은 기둥 '중심' 좌표로 스냅 → buildStructuralModel 절점 병합이 기둥 절점과 정확히 공유(보-기둥 연결).
const splitLinesAtColumns = (
  lines: StructureLineData[],
  cols: { cx: number; cy: number; w: number; h: number }[],
  tol: number,
): StructureLineData[] => {
  if (!cols.length) return lines;
  const out: StructureLineData[] = [];
  for (const L of lines) {
    const A = L.coordinates[0], B = L.coordinates[1];
    if (!A || !B || getDistance(A, B) < 1e-6) { out.push(L); continue; }
    const cuts: { t: number; p: Point2D }[] = [];
    for (const c of cols) {
      const P = { x: c.cx, y: c.cy };
      const f = perpFoot(P, A, B);
      if (getDistance(P, f) > Math.max(c.w, c.h) / 2 + tol) continue; // 보 중심선이 기둥 footprint를 지나는가
      const t = projParam(P, A, B);
      if (t > 0.02 && t < 0.98) cuts.push({ t, p: P }); // 내부만(끝점 근처는 이미 절점)
    }
    if (!cuts.length) { out.push(L); continue; }
    cuts.sort((a, b) => a.t - b.t);
    const pts: Point2D[] = [A];
    let lastT = 0;
    for (const c of cuts) { if (c.t - lastT > 0.02) { pts.push(c.p); lastT = c.t; } } // 근접 분할점 중복 제거
    pts.push(B);
    for (let k = 0; k < pts.length - 1; k++) {
      if (getDistance(pts[k], pts[k + 1]) < 1e-6) continue;
      out.push({ ...L, id: `${L.id}_bc${k}`, coordinates: [pts[k], pts[k + 1]] });
    }
  }
  return out;
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
