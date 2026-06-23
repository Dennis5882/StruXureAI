import { StructureLineData, Point2D } from '../types/drawing';
import { DxfTransform } from '../store/useDrawingStore';

// ── DXF 내보내기 (ASCII DXF R12 호환) ───────────────────────
// 캔버스 px 구조부재를 월드(mm) 좌표로 변환해 LINE/LWPOLYLINE/CIRCLE 로 출력.
// dxfTransform 있으면 mm 복원, 없으면 px 그대로(Y만 상하 반전해 CAD에서 정상 방향).

const LAYERS: Record<string, { layer: string; color: number }> = {
  WALL: { layer: 'S_WALL', color: 1 },        // red
  COLUMN: { layer: 'S_COLUMN', color: 5 },    // blue
  BEAM: { layer: 'S_BEAM', color: 3 },        // green
  CENTER_LINE: { layer: 'S_CENTER', color: 2 }, // yellow
};
const DEFAULT_LAYER = { layer: 'S_MISC', color: 7 };

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

export const buildDxf = (lines: StructureLineData[], transform: DxfTransform | null): string => {
  // px → 월드(mm) 역변환 (없으면 px, Y 반전)
  const wx = transform ? (px: number) => transform.minX + (px - transform.pad) / transform.scale : (px: number) => px;
  const wy = transform ? (py: number) => transform.maxY - (py - transform.pad) / transform.scale : (py: number) => -py;
  const wlen = transform ? (px: number) => px / transform.scale : (px: number) => px;

  const body: string[] = [];
  const g = (code: number, val: string | number) => { body.push(String(code), String(val)); };

  const line = (a: Point2D, b: Point2D, layer: string) => {
    g(0, 'LINE'); g(8, layer);
    g(10, fmt(wx(a.x))); g(20, fmt(wy(a.y))); g(30, '0');
    g(11, fmt(wx(b.x))); g(21, fmt(wy(b.y))); g(31, '0');
  };
  const polyline = (pts: Point2D[], layer: string, closed = true) => {
    g(0, 'LWPOLYLINE'); g(8, layer); g(90, pts.length); g(70, closed ? 1 : 0);
    for (const p of pts) { g(10, fmt(wx(p.x))); g(20, fmt(wy(p.y))); }
  };
  const circle = (c: Point2D, rPx: number, layer: string) => {
    g(0, 'CIRCLE'); g(8, layer); g(10, fmt(wx(c.x))); g(20, fmt(wy(c.y))); g(30, '0'); g(40, fmt(wlen(rPx)));
  };

  // 회전 사각형(기둥)의 4모서리(px) 계산: 중심±반치수를 각도(도, 화면 시계방향)만큼 회전
  const rectCorners = (a: Point2D, b: Point2D, deg: number): Point2D[] => {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const hw = Math.abs(b.x - a.x) / 2, hh = Math.abs(b.y - a.y) / 2;
    const t = (deg || 0) * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    const offs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return offs.map(([dx, dy]) => ({ x: cx + dx * co - dy * si, y: cy + dx * si + dy * co }));
  };

  for (const l of lines) {
    if (!l.coordinates || l.coordinates.length < 2) continue;
    const { layer } = LAYERS[l.type] || DEFAULT_LAYER;
    const a = l.coordinates[0], b = l.coordinates[1];
    if (l.shape === 'rect') {
      polyline(rectCorners(a, b, l.properties?.rotation_deg ?? 0), layer);
    } else if (l.shape === 'circle') {
      circle(a, Math.hypot(b.x - a.x, b.y - a.y), layer);
    } else if (l.shape === 'triangle') {
      // bbox → 위 꼭지점·좌하·우하 (대략)
      polyline([{ x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) }, { x: a.x, y: Math.max(a.y, b.y) }, { x: b.x, y: Math.max(a.y, b.y) }], layer);
    } else if (l.coordinates.length > 2) {
      polyline(l.coordinates, layer, false);
    } else {
      line(a, b, layer);
    }
  }

  // 사용된 레이어 테이블
  const used = new Map<string, number>();
  for (const l of lines) { const e = LAYERS[l.type] || DEFAULT_LAYER; used.set(e.layer, e.color); }

  const out: string[] = [];
  const o = (code: number, val: string | number) => { out.push(String(code), String(val)); };
  // HEADER (단위 mm)
  o(0, 'SECTION'); o(2, 'HEADER'); o(9, '$INSUNITS'); o(70, 4); o(0, 'ENDSEC');
  // TABLES (LAYER)
  o(0, 'SECTION'); o(2, 'TABLES'); o(0, 'TABLE'); o(2, 'LAYER'); o(70, used.size);
  for (const [name, color] of used) { o(0, 'LAYER'); o(2, name); o(70, 0); o(62, color); o(6, 'CONTINUOUS'); }
  o(0, 'ENDTAB'); o(0, 'ENDSEC');
  // ENTITIES
  o(0, 'SECTION'); o(2, 'ENTITIES');
  out.push(...body);
  o(0, 'ENDSEC'); o(0, 'EOF');

  return out.join('\n') + '\n';
};
