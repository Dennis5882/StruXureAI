import { StructureLineData, Point2D, StructureType } from '../types/drawing';
import { DxfTransform } from '../store/useDrawingStore';

// ── 벡터 헬퍼 ──────────────────────────────────────────────
const getDistance = (p1: Point2D, p2: Point2D) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
const getAngle = (p1: Point2D, p2: Point2D) => Math.atan2(p2.y - p1.y, p2.x - p1.x);
const getMidpoint = (p1: Point2D, p2: Point2D): Point2D => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
const sub = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point2D, b: Point2D) => a.x * b.x + a.y * b.y;
// 점 p에서 직선 ab에 내린 수선의 발
const perpFoot = (p: Point2D, a: Point2D, b: Point2D): Point2D => {
  const ab = sub(b, a);
  const t = dot(sub(p, a), ab) / (dot(ab, ab) || 1);
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
};
// 점 p를 직선 ab에 투영한 매개변수 (0=a, 1=b)
const projParam = (p: Point2D, a: Point2D, b: Point2D) => {
  const ab = sub(b, a);
  return dot(sub(p, a), ab) / (dot(ab, ab) || 1);
};

// ── 1) DXF → 편집 가능한 구조 부재 추출 ─────────────────────

// 레이어명으로 구조 부재 종류 분류 (대만/동남아/한국 관례 키워드)
// ⚠️ 조적벽(비내력)은 구조 부재에서 제외 (벽 키워드보다 먼저 판정)
const classifyLayer = (name: string): StructureType | null => {
  const u = (name || '').toUpperCase();
  if (/MASONRY|조적|벽돌|BRICK|磚|砌/.test(u)) return null; // 조적/비내력벽 제외
  if (/COL|기둥|柱/.test(u)) return 'COLUMN';
  if (/WALL|옹벽|벽|墙|牆|RC|SHEAR/.test(u)) return 'WALL';
  return null;
};

// 엔티티의 모든 정점(또는 원/호의 바운딩 점)을 DXF 좌표로 수집
const entityPoints = (e: any): Point2D[] => {
  if (Array.isArray(e.vertices) && e.vertices.length) return e.vertices;
  if (e.center && typeof e.radius === 'number')
    return [{ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius }];
  if (e.startPoint && e.endPoint) return [e.startPoint, e.endPoint];
  return [];
};

export interface ExtractResult {
  members: StructureLineData[];
  counts: { wall: number; column: number };
  truncated: boolean;
}

/**
 * 보이는 구조 레이어(벽/기둥)의 DXF 엔티티를 편집 가능한 구조 부재로 변환한다.
 * - 좌표는 화면(캔버스) 좌표로 변환되어 렌더된 도면과 정확히 겹친다.
 * - 벽: LINE/LWPOLYLINE/POLYLINE을 선분 단위로 추출.
 * - 기둥: 외곽 바운딩박스 → 중심점+단면을 가진 사각형 1개로 객체화.
 * - 조적벽(masonry)은 분류 단계에서 제외.
 */
