# StruXureAI — 진행상황 & 앞으로 할 일 (통합 기록)

> 이 문서는 작업 핸드오프용 단일 기록. 대화가 압축돼도 여기서 맥락을 복구한다.
> 기준 버전: **v0.25.1** · 갱신: 2026-06-24 · 배포: Vercel (`stru-xure-ai.vercel.app`)
> 🌟 북극성: **구조 평면도를 제대로 만들기 + 그 이후를 위한 기반 다지기** (추출 정확도·데이터 기반 우선; 해석/AI는 그 위에)
> 함께 보기: [ROADMAP.md](./ROADMAP.md)(단계별 로드맵·추천경로) · [STRUCTURAL_MODEL.md](./STRUCTURAL_MODEL.md)(정밀추출 설계) · [MODULES.md](./MODULES.md)(OSS 조사)

---

## 0. 큰 그림 / 방향 (절대 잊지 말 것)
- **최종 목표**: 벡터(DWG/DXF) → **정밀 구조부재 추출** → **층기반 구조모델** → **MIDAS 구조해석 연계**.
  (사용자 = MIDAS IT 소속. 내보내기 타깃 = MIDAS Gen.)
- **시장**: 주로 **대만/동남아**(+한국). 레이어/도면 관례가 서구와 다름.
- **단계**: 현재 **학습용**(상용화 전). → GPL(LibreDWG)/academic(ArchCAD) 라이선스는 지금은 비차단, 상용화 시점에 정리.
- **AI 정책**: AI 인식은 **DWG가 없을 때(사진/스캔)만**. 공개 래스터 모델은 도메인 불일치로 품질 부족 → 추후 대만/동남아 도면으로 파인튜닝. CAD(벡터)는 **기하/심볼스포팅**이 정답.
- **검증 방식**: 로컬 빌드 + Playwright(헤드리스)로 실제 `B1F 1.dwg` 동작 확인이 표준. (`npm run preview -- --port 4317`)

---

