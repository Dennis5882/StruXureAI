# StruXureAI — 진행상황 & 앞으로 할 일 (통합 기록)

> 이 문서는 작업 핸드오프용 단일 기록. 대화가 압축돼도 여기서 맥락을 복구한다.
> 기준 버전: **v0.13.1** · 갱신: 2026-06-23 · 배포: Vercel (`stru-xure-ai.vercel.app`)
> 함께 보기: [STRUCTURAL_MODEL.md](./STRUCTURAL_MODEL.md)(정밀추출 설계) · [MODULES.md](./MODULES.md)(OSS 조사)

---

## 0. 큰 그림 / 방향 (절대 잊지 말 것)
- **최종 목표**: 벡터(DWG/DXF) → **정밀 구조부재 추출** → **층기반 구조모델** → **MIDAS 구조해석 연계**.
  (사용자 = MIDAS IT 소속. 내보내기 타깃 = MIDAS Gen.)
- **시장**: 주로 **대만/동남아**(+한국). 레이어/도면 관례가 서구와 다름.
- **단계**: 현재 **학습용**(상용화 전). → GPL(LibreDWG)/academic(ArchCAD) 라이선스는 지금은 비차단, 상용화 시점에 정리.
- **AI 정책**: AI 인식은 **DWG가 없을 때(사진/스캔)만**. 공개 래스터 모델은 도메인 불일치로 품질 부족 → 추후 대만/동남아 도면으로 파인튜닝. CAD(벡터)는 **기하/심볼스포팅**이 정답.
- **검증 방식**: 로컬 빌드 + Playwright(헤드리스)로 실제 `B1F 1.dwg` 동작 확인이 표준. (`npm run preview -- --port 4317`)

---

## 1. 완료됨 (v0.13.1까지)
- **DWG/DXF 열기·렌더**: libredwg-web(WASM, DWG→DXF), INSERT(블록)/DIMENSION/SPLINE/ARC/ELLIPSE/TEXT 렌더, 레이어 사이드바+자동필터, 드래그앤드롭.
- **편집**: 그리드 스냅, fabric 네이티브 선택·이동·**크기조절·회전**(`setCoords` 누락이 원인이었음), 선 정점(vertex) 편집, 지우개.
- **정밀 구조모델 추출(P1)**: 벽=**축선+두께(mm)**, 기둥=**bbox+단면(mm)+gridRef**, 그리드 추출 + **버블 라벨 정합**(X1~X10/Y1~Y8), 조적 제외, 중복정리, 그리드스냅, 중심선 연결성 병합.
- **운영**: Vercel 방문자 분석(@vercel/analytics), 재배포 stale-chunk 자동 새로고침, 버전 배지.
- **문서**: MODULES.md, STRUCTURAL_MODEL.md(+Gemini 피드백), 발표 PPT(번체).

---

## 2. 다음 할 일 (정밀 구조모델 — 우선순위)
> 추천 순서. 각 항목은 STRUCTURAL_MODEL.md의 단계와 연결.

1. **[P3] 위상 정리 (최우선 추천)**
   - 미매칭 벽 면선 **86개 회복**: 교차부(T/L/+)·단부 처리 → 벽 축선 trim/extend.
   - 벽 축선 끝점을 **기둥/교차점에 스냅**(절점화) → 절점-부재 그래프(해석모델 직전).
2. **기둥 회전/단면 정밀화**: 최소면적사각형(PCA/rotating calipers)로 사선 기둥 단면·rotation 산출 (설계 §4.2).
3. **벽 축선 gridLine 라벨링**: 벽이 어느 통심선 위인지 태깅.
4. **[P2] 보(Beam) 추출**: 레이어 `S-BEAM/BEAM/보/梁/大梁/小梁` → 중심선+폭.
5. **단일선 벽 처리**: 짝 없는 벽선 기본두께 부여 vs 보류(플래그) 정책 구현.
6. **두께 양자화 프리셋**: 지역별 테이블 주입(`TW-Standard`: 120/150/180/200/240/250/300/400 등). 현재는 5mm 반올림만.
7. **[P4] 층 조립 + 내보내기**:
   - `structural.ts` 스키마 + store `model`(월드 mm), 가교유틸 `worldToCanvas/canvasToWorld`, 승격/반영 생명주기.
   - FloorModel×N → BuildingModel, 다층 스택, 수직 연속성(같은 gridRef 기둥).
   - 내보내기 JSON/DXF → **MIDAS**(절점+요소 기하 정합, **더미 속성** `Dummy_C1/Dummy_W1`로 내보내고 단면/재질은 MIDAS에서 일괄 대입).

