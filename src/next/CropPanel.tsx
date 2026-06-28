import React, { useRef, useState, useMemo, useCallback } from 'react';
import { CropIcon, X, RotateCcw } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';

export interface CropBBox {
  minX: number; minY: number; maxX: number; maxY: number; // DXF world coords
}

interface Props {
  cropBBox: CropBBox | null;
  setCropBBox: (bbox: CropBBox | null) => void;
}

const SVG_W = 236;
const SVG_H = 148;
const PAD = 6;

// entity의 대표 포인트들을 world 좌표로 반환
const entityPoints = (e: any): { x: number; y: number }[] => {
  if (Array.isArray(e.vertices) && e.vertices.length > 0) {
    // 최대 4 포인트만 샘플링 (성능)
    const step = Math.max(1, Math.floor(e.vertices.length / 4));
    return e.vertices.filter((_: any, i: number) => i % step === 0);
  }
  if (e.startPoint && e.endPoint) return [e.startPoint, e.endPoint];
  if (e.center) return [e.center];
  if (e.position) return [e.position];
  return [];
};

export const filterEntitiesByCrop = (entities: any[], bbox: CropBBox | null): any[] => {
  if (!bbox) return entities;
  return entities.filter((e) => {
    const pts = entityPoints(e);
    if (pts.length === 0) return true;
    return pts.some((p) => p.x >= bbox.minX && p.x <= bbox.maxX && p.y >= bbox.minY && p.y <= bbox.maxY);
  });
};

