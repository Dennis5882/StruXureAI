# StruXureAI — 모듈 / 오픈소스 연결 계획

> 목적: 모든 기능을 직접 구현하지 않고, **성숙한 오픈소스를 찾아 연결**한다.
> 이 문서는 살아있는 체크리스트다. GitHub에서 후보를 찾으면 표의 "후보/링크"에 적고,
> 완성도·라이선스·연결난이도를 채워 넣은 뒤 ✅로 결정한다.
>
> 기준 버전: v0.8.2 · 최종 갱신: 2026-06-22

---

## 전체 구조

```
[A. CAD 파일] ─┐
[B. 사진→AI] ──┼─→ ⟨1.편집 캔버스 엔진⟩ ─→ ⟨4.지오메트리 처리⟩ ─→ [6.출력/내보내기]
[C. 손그림] ───┘          ▲
                    ⟨5.이미지 전처리⟩
```

입력 3경로(README의 Case A/B/C) → 편집 캔버스 → 지오메트리 처리 → 출력.

---

## 1. 편집 캔버스 엔진 ⚠️ 최우선

- **역할**: 그리기·선택·이동·정점편집·줌/팬·스냅. 모든 기능의 토대.
- **현재 상태**: `fabric.js 6.0.0-rc.1`(릴리스 후보). `findTarget`이 얇은 선·도형을 못 잡는 버그 →
  선택/이동/정점편집을 모두 기하적으로 직접 구현 중([Workspace.tsx](../src/components/Workspace.tsx)).
- **방향**: ① fabric 정식(6.x stable)로 업그레이드해 RC 버그만 해소되는지 1차 확인 →
  ② 안 되면 **Konva.js로 전환**(히트 판정 정확, React 바인딩 성숙).

| 후보 | 검색어 / 링크 | 완성도 | 라이선스 | 연결난이도 | 비고 |
|---|---|---|---|---|---|
| fabric.js 6.x stable | `fabricjs/fabric.js` |  |  | 낮음 | 현재 코드 거의 유지, 버전만 ↑ |
| **Konva** ⭐ | `konvajs/konva`, `konvajs/react-konva` |  |  | 중간 | 캔버스 추상화 교체 |
| Paper.js | `paperjs/paper.js` |  |  | 중간 | 벡터/패스 연산 강점 |
| (참고)tldraw | `tldraw/tldraw` |  |  | 높음 | 무한캔버스 SDK, 통째론 무거움 |
| (참고)Excalidraw | `excalidraw/excalidraw` |  |  | 높음 | 손그림 UX 참고용 |

---

## 2. CAD 파싱 / 렌더링 (Case A)

- **역할**: DXF/DWG 읽어 도형·레이어 표시.
- **현재 상태**: `dxf-parser` + `@mlightcad/libredwg-web`(DWG→DXF) + 직접 렌더.
  INSERT(블록)/DIMENSION/SPLINE까지 렌더, **HATCH 미지원**.

| 후보 | 검색어 / 링크 | 완성도 | 라이선스 | 연결난이도 | 비고 |
|---|---|---|---|---|---|
| libredwg-web 생태계 | `mlightcad/libredwg-web` 및 동일 저자 뷰어 |  |  | 낮음 | 이미 사용 중, 뷰어 컴포넌트 확인 |
| three-dxf | `gdsestimating/three-dxf`, `prolincur/three-dxf-loader` |  |  | 중간 | three.js 렌더 위임 |
| dxf (SVG 변환) | npm `dxf` (`bjnortier/dxf`) |  |  | 중간 | HATCH 등 폭넓음, SVG 출력 |
| (참고)대형 뷰어 | `xeokit/xeokit-sdk`, `LibreCAD/LibreCAD` |  |  | 높음 | BIM/데스크톱급 |

- **연결 지점**: [src/utils/fileLoader.ts](../src/utils/fileLoader.ts) (파싱), [Workspace.tsx](../src/components/Workspace.tsx) (렌더).

---

## 3. AI 인식 — 사진/도면 → 벽·기둥 (Case B) 🎯 핵심 미구현

- **역할**: 이미지에서 구조부재 윤곽 추출.
- **현재 상태**: 프론트 연동(`VITE_AI_API_URL`)만 준비, 실제 모델 없음(목 데이터).
- **방향 (두 갈래)**:
  - **A) 브라우저 추론(백엔드 없음)** ⭐ — Vercel만으로 끝남. YOLOv8-seg → ONNX export → 웹에서 실행.
  - **B) 호스팅 추론** — 서버를 직접 안 만들고 Replicate / Roboflow / HF Inference 사용.