---

## 3. 보류/파킹 (나중에 논의)
- **AI 인식(모듈③)**: DWG 없는 경우용. 경로 후보 = onnxruntime-web 브라우저 추론 / Roboflow 호스팅 / 자체 파인튜닝.
  벡터는 심볼스포팅(ArchCAD-DPSS, FloorPlanCAD — **academic 라이선스**). 상용 전 데이터 자체 라벨링 필요.
- **DWG 렌더 보강**: HATCH 미지원 등 → `@mlightcad/cad-viewer`(같은 저자, HATCH·전체엔티티·성능) 채택 검토. ⚠️ GPL 확인.
- **기타 모듈**(MODULES.md): 지오메트리(flatten-js/Clipper), 이미지 전처리(opencv.js), 내보내기(dxf-writer/jsPDF).
- **라이선스 정리**(상용화 전 필수): LibreDWG(GPL), ArchCAD(academic).

---

## 4. 알려진 이슈 / 정리(cleanup)
- **데드코드**: `extractMembersFromDxf`(구버전)·`ExtractResult` 미사용 → 제거 가능. ("정밀 구조모델 추출"이 `extractStructuralModel` 사용)
- **"중심선 자동" 버튼**: 정밀 추출이 이미 벽을 축선으로 만들므로 부분 중복 — 수동 벽용으로 남김(정리 여지).
- **그리드 라벨**: 버블 없는 도면은 자동번호(보조 CEN 포함될 수 있음) — 버블 있으면 정합됨.
- **좌표**: 현재 캔버스 px + mm는 properties에 동반. 다층/MIDAS(P4) 때 월드 모델로 승격 예정.
- **선(LINE) 크기조절·회전**: 정점 편집만(설계상). rect/원/삼각형은 네이티브 지원.

---

## 5. 핵심 코드 위치
- 추출/기하: [src/utils/geometry.ts](../src/utils/geometry.ts) — `extractStructuralModel`, `extractGridLabeled`, `extractCenterLinesFromWalls`, `mergeCollinearLines`, `classifyLayer`, `isAxisLayer`, `isBubbleLayer`.
- 파일로드: [src/utils/fileLoader.ts](../src/utils/fileLoader.ts) — DWG/DXF, `expandEntities`(INSERT 전개).
- 캔버스/렌더/편집: [src/components/Workspace.tsx](../src/components/Workspace.tsx) — DXF 렌더, lines 동기화(rect/circle 포함), gridRef 라벨, 정점편집, dxfTransform 저장.
- 사이드바: [src/components/LayerSidebar.tsx](../src/components/LayerSidebar.tsx) — 자동필터, "정밀 구조모델 추출".
- 스토어: [src/store/useDrawingStore.ts](../src/store/useDrawingStore.ts) — `dxfTransform`, `addLines`, lines/레이어 상태.
- 타입: [src/types/drawing.ts](../src/types/drawing.ts) — `StructureLineData`(WALL/COLUMN/BEAM/CENTER_LINE).

## 6. 환경 메모
- 시스템 Node 없음 → winget 설치본 사용. PATH 앞에 추가:
  `C:\Users\Dennis\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_...\node-v24.17.0-win-x64`
- 빌드 `npm run build`, 미리보기 `npm run preview -- --port 4317`. fabric 6.9.1(정식), Vite 5.
- 커밋 시 버전(package.json)·README Changelog 갱신, Playwright 검증 후 push(자동 배포).
