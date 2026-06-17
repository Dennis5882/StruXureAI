import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const { currentMode, lines } = useDrawingStore();

  // 🧹 툴바에서 '전체 비우기'를 눌렀을 때 캔버스 화면도 같이 지워지도록 연동
  useEffect(() => {
    if (fabricCanvasRef.current && lines.length === 0) {
      fabricCanvasRef.current.clear();
      fabricCanvasRef.current.backgroundColor = '#1e1e1e';
      fabricCanvasRef.current.requestRenderAll();
    }
  }, [lines.length]);

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
    let currentText: fabric.Text | null = null; // 📐 치수(길이)를 표시할 텍스트 변수 추가

    // 마우스 클릭 (그리기 시작)
    canvas.on('mouse:down', (opt) => {
      const state = useDrawingStore.getState();
      if (state.currentMode !== 'DRAW_LINE') return;
      
      isDrawing = true;
      const pointer = canvas.getPointer(opt.e);
      
      const colorMap: Record<string, string> = {
        WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b'
      };
      const color = colorMap[state.currentType] || '#ffffff';
      
      // 선 객체 생성
      currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        strokeWidth: 4, fill: color, stroke: color, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      });
      canvas.add(currentLine);

      // 치수 텍스트 객체 생성 (배경을 어둡게 하여 글씨가 잘 보이게 함)
      currentText = new fabric.Text('0 px', {
        left: pointer.x, top: pointer.y - 15,
        fontSize: 12, fill: '#e4e4e7', backgroundColor: 'rgba(0,0,0,0.7)',
        originX: 'center', originY: 'center', fontFamily: 'monospace',
        selectable: false, evented: false,
      });
      canvas.add(currentText);
    });

    // 마우스 드래그 (선 긋기 및 치수 실시간 렌더링)
    canvas.on('mouse:move', (opt) => {
      if (!isDrawing || !currentLine || !currentText) return;
      const pointer = canvas.getPointer(opt.e);
      let endX = pointer.x;
      let endY = pointer.y;

      if (opt.e.shiftKey || useDrawingStore.getState().isOrthoMode) {
        const startX = currentLine.x1!;
        const startY = currentLine.y1!;
        Math.abs(endX - startX) > Math.abs(endY - startY) ? endY = startY : endX = startX;
      }
      
      currentLine.set({ x2: endX, y2: endY });

      // 📐 피타고라스 정리로 두 점 사이의 실제 길이(px) 계산
      const startX = currentLine.x1!;
      const startY = currentLine.y1!;
      const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      
      // 텍스트를 선의 정중앙에 위치시키고 길이 업데이트
      currentText.set({
        left: (startX + endX) / 2,
        top: ((startY + endY) / 2) - 15, // 선 중앙에서 15px 위로
        text: ` ${Math.round(length)} px ` // 정수로 깔끔하게 출력
      });

      canvas.requestRenderAll();
    });

    // 마우스 드롭 (그리기 종료)
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
      currentText = null;
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
  }, []); // 렌더링 찌꺼기 방지를 위한 빈 배열

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
