import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useDrawingStore } from '../store/useDrawingStore';
import { Point2D } from '../types/drawing';

export const Workspace: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { currentMode, currentType, isOrthoMode, setZoom, setPan, addLine } = useDrawingStore();

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width, height, backgroundColor: '#1e1e1e', selection: currentMode === 'SELECT',
    });

    canvas.on('mouse:wheel', (opt) => {
      const evt = opt.e;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** evt.deltaY;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.1) zoom = 0.1;
      canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);
      setZoom(zoom);
      evt.preventDefault();
      evt.stopPropagation();
    });

    let isDrawing = false;
    let currentLine: fabric.Line | null = null;

    canvas.on('mouse:down', (opt) => {
      if (useDrawingStore.getState().currentMode !== 'DRAW_LINE') return;
      isDrawing = true;
      const pointer = canvas.getPointer(opt.e);
      const color = useDrawingStore.getState().currentType === 'WALL' ? '#ef4444' : '#3b82f6';
      
      currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        strokeWidth: 4, fill: color, stroke: color, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      });
      canvas.add(currentLine);
    });

    canvas.on('mouse:move', (opt) => {
      if (!isDrawing || !currentLine) return;
      const pointer = canvas.getPointer(opt.e);
      let endX = pointer.x;
      let endY = pointer.y;

      if (opt.e.shiftKey || useDrawingStore.getState().isOrthoMode) {
        const startX = currentLine.x1!;
        const startY = currentLine.y1!;
        Math.abs(endX - startX) > Math.abs(endY - startY) ? endY = startY : endX = startX;
      }
      currentLine.set({ x2: endX, y2: endY });
      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', () => {
      if (!isDrawing || !currentLine) return;
      isDrawing = false;
      addLine({
        source: 'MANUAL', type: useDrawingStore.getState().currentType,
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

    return () => { window.removeEventListener('resize', handleResize); canvas.dispose(); };
  }, [currentMode, currentType, isOrthoMode, setZoom, setPan, addLine]);

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
