import { Point2D } from '../types/drawing';

export interface AIPolygon {
  id: string;
  type: string;
  points: Point2D[];
}

// 🤖 백엔드 AI 분석 API 엔드포인트 (Vercel 환경변수로 주입)
//   - 설정되어 있으면 실제 서버(YOLOv8-seg 등)로 이미지를 전송
//   - 설정이 없으면 아래 목(mock) 데이터로 폴백하여 프론트 단독 동작 보장
const API_URL = import.meta.env.VITE_AI_API_URL as string | undefined;

// 목 데이터: 백엔드 미연동 환경에서의 UI 검증용
const mockAnalysis = (): Promise<AIPolygon[]> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 'ai_wall_1', type: 'WALL', points: [{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 220 }, { x: 200, y: 220 }] },
        { id: 'ai_col_1', type: 'COLUMN', points: [{ x: 180, y: 180 }, { x: 220, y: 180 }, { x: 220, y: 240 }, { x: 180, y: 240 }] },
        { id: 'ai_wall_2', type: 'WALL', points: [{ x: 200, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 420 }, { x: 200, y: 420 }] },
      ]);
    }, 2000);
  });

// blob URL(또는 일반 URL) → Blob 변환 (멀티파트 업로드용)
const urlToBlob = async (url: string): Promise<Blob> => {
  const res = await fetch(url);
  return res.blob();
};

export const fetchAIAnalysis = async (imageUrl: string): Promise<AIPolygon[]> => {
  // 엔드포인트 미설정 시 목으로 폴백
  if (!API_URL) {
    console.warn('[StruXureAI] VITE_AI_API_URL 미설정 → 목(mock) 데이터 사용');
    return mockAnalysis();
  }

  const blob = await urlToBlob(imageUrl);
  const form = new FormData();
  form.append('image', blob, 'drawing.png');

  const res = await fetch(API_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`AI 서버 오류: ${res.status}`);

  const data = await res.json();
  // 서버 응답 형태: { polygons: AIPolygon[] } 또는 AIPolygon[] 모두 허용
  const polygons: AIPolygon[] = Array.isArray(data) ? data : data.polygons ?? [];
  return polygons;
};
