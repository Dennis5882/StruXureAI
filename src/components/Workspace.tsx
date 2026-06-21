import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const { currentMode, lines, undoLine, backgroundImage, dxfEntities, dxfLayers, aiPolygons, bgScale, setBgScale } = useDrawingStore();

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

    if (hasChanged) canvas.requestRenderAll();
  }, [lines]);

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
  }, [backgroundImage]);

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
        acc(e.center.x - e.radius, e.center.y - e.radius);
        acc(e.center.x + e.radius, e.center.y + e.radius);
      }
    });

    if (!isFinite(minX) || !isFinite(maxX)) { canvas.requestRenderAll(); return; }

    // 2) 캔버스에 맞춘 스케일/오프셋 (DXF Y축은 위로 향하므로 뒤집음)
    const pad = 40;
    const dxfW = (maxX - minX) || 1;
    const dxfH = (maxY - minY) || 1;
    const scale = Math.min((canvas.getWidth() - pad * 2) / dxfW, (canvas.getHeight() - pad * 2) / dxfH);
    const tx = (x: number) => pad + (x - minX) * scale;
    const ty = (y: number) => pad + (maxY - y) * scale;

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
      }

      if (obj) {
        (obj as any).isDxf = true;
        (obj as any).dxfLayer = e.layer;
        canvas.add(obj);
      }
    });

    canvas.requestRenderAll();
  }, [dxfEntities, dxfLayers]);

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
  }, [aiPolygons, bgScale]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width, height, backgroundColor: '#1e1e1e', 
      selection: useDrawingStore.getState().currentMode === 'SELECT',
    });
    
    fabricCanvasRef.current = canvas;

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
    });

    let isDrawing = false;
    let currentShape: fabric.Object | null = null;
    let currentText: fabric.Text | null = null;
    let startX = 0;
    let startY = 0;
    let objId = '';

    canvas.on('mouse:down', (opt) => {
      const state = useDrawingStore.getState();
      const mode = state.currentMode;
      if (!mode.startsWith('DRAW_')) return;
      
      isDrawing = true;
      const pointer = canvas.getPointer(opt.e);
      startX = pointer.x;
      startY = pointer.y;
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
      if (!isDrawing || !currentShape || !currentText) return;
      const state = useDrawingStore.getState();
      const pointer = canvas.getPointer(opt.e);
      let endX = pointer.x;
      let endY = pointer.y;

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
      if (!isDrawing || !currentShape) return;
      isDrawing = false;
      const state = useDrawingStore.getState();
      const pointer = canvas.getPointer(opt.e); // 최종 포인터 위치
      
      state.addLine({
        id: objId,
        source: 'MANUAL', type: state.currentType,
        shape: state.currentMode.replace('DRAW_', '').toLowerCase(),
        coordinates: [{ x: startX, y: startY }, { x: pointer.x, y: pointer.y }],
        thickness: 4,
      });
      
      currentShape = null;
      currentText = null;
    });

    const handleResize = () => {
      if (!containerRef.current) return;
      canvas.setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => { window.removeEventListener('resize', handleResize); canvas.dispose(); };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (currentMode === 'SELECT') {
      canvas.selection = true;
      canvas.forEachObject((obj: any) => {
        // DXF 도면/AI 오버레이는 배경 참조용이므로 선택 불가 유지
        if (obj.isDxf || obj.isAi) return;
        obj.selectable = true; obj.evented = true;
      });
    } else {
      canvas.selection = false;
      canvas.forEachObject((obj) => { obj.selectable = false; obj.evented = false; });
    }
    canvas.requestRenderAll();
  }, [currentMode]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-zinc-900">
      <div className="absolute bottom-4 left-4 z-10 bg-black/70 text-zinc-300 text-xs px-3 py-1.5 rounded pointer-events-none font-mono">
        {currentMode === 'SELECT' && "💡 [Alt + 드래그] 뷰포트 이동 | [마우스 휠] 줌 인/아웃"}
        {currentMode !== 'SELECT' && "✏️ 도형 및 선 그리기 모드. Ctrl+Z 를 눌러 실행을 취소할 수 있습니다."}
      </div>
      {/* 🏷️ 버전 정보 (빌드 시 자동 주입) */}
      <div className="absolute bottom-4 right-4 z-10 bg-black/60 text-zinc-500 text-[10px] px-2.5 py-1 rounded pointer-events-none font-mono leading-tight text-right">
        <div>StruXureAI <span className="text-zinc-300">v{__APP_VERSION__}</span> · by {__APP_DEVELOPER__}</div>
        <div className="text-zinc-600">build {__APP_BUILD_DATE__} · {__APP_COMMIT__}</div>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
