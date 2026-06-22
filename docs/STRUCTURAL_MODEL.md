# 정밀 구조부재 추출 & 층기반 구조모델링 — 설계문서

> 목적: 벡터(DWG/DXF)에서 **정밀한 구조부재**를 뽑아 **층기반 구조모델**을 만들고,
> 최종적으로 구조해석/BIM(예: MIDAS)으로 연계한다.
> 상태: 설계(Design) · 기준 버전 v0.12.0 · 작성 2026-06-23
> 관련: [MODULES.md](./MODULES.md)

---

## 0. 큰 그림 (왜 이게 핵심인가)

```
DWG/DXF (벡터)
   │  ① 정밀 추출 (이 문서의 핵심)
   ▼
구조부재 (그리드 · 기둥 · 벽 · 보)  ── 월드좌표(mm), 위상 연결
   │  ② 층 조립
   ▼
층기반 구조모델 (FloorModel × N → BuildingModel)
   │  ③ 내보내기
   ▼
구조해석/BIM (MIDAS Gen 등) · DXF · JSON
```

①의 정밀도가 전체 품질을 좌우한다. 부재가 "선 더미"가 아니라 **축선+단면을 가진 부재**여야
②층 조립(수직 연속성)과 ③해석 연계가 가능하다.

---

## 1. 현재 상태 & 한계 (v0.12.0)

구현됨: 레이어 필터, `extractMembersFromDxf`(벽 면선/기둥 bbox), `extractCenterLinesFromWalls`(중심선+병합), 그리드 추출(`extractGrid`), 조적 제외, 기둥 그리드 스냅.

**정밀도 한계:**
1. **벽 = 면(face) 선 더미** — 한 벽이 면2개 + 별도 중심선으로 중복 표현. "부재"가 아님.
2. **좌표가 캔버스 px** — `dxfTransform`로 화면맞춤된 px 저장. 뷰 의존적이라 영속·내보내기·다층에 부적합. → **월드(mm) 저장 필요.**
3. **기둥 메타 부족** — 회전·단면명·`gridRef` 없음.
4. **보(Beam) 미추출.**
5. **위상 없음** — 부재 접합(벽-기둥, 벽-벽 교차) 미연결. 해석모델은 절점/부재 그래프가 필요.
6. **그리드 라벨 없음** — 축 위치만, X1/Y3 라벨·간격 미연동.

---

## 2. 좌표계 원칙 (중요)

- **구조모델은 월드좌표(mm)로 저장.** DXF 원본 단위를 유지(통상 mm).
- 화면 렌더링 시에만 `dxfTransform`(scale/minX/maxY/pad)로 캔버스 px 변환.
- 기존 `StructureLineData.coordinates`(캔버스 px, 드로잉 레이어)와 **분리**한다.
  - 드로잉 레이어: 사용자가 손으로 그리는 보조선(기존 유지).
  - 구조모델 레이어: 추출/편집된 실제 부재(신규, 월드 mm).

---

## 3. 목표 데이터 모델 (스키마)

> 1차: 아래를 `src/types/structural.ts`로 신설. 저장은 zustand에 `model: BuildingModel`.
> 기존 `StructureLineData`는 드로잉 보조로 유지(점진 이행, 큰 재작성 회피).

```ts
type Vec2 = { x: number; y: number }; // 월드 mm

interface GridAxis {
  id: string;
  label: string;        // "X1", "Y3" …
  dir: 'X' | 'Y';       // X축선=세로선(상수 x), Y축선=가로선(상수 y)
  position: number;     // 월드 좌표(mm): dir==='X'→x, dir==='Y'→y
}
interface Grid {
  axes: GridAxis[];
  // 파생: 간격 = 인접 position 차이
}

interface Column {
  id: string;
  center: Vec2;         // mm
  width: number;        // 단면 b (mm, 로컬 x)
  depth: number;        // 단면 h (mm, 로컬 y)
  rotation: number;     // deg, 반시계
  gridRef?: string;     // "X3-Y5"
  sectionName?: string; // "C1" 등(있으면)
  layer?: string;
}
interface Wall {
  id: string;
  axis: Vec2[];         // 중심선 폴리라인(2점 이상) — 면이 아니라 축선
  thickness: number;    // 측정/양자화된 두께(mm)
  gridLine?: string;    // 축선 위면 라벨
  layer?: string;
}
interface Beam {
  id: string;
  axis: Vec2[];         // 중심선
  width: number;        // 폭(mm)
  depth?: number;
  gridLine?: string;
  layer?: string;
}
// 추후: Slab, Opening(개구부), Brace

interface FloorModel {
  id: string;
  name: string;         // "B1F", "2F" …
  elevation: number;    // 바닥 레벨(mm)
  height: number;       // 층고(mm)
  grid: Grid;
  columns: Column[];
  walls: Wall[];
  beams: Beam[];
  sourceFile?: string;
}
interface BuildingModel {
  units: 'mm';
  floors: FloorModel[];
}
```

설계 의도:
- **Wall.axis + thickness** = 정밀도의 핵심. 면선 대신 축선 1개로 부재 표현.
- 모든 좌표 mm. 렌더 시 변환.
- `gridRef`/`gridLine`으로 그리드와 결합 → 층 조립·라벨링·해석 매핑의 기반.

---

## 4. 추출 알고리즘 (정밀)

