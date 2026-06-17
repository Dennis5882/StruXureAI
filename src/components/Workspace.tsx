import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const { currentMode, lines } = useDrawingStore();

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
    let currentText: fabric.Text | null = null;

    canvas.on('mouse:down', (opt) => {
      const state = useDrawingStore.getState();
      if (state.currentMode !== 'DRAW_LINE') return;
      
      isDrawing = true;
      const pointer = canvas.getPointer(opt.e);
      
      const colorMap: Record<string, string> = {
        WALL: '#ef4444', COLUMN: '#3b82f6', BEAM: '#22c55e', CENTER_LINE: '#f59e0b'
      };
      const color = colorMap[state.currentType] || '#ffffff';
      
      currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        strokeWidth: 4, fill: color, stroke: color, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      });
      canvas.add(currentLine);

      currentText = new fabric.Text('', {
        left: pointer.x, top: pointer.y - 15,
        fontSize: 12, fill: '#e4e4e7', backgroundColor: 'rgba(0,0,0,0.7)',
        originX: 'center', originY: 'center', fontFamily: 'monospace',
        selectable: false, evented: false,
      });
      canvas.add(currentText);
    });

    canvas.on('mouse:move', (opt) => {
      if (!isDrawing || !currentLine || !currentText) return;
      const state = useDrawingStore.getState();
      const pointer = canvas.getPointer(opt.e);
      let endX = pointer.x;
      let endY = pointer.y;

      if (opt.e.shiftKey || state.isOrthoMode) {
        const startX = currentLine.x1!;
        const startY = currentLine.y1!;
        Math.abs(endX - startX) > Math.abs(endY - startY) ? endY = startY : endX = startX;
      }
      currentLine.set({ x2: endX, y2: endY });

      // 📐 길이 계산 및 설정된 단위/축척 반영
      const startX = currentLine.x1!;
      const startY = currentLine.y1!;
      const pixelLength = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      
      // 1px 당 스케일(scaleRatio) 곱하기
      const realLength = pixelLength * state.scaleRatio;
      
      // m(미터) 단위일 때는 소수점 2자리까지, 나머지는 정수로 깔끔하게 표시
      let displayValue = state.unit === 'm' ? realLength.toFixed(2) : Math.round(realLength).toString();

      currentText.set({
        left: (startX + endX) / 2,
        top: ((startY + endY) / 2) - 15,
        text: ` ${displayValue} ${state.unit} `
      });

      canvas.requestRenderAll();
    });

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
        {currentMode === 'DRAW_LINE' && "✏️ 상단의 단위를 변경하여 실제 스케일에 맞게 드로잉하세요."}
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
