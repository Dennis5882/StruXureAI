# StruXureAI — 진행상황 & 앞으로 할 일 (통합 기록)

> 이 문서는 작업 핸드오프용 단일 기록. 대화가 압축돼도 여기서 맥락을 복구한다.
> 기준 버전: **v0.41.0** · 갱신: 2026-07-15 · 배포: Vercel (`stru-xure-ai.vercel.app`)
> 🌟 북극성: **구조 평면도를 제대로 만들기 + 그 이후를 위한 기반 다지기** (추출 정확도·데이터 기반 우선; 해석/AI는 그 위에)
> 함께 보기: [ROADMAP.md](./ROADMAP.md)(단계별 로드맵·추천경로) · [STRUCTURAL_MODEL.md](./STRUCTURAL_MODEL.md)(정밀추출 설계) · [MODULES.md](./MODULES.md)(OSS 조사)

---

## 0. 큰 그림 / 방향 (절대 잊지 말 것)
- **최종 목표**: 벡터(DWG/DXF) → **정밀 구조부재 추출** → **층기반 구조모델** → **MIDAS Gen NX 핸드오프**.
  ⚠️ **범위 = 빠르고 정확한 "모델링 + 핸드오프"까지. 해석(하중/지진/풍/하중조합/해석실행)은 범위 밖 — Gen NX에서 사용자가 함.**
  (사용자 = MIDAS IT 소속. 타깃 = MIDAS Gen NX.)
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
- **데이터 기반 정식화(v0.27.0)** [`types/structural.ts`+`utils/structuralModel.ts`+store `model`]: 추출 부재→**월드 mm FloorModel**(절점-부재 그래프, 절점 id 참조). 가교 `canvasToWorld/worldToCanvas`. B1F 검증: 절점144·부재117, 참조 무결성 100%, 공유절점38, 그리드 10X+8Y.
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

## 2. 다음 할 일

