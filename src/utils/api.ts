import { Point2D } from '../types/drawing';

// 🤖 가상의 AI 서버 통신 함수 (추후 실제 백엔드 API로 교체)
export const fetchAIAnalysis = async (imageUrl: string): Promise<{ id: string, type: string, points: Point2D[] }[]> => {
  return new Promise((resolve) => {
    // AI 모델이 이미지를 분석하는 시간(2초)을 시뮬레이션합니다.
    setTimeout(() => {
      resolve([
        // YOLOv8-seg 모델이 반환할 다각형(Polygon) 좌표 데이터 예시
        { id: 'ai_wall_1', type: 'WALL', points: [{x: 200, y: 200}, {x: 600, y: 200}, {x: 600, y: 220}, {x: 200, y: 220}] },
        { id: 'ai_col_1', type: 'COLUMN', points: [{x: 180, y: 180}, {x: 220, y: 180}, {x: 220, y: 240}, {x: 180, y: 240}] },
        { id: 'ai_wall_2', type: 'WALL', points: [{x: 200, y: 400}, {x: 600, y: 400}, {x: 600, y: 420}, {x: 200, y: 420}] }
      ]);
    }, 2000);
  });
};
