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

## 2. 좌표계 원칙 (결정됨)

- **렌더·편집은 캔버스 px 단일 시스템 유지**(기존 `StructureLineData`). 이중 좌표계 복잡도 회피.
- **구조적 의미는 mm로 `properties`에 동반 저장**: `thickness_mm`, `gridRef`, 단면(w/d mm), 축선 여부 등.
- **월드(mm) 복원**: `world = inverse(dxfTransform)` — `x_mm = minX + (px - pad)/scale`, `y_mm = maxY - (py - pad)/scale`.
  px↔mm 가역이므로 정보 손실 없음. **MIDAS 내보내기(P4)에서 mm로 변환**.
- 다층/전용 모델이 필요해지는 시점(P4)에 `BuildingModel`(월드 mm)로 승격.
- **가교 유틸 추상화(권장, Gemini)**: 상태 레이어에 `worldToCanvas(vec, transform)`,
  `canvasToWorld(vec, transform)`를 견고히 추상화. 두 시스템은 데이터로는 분리하되 변환은 한 곳에서.
- **생명주기 정의**: 드로잉 보조선이 구조부재로 **승격(Promote)** 되거나 모델 변경이 드로잉에 **반영(Reflect)** 되는
  트리거를 명확히(예: "구조모델 추출" 시 승격, 편집 시 양방향). 공존기 혼선 최소화.

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
2. **최소면적 사각형**(rotating calipers)으로 center·width·depth·rotation 산출
   (정렬 안 된 기둥/사선 기둥 대응). ✅ 구현 `minAreaRect`(v0.15.0): 볼록껍질 변 방향 투영 최소면적, 각도 (-45,45] 정규화·직교 스냅.
3. `gridRef` = 가장 가까운 X라벨 + Y라벨 (tol 내).
4. 중복 제거(center 근접), 그리드 교점 스냅(가까울 때만).

### 4.3 벽 (Wall) — 핵심
1. 벽 레이어 면선 수집(월드). 조적 제외.
2. **면 쌍 매칭**: 각 면선에 대해 근평행 + 두께범위 + 길이중첩인 상대 면선 탐색
   → 축선 = 두 면의 중점선, 두께 = 수직거리. (현행 `extractCenterLinesFromWalls` 원리 확장)
3. **런(run) 병합**: 동일선상 인접 축선을 폴리라인으로 연결(현행 `mergeCollinearLines` 확장,
   2점→다점 폴리라인 유지).
4. **두께 양자화(옵션)**: §5의 지역별 프리셋 테이블로 표준치 스냅.
5. **단일선 벽 처리**: 짝 없는 벽선은 (a)기본두께 부여 또는 (b)보류 — 플래그로 표시.
6. 산출: Wall(axis+thickness). **면선은 모델에 넣지 않음**(원본은 배경 렌더로만).

> ⚠️ **현실화(Gemini)**: T자 교차·L자 모서리·벽 단부 마감선 등 **예외 케이스가 많음**.
> P1은 "정형적 평행 벽체 축선 추출 + 교차부 **예외 플래그**"까지로 범위를 잡고,
> 복잡한 교차부 정리는 **P3(위상 정리)** 로 이관해 리스크를 분산한다.

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

### 5.1 두께 양자화 — 지역별 프리셋(Quantization Table Preset, Gemini)
- 코드가 특정 두께표에 의존하지 않도록, **프리셋 주입형**으로 설계.
  `profile: 'KR-Standard' | 'TW-Standard' | 'raw'` (BuildingModel/시스템 설정 레벨).
- 예시 테이블(벽 두께 mm):
  - `TW-Standard`(대만/동남아 RC): **120, 150, 180, 200, 240, 250, 300, 400**
  - `KR-Standard`: 150, 200, 250, 300, …(추후 확정)
  - `raw`: 양자화 끔(측정값 + 5mm 반올림만)
- 측정값을 프리셋 중 **가장 가까운 값(±tol)** 으로 스냅. 기둥 단면도 동일 방식 확장 가능.

---