### 4.1 그리드 (Grid)
1. 축선 레이어(`AXIS/AXN/축/軸/通り`)의 직선 수집(월드).
2. 수직선(|dx|≈0)→X축선 position(x), 수평선(|dy|≈0)→Y축선 position(y). tol로 클러스터.
3. **라벨링**: 버블 레이어(`BUBBLE`/원+TEXT)의 문자(X1,Y3…)를 가장 가까운 축 position에 매칭.
   버블이 없으면 정렬 순서로 X1..Xn, Y1..Yn 자동 부여.
4. 간격 = 인접 position 차.

### 4.2 기둥 (Column)
1. 기둥 레이어 엔티티 → 정점 수집.
2. **최소면적 사각형**(rotating calipers 또는 PCA)으로 center·width·depth·rotation 산출
   (정렬 안 된 기둥/사선 기둥 대응).
3. `gridRef` = 가장 가까운 X라벨 + Y라벨 (tol 내).
4. 중복 제거(center 근접), 그리드 교점 스냅(가까울 때만).

### 4.3 벽 (Wall) — 핵심
1. 벽 레이어 면선 수집(월드). 조적 제외.
2. **면 쌍 매칭**: 각 면선에 대해 근평행 + 두께범위 + 길이중첩인 상대 면선 탐색
   → 축선 = 두 면의 중점선, 두께 = 수직거리. (현행 `extractCenterLinesFromWalls` 원리 확장)
3. **런(run) 병합**: 동일선상 인접 축선을 폴리라인으로 연결(현행 `mergeCollinearLines` 확장,
   2점→다점 폴리라인 유지).
4. **두께 양자화(옵션)**: 측정두께를 표준(100/150/200/250/300mm…)에 스냅.
5. **단일선 벽 처리**: 짝 없는 벽선은 (a)기본두께 부여 또는 (b)보류 — 플래그로 표시.
6. 산출: Wall(axis+thickness). **면선은 모델에 넣지 않음**(원본은 배경 렌더로만).

### 4.4 보 (Beam)
- 보 레이어(`S-BEAM/BEAM/보/梁/大梁/小梁`) → 보통 중심선 1개 → axis 직접 사용.
- 폭은 병행 2선이면 측정, 아니면 라벨/기본값.

### 4.5 위상 정리 (Topology)
1. 축선 끝점을 가까운 **기둥 center / 다른 축선 끝점**에 스냅(클러스터=절점).
2. 교차하는 축선은 교점까지 **trim/extend**(T·L·+ 접합).
3. 결과: 절점(node)–부재(member) 그래프 → 해석모델 직전 형태.

---

## 5. 정규화 / 보정 옵션
- 그리드 스냅(기둥·축선 끝점), 직교 보정(±tol→수평/수직), 두께 양자화,
  최소 부재 길이 필터(노이즈 제거), 중복 부재 병합.
- 모두 토글 가능하게(과보정 방지).

---

## 6. 층기반 모델링 로드맵
1. **층 단위 import**: DWG 1장 = FloorModel 1개. 사용자에 elevation/height/이름 입력받기.
2. **다층 스택**: BuildingModel.floors[]. 평면 정합(공통 원점/그리드).
3. **수직 연속성**: 같은 `gridRef` 기둥을 층간 연결(컬럼 스택), 불연속 경고.
4. **내보내기**:
   - JSON(자체 포맷, 왕복),
   - DXF(정리본),
   - **구조해석 연계 — MIDAS** (그리드/절점/기둥/벽/보 → MIDAS Gen 모델, API 활용. `new-midas-api` 참고).

---

## 7. 단계 계획 & 완료기준(AC)

| 단계 | 범위 | 완료기준 |
|---|---|---|
| **P1** | structural.ts 스키마 + 월드좌표 추출 + 벽 축선·두께 + 그리드 1급화 + 기둥 메타/gridRef | B1F에서 벽이 면선이 아닌 **축선 부재**로, 기둥에 gridRef, 그리드 라벨 표시. Playwright 검증 |
| **P2** | 보 추출 | 보 레이어 있으면 보 부재 생성 |
| **P3** | 위상 정리(스냅·trim/extend) | 축선이 기둥/교차점에 연결(절점 그래프) |
| **P4** | 층 조립 + 내보내기(JSON/DXF→MIDAS) | 다층 모델 1개 왕복 + MIDAS 연계 PoC |

---

## 8. 미해결 결정 사항 (논의 필요)
1. **두께 양자화**: 측정값 그대로 vs 표준치 스냅(국가/회사 표준?). 대만/동남아 표준 확인 필요.
2. **단일선 벽**: 기본두께 부여 정책.
3. **렌더링**: 부재 모델을 fabric에 별도 레이어로 그릴지(현 lines-sync 확장) vs 전용 렌더.
4. **그리드 라벨 소스**: 버블 TEXT 신뢰도(폰트/회전) — 실패 시 자동 번호.
5. **MIDAS 매핑 범위**: 어디까지(절점·부재만 vs 단면·하중까지).
6. **좌표 이행**: 기존 `StructureLineData`(px)와 신규 모델(mm) 공존 기간/통합 시점.

---

## 9. 다음 행동
P1 착수 시 작업 순서(예정):
1. `src/types/structural.ts` 스키마 + store `model` 상태.
2. `extractGrid` → 라벨 포함 Grid 객체로 승격(월드).
3. 벽 면쌍→축선+두께(월드), 런 폴리라인 병합.
4. 기둥 최소면적사각형 + gridRef.
5. 부재 모델 렌더(축선=중심선 스타일, 기둥=박스+라벨) + 검증.
