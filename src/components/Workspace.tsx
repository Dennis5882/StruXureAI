import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const { currentMode } = useDrawingStore();

  // 1. 캔버스 초기화 (도화지는 처음에 딱 한 번만 깝니다!)
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width, height, backgroundColor: '#1e1e1e', 
      selection: useDrawingStore.getState().currentMode === 'SELECT',
    });
    
    fabricCanvasRef.current = canvas;

    // 마우스 휠 줌
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
    let currentLine: fabric.Line | null = null;

    // 마우스 클릭 (그리기 시작)
    canvas.on('mouse:down', (opt) => {
      const state = useDrawingStore.getState();
      if (state.currentMode !== 'DRAW_LINE') return;
      
      isDrawing = true;
      const pointer = canvas.getPointer(opt.e);
      
      // 상태 창고에서 최신 부재 타입을 가져와 색상 지정
      const colorMap: Record<string, string> = {
        WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b'
      };
      const color = colorMap[state.currentType] || '#ffffff';
      
      currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        strokeWidth: 4, fill: color, stroke: color, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      });
      canvas.add(currentLine);
    });

    // 마우스 드래그 (선 긋기 및 직교 스냅)
    canvas.on('mouse:move', (opt) => {
      if (!isDrawing || !currentLine) return;
      const pointer = canvas.getPointer(opt.e);
      let endX = pointer.x;
      let endY = pointer.y;

      // 직교 모드 실시간 체크
      if (opt.e.shiftKey || useDrawingStore.getState().isOrthoMode) {
        const startX = currentLine.x1!;
        const startY = currentLine.y1!;
        Math.abs(endX - startX) > Math.abs(endY - startY) ? endY = startY : endX = startX;
      }
      currentLine.set({ x2: endX, y2: endY });
      canvas.requestRenderAll();
    });

    // 마우스 드롭 (그리기 종료 및 데이터 저장)
    canvas.on('mouse:up', () => {
      if (!isDrawing || !currentLine) return;
      isDrawing = false;
      const state = useDrawingStore.getState();
      
      state.addLine({
        source: 'MANUAL', type: state.currentType,
        coordinates: [{ x: currentLine.x1!, y: currentLine.y1! }, { x: currentLine.x2!, y: currentLine.y2! }],
        thickness: 4,
      });
      currentLine = null;
    });

    const handleResize = () => {
      if (!containerRef.current) return;
      canvas.setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => { 
      window.removeEventListener('resize', handleResize); 
      canvas.dispose(); 
    };
  }, []); // <-- 핵심 수정 사항: 빈 배열을 넣어 렌더링 찌꺼기 방지

  // 2. '선택 모드' ↔ '그리기 모드' 전환 시 객체 선택 가능 여부만 업데이트
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
        {currentMode === 'SELECT' && "💡 [Alt + 마우스 드래그] 또는 패닝으로 도면을 이동할 수 있습니다."}
        {currentMode === 'DRAW_LINE' && "✏️ 드로잉 모드: Canvas 위에 구조 라인을 추출하세요."}
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
