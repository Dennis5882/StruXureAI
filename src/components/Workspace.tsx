import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore, effectiveScaleFactor } from '../store/useDrawingStore';
import { analyzeDrawingScale, type ScaleAnalysis } from '../utils/drawingScale';
import { loadFiles } from '../utils/fileLoader';
import { Point2D } from '../types/drawing';
import { useT } from '../i18n';
import { worldToCanvas, nodeDegrees } from '../utils/structuralModel';

// 그리드 스냅: g>0이면 가장 가까운 격자점으로 반올림
const snapTo = (v: number, g: number): number => (g > 0 ? Math.round(v / g) * g : v);

// fabric.Line의 두 끝점을 씬(scene) 절대좌표로 반환 (이동/회전/스케일 반영)
const lineAbsEnds = (line: any): Point2D[] => {
  const m = line.calcTransformMatrix();
  const po = line.pathOffset || { x: 0, y: 0 };
  const p1 = fabric.util.transformPoint(new fabric.Point(line.x1 - po.x, line.y1 - po.y), m);
  const p2 = fabric.util.transformPoint(new fabric.Point(line.x2 - po.x, line.y2 - po.y), m);
  return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
};

// 점 p에서 선분 a-b 까지의 최단 거리
const distToSegment = (p: Point2D, a: Point2D, b: Point2D): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

// dxf-parser는 각도를 라디안/도 둘 다로 줄 수 있어 방어적으로 정규화
const toRad = (a: number) => (Math.abs(a) > Math.PI * 2 + 0.001 ? (a * Math.PI) / 180 : a);

