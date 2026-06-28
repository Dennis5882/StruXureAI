export type StructureType = 'WALL' | 'COLUMN' | 'BEAM' | 'CENTER_LINE';
export type SourceType = 'CAD' | 'AI' | 'MANUAL';
export type DrawingMode = 'SELECT' | 'DRAW_LINE' | 'DRAW_RECT' | 'DRAW_CIRCLE' | 'DRAW_TRIANGLE' | 'DELETE' | 'CROP';

export interface Point2D {
  x: number;
  y: number;
}

export interface StructureLineData {
  id: string;
  source: SourceType;
  type: StructureType;
  shape?: string; // 도형 종류 (line, rect, circle, triangle)
  coordinates: Point2D[];
  thickness?: number;
  opacity?: number;
  properties?: Record<string, any>;
}