export const CropPanel: React.FC<Props> = ({ cropBBox, setCropBBox }) => {
  const dxfEntities = useDrawingStore((s) => s.dxfEntities);

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);

  // world 전체 extents — xref 실세계좌표 극단치 제거를 위해 percentile 방식
  const worldExt = useMemo(() => {
    const allX: number[] = [], allY: number[] = [];
    for (const e of dxfEntities) {
      for (const p of entityPoints(e)) {
        if (isFinite(p.x) && isFinite(p.y)) { allX.push(p.x); allY.push(p.y); }
      }
    }
    if (allX.length === 0) return null;
    const pct = (arr: number[], p: number) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.max(0, Math.floor(s.length * p / 100))];
    };
    const minX = pct(allX, 2), maxX = pct(allX, 98);
    const minY = pct(allY, 2), maxY = pct(allY, 98);
    return { minX, minY, maxX, maxY, w: (maxX - minX) || 1, h: (maxY - minY) || 1 };
  }, [dxfEntities]);

  // world → SVG 좌표 (Y 반전, 패딩 포함)
  const w2s = useCallback((wx: number, wy: number) => {
    if (!worldExt) return { x: 0, y: 0 };
    const inner_w = SVG_W - PAD * 2;
    const inner_h = SVG_H - PAD * 2;
    const scaleX = inner_w / worldExt.w;
    const scaleY = inner_h / worldExt.h;
    const scale = Math.min(scaleX, scaleY);
    const ox = PAD + (inner_w - worldExt.w * scale) / 2;
    const oy = PAD + (inner_h - worldExt.h * scale) / 2;
    return {
      x: ox + (wx - worldExt.minX) * scale,
      y: oy + (worldExt.maxY - wy) * scale, // Y 반전
    };
  }, [worldExt]);

  // SVG → world 좌표 (Y 반전 역변환)
  const s2w = useCallback((sx: number, sy: number) => {
    if (!worldExt) return { x: 0, y: 0 };
    const inner_w = SVG_W - PAD * 2;
    const inner_h = SVG_H - PAD * 2;
    const scaleX = inner_w / worldExt.w;
    const scaleY = inner_h / worldExt.h;
    const scale = Math.min(scaleX, scaleY);
    const ox = PAD + (inner_w - worldExt.w * scale) / 2;
    const oy = PAD + (inner_h - worldExt.h * scale) / 2;
    return {
      x: worldExt.minX + (sx - ox) / scale,
      y: worldExt.maxY - (sy - oy) / scale,
    };
  }, [worldExt]);

  // SVG 이벤트 좌표
  const getSvgXY = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const commitDrag = useCallback((drag: { sx: number; sy: number; ex: number; ey: number }, ex: number, ey: number) => {
    const minSx = Math.min(drag.sx, ex), maxSx = Math.max(drag.sx, ex);
    const minSy = Math.min(drag.sy, ey), maxSy = Math.max(drag.sy, ey);
    if (Math.abs(maxSx - minSx) < 4 || Math.abs(maxSy - minSy) < 4) return;
    const topLeft  = s2w(minSx, minSy);
    const botRight = s2w(maxSx, maxSy);
    setCropBBox({ minX: topLeft.x, maxX: botRight.x, minY: botRight.y, maxY: topLeft.y });
  }, [s2w, setCropBBox]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = getSvgXY(e);
    setDrag({ sx: x, sy: y, ex: x, ey: y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = getSvgXY(e);
    setDrag((d) => d ? { ...d, ex: x, ey: y } : null);
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = getSvgXY(e);
    commitDrag(drag, x, y);
    setDrag(null);
  };
  const onMouseLeave = (e: React.MouseEvent) => {
    if (!drag) return;
    // 드래그 중 SVG를 벗어나면 마지막 위치로 커밋
    const { x, y } = getSvgXY(e);
    commitDrag(drag, drag.ex, drag.ey);
    setDrag(null);
  };

  // mini-map에 표시할 점들 (최대 2000개 샘플링)
  const dots = useMemo(() => {
    const pts: { x: number; y: number; layer: string }[] = [];
    let step = Math.max(1, Math.floor(dxfEntities.length / 400));
    for (let i = 0; i < dxfEntities.length; i += step) {
      const e = dxfEntities[i];
      const ep = entityPoints(e);
      if (ep.length > 0) {
        const mid = ep[Math.floor(ep.length / 2)];
        pts.push({ ...w2s(mid.x, mid.y), layer: e.layer });
      }
    }
    return pts;
  }, [dxfEntities, w2s]);

  // 현재 crop 범위를 SVG 사각형으로
  const cropRect = cropBBox ? (() => {
    const p1 = w2s(cropBBox.minX, cropBBox.maxY); // top-left (high worldY → low svgY)
    const p2 = w2s(cropBBox.maxX, cropBBox.minY); // bottom-right
    return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
  })() : null;

  // 드래그 중 rect
  const dragRect = drag ? {
    x: Math.min(drag.sx, drag.ex),
    y: Math.min(drag.sy, drag.ey),
    w: Math.abs(drag.ex - drag.sx),
    h: Math.abs(drag.ey - drag.sy),
  } : null;

  // crop 적용 시 포함 엔티티 수
  const filteredCount = useMemo(() => {
    if (!cropBBox) return dxfEntities.length;
    return filterEntitiesByCrop(dxfEntities, cropBBox).length;
  }, [dxfEntities, cropBBox]);

  if (dxfEntities.length === 0) return null;

  return (
    <div className="border border-zinc-700/60 rounded bg-zinc-900/60 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 font-medium">
          <CropIcon size={12} className="text-indigo-400" />
          <span>추출 범위 지정</span>
        </div>
        <div className="flex items-center gap-1">
          {cropBBox && (
            <button
              onClick={() => setCropBBox(null)}
              className="flex items-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 px-1 py-0.5 rounded hover:bg-zinc-800"
            >
              <RotateCcw size={10} />
              <span>전체</span>
            </button>
          )}
        </div>
      </div>

      {/* 미니맵 */}
      <div className="relative bg-zinc-950/80">
        <svg
          ref={svgRef}
          width={SVG_W}
          height={SVG_H}
          className="block cursor-crosshair select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        >
          {/* 엔티티 점군 */}
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={1} fill="rgba(148,163,184,0.35)" />
          ))}

          {/* 기존 crop 범위 — 바깥 어둡게 */}
          {cropRect && (
            <>
              <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="rgba(0,0,0,0.45)" />
              <rect
                x={cropRect.x} y={cropRect.y}
                width={cropRect.w} height={cropRect.h}
                fill="rgba(99,102,241,0.12)"
                stroke="rgba(99,102,241,0.8)"
                strokeWidth="1.5"
              />
              {/* 코너 핸들 표시 */}
              {[
                [cropRect.x, cropRect.y],
                [cropRect.x + cropRect.w, cropRect.y],
                [cropRect.x, cropRect.y + cropRect.h],
                [cropRect.x + cropRect.w, cropRect.y + cropRect.h],
              ].map(([cx, cy], i) => (
                <rect key={i} x={cx - 2.5} y={cy - 2.5} width={5} height={5}
                  fill="rgba(99,102,241,0.9)" />
              ))}
            </>
          )}

          {/* 드래그 중 rect */}
          {dragRect && (
            <rect
              x={dragRect.x} y={dragRect.y}
              width={dragRect.w} height={dragRect.h}
              fill="rgba(99,102,241,0.1)"
              stroke="rgba(129,140,248,0.9)"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
          )}

          {/* 전체 범위 테두리 */}
          <rect x={PAD - 1} y={PAD - 1} width={SVG_W - PAD * 2 + 2} height={SVG_H - PAD * 2 + 2}
            fill="none" stroke="rgba(63,63,70,0.6)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* 하단 통계 */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-zinc-800">
        <span className="text-[10px] text-zinc-500">
          {cropBBox ? (
            <span>
              <span className="text-indigo-400 font-medium">{filteredCount.toLocaleString()}</span>
              <span className="text-zinc-600"> / {dxfEntities.length.toLocaleString()}개</span>
            </span>
          ) : (
            <span className="text-zinc-500">{dxfEntities.length.toLocaleString()}개 · 드래그로 범위 지정</span>
          )}
        </span>
        {cropBBox && (
          <span className="text-[9px] text-zinc-600 font-mono">
            {Math.round(cropBBox.maxX - cropBBox.minX).toLocaleString()} ×{' '}
            {Math.round(cropBBox.maxY - cropBBox.minY).toLocaleString()} mm
          </span>
        )}
      </div>
    </div>
  );
};