// 호(ARC)를 DXF 좌표계에서 점 배열로 샘플링 (CCW: start→end)
const arcPoints = (cx: number, cy: number, r: number, a0r: number, a1r: number): Point2D[] => {
  let s = toRad(a0r), e = toRad(a1r);
  while (e <= s) e += Math.PI * 2;
  const n = Math.max(8, Math.ceil((e - s) / (Math.PI / 24)));
  const pts: Point2D[] = [];
  for (let i = 0; i <= n; i++) {
    const a = s + ((e - s) * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
};

// 타원(ELLIPSE)을 DXF 좌표계에서 점 배열로 샘플링
const ellipsePoints = (cx: number, cy: number, major: Point2D, ratio: number, a0r: number, a1r: number): Point2D[] => {
  const ma = Math.hypot(major.x, major.y);
  const mi = ma * ratio;
  const rot = Math.atan2(major.y, major.x);
  let s = toRad(a0r), e = toRad(a1r);
  if (Math.abs(e - s) < 1e-6) { s = 0; e = Math.PI * 2; }
  while (e <= s) e += Math.PI * 2;
  const n = Math.max(16, Math.ceil((e - s) / (Math.PI / 24)));
  const pts: Point2D[] = [];
  for (let i = 0; i <= n; i++) {
    const a = s + ((e - s) * i) / n;
    const px = Math.cos(a) * ma, py = Math.sin(a) * mi;
    pts.push({ x: cx + px * Math.cos(rot) - py * Math.sin(rot), y: cy + px * Math.sin(rot) + py * Math.cos(rot) });
  }
  return pts;
};

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null); // 정적 DXF 배경(대용량 도면 성능)
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const dragCounter = useRef(0);
  // 파일별로 고정한 DXF 맞춤(scale). 구조부재 추출 후엔 리사이즈해도 이 값을 재사용해
  // 배경 도면과 추출 부재(px 좌표)의 정합이 깨지지 않게 한다.
  const dxfFitRef = useRef<{ entities: any; scale: number } | null>(null);
  // DXF 배경 드로우리스트(레이어별 Path2D, scene px 좌표) — Fabric 객체 대신 한 번에 그림.
  // 숨긴 레이어는 빌드 시 제외하므로 그리기 단계에서 별도 가시성 조회 불필요.
  const dxfDrawRef = useRef<{ color: string; path: Path2D }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeTick, setResizeTick] = useState(0); // 영역 크기 변화 시 도면 재맞춤 트리거

  const { currentMode, lines, undoLine, backgroundImage, dxfEntities, dxfLayers, aiPolygons, bgScale, setBgScale, isLoadingFile, loadingMessage, loadingProgress, gridSize, cropBBox, model, selectedMemberId, scaleOverride } = useDrawingStore();
  const { t } = useT();

  // 축척 판정 캐시 — (엔티티, crop)이 그대로면 리사이즈마다 20만개를 다시 훑지 않는다.
  const scaleRef = useRef<{ entities: any[]; key: string; info: ScaleAnalysis | null } | null>(null);

  // ⌨️ 단축키: Ctrl+Z 실행취소 · Delete/Backspace 로 선택된 검토 부재 삭제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        undoLine();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 입력 필드에 포커스 중이면 무시 (인라인 편집 방해 방지)
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        const st = useDrawingStore.getState();
        if (st.selectedMemberId) { e.preventDefault(); st.deleteMember(st.selectedMemberId); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoLine]);

  // 🔄 Zustand 상태(lines)와 Fabric 캔버스 객체를 동기화 (취소/전체삭제 시 캔버스에서 제거)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const currentLineIds = new Set(lines.map((l) => l.id));
    let hasChanged = false;

    canvas.getObjects().forEach((obj: any) => {
      if (obj.id) {
        // 객체 ID(_text 포함)가 스토어에 없으면 캔버스에서 제거
        const baseId = obj.id.replace('_text', '');
        if (!currentLineIds.has(baseId)) {
          canvas.remove(obj);
          hasChanged = true;
        }
      }
    });

    // 스토어에는 있으나 캔버스 객체가 없는 선을 생성 (프로그램 생성 중심선 등)
    const existingIds = new Set(
      canvas.getObjects()
        .map((o: any) => o.id)
        .filter(Boolean)
        .map((id: string) => id.replace('_text', ''))
    );
    const colorMap: Record<string, string> = { WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b' };
    const selMode = useDrawingStore.getState().currentMode === 'SELECT';
    lines.forEach((line) => {
      if (existingIds.has(line.id) || line.coordinates.length < 2) return;
      const [a, b] = line.coordinates;
      const color = colorMap[line.type] || '#ffffff';
      let obj: fabric.Object;
      if (line.shape === 'rect') {
        // 사각형(기둥 등): 중심 기준 + 회전(rotation_deg) 적용. 사선 기둥도 정확한 단면으로 렌더.
        obj = new fabric.Rect({
          left: (a.x + b.x) / 2, top: (a.y + b.y) / 2,
          width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
          angle: line.properties?.rotation_deg || 0,
          originX: 'center', originY: 'center',
          stroke: color, strokeWidth: line.thickness || 2, fill: 'transparent',
          selectable: selMode, evented: selMode,
        });
      } else if (line.shape === 'circle') {
        obj = new fabric.Circle({
          left: a.x, top: a.y, radius: Math.hypot(b.x - a.x, b.y - a.y),
          originX: 'center', originY: 'center',
          stroke: color, strokeWidth: line.thickness || 2, fill: 'transparent',
          selectable: selMode, evented: selMode,
        });
      } else {
        // 선: fabric 히트가 불안정 → 항상 비활성, 선택/이동/정점편집은 기하적으로 직접 처리
        obj = new fabric.Line([a.x, a.y, b.x, b.y], {
          stroke: color, strokeWidth: line.thickness || 2,
          selectable: false, evented: false, hasControls: false,
          originX: 'center', originY: 'center',
        });
      }
      (obj as any).id = line.id;
      obj.setCoords();
      canvas.add(obj);
      hasChanged = true;
    });

    if (hasChanged) canvas.requestRenderAll();
  }, [lines]);

  // 🏷️ 기둥 그리드 참조(gridRef) 라벨 렌더링
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.getObjects().filter((o: any) => o.isGridRefLabel).forEach((o) => canvas.remove(o));
    lines.forEach((l) => {
      if (l.type !== 'COLUMN' || !l.properties?.gridRef || l.coordinates.length < 2) return;
      const [a, b] = l.coordinates;
      const txt = new fabric.Text(String(l.properties.gridRef), {
        left: (a.x + b.x) / 2, top: Math.min(a.y, b.y) - 7,
        fontSize: 10, fill: '#93c5fd', fontFamily: 'monospace',
        originX: 'center', originY: 'bottom', selectable: false, evented: false,
      });
      (txt as any).isGridRefLabel = true;
      canvas.add(txt);
    });
    canvas.requestRenderAll();
  }, [lines]);

  // 📏 그리드(격자) 시각화 — gridSize>0일 때 옅은 격자선을 캔버스 좌표계에 그림
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.getObjects().filter((o: any) => o.isGrid).forEach((o) => canvas.remove(o));

    if (gridSize > 0) {
      const W = canvas.getWidth(), H = canvas.getHeight();
      const margin = Math.max(W, H); // 팬/줌을 고려해 화면보다 넓게 그림
      const x0 = -margin, x1 = W + margin, y0 = -margin, y1 = H + margin;
      const maxLines = 260; // 과도한 격자선 방지 (작은 간격이면 시각 격자는 생략, 스냅은 유지)
      const nx = (x1 - x0) / gridSize, ny = (y1 - y0) / gridSize;
      if (nx <= maxLines && ny <= maxLines) {
        const gp = { stroke: '#3f3f46', strokeWidth: 1, selectable: false, evented: false, hoverCursor: 'default' };
        for (let x = Math.ceil(x0 / gridSize) * gridSize; x <= x1; x += gridSize) {
          const l = new fabric.Line([x, y0, x, y1], gp); (l as any).isGrid = true; canvas.add(l); canvas.sendObjectToBack(l);
        }
        for (let y = Math.ceil(y0 / gridSize) * gridSize; y <= y1; y += gridSize) {
          const l = new fabric.Line([x0, y, x1, y], gp); (l as any).isGrid = true; canvas.add(l); canvas.sendObjectToBack(l);
        }
      }
    }
    canvas.requestRenderAll();
  }, [gridSize, resizeTick]);

  // 🖼️ 배경 도면 이미지 렌더링 (캔버스에 맞춰 스케일)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (!backgroundImage) {
      canvas.backgroundImage = undefined;
      canvas.requestRenderAll();
      return;
    }

    fabric.FabricImage.fromURL(backgroundImage).then((img) => {
      if (!img) return;
      const scale = Math.min(
        canvas.getWidth() / (img.width || 1),
        canvas.getHeight() / (img.height || 1)
      );
      img.set({ scaleX: scale, scaleY: scale, originX: 'left', originY: 'top' });
      canvas.backgroundImage = img;
      setBgScale(scale); // AI 폴리곤 좌표를 동일 스케일로 정합시키기 위해 저장
      canvas.requestRenderAll();
    });
  }, [backgroundImage, resizeTick]);

  // 📐 DXF 지오메트리 렌더링 + 레이어 가시성 연동 (Phase 3)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 기존 DXF 객체 제거(구버전 잔재 방어) — 이제 DXF는 배경 캔버스가 그림
    canvas.getObjects().filter((o: any) => o.isDxf).forEach((o) => canvas.remove(o));

    if (!dxfEntities || dxfEntities.length === 0) {
      dxfDrawRef.current = []; // 배경 비우기
      canvas.requestRenderAll();
      return;
    }

    // 레이어별 색상/가시성 조회 맵
    const layerMap = new Map(dxfLayers.map((l) => [l.name, l]));

    // 1) 전체 바운딩 박스 계산 — xref 실세계좌표 등 극단치 제거를 위해 percentile 방식 사용
    const SKIP_TYPES = new Set(['TEXT','MTEXT','HATCH','SOLID','DIMENSION','ATTRIB','ATTDEF','INSERT']);
    const allX: number[] = [], allY: number[] = [];
    dxfEntities.forEach((e: any) => {
      if (SKIP_TYPES.has((e.type || '').toUpperCase())) return;
      const push = (x: number, y: number) => {
        if (isFinite(x) && isFinite(y)) { allX.push(x); allY.push(y); }
      };
      if (Array.isArray(e.vertices)) e.vertices.forEach((v: any) => push(v.x, v.y));
      else if (e.center && typeof e.radius === 'number') {
        push(e.center.x - e.radius, e.center.y - e.radius);
        push(e.center.x + e.radius, e.center.y + e.radius);
      } else if (e.center && e.majorAxisEndPoint) {
        const m = Math.hypot(e.majorAxisEndPoint.x, e.majorAxisEndPoint.y);
        push(e.center.x - m, e.center.y - m);
        push(e.center.x + m, e.center.y + m);
      }
      if (Array.isArray(e.controlPoints)) e.controlPoints.forEach((p: any) => push(p.x, p.y));
      if (Array.isArray(e.fitPoints)) e.fitPoints.forEach((p: any) => push(p.x, p.y));
      if (e.startPoint) push(e.startPoint.x, e.startPoint.y);
      if (e.position) push(e.position.x, e.position.y);
    });

    // percentile 기반 bounds (극단치 제거: 하위 2% ~ 상위 2%)
    const pct = (arr: number[], p: number) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.max(0, Math.floor(s.length * p / 100))];
    };
    let minX: number, minY: number, maxX: number, maxY: number;
    if (allX.length === 0) { dxfDrawRef.current = []; canvas.requestRenderAll(); return; }
    minX = pct(allX, 2); maxX = pct(allX, 98);
    minY = pct(allY, 2); maxY = pct(allY, 98);
    // 너무 좁으면(점 하나 수준) 전체 범위로 폴백
    if (maxX - minX < 1) { minX = Math.min(...allX); maxX = Math.max(...allX); }
    if (maxY - minY < 1) { minY = Math.min(...allY); maxY = Math.max(...allY); }

    if (!isFinite(minX) || !isFinite(maxX)) { dxfDrawRef.current = []; canvas.requestRenderAll(); return; }

    // 1-b) 미니맵에서 추출 범위(crop)를 지정했으면 그 영역에 맞춰 확대한다.
    //      → 4장 도면 중 선택한 한 장이 화면을 채워 B1F 수준의 정밀도로 보인다.
    if (cropBBox && cropBBox.maxX > cropBBox.minX && cropBBox.maxY > cropBBox.minY) {
      minX = cropBBox.minX; maxX = cropBBox.maxX;
      minY = cropBBox.minY; maxY = cropBBox.maxY;
    }

    // 1-c) 도면 축척 판정 → 월드 mm 환산 계수(unitMm).
    //      도면이 참값의 N배로 그려져 있고 치수만 DIMLFAC로 참값을 보이는 경우가 실제로 있다
    //      (1#2#结构图.dwg = 2배). 보정 안 하면 절점·스팬·단면이 전부 N배로 MIDAS에 넘어간다.
    //      ⚠️ 한 파일에 축척이 다른 도면이 섞이므로(1#2#: 대부분 2×, 일부 1×) crop 범위로 한정해 판정.
    //      엔티티 20만개 판정은 무거워서 (엔티티, crop)이 바뀔 때만 재계산한다(리사이즈 시 재사용).
    const scaleKey = cropBBox ? `${cropBBox.minX},${cropBBox.minY},${cropBBox.maxX},${cropBBox.maxY}` : '-';
    let sc = scaleRef.current;
    if (!sc || sc.entities !== dxfEntities || sc.key !== scaleKey) {
      sc = { entities: dxfEntities, key: scaleKey, info: analyzeDrawingScale(dxfEntities, cropBBox ?? undefined) };
      scaleRef.current = sc;
      useDrawingStore.getState().setScaleInfo(sc.info);
    }
    const unitMm = 1 / effectiveScaleFactor(sc.info, scaleOverride);

    // 2) 캔버스에 맞춘 스케일/오프셋 (DXF Y축은 위로 향하므로 뒤집음)
    const pad = 40;
    const dxfW = (maxX - minX) || 1;
    const dxfH = (maxY - minY) || 1;
    // 구조부재(CAD 추출)가 이미 있으면 리사이즈 시 스케일을 고정해 정합 유지.
    // (px 좌표로 저장된 부재가 스케일 변경에 따라가지 못해 어긋나는 문제 방지)
    const hasCadMembers = useDrawingStore.getState().lines.some((l) => l.source === 'CAD');
    // crop 지정 중에는 선택 영역에 맞춰 매번 재맞춤 (고정 스케일 재사용 안 함)
    const sameFile = dxfFitRef.current?.entities === dxfEntities && !cropBBox;
    let scale: number;
    if (sameFile && hasCadMembers && dxfFitRef.current) {
      scale = dxfFitRef.current.scale; // 고정값 재사용
    } else {
      scale = Math.min((canvas.getWidth() - pad * 2) / dxfW, (canvas.getHeight() - pad * 2) / dxfH);
      dxfFitRef.current = { entities: dxfEntities, scale };
    }
    const tx = (x: number) => pad + (x - minX) * scale;
    const ty = (y: number) => pad + (maxY - y) * scale;
    // 구조 부재 추출이 화면과 정확히 정합되도록 변환 파라미터 저장
    useDrawingStore.getState().setDxfTransform({ scale, minX, maxY, pad, unitMm });

    // 3) 엔티티 → 레이어별 Path2D (정적 배경 드로우리스트). Fabric 객체를 만들지 않아
    //    수만 개 엔티티도 한 번의 stroke로 그린다(대용량 도면 성능).
    const groups = new Map<string, { color: string; path: Path2D }>();
    const grpPath = (layerName: string, color: string): Path2D => {
      let g = groups.get(layerName);
      if (!g) { g = { color, path: new Path2D() }; groups.set(layerName, g); }
      return g.path;
    };
    const addPoly = (path: Path2D, pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return;
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    };

    dxfEntities.forEach((e: any) => {
      const layer = layerMap.get(e.layer);
      const visible = layer ? layer.visible : true;
      const color = (layer && layer.color) || '#d4d4d8';
      const type = (e.type || '').toUpperCase();
      // 비구조 엔티티 스킵 + 숨긴 레이어는 드로우리스트에서 제외
      if (type === 'TEXT' || type === 'MTEXT' || type === 'HATCH' || type === 'SOLID' ||
          type === 'DIMENSION' || type === 'ATTRIB' || type === 'ATTDEF' || type === 'INSERT') return;
      if (!visible) return;

      if (type === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2) {
        const [a, b] = e.vertices;
        const p = grpPath(e.layer, color);
        p.moveTo(tx(a.x), ty(a.y)); p.lineTo(tx(b.x), ty(b.y));
      } else if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && Array.isArray(e.vertices) && e.vertices.length >= 2) {
        addPoly(grpPath(e.layer, color), e.vertices.map((v: any) => ({ x: tx(v.x), y: ty(v.y) })));
      } else if (type === 'CIRCLE' && e.center && typeof e.radius === 'number') {
        const p = grpPath(e.layer, color);
        const cx = tx(e.center.x), cy = ty(e.center.y), r = e.radius * scale;
        p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2);
      } else if (type === 'ARC' && e.center && typeof e.radius === 'number') {
        addPoly(grpPath(e.layer, color), arcPoints(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2).map((p) => ({ x: tx(p.x), y: ty(p.y) })));
      } else if (type === 'ELLIPSE' && e.center && e.majorAxisEndPoint) {
        addPoly(grpPath(e.layer, color), ellipsePoints(e.center.x, e.center.y, e.majorAxisEndPoint, e.axisRatio ?? 1, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2).map((p) => ({ x: tx(p.x), y: ty(p.y) })));
      } else if (type === 'SPLINE') {
        const src = (Array.isArray(e.fitPoints) && e.fitPoints.length >= 2) ? e.fitPoints : e.controlPoints;
        if (Array.isArray(src) && src.length >= 2) addPoly(grpPath(e.layer, color), src.map((p: any) => ({ x: tx(p.x), y: ty(p.y) })));
      }
    });

    dxfDrawRef.current = [...groups.values()];
    canvas.requestRenderAll(); // → after:render → renderBg 로 배경 재그림
  }, [dxfEntities, dxfLayers, resizeTick, cropBBox, scaleOverride]);

  // 🔶 모델 오버레이: 자유단(연결 안 된 벽/보 끝점) 강조 + 검토 탭 선택 부재 하이라이트
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.getObjects().filter((o: any) => o.isModelOverlay).forEach((o) => canvas.remove(o));

    const t = useDrawingStore.getState().dxfTransform;
    if (!model || !t) { canvas.requestRenderAll(); return; }
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

    // 자유단: 벽/보 전용 차수 ≤ 1 인 끝점 절점
    const degWB = new Map<string, number>();
    const inc = (id: string) => degWB.set(id, (degWB.get(id) || 0) + 1);
    model.walls.forEach((w) => { inc(w.i); inc(w.j); });
    model.beams.forEach((b) => { inc(b.i); inc(b.j); });
    degWB.forEach((d, id) => {
      if (d > 1) return;
      const nd = nodeById.get(id); if (!nd) return;
      const p = worldToCanvas(nd, t);
      const ring = new fabric.Circle({
        left: p.x, top: p.y, radius: 7, originX: 'center', originY: 'center',
        fill: 'rgba(245,158,11,0.18)', stroke: '#f59e0b', strokeWidth: 1.5,
        selectable: false, evented: false,
      });
      (ring as any).isModelOverlay = true;
      canvas.add(ring);
    });

    // 선택 부재 하이라이트
    if (selectedMemberId) {
      const seg = model.walls.find((x) => x.id === selectedMemberId)
        || model.beams.find((x) => x.id === selectedMemberId);
      const col = model.columns.find((x) => x.id === selectedMemberId);
      if (seg) {
        const a = nodeById.get(seg.i), b = nodeById.get(seg.j);
        if (a && b) {
          const pa = worldToCanvas(a, t), pb = worldToCanvas(b, t);
          const hl = new fabric.Line([pa.x, pa.y, pb.x, pb.y], {
            stroke: '#818cf8', strokeWidth: 6, opacity: 0.65, selectable: false, evented: false,
          });
          (hl as any).isModelOverlay = true;
          canvas.add(hl);
        }
      } else if (col) {
        const nd = nodeById.get(col.node);
        if (nd) {
          const p = worldToCanvas(nd, t);
          const box = new fabric.Rect({
            left: p.x, top: p.y, width: 18, height: 18, originX: 'center', originY: 'center',
            angle: col.rotation || 0, fill: 'rgba(129,140,248,0.22)', stroke: '#818cf8', strokeWidth: 2,
            selectable: false, evented: false,
          });
          (box as any).isModelOverlay = true;
          canvas.add(box);
        }
      }
    }
    canvas.requestRenderAll();
  }, [model, selectedMemberId, lines, resizeTick, cropBBox]);

  // 🤖 AI 인식 폴리곤 렌더링 (반투명 오버레이)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.getObjects().filter((o: any) => o.isAi).forEach((o) => canvas.remove(o));

    const colorMap: Record<string, string> = { WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b' };
    // AI 좌표는 원본 이미지 픽셀 기준 → 배경 렌더링 스케일(bgScale)을 곱해 정합
    const s = bgScale || 1;
    (aiPolygons || []).forEach((poly) => {
      if (!poly.points || poly.points.length < 3) return;
      const color = colorMap[poly.type] || '#a855f7';
      const points = poly.points.map((p) => ({ x: p.x * s, y: p.y * s }));
      const polygon = new fabric.Polygon(points, {
        fill: `${color}40`, stroke: color, strokeWidth: 2,
        selectable: false, evented: false, objectCaching: false,
      });
      (polygon as any).isAi = true;
      (polygon as any).id = poly.id;
      canvas.add(polygon);
    });

    canvas.requestRenderAll();
  }, [aiPolygons, bgScale, resizeTick]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width, height, backgroundColor: 'transparent', // DXF는 뒤 배경 캔버스가 그림
      selection: useDrawingStore.getState().currentMode === 'SELECT',
    });

    fabricCanvasRef.current = canvas;
    (canvasRef.current as any).__fabric = canvas; // 디버깅/E2E 테스트에서 캔버스 인스턴스 접근용

    // 🖼️ 정적 DXF 배경: 레이어별 Path2D를 Fabric 뷰포트 변환(줌/팬)에 맞춰 한 번에 그림.
    const sizeBg = () => {
      const bg = bgCanvasRef.current, cont = containerRef.current;
      if (!bg || !cont) return;
      const dpr = window.devicePixelRatio || 1;
      bg.width = Math.max(1, Math.floor(cont.clientWidth * dpr));
      bg.height = Math.max(1, Math.floor(cont.clientHeight * dpr));
    };
    const renderBg = () => {
      const bg = bgCanvasRef.current; if (!bg) return;
      const ctx = bg.getContext('2d'); if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      // 배경 채움(옛 fabric 배경색 유지)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, bg.width, bg.height);
      const groups = dxfDrawRef.current;
      if (!groups.length) return;
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = vpt[0] || 1;
      // device = dpr ∘ viewport(scene). scene px 좌표의 Path2D를 그대로 stroke.
      ctx.setTransform(dpr * vpt[0], dpr * vpt[1], dpr * vpt[2], dpr * vpt[3], dpr * vpt[4], dpr * vpt[5]);
      ctx.lineWidth = 1 / zoom; // 화면상 ~1px
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const g of groups) { ctx.strokeStyle = g.color; ctx.stroke(g.path); }
    };
    sizeBg();
    (canvas as any).__renderBg = renderBg; // 리사이즈 등에서 강제 호출용
    (canvas as any).__sizeBg = sizeBg;
    canvas.on('after:render', renderBg);

    canvas.on('mouse:wheel', (opt) => {
      const evt = opt.e;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** evt.deltaY;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.1) zoom = 0.1;
      canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);
      useDrawingStore.getState().setZoom(zoom);
      evt.preventDefault();
      evt.stopPropagation();
      // 편집 중이면 핸들 크기를 줌에 맞춰 갱신
      if (editLineId) {
        const lo = canvas.getObjects().find((o: any) => o.id === editLineId && o.type === 'line');
        if (lo) showVHandles(lo);
      }
    });

    let isDrawing = false;
    let currentShape: fabric.Object | null = null;
    let currentText: fabric.Text | null = null;
    let startX = 0;
    let startY = 0;
    let objId = '';
    // 🖐️ 팬(Pan) 상태
    let isPanning = false;
    let lastPosX = 0;
    let lastPosY = 0;
    // ✏️ 정점(끝점) 편집 상태
    let editLineId: string | null = null;
    let vHandles: fabric.Object[] = [];
    let draggingVertex = false;
    let vertexDrag: { id: string; index: number } | null = null; // 끝점 드래그 중
    let lineMove: { id: string; sx: number; sy: number; coords: Point2D[] } | null = null; // 선 전체 이동 중(시작 기준)
    // 📦 범위 선택(CROP) 상태 — 캔버스에서 직접 박스를 끌어 추출 범위를 지정
    let isCropping = false;
    let cropStart = { x: 0, y: 0 };
    let cropRectObj: fabric.Rect | null = null;

    const lineColorMap: Record<string, string> = { WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b' };

    const clearVHandles = () => {
      vHandles.forEach((h) => canvas.remove(h));
      vHandles = [];
      editLineId = null;
    };

    // 선택된 직선(LINE)의 두 끝점에 드래그 핸들을 띄운다 (스토어 좌표 기준)
    const showVHandles = (lineObj: any) => {
      clearVHandles();
      const st = useDrawingStore.getState();
      const d = st.lines.find((l) => l.id === lineObj.id);
      if (!d || d.shape !== 'line' || d.coordinates.length < 2) return;
      editLineId = lineObj.id;
      lineObj.set({ hasControls: false }); // 기본 스케일 핸들 대신 끝점 핸들 사용
      const z = canvas.getZoom();
      d.coordinates.slice(0, 2).forEach((pt, idx) => {
        const h = new fabric.Circle({
          left: pt.x, top: pt.y, radius: 6 / z, fill: '#fde047', stroke: '#18181b', strokeWidth: 1.5 / z,
          originX: 'center', originY: 'center', hasControls: false, hasBorders: false,
          // 장식용: fabric이 타깃으로 잡지 않도록 비활성(드래그는 기하적으로 직접 처리)
          selectable: false, evented: false,
        });
        (h as any).isVertexHandle = true; (h as any).vertexIndex = idx; (h as any).lineId = lineObj.id;
        canvas.add(h); canvas.bringObjectToFront(h);
        vHandles.push(h);
      });
      canvas.requestRenderAll();
    };

    // 직선 fabric 객체를 스토어 좌표로 다시 만든다 (끝점 이동 시 실시간 반영용)
    const rebuildLineObject = (id: string) => {
      const st = useDrawingStore.getState();
      const d = st.lines.find((l) => l.id === id);
      if (!d || d.coordinates.length < 2) return;
      canvas.getObjects().filter((o: any) => o.id === id && o.type === 'line').forEach((o) => canvas.remove(o));
      const [a, b] = d.coordinates;
      const obj = new fabric.Line([a.x, a.y, b.x, b.y], {
        stroke: lineColorMap[d.type] || '#ffffff', strokeWidth: d.thickness || 2,
        originX: 'center', originY: 'center', selectable: false, evented: false, hasControls: false,
      });
      (obj as any).id = id;
      obj.setCoords();
      canvas.add(obj);
      vHandles.forEach((h) => canvas.bringObjectToFront(h));
    };

    canvas.on('mouse:down', (opt) => {
      const state = useDrawingStore.getState();
      const mode = state.currentMode;

      // 🖐️ Alt + 드래그 → 뷰포트 이동 (모든 모드 공통)
      if (opt.e.altKey) {
        isPanning = true;
        lastPosX = opt.e.clientX;
        lastPosY = opt.e.clientY;
        canvas.setCursor('grabbing');
        return;
      }

      // 🎯 선택 모드
      //  - 사각형/원/삼각형: fabric 네이티브 선택(이동·크기조절·회전). setCoords로 히트영역 정상화됨
      //  - 선(LINE): fabric 박스 히트가 부정확하고 정점 편집이 필요해 기하적으로 직접 처리
      if (mode === 'SELECT') {
        const p = canvas.getPointer(opt.e);
        const z = canvas.getZoom();
        const tol = 8 / z;

        // 1) 편집 중인 선의 끝점 근처 → 정점 드래그 시작
        if (editLineId) {
          const d = state.lines.find((l) => l.id === editLineId);
          if (d && d.coordinates.length >= 2) {
            for (let i = 0; i < 2; i++) {
              if (Math.hypot(p.x - d.coordinates[i].x, p.y - d.coordinates[i].y) <= 10 / z) {
                vertexDrag = { id: editLineId, index: i }; draggingVertex = true; return;
              }
            }
          }
        }

        // 1-b) 모델 부재(CAD 추출) 히트 → 검토 선택. (수동 선은 아래 정점편집으로 자연 분리)
        const mt = state.dxfTransform;
        if (state.model && mt) {
          const nodeById = new Map(state.model.nodes.map((nd) => [nd.id, nd]));
          // 부재 치수는 월드 mm → px 변환은 mmPx(=scale/unitMm). scale은 '도면단위→px'라
          // 2배로 그린 도면에선 히트 반경이 절반이 되어 클릭이 안 먹는다.
          const mmPx = mt.scale / (mt.unitMm ?? 1);
          // 기둥: 풋프린트(+tol) 안이면 선택
          let colId: string | null = null, colBest = Infinity;
          for (const c of state.model.columns) {
            const nd = nodeById.get(c.node); if (!nd) continue;
            const pc = worldToCanvas(nd, mt);
            const dd = Math.hypot(p.x - pc.x, p.y - pc.y);
            const half = (Math.max(c.width, c.depth, 200) / 2) * mmPx;
            if (dd <= half + tol && dd < colBest) { colBest = dd; colId = c.id; }
          }
          if (colId) { state.setSelectedMemberId(colId); clearVHandles(); canvas.discardActiveObject(); canvas.requestRenderAll(); return; }
          // 벽/보: 선분 근처(두께 절반 + tol)면 선택
          let segId: string | null = null, segBest = Infinity;
          const testSeg = (id: string, i: string, j: string, extra: number) => {
            const a = nodeById.get(i), b = nodeById.get(j); if (!a || !b) return;
            const dd = distToSegment(p, worldToCanvas(a, mt), worldToCanvas(b, mt));
            if (dd <= tol + extra && dd < segBest) { segBest = dd; segId = id; }
          };
          for (const w of state.model.walls) testSeg(w.id, w.i, w.j, (w.thickness / 2) * mmPx);
          for (const bm of state.model.beams) testSeg(bm.id, bm.i, bm.j, (bm.width / 2) * mmPx);
          if (segId) { state.setSelectedMemberId(segId); clearVHandles(); canvas.discardActiveObject(); canvas.requestRenderAll(); return; }
        }

        // 2) fabric이 도형(선 아님)을 잡았으면 네이티브 처리에 위임
        const tgt = opt.target as any;
        if (tgt && !tgt.isGrid && !tgt.isVertexHandle && tgt.type !== 'line') { clearVHandles(); return; }

        // 3) 최근접 선 탐색 → 끝점 핸들 표시 + 전체 이동
        let bestId: string | null = null; let best = Infinity;
        for (const ln of state.lines) {
          if ((ln.shape || 'line') !== 'line' || ln.coordinates.length < 2) continue;
          const dd = distToSegment(p, ln.coordinates[0], ln.coordinates[1]);
          if (dd < best) { best = dd; bestId = ln.id; }
        }
        if (bestId && best <= tol) {
          const obj = canvas.getObjects().find((o: any) => o.id === bestId && o.type === 'line');
          if (obj) showVHandles(obj);
          const d = state.lines.find((l) => l.id === bestId)!;
          lineMove = { id: bestId, sx: p.x, sy: p.y, coords: d.coordinates.map((c) => ({ ...c })) };
        } else {
          clearVHandles(); canvas.discardActiveObject();
          if (state.selectedMemberId) state.setSelectedMemberId(null); // 빈 곳 클릭 → 검토 선택 해제
          canvas.requestRenderAll();
        }
        return;
      }

      // 🧽 삭제 모드 → 클릭한 객체 제거
      if (mode === 'DELETE') {
        // 1순위: fabric이 잡은 타깃(면적 있는 도형에 유리)
        const target = opt.target as any;
        if (target && target.id) { state.deleteLine(String(target.id).replace('_text', '')); return; }
        // 2순위: 가장 가까운 선분 직접 탐색(얇은 선에 안정적)
        const p = canvas.getPointer(opt.e);
        let bestId: string | null = null;
        let best = Infinity;
        for (const ln of state.lines) {
          if (ln.coordinates.length < 2) continue;
          const d = distToSegment(p, ln.coordinates[0], ln.coordinates[1]);
          if (d < best) { best = d; bestId = ln.id; }
        }
        if (bestId && best <= 10 / canvas.getZoom()) state.deleteLine(bestId);
        return;
      }

      // 📦 범위 선택 모드 → 캔버스에서 박스 드래그 시작
      if (mode === 'CROP') {
        const p = canvas.getPointer(opt.e);
        isCropping = true;
        cropStart = { x: p.x, y: p.y };
        cropRectObj = new fabric.Rect({
          left: p.x, top: p.y, width: 0, height: 0,
          fill: 'rgba(99,102,241,0.12)', stroke: '#818cf8', strokeWidth: 1,
          strokeDashArray: [6, 3], strokeUniform: true,
          selectable: false, evented: false,
        });
        (cropRectObj as any).isCropOverlay = true;
        canvas.add(cropRectObj);
        return;
      }

      if (!mode.startsWith('DRAW_')) return;

      isDrawing = true;
      const pointer = canvas.getPointer(opt.e);
      startX = snapTo(pointer.x, state.gridSize);
      startY = snapTo(pointer.y, state.gridSize);
      objId = `str_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      const colorMap: Record<string, string> = { WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b' };
      const color = colorMap[state.currentType] || '#ffffff';
      
      const commonProps = { strokeWidth: 4, stroke: color, fill: 'transparent', selectable: false, evented: false };

      // 🪄 모드에 따른 도형 생성 분기점
      if (mode === 'DRAW_LINE') {
        currentShape = new fabric.Line([startX, startY, startX, startY], { ...commonProps, fill: color, originX: 'center', originY: 'center' });
      } else if (mode === 'DRAW_RECT') {
        currentShape = new fabric.Rect({ left: startX, top: startY, width: 0, height: 0, ...commonProps });
      } else if (mode === 'DRAW_CIRCLE') {
        currentShape = new fabric.Circle({ left: startX, top: startY, radius: 0, originX: 'center', originY: 'center', ...commonProps });
      } else if (mode === 'DRAW_TRIANGLE') {
        currentShape = new fabric.Triangle({ left: startX, top: startY, width: 0, height: 0, ...commonProps });
      }

      if (currentShape) {
        (currentShape as any).id = objId; // ID 주입 (취소 연동용)
        canvas.add(currentShape);

        currentText = new fabric.Text('', {
          left: pointer.x, top: pointer.y - 15, fontSize: 12, fill: '#e4e4e7', backgroundColor: 'rgba(0,0,0,0.7)',
          originX: 'center', originY: 'center', fontFamily: 'monospace', selectable: false, evented: false,
        });
        (currentText as any).id = `${objId}_text`; // 텍스트도 같이 삭제되도록 세팅
        canvas.add(currentText);
      }
    });

    canvas.on('mouse:move', (opt) => {
      // 🖐️ 팬 처리
      if (isPanning) {
        const e = opt.e;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += e.clientX - lastPosX;
          vpt[5] += e.clientY - lastPosY;
          canvas.requestRenderAll();
        }
        lastPosX = e.clientX;
        lastPosY = e.clientY;
        return;
      }

      // ✏️ 정점(끝점) 드래그
      if (vertexDrag) {
        const st = useDrawingStore.getState();
        const p = canvas.getPointer(opt.e);
        const d = st.lines.find((l) => l.id === vertexDrag!.id);
        if (d) {
          const coords = d.coordinates.map((c) => ({ ...c }));
          coords[vertexDrag.index] = { x: snapTo(p.x, st.gridSize), y: snapTo(p.y, st.gridSize) };
          st.updateLine(vertexDrag.id, { coordinates: coords });
          rebuildLineObject(vertexDrag.id);
          const obj = canvas.getObjects().find((o: any) => o.id === vertexDrag!.id && o.type === 'line');
          if (obj) showVHandles(obj);
        }
        return;
      }

      // ✏️ 선 전체 이동 (시작 좌표 기준 누적 평행이동, 격자 스냅)
      if (lineMove) {
        const st = useDrawingStore.getState();
        const p = canvas.getPointer(opt.e);
        const dx = p.x - lineMove.sx, dy = p.y - lineMove.sy;
        const coords = lineMove.coords.map((c) => ({ x: snapTo(c.x + dx, st.gridSize), y: snapTo(c.y + dy, st.gridSize) }));
        st.updateLine(lineMove.id, { coordinates: coords });
        rebuildLineObject(lineMove.id);
        const obj = canvas.getObjects().find((o: any) => o.id === lineMove!.id && o.type === 'line');
        if (obj) showVHandles(obj);
        return;
      }

      // 📦 범위 선택 박스 실시간 갱신
      if (isCropping && cropRectObj) {
        const p = canvas.getPointer(opt.e);
        cropRectObj.set({
          left: Math.min(cropStart.x, p.x),
          top: Math.min(cropStart.y, p.y),
          width: Math.abs(p.x - cropStart.x),
          height: Math.abs(p.y - cropStart.y),
        });
        canvas.requestRenderAll();
        return;
      }

      if (!isDrawing || !currentShape || !currentText) return;
      const state = useDrawingStore.getState();
      const pointer = canvas.getPointer(opt.e);
      let endX = snapTo(pointer.x, state.gridSize);
      let endY = snapTo(pointer.y, state.gridSize);

      // 📐 실시간 드래그 도형 렌더링
      if (state.currentMode === 'DRAW_LINE') {
        if (opt.e.shiftKey || state.isOrthoMode) {
          Math.abs(endX - startX) > Math.abs(endY - startY) ? endY = startY : endX = startX;
        }
        (currentShape as fabric.Line).set({ x2: endX, y2: endY });
        
      } else if (state.currentMode === 'DRAW_RECT' || state.currentMode === 'DRAW_TRIANGLE') {
        let w = Math.abs(endX - startX);
        let h = Math.abs(endY - startY);
        // 도형 직교(Ortho) 모드: 정사각형, 정삼각형 강제
        if (opt.e.shiftKey || state.isOrthoMode) {
          const max = Math.max(w, h);
          w = max; h = max;
        }
        currentShape.set({
          width: w, height: h,
          left: endX > startX ? startX : startX - w,
          top: endY > startY ? startY : startY - h
        });
        
      } else if (state.currentMode === 'DRAW_CIRCLE') {
        const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        (currentShape as fabric.Circle).set({ radius: distance });
      }

      // 치수 텍스트 표시 연산
      const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      const realLength = distance * state.scaleRatio;
      let displayValue = state.unit === 'm' ? realLength.toFixed(2) : Math.round(realLength).toString();

      currentText.set({
        left: (startX + endX) / 2,
        top: ((startY + endY) / 2) - 15,
        text: ` ${displayValue} ${state.unit} `
      });

      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', (opt) => {
      // 🖐️ 팬 종료 (뷰포트 변환 확정)
      if (isPanning) {
        isPanning = false;
        canvas.setViewportTransform(canvas.viewportTransform);
        return;
      }

      // 📦 범위 선택 종료 → px 박스를 world mm로 환산해 store에 저장
      if (isCropping) {
        isCropping = false;
        const st = useDrawingStore.getState();
        const rect = cropRectObj;
        if (cropRectObj) { canvas.remove(cropRectObj); cropRectObj = null; }
        const t = st.dxfTransform;
        // 너무 작은 드래그(오클릭)는 취소, dxfTransform 없으면 환산 불가
        if (rect && t && (rect.width ?? 0) > 5 && (rect.height ?? 0) > 5) {
          const L = rect.left ?? 0, T = rect.top ?? 0;
          const W = rect.width ?? 0, H = rect.height ?? 0;
          // ⚠️ 여기는 '도면 단위'로 되돌리는 게 맞다 — unitMm을 곱하면 안 된다.
          //    cropBBox는 filterEntitiesByCrop()이 엔티티 원본 좌표와 직접 비교하는 값이라
          //    월드 mm가 아니라 DXF 원본 좌표계여야 한다. (canvasToWorld와 의도적으로 다름)
          const wx = (px: number) => t.minX + (px - t.pad) / t.scale;
          const wy = (py: number) => t.maxY - (py - t.pad) / t.scale;
          st.setCropBBox({
            minX: wx(L), maxX: wx(L + W),
            minY: wy(T + H), maxY: wy(T), // 화면 아래(top+H)가 world Y 최소
          });
        }
        st.setMode('SELECT'); // 한 번 지정 후 자동으로 선택 모드 복귀
        return;
      }

      if (!isDrawing || !currentShape) return;
      isDrawing = false;
      const state = useDrawingStore.getState();
      const pointer = canvas.getPointer(opt.e); // 최종 포인터 위치
      const endX = snapTo(pointer.x, state.gridSize);
      const endY = snapTo(pointer.y, state.gridSize);

      // ⭐ 히트판정용 좌표(aCoords) 갱신 — 누락 시 fabric findTarget이 도형을 못 잡음
      currentShape.setCoords();

      const newLine = {
        id: objId,
        source: 'MANUAL' as const, type: state.currentType,
        shape: state.currentMode.replace('DRAW_', '').toLowerCase(),
        coordinates: [{ x: startX, y: startY }, { x: endX, y: endY }],
        thickness: 4,
      };
      state.addLine(newLine);

      // 🧩 모델이 있고 구조 부재 타입이면 모델에 편입(부재 추가) 후 선택 모드 복귀.
      const structural = state.currentType === 'WALL' || state.currentType === 'COLUMN' || state.currentType === 'BEAM';
      if (state.model && structural) {
        state.addLineToModel(newLine);
        state.setMode('SELECT');
      }

      currentShape = null;
      currentText = null;
    });

    // 🟡 fabric 네이티브 객체(rect/원/삼각형) 이동 시 그리드 스냅
    canvas.on('object:moving', (opt) => {
      const obj: any = opt.target;
      if (!obj || obj.isVertexHandle) return;
      const g = useDrawingStore.getState().gridSize;
      if (g > 0) obj.set({ left: snapTo(obj.left, g), top: snapTo(obj.top, g) });
    });

    // 💾 이동/크기/회전 변경을 스토어 좌표에 반영 (영속화)
    canvas.on('object:modified', (opt) => {
      const obj: any = opt.target;
      if (!obj || !obj.id || obj.isVertexHandle || obj.isDxf || obj.isAi) return;
      const st = useDrawingStore.getState();
      let coords: Point2D[];
      if (obj.type === 'line') {
        coords = lineAbsEnds(obj);
      } else {
        obj.setCoords();
        const a = obj.aCoords;
        coords = [{ x: a.tl.x, y: a.tl.y }, { x: a.br.x, y: a.br.y }];
      }
      st.updateLine(String(obj.id), { coordinates: coords });
      if (editLineId === obj.id) showVHandles(obj); // 본체 이동 후 핸들 위치 갱신
    });

    // 🎯 선택 시: 단일 직선이면 끝점 편집 핸들 표시
    const onSelect = () => {
      if (useDrawingStore.getState().currentMode !== 'SELECT') return;
      const active = canvas.getActiveObjects();
      if (active.length === 1) {
        const o: any = active[0];
        if (o.isVertexHandle) return; // 핸들을 잡은 상태면 유지
        if (o.type === 'line' && o.id) { showVHandles(o); return; }
      }
      clearVHandles();
    };
    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', () => { if (!draggingVertex && !lineMove) clearVHandles(); });
    canvas.on('mouse:up', () => { draggingVertex = false; vertexDrag = null; lineMove = null; });

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
      if (w < 1 || h < 1) return;
      if (canvas.getWidth() === w && canvas.getHeight() === h) return;
      canvas.setDimensions({ width: w, height: h });
      sizeBg(); // 배경 캔버스도 컨테이너 크기에 맞춤
      setResizeTick((t) => t + 1); // 도면/격자/배경 재맞춤 유도
    };
    window.addEventListener('resize', handleResize);
    // 사이드바 열고/닫기 등 레이아웃 변화도 감지 (window resize 이벤트가 없으므로 ResizeObserver 사용)
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(containerRef.current);

    return () => { window.removeEventListener('resize', handleResize); ro.disconnect(); canvas.dispose(); };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // SELECT 모드가 아니면 정점 편집 핸들 제거
    if (currentMode !== 'SELECT') {
      canvas.getObjects().filter((o: any) => o.isVertexHandle).forEach((o) => canvas.remove(o));
    }

    if (currentMode === 'SELECT') {
      canvas.selection = false; // 러버밴드 끔 (선은 직접 처리, 개별 객체 선택은 유지)
      canvas.forEachObject((obj: any) => {
        // DXF/AI/격자/핸들은 배경·장식, 선(line)은 기하적으로 직접 처리 → fabric 선택 제외
        if (obj.isDxf || obj.isAi || obj.isGrid || obj.isVertexHandle || obj.type === 'line') return;
        obj.selectable = true; obj.evented = true;
      });
    } else if (currentMode === 'DELETE') {
      // 🧽 삭제 모드: 선택은 막되 클릭은 감지되도록 evented만 켠다 (배경/격자 제외)
      canvas.selection = false;
      canvas.forEachObject((obj: any) => {
        obj.selectable = false;
        obj.evented = !(obj.isDxf || obj.isAi || obj.isGrid);
      });
    } else {
      canvas.selection = false;
      canvas.forEachObject((obj) => { obj.selectable = false; obj.evented = false; });
    }
    // 📦 범위 선택 모드는 십자 커서로 안내
    canvas.defaultCursor = currentMode === 'CROP' ? 'crosshair' : 'default';
    canvas.requestRenderAll();
  }, [currentMode]);

  // 🖱️ 드래그앤드롭 파일 업로드 (이미지/CAD)
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) loadFiles(e.dataTransfer.files);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-zinc-900"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="absolute bottom-4 left-4 z-10 bg-black/70 text-zinc-300 text-xs px-3 py-1.5 rounded pointer-events-none font-mono">
        {currentMode === 'SELECT' && t('ws.hintSelect')}
        {currentMode === 'DELETE' && t('ws.hintDelete')}
        {currentMode === 'CROP' && '드래그하여 추출할 도면 범위를 지정하세요'}
        {currentMode !== 'SELECT' && currentMode !== 'DELETE' && currentMode !== 'CROP' && t('ws.hintDraw')}
      </div>
      {/* 🖱️ 드래그앤드롭 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-indigo-950/70 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center space-y-3 border-2 border-dashed border-indigo-400 rounded-2xl px-12 py-10 bg-indigo-900/40">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div className="text-indigo-100 font-bold text-sm">{t('ws.dropTitle')}</div>
            <div className="text-indigo-300/70 text-xs">{t('ws.dropSub')}</div>
          </div>
        </div>
      )}
      {/* ⏳ 파일 로딩 오버레이 (DWG 변환 등) + 단계별 진행률 */}
      {isLoadingFile && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-4 w-72 max-w-[80%]">
            <svg className="animate-spin" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <div className="text-indigo-200 text-sm font-medium">{loadingMessage || t('ws.loading')}</div>
            <div className="w-full">
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.round(loadingProgress * 100)}%` }} />
              </div>
              <div className="mt-1 text-right text-[10px] text-zinc-500 font-mono">{Math.round(loadingProgress * 100)}%</div>
            </div>
          </div>
        </div>
      )}
      {/* 🏷️ 버전 정보 (빌드 시 자동 주입) */}
      <div className="absolute bottom-4 right-4 z-10 bg-black/60 text-zinc-500 text-[10px] px-2.5 py-1 rounded pointer-events-none font-mono leading-tight text-right">
        <div>StruXureAI <span className="text-zinc-300">v{__APP_VERSION__}</span> · by {__APP_DEVELOPER__}</div>
        <div className="text-zinc-600">build {__APP_BUILD_DATE__} · {__APP_COMMIT__}</div>
      </div>
      {/* 정적 DXF 배경 (Fabric 뒤). Fabric 캔버스는 투명 배경으로 이 위에 부재/오버레이만 그림 */}
      <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
