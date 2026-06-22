import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';
import { loadFiles } from '../utils/fileLoader';
import { Point2D } from '../types/drawing';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeTick, setResizeTick] = useState(0); // 영역 크기 변화 시 도면 재맞춤 트리거

  const { currentMode, lines, undoLine, backgroundImage, dxfEntities, dxfLayers, aiPolygons, bgScale, setBgScale, isLoadingFile, loadingMessage, gridSize } = useDrawingStore();

  // ⌨️ 단축키(Ctrl+Z)로 실행 취소 기능 연동
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        undoLine();
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
        // 사각형(기둥 등): fabric 네이티브 선택/이동/크기조절
        obj = new fabric.Rect({
          left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
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

    // 기존 DXF 객체 제거
    canvas.getObjects().filter((o: any) => o.isDxf).forEach((o) => canvas.remove(o));

    if (!dxfEntities || dxfEntities.length === 0) {
      canvas.requestRenderAll();
      return;
    }

    // 레이어별 색상/가시성 조회 맵
    const layerMap = new Map(dxfLayers.map((l) => [l.name, l]));

    // 1) 전체 바운딩 박스 계산
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x: number, y: number) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    dxfEntities.forEach((e: any) => {
      if (Array.isArray(e.vertices)) e.vertices.forEach((v: any) => acc(v.x, v.y));
      else if (e.center && typeof e.radius === 'number') {
        // CIRCLE / ARC
        acc(e.center.x - e.radius, e.center.y - e.radius);
        acc(e.center.x + e.radius, e.center.y + e.radius);
      } else if (e.center && e.majorAxisEndPoint) {
        // ELLIPSE
        const m = Math.hypot(e.majorAxisEndPoint.x, e.majorAxisEndPoint.y);
        acc(e.center.x - m, e.center.y - m);
        acc(e.center.x + m, e.center.y + m);
      }
      // SPLINE 제어점/맞춤점
      if (Array.isArray(e.controlPoints)) e.controlPoints.forEach((p: any) => acc(p.x, p.y));
      if (Array.isArray(e.fitPoints)) e.fitPoints.forEach((p: any) => acc(p.x, p.y));
      // TEXT/MTEXT 등 위치점
      if (e.startPoint) acc(e.startPoint.x, e.startPoint.y);
      if (e.position) acc(e.position.x, e.position.y);
    });

    if (!isFinite(minX) || !isFinite(maxX)) { canvas.requestRenderAll(); return; }

    // 2) 캔버스에 맞춘 스케일/오프셋 (DXF Y축은 위로 향하므로 뒤집음)
    const pad = 40;
    const dxfW = (maxX - minX) || 1;
    const dxfH = (maxY - minY) || 1;
    const scale = Math.min((canvas.getWidth() - pad * 2) / dxfW, (canvas.getHeight() - pad * 2) / dxfH);
    const tx = (x: number) => pad + (x - minX) * scale;
    const ty = (y: number) => pad + (maxY - y) * scale;
    // 구조 부재 추출이 화면과 정확히 정합되도록 변환 파라미터 저장
    useDrawingStore.getState().setDxfTransform({ scale, minX, maxY, pad });

    // 3) 엔티티 → Fabric 객체
    dxfEntities.forEach((e: any) => {
      const layer = layerMap.get(e.layer);
      const visible = layer ? layer.visible : true;
      const color = (layer && layer.color) || '#d4d4d8';
      const base = { stroke: color, strokeWidth: 1, fill: 'transparent', selectable: false, evented: false, visible };
      let obj: fabric.Object | null = null;

      const type = (e.type || '').toUpperCase();
      if (type === 'LINE' && Array.isArray(e.vertices) && e.vertices.length >= 2) {
        const [a, b] = e.vertices;
        obj = new fabric.Line([tx(a.x), ty(a.y), tx(b.x), ty(b.y)], base);
      } else if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && Array.isArray(e.vertices) && e.vertices.length >= 2) {
        const pts = e.vertices.map((v: any) => ({ x: tx(v.x), y: ty(v.y) }));
        obj = new fabric.Polyline(pts, { ...base, objectCaching: false });
      } else if (type === 'CIRCLE' && e.center) {
        obj = new fabric.Circle({
          left: tx(e.center.x), top: ty(e.center.y), radius: e.radius * scale,
          originX: 'center', originY: 'center', ...base,
        });
      } else if (type === 'ARC' && e.center && typeof e.radius === 'number') {
        const pts = arcPoints(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2)
          .map((p) => ({ x: tx(p.x), y: ty(p.y) }));
        obj = new fabric.Polyline(pts, { ...base, objectCaching: false });
      } else if (type === 'ELLIPSE' && e.center && e.majorAxisEndPoint) {
        const pts = ellipsePoints(e.center.x, e.center.y, e.majorAxisEndPoint, e.axisRatio ?? 1, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2)
          .map((p) => ({ x: tx(p.x), y: ty(p.y) }));
        obj = new fabric.Polyline(pts, { ...base, objectCaching: false });
      } else if (type === 'SPLINE') {
        // 정밀 NURBS 평가 대신 맞춤점/제어점을 잇는 폴리라인으로 근사
        const src = (Array.isArray(e.fitPoints) && e.fitPoints.length >= 2) ? e.fitPoints : e.controlPoints;
        if (Array.isArray(src) && src.length >= 2) {
          const pts = src.map((p: any) => ({ x: tx(p.x), y: ty(p.y) }));
          obj = new fabric.Polyline(pts, { ...base, objectCaching: false });
        }
      } else if (type === 'TEXT' || type === 'MTEXT') {
        const pos = e.startPoint || e.position;
        const raw = (e.text || '').replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim(); // MTEXT 포맷 코드 간이 제거
        const h = (e.textHeight || e.height || 0) * scale;
        if (pos && raw) {
          obj = new fabric.Text(raw, {
            left: tx(pos.x), top: ty(pos.y),
            fontSize: Math.max(8, Math.min(h || 12, 200)),
            fill: color, stroke: undefined,
            originX: 'left', originY: 'bottom',
            fontFamily: 'sans-serif', selectable: false, evented: false, visible,
          });
        }
      }

      if (obj) {
        (obj as any).isDxf = true;
        (obj as any).dxfLayer = e.layer;
        canvas.add(obj);
      }
    });

    canvas.requestRenderAll();
  }, [dxfEntities, dxfLayers, resizeTick]);

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
      width, height, backgroundColor: '#1e1e1e', 
      selection: useDrawingStore.getState().currentMode === 'SELECT',
    });
    
    fabricCanvasRef.current = canvas;
    (canvasRef.current as any).__fabric = canvas; // 디버깅/E2E 테스트에서 캔버스 인스턴스 접근용

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
          clearVHandles(); canvas.discardActiveObject(); canvas.requestRenderAll();
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

      if (!isDrawing || !currentShape) return;
      isDrawing = false;
      const state = useDrawingStore.getState();
      const pointer = canvas.getPointer(opt.e); // 최종 포인터 위치
      const endX = snapTo(pointer.x, state.gridSize);
      const endY = snapTo(pointer.y, state.gridSize);

      // ⭐ 히트판정용 좌표(aCoords) 갱신 — 누락 시 fabric findTarget이 도형을 못 잡음
      currentShape.setCoords();

      state.addLine({
        id: objId,
        source: 'MANUAL', type: state.currentType,
        shape: state.currentMode.replace('DRAW_', '').toLowerCase(),
        coordinates: [{ x: startX, y: startY }, { x: endX, y: endY }],
        thickness: 4,
      });

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
        {currentMode === 'SELECT' && "💡 객체 클릭→이동/크기 조절 · 선은 노란 끝점을 끌어 편집 | [Alt+드래그] 이동 · [휠] 줌"}
        {currentMode === 'DELETE' && "🧽 삭제 모드: 지울 객체를 클릭하세요. [Alt + 드래그] 이동 | [휠] 줌"}
        {currentMode !== 'SELECT' && currentMode !== 'DELETE' && "✏️ 도형 및 선 그리기 모드. Ctrl+Z 실행취소 | [Alt + 드래그] 이동 | [휠] 줌"}
      </div>
      {/* 🖱️ 드래그앤드롭 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-indigo-950/70 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center space-y-3 border-2 border-dashed border-indigo-400 rounded-2xl px-12 py-10 bg-indigo-900/40">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div className="text-indigo-100 font-bold text-sm">여기에 파일을 놓으세요</div>
            <div className="text-indigo-300/70 text-xs">이미지 (PNG/JPG 등) 또는 CAD (DXF/DWG)</div>
          </div>
        </div>
      )}
      {/* ⏳ 파일 로딩 오버레이 (DWG 변환 등) */}
      {isLoadingFile && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-4">
            <svg className="animate-spin" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <div className="text-indigo-200 text-sm font-medium">{loadingMessage || '불러오는 중...'}</div>
          </div>
        </div>
      )}
      {/* 🏷️ 버전 정보 (빌드 시 자동 주입) */}
      <div className="absolute bottom-4 right-4 z-10 bg-black/60 text-zinc-500 text-[10px] px-2.5 py-1 rounded pointer-events-none font-mono leading-tight text-right">
        <div>StruXureAI <span className="text-zinc-300">v{__APP_VERSION__}</span> · by {__APP_DEVELOPER__}</div>
        <div className="text-zinc-600">build {__APP_BUILD_DATE__} · {__APP_COMMIT__}</div>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
