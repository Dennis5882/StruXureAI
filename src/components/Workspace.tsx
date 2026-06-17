import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const { currentMode, lines, undoLine } = useDrawingStore();

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

    canvas.on('mouse:up', () => {
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
      canvas.forEachObject((obj) => { obj.selectable = true; obj.evented = true; });
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
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