export const extractMembersFromDxf = (
  entities: any[],
  layers: { name: string; visible: boolean }[],
  t: DxfTransform,
  cap: number = 4000,
): ExtractResult => {
  const visible = new Map(layers.map((l) => [l.name, l.visible]));
  const tx = (x: number) => t.pad + (x - t.minX) * t.scale;
  const ty = (y: number) => t.pad + (t.maxY - y) * t.scale; // DXF Y축은 위로 향함 → 반전
  const members: StructureLineData[] = [];
  let wall = 0, column = 0, idc = 0, truncated = false;
  const nid = () => `cad_${Date.now().toString(36)}_${idc++}`;

  const pushSeg = (type: StructureType, a: Point2D, b: Point2D, layer: string) => {
    members.push({
      id: nid(), source: 'CAD', type, shape: 'line',
      coordinates: [{ x: tx(a.x), y: ty(a.y) }, { x: tx(b.x), y: ty(b.y) }],
      thickness: 3, properties: { fromCad: true, layer },
    });
  };

  for (const e of entities) {
    if (members.length >= cap) { truncated = true; break; }
    const cls = classifyLayer(e.layer);
    if (!cls) continue;
    if (visible.get(e.layer) === false) continue; // 숨긴 레이어 제외

    if (cls === 'COLUMN') {
      // 3) 기둥: 외곽 bbox → 중심점+단면(사각형) 하나
      const pts = entityPoints(e);
      if (pts.length < 2) continue;
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; }
      if (mxx - mnx < 1e-6 || mxy - mny < 1e-6) continue; // 면적 없는 건 제외
      members.push({
        id: nid(), source: 'CAD', type: 'COLUMN', shape: 'rect',
        // 캔버스 좌표(Y반전): 좌상단=(minX,maxY), 우하단=(maxX,minY)
        coordinates: [{ x: tx(mnx), y: ty(mxy) }, { x: tx(mxx), y: ty(mny) }],
        thickness: 2, properties: { fromCad: true, layer: e.layer },
      });
      column++;
      continue;
    }

    // 벽: 선분 단위
    const etype = (e.type || '').toUpperCase();
    const before = members.length;
    if (etype === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2) {
      pushSeg(cls, e.vertices[0], e.vertices[1], e.layer);
    } else if ((etype === 'LWPOLYLINE' || etype === 'POLYLINE') && Array.isArray(e.vertices) && e.vertices.length >= 2) {
      for (let i = 0; i < e.vertices.length - 1; i++) pushSeg(cls, e.vertices[i], e.vertices[i + 1], e.layer);
      if (e.shape === true || e.closed === true) pushSeg(cls, e.vertices[e.vertices.length - 1], e.vertices[0], e.layer);
    }
    if (members.length > before) wall++;
  }

  return { members, counts: { wall, column }, truncated };
};

// ── 2) 벽 쌍 → 중심선 자동 생성 ─────────────────────────────
// thickness 범위는 좌표와 같은 단위(px). CAD 추출 벽은 호출부에서 dxfTransform.scale로 환산해 전달.
export const extractCenterLinesFromWalls = (
  lines: StructureLineData[],
  minThickness: number = 100,
  maxThickness: number = 400,
  angleTolerance: number = 0.08,
): StructureLineData[] => {
  const wallLines = lines.filter((l) => l.type === 'WALL' && l.coordinates.length >= 2);
  const centerLines: StructureLineData[] = [];
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

      // 평행 여부
      let angleDiff = Math.abs(angleA - getAngle(b1, b2));
      if (angleDiff > Math.PI / 2) angleDiff = Math.PI - angleDiff;
      if (angleDiff > angleTolerance) continue;

      // 수직(벽 두께) 거리
      const d = getDistance(midA, perpFoot(midA, b1, b2));
      if (d < minThickness || d > maxThickness || d >= bestDist) continue;

      // 나란히 겹치는지 (끝과 끝이 만나는 동일선상 세그먼트 배제)
      const t1 = projParam(a1, b1, b2), t2 = projParam(a2, b1, b2);
      const overlap = Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0);
      if (overlap <= 0.05) continue;

      bestDist = d;
      best = B;
    }

    if (best) {
      processed.add(A.id);
      processed.add(best.id);
      const b1 = best.coordinates[0], b2 = best.coordinates[1];
      const cs = getMidpoint(a1, perpFoot(a1, b1, b2));
      const ce = getMidpoint(a2, perpFoot(a2, b1, b2));
      centerLines.push({
        id: `center_${Date.now().toString(36)}_${centerLines.length}`,
        source: 'CAD', type: 'CENTER_LINE', shape: 'line',
        coordinates: [cs, ce], thickness: 2,
        properties: { isAutoGenerated: true, wallThickness: Math.round(bestDist) },
      });
    }
  }

  return centerLines;
};