## 1. 완료됨 (v0.14.0까지)
- **DWG/DXF 열기·렌더**: libredwg-web(WASM, DWG→DXF), INSERT(블록)/DIMENSION/SPLINE/ARC/ELLIPSE/TEXT 렌더, 레이어 사이드바+자동필터, 드래그앤드롭.
- **편집**: 그리드 스냅, fabric 네이티브 선택·이동·**크기조절·회전**(`setCoords` 누락이 원인이었음), 선 정점(vertex) 편집, 지우개.
- **정밀 구조모델 추출(P1)**: 벽=**축선+두께(mm)**, 기둥=**bbox+단면(mm)+gridRef**, 그리드 추출 + **버블 라벨 정합**(X1~X10/Y1~Y8), 조적 제외, 중복정리, 그리드스냅, 중심선 연결성 병합.
- **벽 추출 정확도↑(v0.24~0.25)**: 상호최근접 면쌍 매칭 + 매칭전 면 병합(`mergeCollinearFaces`) + 두께상한 800 + 단일선 벽 회복(중복가드). **CON_WALL 커버리지 73%→96%**.
- **기둥 위치 정밀화(v0.25.1)**: 스냅/중복 상수 px→mm(scale) 환산. 기둥 오배치(누락 25→0) 수정.
- 품질 점검 하네스: `scratchpad/pw/audit.mjs`·`analyze_walls.mjs`·`audit_cols.mjs`. **앱 `?debug=1`로 `window.__store` 노출**(영구, 프로덕션 무영향).
- **위상 정리(P3)** [`cleanupTopology`]: 벽 축선 끝점 → 기둥 중심/축선 교차점 연결(extend/trim), 근접 끝점 절점 클러스터링 + `n0/n1` 절점 ID → 절점-부재 그래프. (B1F 검증: 39벽 전부 태깅, 접합 절점 14, 연장 40, 기둥스냅 7)
- **기둥 회전/단면 정밀화** [`minAreaRect`]: 최소면적 직사각형으로 사선 기둥 단면(width/depth)·회전각(`rotation_deg`) 산출 + 오리엔트 렌더. (단위검증 30°/70°, B1F 50기둥 무회귀)
- **벽 통심선(gridLine) 라벨링**: 벽 축선을 평행·근접 그리드선에 매칭 → `gridLine` 속성. (B1F 39벽 중 21개 라벨)
- **보(Beam) 추출(P2)** [`pairFaces` 공용]: 이중선 보→축선+폭, 단일선 보→중심선(`singleLine`). (합성검증 완료. ⚠️ B1F엔 보 레이어 없음 → 실데이터 검증은 보 있는 도면 필요)
- **리사이즈 정합 버그수정**(v0.16.1): 추출 후 DXF 스케일 고정(`dxfFitRef`).
- **두께 양자화 프리셋**(v0.18.0): `THICKNESS_PRESETS`(TW/KR) 주입형, 사이드바 "두께 표준" 선택. 측정값 ±50mm 표준 스냅, 원본 `*_measured_mm` 보존. (B1F TW: 4개 스냅)
- **MIDAS Gen NX 내보내기(P4a, 단일층)**(v0.19.0) [`midasExport.ts`+`MidasExport.tsx`]: 구조부재→월드(mm)→MIDAS API 시퀀스(PUT /db/*, {Assign}). 기둥/보=BEAM, 벽=수직 PLATE(4점). API 전송(fetch)/JSON·Python 다운로드. 스키마=대만 RC 에이전트 live-verified. (B1F: 절점216·기둥50·벽39 검증)
- **도움말 패널**(v0.20.0) + **다국어 i18n(한/영/번체)**(v0.21.0) [`i18n.ts`+`useT`+store `lang`]: 전 UI·알림·도움말 번역, 상단 언어 선택기. (ko/en/zh 전환·번체 추출 검증)
- **DXF 저장**(v0.22.0) [`dxfExport.ts`+툴바 저장버튼]: 구조부재→월드(mm) DXF(타입별 레이어, 회전기둥=폴리라인). 라운드트립 검증. ⚠️ DWG 저장은 미지원(WASM 읽기전용).
- **운영**: Vercel 방문자 분석(@vercel/analytics), 재배포 stale-chunk 자동 새로고침, 버전 배지.
- **문서**: MODULES.md, STRUCTURAL_MODEL.md(+Gemini 피드백), 발표 PPT(번체).

---

## 2. 다음 할 일 (정밀 구조모델 — 우선순위)
> 추천 순서. 각 항목은 STRUCTURAL_MODEL.md의 단계와 연결.

1. ~~**[P3] 위상 정리**~~ ✅ **완료(v0.14.0)** — `cleanupTopology`로 끝점→기둥/교차점 연결 + 절점 그래프(`n0/n1`).
   - 남은 개선(후속): ① 비직교 코너 **축선 직교 보존**(현재 절점=중심/교점/centroid라 코너에 사선 킨크 생길 수 있음 — 직교 우선 스냅으로 보정). ② 미매칭 면선 86개 중 **실제 단일선 벽** 선별 회복(단부/개구부 jamb은 제외). ③ 절점 객체를 store에 1급 보관(현재는 벽 properties의 `n0/n1` 태그만).
2. ~~**기둥 회전/단면 정밀화**~~ ✅ **완료(v0.15.0)** — `minAreaRect`(회전 캘리퍼스). 후속: 편집(이동/회전) 시 회전각 영속화(현재 object:modified는 AABB만 저장 → 회전 유실, 사전 한계).
3. ~~**벽 축선 gridLine 라벨링**~~ ✅ **완료(v0.16.0)** — 평행·근접(±14px) 그리드선 매칭 → `gridLine` 속성.
4. ~~**[P2] 보(Beam) 추출**~~ ✅ **완료(v0.17.0)** — `pairFaces` 공용(이중선) + 단일선 폴백. 실데이터(보 레이어 있는 도면) 검증은 추후. 후속: 보↔기둥/벽 위상연결, 보 gridLine 라벨, 라벨 텍스트(B1 300x600)에서 폭/춤 파싱.
5. ~~**두께 양자화 프리셋**~~ ✅ **완료(v0.18.0)** — TW/KR 프리셋 주입형, 사이드바 선택.
6. **남은 벽 품질**(북극성 직결):
   - ~~단일선 벽~~ ✅ **완료(v0.25.0)** — 진짜 짝없는 0.5m+ 면 회복(중복 가드 hasPartner/coveredByAxis). 커버리지 89%→**96%**.
   - **연결성(다음)**: 자유단 ~60개(노드 73). 토막 끝점을 인접 벽/콜리니어 끝에 연결(현재 cleanupTopology는 기둥/교차점만). 개구부 단부는 정상 자유단이라 구분 필요. 목표 자유단↓.
   - 남은 ~4%: 짝 매칭 놓친 면(파트너 있으나 미매칭) — 위상연결로 일부 흡수 가능.
7. **[P4a] 단일층 MIDAS 내보내기** ✅ **완료(v0.19.0)** — `midasExport.ts`(buildMidasRequests/sendMidas/toPythonScript) + `MidasExport.tsx` 패널. 절점+BEAM/PLATE 요소, CNS560 더미재질.
8. **[P4b] 다층 + 위상강화**:
   - ~~라이브 전송 실환경 검증~~ ✅ **완료(v0.22.1)** — 실제 Gen NX에 절점218·기둥50·벽39 생성 확인, CORS 무문제. `/doc/save` 제거(저장 모달이 모델 폐기시키던 문제).
   - ~~다층 스택(수직 복제)~~ ✅ **완료(v0.23.0)** — `stories` 옵션, 평면 N층 복제(기둥 수직 연속, 베이스 z=0). N=3 페이로드 검증. **라이브 N≥2 전송은 재연결 후 확인 필요**(테스트 키 세션 종료됨).
   - 다음 후속: MIDAS **Story Data(STRY)** 연동(층 정보 등록), 층별 다른 평면(다중 DWG import), 보↔기둥/벽 위상연결(절점 공유), 보 춤 라벨 파싱, 하중/지진/풍(Story 자료 참고).
   - 참고자료: `e:/AI Study/Story`(대만 RC 에이전트, MAPI 엔드포인트 카탈로그, 대만 내진/풍하중), [Dennis5882/MIDAS-API](https://github.com/Dennis5882/MIDAS-API).

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
- **좌표**: 현재 캔버스 px + mm는 properties에 동반. 다층/MIDAS(P4) 때 월드 모델로 승격 예정. ⚠️ px 저장이라 리사이즈 시 부재가 배경과 어긋날 수 있어 **추출 후 DXF 맞춤 스케일을 파일별로 고정**(v0.16.1)으로 우회 중. 근본 해결은 월드(mm) 저장+렌더시 변환(P4).
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