### ⭐ 지금 다음 한 수 (범위 = 모델링+핸드오프, 해석 제외)
> 자세한 단계는 [ROADMAP.md](./ROADMAP.md). 현재 v0.27.1: 추출(벽96%)→FloorModel(절점그래프)→Gen NX 핸드오프 **동작**.
> UI v2(`index.next.html`) 검토 중: 5단계 스테퍼·레이어 타입 지정·LINE 확인 배너·검토 탭·하단 상태바 포함. Vercel 배포 완료(`/index.next.html`).
- ~~**U3 검토→수정 루프**~~ ✅ **완료(v0.29~0.30)** — 검토 탭/캔버스 **양방향** 부재 선택+강조, 두께/단면(기둥 b/h/회전·벽 두께·보 폭) 인라인 편집→model 반영, **자유단 amber 링 하이라이트**, **부재 삭제**(삭제버튼·Delete키, model+캔버스 line 동기), **부재 추가**(벽/기둥 그리기→model 편입), **자유단 자동 연결**(≤300mm 근접 자유단 병합, B1F 60→24). store `selectedMemberId`/`updateMember`/`deleteMember`/`addLineToModel`/`autoConnectFreeEnds`, member↔line `lineId` 링크.
- (이번 세션 추가) 재로드/재추출 겹침 수정(`clearCadLines`), 캔버스 CROP 모드(도면에서 직접 범위 선택), 언어 드롭다운, CTA 정리(추출만).
- **성능: DXF 정적 배경 렌더링(v0.31.1)** — DXF 엔티티를 Fabric 객체 수만 개 대신 레이어별 Path2D로 배경 캔버스에 한 번에 stroke(뷰포트 동기 `after:render`). tracing 68k에서 fabric 객체 3만→0, 줌/팬 버벅임 해소. 구조부재/오버레이만 Fabric 유지.
- **성능/UX: 파일 열기 진행률 바(v0.31.2) + DWG→DXF Web Worker 변환(v0.31.3)** — `src/workers/dwgWorker.ts`로 변환을 메인 스레드 밖으로 격리(실패 시 메인 폴백). 변환 중 UI 안 멈춤(메인 응답 <50ms), 바 크립 30→58%. 단계별 진행률(파일읽기→모듈→변환→파싱→전개→완료). (남은 부하: DXF 파싱 parseSync는 아직 메인 — 필요 시 워커화.)
- **C1 실도면 일반성** 🟢 **1차 검증·수정 완료(v0.33.0~v0.34.0)** — 중국법인 제공 실도면 6종(PKPM/YJK 관례)으로 검증. 발견·수정 4건:
  - **(a) LINE 4선 기둥(v0.33.0)**: 기둥이 닫힌 폴리라인이 아니라 개별 LINE 4개(COLU_BR)로 그려진 경우 0개 추출 → COLUMN 분류 레이어의 LINE 자동 클러스터링(수동 토글 없이). zg test.2(AC1024): 기둥 18개(부호 일치)·단면 800×800·gridRef 18/18·벽 16.
  - **(b) 자동필터 한자화(v0.34.0)**: 자동필터 키워드가 영/한(`COL/WALL/기둥`)뿐이라 한자 레이어(`砼柱/柱/砼墙/砼梁`)를 숨기고 오히려 철근(`WCOL_REIND`)만 켜던 치명 버그 → `classifyLayer` 재사용으로 통일(한/영/중·번체 일관).
  - **(c) 부정 키워드(v0.34.0)**: `classifyLayer`에 철근/치수/주석/해치/표제란/상세도(`钢筋/尺寸/标注/文字/填充/图签/详图/虚线/洞/表/REIN/DIM/TEXT`…) 제외 추가 → `柱钢筋/柱尺寸/暗柱纵筋` 같은 파생 레이어 노이즈 제거. 대형 시공도(`1#2#结构图.dwg` 222,236엔티티·110레이어): 기둥 4366(철근노이즈)→435(실기둥, 단면 1200×1200/600×600 등)·벽 78·보 23. (다층 세트라 한 층만 뽑으려면 CROP.)
  - **(d) GBK/Big5 인코딩 자동판별(v0.34.0)** [`utils/decodeDxf.ts`]: 중국/대만 도면은 CJK가 코드페이지로 저장돼 무조건 UTF-8 디코딩 시 레이어명 깨짐(mojibake)→분류 실패. `$DWGCODEPAGE`는 libredwg가 소스값 복사라 무용 → **고바이트(≥0x80) 대비 UTF-8 무효(U+FFFD) 비율 B/H**로 판별(UTF-8=0.00, GBK=0.55~0.69, 임계 0.15). 三叶/12#(GBK) 복구, 1#2#(UTF-8, 61MB) 무손상 보존. 워커·메인폴백 공용.
  - **구버전 DWG UX(v0.33.0)**: 로드 후 엔티티 0이면 헤더 버전(AC1006=R10 등) 읽어 명확히 안내(+직전 도면 보존).
  - **(e) 边缘构件 + 기둥 타당성 필터(v0.35.0)**: `classifyLayer`에 边缘构件/約束邊緣(전단벽 단부기둥)→COLUMN 추가. 기둥 타당성 필터(최대변>3000mm·종횡비>6·최소변<50mm 제외)로 벽구간·철근 오인 차단. 1#2#: 기둥 435→1540(전층 단부기둥 포함, 단면 400×800/500×1200 등 타당), tracing: `800x4200`(4.2m 벽) 가짜기둥 제거(152→150).
  - **(f) 그리드 축선 간체(v0.35.0)**: `isAxisLayer`에 간체 `轴`·`网` 추가 → `0轴线` 인식. 정상 스케일 동작(zg grid=22). ⚠️ 거대 미크롭 세트(1#2#)는 scale 0.0003에서 축선 6m가 1.8px=sub-pixel이라 grid=0 — 크롭 필요(아래).
  - **(g) 병합 갭 월드 상한(v0.35.0)**: `mergeCollinearLines` 갭 px 바닥값(30)이 작은 scale에서 100m로 폭주 → 20m 월드 상한(`gapCap=20000*scale`). 1#2# 보 메가병합 938m→117m. B1F/zg 무회귀.
  - tracing(한국 아파트, 68k엔티티) 재검증: 기둥150·벽154·grid18·gridRef150, 인코딩(한글) 정상.
  - **(h) 크롭 리핏 = 이미 구현·검증 완료(v0.36.0)**: 조사 결과 CROP이 transform을 **이미 재계산**하고 있었음(`Workspace.tsx` 294-318: cropBBox를 경계로 fit scale 산출→`setDxfTransform`, effect deps에 cropBBox). 검증(1#2#, 진짜 砼柱 평면 클러스터로 크롭): scale 4e-4→4.75e-3(**12×↑**) → **벽 두께 [440/470/480/500/600]mm 실측(이중선 116개)**, **보 폭 [300/440/500/1000/1200]mm 실측**, 벽 최대길이 116m→29m. 즉 거대 세트도 **한 층을 CROP하면 벽/보 이중선 정밀 추출이 살아남**(기둥은 스케일 무관). ⚠️ 이 파일 `边缘构件`은 **暗柱表(상세표)로 그려져** 미크롭 시 1540 가짜기둥 유발 — 크롭이 정답.
  - **(i) 크롭 유도 힌트(v0.36.0)** [`AppNext.extract`]: 미크롭 + 벽 15개↑ + 단일선>85%(=sub-pixel 스케일)면 "CROP으로 한 층 선택 후 재추출" 안내(세션 1회, 비차단). 1#2#만 발동, zg/B1F 미발동 확인.
  - **(j) 보 절점 분할(v0.37.0)** [`splitLinesAtColumns` + 보에도 `splitWallsAtJunctions`]: 기둥을 지나는 보를 **기둥 중심에서 분할**(분할점=기둥 중심 좌표 → `buildStructuralModel` 절점 병합이 기둥 절점과 공유=보-기둥 연결) + 보-보 T자 분할. 크롭 1#2#: 보 110→197, **중앙 길이 5.1m**(정상 스팬), 보 끝점 **38%가 기둥 절점 공유**(분할 전 ~0%). 부수: `buildStructuralModel`에 퇴화(i==j 길이0) 벽·보 제외 가드 추가(잠재 버그 수정, MIDAS 오류 방지).
  - **(k) 크롭 UX + 보 폭 추정(v0.38.0)**: ① 边缘构件 상세표 자동구분 — 측정 결과 **전제 반박**: 1540 기둥의 국소밀도가 낮아(2.5m내 이웃 최대 2) 상세표가 아니라 **전층 분산 실부재**임 확인 → 크롭이 이미 해결(1540→184), 고칠 것 없음. ② **큰 도면 크롭 배너**(`CropPanel`): 도면 범위>300m면 "한 층만 선택하면 정밀 추출" 인라인 배너(한/영/중). 1#2#/tracing 표시, zg 미표시. ③ **단일선 보 폭 기본값 개선**: 고정 300 대신 그 도면 이중선 보 폭 **중앙값**(`medBeamWidthMm`) → 크롭 1#2# 보 폭 [300 제거→440/500/1000/1200] 실측 기반.
- **B1 다층**(다중 DWG→BuildingModel): 🟡 **Phase1~2 완료(v0.31.0)** — 스냅샷 방식 층 수집(`floors[]`, 저장/레벨·층고·층명 편집/삭제, FloorsPanel), **다층 MIDAS 전송**(`buildMidasRequestsBuilding`, 각 층 elevation~+height 배치, 절점 월드(x,y,z) 병합→경계층 절점 공유=기둥 연속). B1F×2 검증: z{0,3000,6000} 각 145절점(경계 병합), 기둥100·벽142. **남음**: 층별 다른 평면 로드(현재는 같은 DWG 재추출로 층 저장), Phase3 빌딩 DXF(3D).
- ~~**B2 Story Data(STRY) 등록**~~ ✅ **완료(v0.32.0)** — `storyRequest`로 `/db/STOR` 추가(공식 스키마: STORY_NAME/LEVEL/bFLOOR_DIAPHRAGM + 층폭 bbox 기하, 하중·지진 편심은 중립 0/1=Gen NX 몫). **빌딩 DXF 3D**(`buildBuildingDxf`: 기둥 수직·벽/보 층레벨 수평, z 포함) + 내보내기 탭 버튼. B1F×2 검증: STOR 2층·DXF z{0,3000,6000}. **남음**: A4 다층 라이브 재전송(Gen NX 재연결 필요), 층별 다른 평면 실검증(다층 DWG 세트 필요).
- ~~핸드오프 다듬기: **dxfExport도 model 소비**~~ ✅ **완료(v0.30.1)** — `buildDxfFromModel(model)`(월드 mm, 벽/보 축선·기둥 회전사각·그리드 축선). 내보내기 탭에 DXF 버튼 추가, Toolbar도 model 우선. B1F 검증: LINE 285=벽71+기둥49×4+그리드18, 편집(삭제/두께) 반영.
- ❌ 범위 밖: 하중/지진/풍·하중조합·해석실행 (Gen NX에서).

- **D1 도면 라벨(평법 집중표주) 파싱** 🟢 **1차 완료(v0.39.0)** [`parseBeamLabel` in geometry.ts] — 도면 텍스트가 설계 명시값을 담고 있어 기하 측정보다 정확하고, **평면 기하로는 불가능한 춤(depth)**까지 준다.
  - **파싱**: `"KL(1) 200X400"` = 부호+경간수+폭×춤. 정규식 25/25(실도면 문자열; 철근·스터럽 `"8@100/200(2)"`·`"214;216"`·중문 주석은 정확히 배제). 부호 KL/L/LL/LLK/KZL/WKL/XL 등. 레이어명이 관례마다 뒤섞여(벽부호 `Q-5`가 `梁集中标注`에 있음) **레이어로 안 거르고 모든 TEXT를 규칙으로 판별**. 주석 레이어가 자동필터로 숨겨져도 읽음(그리드와 동일 방침). 분할 '전'에 부여해 조각들이 속성 상속.
  - **결과**(1#2#结构图 크롭): 파일 전체 **라벨 803개** 파싱, 크롭 영역 27개 중 **23개 매칭(85%)**, 전부 depth 획득. 단면: `L 200×400`·`KL 200×400`·`LLK 200×400`·`KL 250×1050`·`L 150×450`.
  - **MIDAS 반영**: 보 단면이 `sectId(bm.width*2, …)` **더미(폭×2)**였던 것 → `bm.depth ?? width*2` + 부호를 단면명으로. 결과 `KL_1050x250`(실제 춤 1050 — 더미였다면 500, **오차 550mm**), `L_450x150` 등 부호기반 6종. 라벨 없는 보는 여전히 `B_880x440` 더미.
  - ⚠️ **라벨이 드러낸 기하 추출 실상(중요)**: 이 평면의 실제 보는 **~27개**인데 기하는 **197개** 생성(7배 과다), 폭도 **440/500/1000/1200 vs 실제 150~250**(2배+ 과다).
- **D2 면쌍 매칭 교정 — perpTol px 바닥값 버그**(v0.40.0) [`fMergePerp`]: `mergeCollinearFaces`의 perpTol이 `Math.max(2, 30*scale)`이라 **작은 scale(거대 도면)에서 2px = 421mm로 폭주** → 코드 주석이 명시한 불변식(`perpTol < 최소 부재두께`)이 깨져 **200mm 부재의 마주보는 두 면이 한 면으로 병합**됨 → 엉뚱한 상대와 짝지어져 두께/폭이 2배+로 측정. gapCap과 동일한 "px 바닥값이 작은 scale에서 폭주" 버그 계열. **수정**: 월드 기준 `Math.max(30*scale, 0.02)`. **효과**(1#2# 크롭): 벽 두께 440~600 → **200/210/217/220/225/233/250**(현실값), 보 폭에 **200/220/250 등장**. B1F(60기둥·71/72벽·61→21)·zg(18기둥·두께250·gridRef 18/18) **완전 동일**(정상 스케일은 동일선 조각 간격≈0이라 무영향).
  - `width_measured_mm`/`SBeam.widthMeasured` 보존: 라벨이 폭을 덮어써도 기하 측정값을 남겨 **라벨(정답) 대비 매칭 품질 검증** 가능.
  - ~~❓ 미해결: 그려진 보 폭 = 라벨 폭의 2배~~ → ✅ **D3에서 규명·해결**(도면이 2× 축척이었음).
  - UI: 검토 탭 보 행에 부호(에메랄드)·`폭×춤` 표시, 춤 인라인 편집(`edBeamD`). 라벨값은 두께 양자화에서 제외(설계 명시값).

- **D3 도면 축척 자동 캘리브레이션(v0.41.0)** [`utils/drawingScale.ts`] — "보 폭이 라벨의 2배" 미해결건의 **진짜 원인**이자, 지금까지 이 파일에서 뽑은 **모델 전체가 2배였다**는 사실의 발견.
  - **규명 방법**: 치수문자는 자기가 재는 구간의 **중점**에 놓이므로, 인접 두 치수문자 사이 실제 거리는 참값 기준 `(v1+v2)/2`여야 한다 → `k = 실제거리 ÷ ((v1+v2)/2) = 기하 ÷ 참값`. 1#2#의 세로 치수체인에서 **6쌍 연속 정확히 2.000**(1500/3500/2300/1200/2000/1000/3450 ↔ 5000/5800/3500/3200/3000/4450), 가로도 2.000. 파일 전역 4916쌍 중 3072쌍이 k=2.00.
  - **결론**: **기하가 참값의 2배, 치수는 `DIMLFAC=0.5`로 참값 표시.** 독립적인 두 텍스트 출처(평법 라벨 b=200 · 치수문자 축간 3300)가 서로 일치하고 기하만 2배. 공학적으로도 텍스트가 참값이어야 말이 됨(전단벽 200 vs 400, 보 세장비 6.1 vs 12.3).
  - ⚠️ **한 파일에 축척이 섞임**: 1#2#는 k=2 체인 220개(전역) + **k=1 체인 11개가 y≈-165k 한 구역에만** 뭉침 → **crop 범위로 한정해 판정해야 함**(전역 판정은 low-confidence로 거부).
  - **구현**: `analyzeDrawingScale`(진단 포함)/`detectDrawingScale`. 체인 내부 일관성 80%↑만 채택, 흔한 축척(1/2/2.5/4/5/10)으로만 스냅(3%), **신뢰도는 체인 수가 아니라 인접쌍 수로 가중**(잡음 체인은 쌍이 3~4개, 진짜 치수체인은 수십 쌍 → 체인 수로 세면 롱테일이 근거를 희석: conf 0.54(거부)→0.75(채택)).
  - **배선**: `DxfTransform.unitMm`(도면 1단위=몇 mm, 기본 1) → `canvasToWorld/worldToCanvas`(월드 mm에 곱), geometry의 mm 상수는 전부 **`mmPx = scale/unitMm`** 경유(`scale`은 도면단위→px라 mm 상수에 직접 곱하면 틀어짐). Workspace가 (엔티티, crop) 캐시로 판정 → `setDxfTransform({..., unitMm})`. 파일 교체 시 판정/오버라이드 초기화.
  - **UI**: `CropPanel` 배너 — 배율·근거(체인 a/c, 쌍 p)·**보정 끄기/켜기 오버라이드**(모델 크기를 조용히 바꾸는 보정이라 근거와 해제를 항상 노출). 축척 혼재 시 "평면 한 장만 크롭하면 판정됨" 안내.
  - **검증**: 1#2# 평면 1장 크롭 → factor=2 conf=1.00(5/5체인·56쌍), unitMm=0.5, **라벨 대비 기하 측정 65개 중 64개 오차 0**(보정 전 363개 전부 2배로 0개 일치). 스팬 중앙값 2358mm, 벽 두께 200/210/220/250. **오탐 0**: B1F·tracing(체인 없음)→거부, zg(k=1)→factor 1, 三叶(k 부적합)→거부. B1F/zg 무회귀.
  - 📌 **교훈**: v0.36.0(h)의 "벽 두께 440~600 실측"·v0.40.0의 "200/250 현실값"은 **둘 다 도면단위였고 참값은 그 절반**이었음. 도면단위를 mm로 단정한 게 오랜 오류의 뿌리. 이제 참값 200 = 도면 400.

### (완료 이력 — 추출·핸드오프)
1. ~~**[P3] 위상 정리**~~ ✅ **완료(v0.14.0)** — `cleanupTopology`로 끝점→기둥/교차점 연결 + 절점 그래프(`n0/n1`).
   - 남은 개선(후속): ① 비직교 코너 **축선 직교 보존**(현재 절점=중심/교점/centroid라 코너에 사선 킨크 생길 수 있음 — 직교 우선 스냅으로 보정). ② 미매칭 면선 86개 중 **실제 단일선 벽** 선별 회복(단부/개구부 jamb은 제외). ③ 절점 객체를 store에 1급 보관(현재는 벽 properties의 `n0/n1` 태그만).
2. ~~**기둥 회전/단면 정밀화**~~ ✅ **완료(v0.15.0)** — `minAreaRect`(회전 캘리퍼스). 후속: 편집(이동/회전) 시 회전각 영속화(현재 object:modified는 AABB만 저장 → 회전 유실, 사전 한계).
3. ~~**벽 축선 gridLine 라벨링**~~ ✅ **완료(v0.16.0)** — 평행·근접(±14px) 그리드선 매칭 → `gridLine` 속성.
4. ~~**[P2] 보(Beam) 추출**~~ ✅ **완료(v0.17.0)** — `pairFaces` 공용(이중선) + 단일선 폴백. 실데이터(보 레이어 있는 도면) 검증은 추후. 후속: 보↔기둥/벽 위상연결, 보 gridLine 라벨, 라벨 텍스트(B1 300x600)에서 폭/춤 파싱.
5. ~~**두께 양자화 프리셋**~~ ✅ **완료(v0.18.0)** — TW/KR 프리셋 주입형, 사이드바 선택.
6. **남은 벽 품질**(북극성 직결):
   - ~~단일선 벽~~ ✅ **완료(v0.25.0)** — 진짜 짝없는 0.5m+ 면 회복(중복 가드 hasPartner/coveredByAxis). 커버리지 89%→**96%**.
   - ~~연결성(T자 접합)~~ ✅ **완료(v0.26.0)** — `splitWallsAtJunctions`로 관통벽 분할+끝점 스냅. 자유단 64→39, 닿았으나 미접합 34→10.
   - 남은 연결성: 자유단 ~39개 중 ~14 정상(개방단부), ~13 근접갭(150-400mm), ~10 코너 미세갭. 추가 개선 여지(저위험 우선).
   - 남은 커버리지 ~4%: 짝 매칭 놓친 면(파트너 있으나 미매칭).
7. **[P4a] 단일층 MIDAS 내보내기** ✅ **완료(v0.19.0)** — `midasExport.ts`(buildMidasRequests/sendMidas/toPythonScript) + `MidasExport.tsx` 패널. 절점+BEAM/PLATE 요소, CNS560 더미재질.
9. ~~**UI v2 (워크플로 셸)**~~ ✅ **완료(2026-06-28)** — `index.next.html`+`src/next/` 격리 엔트리. 기존 파일 무수정. Vercel 멀티페이지 빌드 등록(`vite.config.ts` rollupOptions.input).
   - **StepperBar**: 5단계 클릭 가능 스테퍼 + "다음 한 수" CTA(워크플로 자동 판단)
   - **RightDock 3탭**: 레이어 탭(타입 지정 드롭다운) / 검토 탭(alert→라이브 품질 카드) / 내보내기 탭
   - **레이어 수동 타입 지정** [`classifyLayer` export + `layerTypeOverrides` opts]: 레이어별 `자동/벽/기둥/보/제외` 드롭다운. override 우선, AUTO면 휴리스틱 폴백.
   - **LINE 확인 배너** [`lineLayerIncludes` + union-find 클러스터링]: 구조 타입 레이어에 LINE 있으면 "이것도 기둥인가요?" 배너. 예 클릭 → L자형 LINE 쌍 클러스터로 묶어 minAreaRect 추출. B1F: CON_COLUMN 기둥 50→**60** (+10, L자형 10그룹).
   - **BottomBar**: DXF엔티티·절점·부재·자유단·zoom 하단 고정 (자유단 amber).
   - **dev WASM 픽스**: `optimizeDeps: { exclude: ['@mlightcad/libredwg-web'] }`.
   - 남은 UI: U3(검토→수정 루프), CON_WALL LINE 배너 처리(현재 기둥만 구현).
10. **[P4b] 다층 + 위상강화**:
   - ~~라이브 전송 실환경 검증~~ ✅ **완료(v0.22.1)** — 실제 Gen NX에 절점218·기둥50·벽39 생성 확인, CORS 무문제. `/doc/save` 제거(저장 모달이 모델 폐기시키던 문제).
   - ~~다층 스택(수직 복제)~~ ✅ **완료(v0.23.0)** — `stories` 옵션, 평면 N층 복제(기둥 수직 연속, 베이스 z=0). N=3 페이로드 검증. **라이브 N≥2 전송은 재연결 후 확인 필요**(테스트 키 세션 종료됨).
   - ~~midasExport가 model 소비~~ ✅ **완료(v0.27.1)** — `buildMidasRequests(model, opts)`. 공유절점 82개 MIDAS로 직결 검증.
   - **남은 소비처**: `dxfExport`도 model 소비(현재 px lines), BuildingModel(다층)을 model 기반 조립.
   - 다음 후속(모델링 한정): **층별 다른 평면(다중 DWG → BuildingModel)**, MIDAS **Story Data(STRY)** 등록(층 표시), 보 춤 라벨 파싱, **실도면 일반성**(B1F 외). ❌ 하중/지진/풍·해석은 범위 밖(Gen NX 몫).
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
