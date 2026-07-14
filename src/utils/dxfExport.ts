import { StructureLineData, Point2D } from '../types/drawing';
import { DxfTransform } from '../store/useDrawingStore';
import { FloorModel } from '../types/structural';

// ── DXF 내보내기 (AutoCAD R12 / AC1009, LINE 기반) ──────────
// MIDAS Gen NX 등 엄격한 임포터 호환을 위해:
//  · LWPOLYLINE(R13+) 대신 LINE만 사용 (사각형=4 LINE, 삼각형=3 LINE, 폴리라인=연속 LINE)
//  · 줄바꿈은 CRLF, HEADER에 $ACADVER=AC1009 명시
//  · 좌표는 월드(mm). MIDAS 임포트 전 길이 단위를 mm로 맞출 것.
// 캔버스 px → 월드 역변환: dxfTransform 있으면 mm, 없으면 px(Y 반전).

const LAYERS: Record<string, { layer: string; color: number }> = {
  WALL: { layer: 'S_WALL', color: 1 },          // red
  COLUMN: { layer: 'S_COLUMN', color: 5 },       // blue
  BEAM: { layer: 'S_BEAM', color: 3 },           // green
  CENTER_LINE: { layer: 'S_CENTER', color: 2 },  // yellow
};
const DEFAULT_LAYER = { layer: 'S_MISC', color: 7 };

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

// ENTITIES(ent) + 사용 레이어 → 완전한 R12 DXF 문자열로 조립 (buildDxf/buildDxfFromModel 공용)
const assembleDxf = (ent: string[], used: Map<string, number>): string => {
  used.set('0', 7); // 기본 레이어 0 항상 포함
  const out: string[] = [];
  const o = (code: number, val: string | number) => { out.push(String(code), String(val)); };
  o(0, 'SECTION'); o(2, 'HEADER');
  o(9, '$ACADVER'); o(1, 'AC1009');
  o(9, '$INSUNITS'); o(70, 4); // 4 = mm
  o(0, 'ENDSEC');
  o(0, 'SECTION'); o(2, 'TABLES'); o(0, 'TABLE'); o(2, 'LAYER'); o(70, used.size);
  for (const [name, color] of used) { o(0, 'LAYER'); o(2, name); o(70, 0); o(62, color); o(6, 'CONTINUOUS'); }
  o(0, 'ENDTAB'); o(0, 'ENDSEC');
  o(0, 'SECTION'); o(2, 'ENTITIES');
  out.push(...ent);
  o(0, 'ENDSEC'); o(0, 'EOF');
  return out.join('\r\n') + '\r\n'; // 고전 DXF = CRLF
};

export const buildDxf = (lines: StructureLineData[], transform: DxfTransform | null): string => {
  // 월드 mm로 내보낸다 — 도면이 2배로 그려진 경우(unitMm=0.5) 여기서도 환산해야
  // model 기반 내보내기(buildDxfFromModel)와 단위가 어긋나지 않는다.
  const u = transform?.unitMm ?? 1;
  const wx = transform ? (px: number) => (transform.minX + (px - transform.pad) / transform.scale) * u : (px: number) => px;
  const wy = transform ? (py: number) => (transform.maxY - (py - transform.pad) / transform.scale) * u : (py: number) => -py;
  const wlen = transform ? (px: number) => (px / transform.scale) * u : (px: number) => px;

  const ent: string[] = [];
  const e = (code: number, val: string | number) => { ent.push(String(code), String(val)); };

  const line = (a: Point2D, b: Point2D, layer: string) => {
    e(0, 'LINE'); e(8, layer);
    e(10, fmt(wx(a.x))); e(20, fmt(wy(a.y))); e(30, '0.0');
    e(11, fmt(wx(b.x))); e(21, fmt(wy(b.y))); e(31, '0.0');
  };
  const polyAsLines = (pts: Point2D[], layer: string, closed: boolean) => {
    for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1], layer);
    if (closed && pts.length > 2) line(pts[pts.length - 1], pts[0], layer);
  };
  const circle = (c: Point2D, rPx: number, layer: string) => {
    e(0, 'CIRCLE'); e(8, layer); e(10, fmt(wx(c.x))); e(20, fmt(wy(c.y))); e(30, '0.0'); e(40, fmt(wlen(rPx)));
  };

  // 회전 사각형(기둥)의 4모서리(px): 중심±반치수를 각도(도, 화면 시계방향)만큼 회전
  const rectCorners = (a: Point2D, b: Point2D, deg: number): Point2D[] => {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const hw = Math.abs(b.x - a.x) / 2, hh = Math.abs(b.y - a.y) / 2;
    const t = (deg || 0) * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => ({ x: cx + dx * co - dy * si, y: cy + dx * si + dy * co }));
  };

  for (const l of lines) {
    if (!l.coordinates || l.coordinates.length < 2) continue;
    const { layer } = LAYERS[l.type] || DEFAULT_LAYER;
    const a = l.coordinates[0], b = l.coordinates[1];
    if (l.shape === 'rect') {
      polyAsLines(rectCorners(a, b, l.properties?.rotation_deg ?? 0), layer, true);
    } else if (l.shape === 'circle') {
      circle(a, Math.hypot(b.x - a.x, b.y - a.y), layer);
    } else if (l.shape === 'triangle') {
      polyAsLines([{ x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) }, { x: a.x, y: Math.max(a.y, b.y) }, { x: b.x, y: Math.max(a.y, b.y) }], layer, true);
    } else if (l.coordinates.length > 2) {
      polyAsLines(l.coordinates, layer, false);
    } else {
      line(a, b, layer);
    }
  }

  // 사용 레이어 테이블
  const used = new Map<string, number>();
  for (const l of lines) { const x = LAYERS[l.type] || DEFAULT_LAYER; used.set(x.layer, x.color); }
  return assembleDxf(ent, used);
};

