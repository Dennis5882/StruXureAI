# StruXureAI
Hybrid Blueprint Structure Line Extractor using React, TypeScript, and AI Vision.

# 프로젝트 아키텍처 및 개발 로드맵: 웹 기반 도면 구조 라인 추출 시스템

React, Vite, TypeScript를 기반으로 하여 CAD 도면 및 이미지/현장 사진으로부터 구조 라인(벽체, 기둥 등)을 자동/수동으로 추출하고 편집하는 웹 워크스페이스 시스템 구축 계획입니다.

---

## 1. 기술 스택 및 핵심 의존성 (Tech Stack & Dependencies)

### 프론트엔드 핵심 환경
- **Framework**: React 18+ (Functional Components)
- **Build Tool**: Vite (Fast HMR)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS
- **State Management**: Zustand (Canvas 전역 상태 및 모드 관리)

### Case별 오픈소스 라이브러리
- **Case A (CAD 파싱)**: `three`, `three-dxf`, `dxf-parser`
- **Case B & C (AI 및 수동 드로잉)**: `fabric` (v6+ TypeScript 환경 권장) 또는 `konva`
- **Utility / UI**: `lucide-react` (아이콘), `axios` (API 통신)

---

## 2. 데이터 규격 정의 (TypeScript Types)

AI 모델 및 인터페이스 간의 일관성을 유지하기 위한 핵심 데이터 모델 정의입니다. `src/types/drawing.ts` 파일의 기본 뼈대가 됩니다.

```typescript
export type StructureType = 'WALL' | 'COLUMN' | 'BEAM' | 'CENTER_LINE';
export type SourceType = 'CAD' | 'AI' | 'MANUAL';
export type DrawingMode = 'SELECT' | 'DRAW_LINE' | 'DRAW_RECT' | 'DELETE';

export interface Point2D {
  x: number;
  y: number;
}

export interface StructureLineData {
  id: string;
  source: SourceType;
  type: StructureType;
  coordinates: Point2D[]; // 선의 시작점과 끝점, 또는 폴리곤의 정점 배열
  thickness?: number;
  opacity?: number;
  properties?: Record<string, any>; // CAD 레이어명 또는 AI 신뢰도 점수 등
}