## 6. 층기반 모델링 로드맵
1. **층 단위 import**: DWG 1장 = FloorModel 1개. 사용자에 elevation/height/이름 입력받기.
2. **다층 스택**: BuildingModel.floors[]. 평면 정합(공통 원점/그리드).
3. **수직 연속성**: 같은 `gridRef` 기둥을 층간 연결(컬럼 스택), 불연속 경고.
4. **내보내기**:
   - JSON(자체 포맷, 왕복),
   - DXF(정리본),
   - **구조해석 연계 — MIDAS** (그리드/절점/기둥/벽/보 → MIDAS Gen 모델, API 활용. `new-midas-api` 참고).
   - **P4 PoC 범위(Gemini)**: 개구부 제외, **절점(Node)+선/판 요소(Element)의 기하 정합성**에 집중.
     도면만으로 단면강성·재질(콘크리트 강도 등) 특정은 어려우므로, 부재 종류별 **더미 속성**
     (`Dummy_C1`, `Dummy_W1` …)으로 매핑해 내보내고 → 사용자가 MIDAS에서 일괄로 실제 단면/재질 대입.

---

## 7. 단계 계획 & 완료기준(AC)

| 단계 | 범위 | 완료기준 |
|---|---|---|
| **P1** | 벽 축선·두께(mm) + 그리드 1급화 + 기둥 메타/gridRef | **정형 평행벽** 축선 추출(교차부는 예외 플래그) + 기둥 gridRef + 그리드 라벨. Playwright 검증. *복잡 교차부는 P3로 이관* |
| **P2** ✅ | 보 추출 | 보 레이어 있으면 보 부재 생성 — `pairFaces`(이중선)+단일선 폴백(v0.17.0). 합성검증 완료, 실데이터 검증 대기(B1F엔 보 레이어 없음) |
| **P3** ✅ | 위상 정리(스냅·trim/extend) | 축선이 기둥/교차점에 연결(절점 그래프) — `cleanupTopology`(v0.14.0). B1F: 39벽 전부 `n0/n1` 태깅, 접합 절점 14 |
| **P4** | 층 조립 + 내보내기(JSON/DXF→MIDAS) | 다층 모델 1개 왕복 + MIDAS 연계 PoC |

---

## 8. 결정 사항
1. ✅ **최종 타깃 = MIDAS** (구조해석). 스키마/내보내기를 MIDAS Gen 모델에 정렬.
2. ✅ **좌표**: 캔버스 px 단일 시스템 + mm를 `properties`에 동반(§2). MIDAS 내보내기 시 mm 변환.
3. ✅ **두께 양자화**: 기본 = 측정값 + 5mm 반올림. 표준 스냅은 **지역별 프리셋 주입형**(§5.1, `TW-Standard` 등), 기본 끔.
4. **단일선 벽**(짝 없는 벽선): 기본두께 부여 vs 보류 — P1에서 "보류+플래그"로 시작.
5. **그리드 라벨 소스**: 1차는 정렬 자동번호(X1.. 좌→우, Y1.. 하→상). **버블 TEXT 매칭은 후속**
   (자동번호는 CEN의 보조 중심선까지 세어 실제 버블 X1‥X10과 어긋날 수 있음 — 버블 매칭으로 정합·필터 예정).
6. ✅ **MIDAS 매핑(Gemini)**: P4는 **절점+선/판 요소 기하 정합**에 집중, **더미 속성**(`Dummy_C1`/`Dummy_W1`)으로 내보내고
   단면/재질은 사용자가 MIDAS에서 일괄 대입. 개구부·하중은 추후.

---

## 9. 다음 행동
P1 착수 시 작업 순서(예정):
1. `src/types/structural.ts` 스키마 + store `model` 상태.
2. `extractGrid` → 라벨 포함 Grid 객체로 승격(월드).
3. 벽 면쌍→축선+두께(월드), 런 폴리라인 병합.
4. 기둥 최소면적사각형 + gridRef.
5. 부재 모델 렌더(축선=중심선 스타일, 기둥=박스+라벨) + 검증.