// ── 정식 모델(월드 mm) 기반 DXF 내보내기 ────────────────────────
// U3 편집(삭제/추가/두께·단면 수정)이 반영된 store.model 을 직접 소비한다.
// 벽/보=축선 LINE, 기둥=회전 사각형 4 LINE, 그리드=축선 LINE. 좌표는 이미 월드 mm(Y 위).
export const buildDxfFromModel = (model: FloorModel): string => {
  const ent: string[] = [];
  const e = (code: number, val: string | number) => { ent.push(String(code), String(val)); };
  const used = new Map<string, number>();
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const line = (ax: number, ay: number, bx: number, by: number, layer: string, color: number) => {
    used.set(layer, color);
    e(0, 'LINE'); e(8, layer);
    e(10, fmt(ax)); e(20, fmt(ay)); e(30, '0.0');
    e(11, fmt(bx)); e(21, fmt(by)); e(31, '0.0');
  };

  for (const w of model.walls) {
    const a = nodeById.get(w.i), b = nodeById.get(w.j);
    if (a && b) line(a.x, a.y, b.x, b.y, LAYERS.WALL.layer, LAYERS.WALL.color);
  }
  for (const bm of model.beams) {
    const a = nodeById.get(bm.i), b = nodeById.get(bm.j);
    if (a && b) line(a.x, a.y, b.x, b.y, LAYERS.BEAM.layer, LAYERS.BEAM.color);
  }
  for (const c of model.columns) {
    const nd = nodeById.get(c.node); if (!nd) continue;
    const hw = (c.width || 400) / 2, hh = (c.depth || 400) / 2;
    // rotation_deg 은 화면(Y 아래) 기준 → 월드(Y 위)에선 부호 반전
    const t = -(c.rotation || 0) * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    const corners = ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const)
      .map(([dx, dy]) => ({ x: nd.x + dx * co - dy * si, y: nd.y + dx * si + dy * co }));
    for (let i = 0; i < 4; i++) {
      const p = corners[i], q = corners[(i + 1) % 4];
      line(p.x, p.y, q.x, q.y, LAYERS.COLUMN.layer, LAYERS.COLUMN.color);
    }
  }
  // 그리드 축선 (bbox 범위로 연장)
  if (model.bbox) {
    const { minX, minY, maxX, maxY } = model.bbox;
    for (const g of model.grid) {
      if (g.dir === 'X') line(g.position, minY, g.position, maxY, LAYERS.CENTER_LINE.layer, LAYERS.CENTER_LINE.color);
      else line(minX, g.position, maxX, g.position, LAYERS.CENTER_LINE.layer, LAYERS.CENTER_LINE.color);
    }
  }
  return assembleDxf(ent, used);
};

// ── 다층(Building) 3D 와이어프레임 DXF ────────────────────────────
// 각 층을 elevation(z)에 배치: 벽/보=층 레벨 수평선, 기둥=elevation→+height 수직선.
export const buildBuildingDxf = (floors: FloorModel[]): string => {
  const ent: string[] = [];
  const e = (code: number, val: string | number) => { ent.push(String(code), String(val)); };
  const used = new Map<string, number>();
  const line3d = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, layer: string, color: number) => {
    used.set(layer, color);
    e(0, 'LINE'); e(8, layer);
    e(10, fmt(ax)); e(20, fmt(ay)); e(30, fmt(az));
    e(11, fmt(bx)); e(21, fmt(by)); e(31, fmt(bz));
  };
  for (const f of floors) {
    const base = f.elevation ?? 0, top = base + (f.height ?? 3000);
    const nb = new Map(f.nodes.map((n) => [n.id, n]));
    for (const w of f.walls) { const a = nb.get(w.i), b = nb.get(w.j); if (a && b) line3d(a.x, a.y, base, b.x, b.y, base, LAYERS.WALL.layer, LAYERS.WALL.color); }
    for (const bm of f.beams) { const a = nb.get(bm.i), b = nb.get(bm.j); if (a && b) line3d(a.x, a.y, base, b.x, b.y, base, LAYERS.BEAM.layer, LAYERS.BEAM.color); }
    for (const c of f.columns) { const nd = nb.get(c.node); if (nd) line3d(nd.x, nd.y, base, nd.x, nd.y, top, LAYERS.COLUMN.layer, LAYERS.COLUMN.color); }
  }
  return assembleDxf(ent, used);
};