| 후보 | 검색어 / 링크 | 완성도 | 라이선스 | 연결난이도 | 비고 |
|---|---|---|---|---|---|
| ONNX Runtime Web ⭐ | `microsoft/onnxruntime` (onnxruntime-web) |  |  | 중간 | 브라우저 추론, 백엔드 불필요 |
| transformers.js | `huggingface/transformers.js` |  |  | 중간 | 브라우저 추론 |
| YOLO(학습/export) | `ultralytics/ultralytics` |  |  | 중간 | seg 모델 → ONNX |
| 도면 특화 모델/데이터 | `CubiCasa/CubiCasa5k`, `art-programmer/FloorplanTransformation`, `zlzeng/DeepFloorplan` |  |  | 높음 | "floor plan recognition / wall detection" |
| 범용 분할 | `facebookresearch/segment-anything` (web) |  |  | 높음 | 클릭 기반 분할 |
| 호스팅 | Replicate / Roboflow / HF Inference |  |  | 낮음 | 모델 올리면 API |

- **연결 지점**: [src/utils/api.ts](../src/utils/api.ts) `fetchAIAnalysis` — 출력만 `{ type, points[] }` 형식 유지.

---

## 4. 지오메트리 처리 (스냅 · 중심선 · 오프셋 · 교차)

- **역할**: 그리드 스냅, 벽→중심선, 평행 오프셋, 교차/정리.
- **현재 상태**: 스냅·중심선 직접 구현([src/utils/geometry.ts](../src/utils/geometry.ts)), 단순함.

| 후보 | 검색어 / 링크 | 완성도 | 라이선스 | 연결난이도 | 비고 |
|---|---|---|---|---|---|
| flatten-js ⭐ | `alexbol99/flatten-js` (`@flatten-js/core`) |  |  | 낮음 | 2D 기하(거리·교차) 견고 |
| JSTS | `bjornharrtell/jsts` |  |  | 중간 | 버퍼/오프셋/토폴로지 |
| Clipper | `junmer/clipper-lib`, Clipper2 |  |  | 중간 | 폴리곤 오프셋(벽두께→중심선) |
| polygon-clipping | `mfogel/polygon-clipping` |  |  | 낮음 | 불리언 연산 |

---

## 5. 이미지 전처리 (사진 도면 보정)

- **역할**: 원근 보정, 이진화, 외곽선 추출(AI 전처리 품질↑).
- **현재 상태**: 없음.

| 후보 | 검색어 / 링크 | 완성도 | 라이선스 | 연결난이도 | 비고 |
|---|---|---|---|---|---|
| OpenCV.js ⭐ | `opencv/opencv` (opencv.js wasm) |  |  | 중간 | 원근변환·threshold·contour |

---

## 6. 출력 / 내보내기

- **역할**: 결과를 DXF/SVG/PDF로 저장.
- **현재 상태**: 없음.

| 후보 | 검색어 / 링크 | 완성도 | 라이선스 | 연결난이도 | 비고 |
|---|---|---|---|---|---|
| DXF 쓰기 | `tarikjabiri/dxf`, `ognjen-petrovic/js-dxf` |  |  | 낮음 | DXF export |
| PDF | `parallax/jsPDF` |  |  | 낮음 | PDF 출력 |
| SVG | 캔버스 → SVG export |  |  | 낮음 | 엔진(1)에 따라 내장 |

---

## 추천 진행 순서

1. **캔버스 엔진 정리** — fabric 정식 업그레이드 시도 → 안 되면 Konva 전환. (토대부터 안정화)
2. **AI 인식** — onnxruntime-web + YOLO-seg ONNX로 백엔드 없이 시도. 막히면 호스팅(Replicate).
3. **지오메트리** — flatten-js + Clipper로 중심선/오프셋 고도화.
4. **이미지 전처리(opencv.js)** → **내보내기** 순.

---

## 평가 기준 (후보 채울 때 참고)

- **완성도**: stars / 최근 커밋 / 이슈 대응 / 문서 품질
- **라이선스**: MIT/Apache(상업 가능) vs GPL/AGPL(주의) vs 상업 전용
- **연결난이도**: 낮음(드롭인) / 중간(어댑터 필요) / 높음(아키텍처 영향)
- **번들 영향**: 용량, 트리셰이킹/지연로딩 가능 여부
