# StruXureAI
Hybrid Blueprint Structure Line Extractor using React, TypeScript, and AI Vision.

# 프로젝트 아키텍처 및 개발 로드맵: 웹 기반 도면 구조 라인 추출 시스템

React, Vite, TypeScript를 기반으로 하여 CAD 도면 및 이미지/현장 사진으로부터 구조 라인(벽체, 기둥 등)을 자동/수동으로 추출하고 편집하는 웹 워크스페이스입니다.

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
```

---

## 3. 핵심 기능 구현 로직 및 파이프라인📐

### Case A: DWG/DXF 벡터 파싱 및 기하 필터링

**바이너리 변환**: 백엔드에서 DWG를 DXF(텍스트 포맷)로 파싱하여 클라이언트에 전달합니다.

**레이어 필터링**: dxf-parser를 통해 텍스트 데이터를 읽어온 후, 구조 키워드가 포함된 레이어만 필터링합니다.
- Keywords: `['S-', 'COL', 'WALL', 'CONC', '기둥', '옹벽']`

**WebGL 시각화**: 필터링된 선 데이터를 Three.js 오브젝트로 변환하여 2D 캔버스에 렌더링합니다.

### 🤖 Case B: 이미지/사진 AI 구조 인식 및 오버레이

**이미지 전처리**: 현장 사진의 왜곡을 보정(Perspective Transform) 및 이진화 처리한 이미지를 배경에 맵핑합니다.

**AI 세그멘테이션**: 백엔드(YOLOv8-seg 기반)에서 추출한 기둥/벽체의 Polygon 좌표 데이터를 수신합니다.

**Fabric.js 매핑**: 수신한 좌표 데이터를 바탕으로 `fabric.Polygon` 객체를 생성하여 투명도가 있는 가이드 레이어로 화면에 자동 오버레이합니다.

### ✏️ Case C: 수동 벡터 드로잉 및 하이브리드 보정

**캔버스 상태 제어**: 상단 툴바 조작에 따라 드로잉 모드를 토글합니다.

**가이드 알고리즘 구현**:
- **직교 모드(Ortho)**: Shift 키 입력 시 마우스 이동 경로의 $dX, dY$를 계산하여 $0^\circ, 90^\circ$ 축으로 좌표를 강제 고정합니다.
- **그리드 스냅**: 마우스 위치 좌표를 특정 픽셀 단위로 반올림 처리하여 정밀한 선 그리기를 지원합니다.

**통합 편집 핸들러**: AI가 생성한(Case B) 객체나 직접 그린(Case C) 객체를 선택하여 정점(Vertex) 수정 및 삭제가 가능하도록 구현합니다.

---

## 4. 단계별 개발 로드맵 (Development Roadmap)

### 📅 Phase 1: 수동 드로잉 워크스페이스 구축 (Case C 우선 검증)

**기간**: 1 ~ 3주차

**목표**: 캔버스 기본 엔진 구축 및 수동 드로잉 UI 완성

**주요 태스크**:
- Vite + TypeScript + Tailwind CSS 초기 환경 세팅
- Fabric.js 기반의 Zoom / Pan이 가능한 워크스페이스 컴포넌트 구현
- 드로잉 툴바 UI 배치 (선 긋기, 지우개, 직교 가이드 모드)
- 그려진 선 객체를 `StructureLineData` 규격의 JSON 데이터로 추출하는 유틸 기능 개발

### 📅 Phase 2: AI 서버 인터페이스 연동 및 마스킹 (Case B 개발)

**기간**: 4 ~ 6주차

**목표**: 도면 사진 업로드 시 AI 가이드 라인이 연동되는 하이브리드 인터페이스 구현

**주요 태스크**:
- 파일 업로드 및 백엔드 AI 추론 결과 수신을 위한 Axios 통신 파이프라인 구축
- 응답받은 Polygon 좌표 데이터를 `fabric.Polygon` 객체로 변환하는 파서 작성
- 하이브리드 보정 구현: AI가 로딩한 가이드 라인을 사용자가 마우스로 클릭하여 미세 조정/삭제할 수 있는 이벤트 바인딩

### 📅 Phase 3: 캐드(DXF) 파싱 및 레이어 매니저 (Case A 개발)

**기간**: 7 ~ 9주차

**목표**: 대용량 벡터 데이터 파싱 및 웹 화면 시각화 안정화

**주요 태스크**:
- dxf-parser 및 three-dxf 라이브러리를 활용한 벡터 그래픽스 렌더링 파이프라인 개발
- 도면 내 레이어 목록을 추출하여 화면에 트리(Tree) 형태로 보여주는 '레이어 관리 사이드바' UI 구현
- 특정 텍스트 키워드 기반 구조 레이어 원클릭 자동 필터링 기능 구현

### 📅 Phase 4: 컴포넌트 통합 및 최적화

**기간**: 10 ~ 12주차

**목표**: 전체 모드 통합, 렌더링 성능 최적화 및 프로덕션 빌드 완료

**주요 태스크**:
- 드로잉 및 캐드 파싱 시 메모리 누수 방지 및 렌더링 최적화 (`useMemo`, `useCallback`, 캔버스 캐싱 기법 적용)
- 최종 추출된 구조 라인 통합 데이터 규격을 표준화하여 데이터베이스 및 외부 엔지니어링 툴 연동 준비
- 종합 테스트 및 버그 수정 후 배포 파이프라인 구축
