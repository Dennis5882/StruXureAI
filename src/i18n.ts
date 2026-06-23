import { useDrawingStore } from './store/useDrawingStore';

export type Lang = 'ko' | 'en' | 'zh';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '繁體中文' },
];

type Entry = Record<Lang, string>;
const D: Record<string, Entry> = {
  // ── Toolbar ──
  'tb.help': { ko: '도움말', en: 'Help', zh: '說明' },
  'tb.image': { ko: '이미지', en: 'Image', zh: '影像' },
  'tb.cad': { ko: 'CAD', en: 'CAD', zh: 'CAD' },
  'tb.ai': { ko: 'AI 인식', en: 'AI Detect', zh: 'AI 辨識' },
  'tb.aiBusy': { ko: 'AI 분석 중...', en: 'Analyzing...', zh: 'AI 分析中…' },
  'tb.centerline': { ko: '중심선 자동', en: 'Auto Centerline', zh: '自動中心線' },
  'tb.centerlineTip': { ko: '벽체 쌍에서 중심선 자동 생성', en: 'Auto-generate centerlines from wall pairs', zh: '由牆對自動產生中心線' },
  'tb.sidebar': { ko: '레이어 사이드바 열기/닫기', en: 'Toggle layer panel', zh: '圖層面板開關' },
  'tb.save': { ko: '저장', en: 'Save', zh: '儲存' },
  'tb.saveTip': { ko: '구조 부재를 DXF로 저장 (DWG는 미지원 — CAD에서 변환)', en: 'Save members as DXF (DWG not supported — convert in CAD)', zh: '將構件儲存為 DXF（不支援 DWG — 請於 CAD 轉換）' },
  'al.noExport': { ko: '저장할 구조 부재가 없습니다. 먼저 도형을 그리거나 "정밀 구조모델 추출"을 실행하세요.', en: 'Nothing to save. Draw shapes or run "Extract Structural Model" first.', zh: '無可儲存的構件。請先繪製圖形或執行「萃取結構模型」。' },
  'al.saveDone': { ko: 'DXF 저장 완료 ({0}개 부재). DWG가 필요하면 CAD에서 열어 변환하세요.', en: 'DXF saved ({0} members). For DWG, open in CAD and convert.', zh: 'DXF 已儲存（{0} 個構件）。需 DWG 請於 CAD 開啟轉換。' },
  'tb.gridSnapTip': { ko: '그리기/이동 시 격자에 맞춤(스냅)', en: 'Snap to grid when drawing/moving', zh: '繪製/移動時對齊格線' },
  'tb.gridOff': { ko: '끄기', en: 'Off', zh: '關閉' },
  'mode.SELECT': { ko: '이동/선택', en: 'Move/Select', zh: '移動/選取' },
  'mode.DRAW_LINE': { ko: '선', en: 'Line', zh: '線' },
  'mode.DRAW_RECT': { ko: '사각형', en: 'Rectangle', zh: '矩形' },
  'mode.DRAW_CIRCLE': { ko: '원', en: 'Circle', zh: '圓' },
  'mode.DRAW_TRIANGLE': { ko: '삼각형', en: 'Triangle', zh: '三角形' },
  'mode.DELETE': { ko: '지우개 (클릭하여 삭제)', en: 'Eraser (click to delete)', zh: '橡皮擦（點擊刪除）' },
  'st.WALL': { ko: '벽체 (Wall)', en: 'Wall', zh: '牆' },
  'st.COLUMN': { ko: '기둥 (Column)', en: 'Column', zh: '柱' },
  'st.BEAM': { ko: '보 (Beam)', en: 'Beam', zh: '梁' },
  'st.CENTER_LINE': { ko: '중심선 (Center)', en: 'Center Line', zh: '中心線' },
  'al.needImage': { ko: '도면 이미지를 먼저 불러와주세요.', en: 'Please load a drawing image first.', zh: '請先載入圖面影像。' },
  'al.aiError': { ko: 'AI 서버 통신 오류', en: 'AI server communication error', zh: 'AI 伺服器通訊錯誤' },
  'al.noCenterline': {
    ko: '중심선을 생성할 벽체(WALL) 쌍을 찾지 못했습니다.\nCAD라면 먼저 "정밀 구조모델 추출"로 벽을 가져오거나, 마주보는 벽 두 개를 그려주세요.',
    en: 'No wall pairs found for centerline generation.\nExtract walls first (Extract Structural Model) or draw two facing walls.',
    zh: '找不到可產生中心線的牆對。\n請先「萃取結構模型」取得牆，或繪製兩道相對的牆。',
  },
  'al.centerlineDone': { ko: '중심선 {0}개 생성 완료', en: 'Generated {0} centerlines', zh: '已產生 {0} 條中心線' },

  // ── LayerSidebar ──
  'ls.title': { ko: 'CAD 도면 레이어', en: 'CAD Layers', zh: 'CAD 圖層' },
  'ls.autofilter': { ko: '구조 부재 자동 필터링', en: 'Auto-filter Structural', zh: '自動篩選結構構件' },
  'ls.extract': { ko: '정밀 구조모델 추출', en: 'Extract Structural Model', zh: '萃取結構模型' },
  'ls.extractTip': { ko: '보이는 벽/기둥 레이어를 편집 가능한 구조 부재로 변환', en: 'Convert visible wall/column layers into editable structural members', zh: '將可見的牆/柱圖層轉為可編輯的結構構件' },
  'ls.thicknessStd': { ko: '두께 표준', en: 'Thickness Std', zh: '厚度標準' },
  'ls.thicknessTip': { ko: '측정 두께를 지역 표준치로 스냅 (MIDAS 단면 정리용)', en: 'Snap measured thickness to regional standard (for MIDAS sections)', zh: '將量測厚度對齊地區標準值（供 MIDAS 斷面整理）' },
  'ls.profRaw': { ko: '원본(측정값)', en: 'Raw (measured)', zh: '原始（量測值）' },
  'ls.profTW': { ko: '대만/동남아', en: 'Taiwan/SEA', zh: '台灣/東南亞' },
  'ls.profKR': { ko: '한국', en: 'Korea', zh: '韓國' },
  'ls.empty': { ko: 'DXF 파일을 불러오면\n레이어 목록이 표시됩니다.', en: 'Load a DXF file to\nsee the layer list.', zh: '載入 DXF 檔案後\n將顯示圖層清單。' },
  'ls.loadFirst': { ko: '먼저 CAD(DXF/DWG) 파일을 불러와주세요.', en: 'Please load a CAD (DXF/DWG) file first.', zh: '請先載入 CAD（DXF/DWG）檔案。' },
  'ls.noStruct': {
    ko: '보이는 레이어에서 벽/기둥을 찾지 못했습니다.\n레이어명에 WALL/COL/벽/기둥 등이 포함돼야 합니다. (자동 필터링 먼저 시도)',
    en: 'No walls/columns found in visible layers.\nLayer names must contain WALL/COL etc. (try Auto-filter first)',
    zh: '可見圖層中找不到牆/柱。\n圖層名稱需含 WALL/COL 等字。（請先試「自動篩選」）',
  },
  'ls.extractDone': { ko: '정밀 구조모델 추출 완료', en: 'Structural model extracted', zh: '結構模型萃取完成' },
  'ls.rWall': { ko: '· 벽 축선 {0}개 (두께 측정, 통심선 라벨 {1}개)', en: '· {0} wall axes (thickness measured, {1} grid-line labels)', zh: '· 牆軸線 {0} 條（已量測厚度，通軸標註 {1}）' },
  'ls.rCol': { ko: '· 기둥 {0}개 (그리드 태깅 {1}개)', en: '· {0} columns ({1} grid-tagged)', zh: '· 柱 {0} 支（網格標記 {1}）' },
  'ls.rBeam': { ko: '· 보 {0}개', en: '· {0} beams', zh: '· 梁 {0} 支' },
  'ls.rUnpaired': { ko: '· 미매칭 벽 면선 {0}개 제외', en: '· {0} unpaired wall faces excluded', zh: '· 排除未配對牆面線 {0} 條' },
  'ls.rTopo': { ko: '· 위상 정리: 절점 {0}개, 교차연장 {1}, 기둥스냅 {2}', en: '· Topology: {0} nodes, {1} extended, {2} column-snaps', zh: '· 拓樸整理：節點 {0}、交點延伸 {1}、柱對齊 {2}' },
  'ls.rQuant': { ko: '· 두께 양자화({0}): {1}개 표준치 스냅', en: '· Quantize ({0}): {1} snapped to standard', zh: '· 厚度量化（{0}）：{1} 對齊標準值' },

  // ── MIDAS Export ──
  'mx.title': { ko: 'MIDAS Gen NX 내보내기', en: 'MIDAS Gen NX Export', zh: 'MIDAS Gen NX 匯出' },
  'mx.storyH': { ko: '층고(mm)', en: 'Story Height (mm)', zh: '樓高 (mm)' },
  'mx.grade': { ko: '콘크리트 등급', en: 'Concrete Grade', zh: '混凝土等級' },
  'mx.baseUrl': { ko: 'Base URL', en: 'Base URL', zh: 'Base URL' },
  'mx.keyLabel': { ko: 'MAPI-Key', en: 'MAPI-Key', zh: 'MAPI-Key' },
  'mx.keyHint': { ko: '(Gen NX 발급, 저장 안 함)', en: '(issued in Gen NX, not stored)', zh: '(Gen NX 發行，不儲存)' },
  'mx.send': { ko: 'API 전송', en: 'Send via API', zh: 'API 傳送' },
  'mx.sending': { ko: '전송 중…', en: 'Sending…', zh: '傳送中…' },
  'mx.jsonTip': { ko: 'API 요청 JSON 다운로드', en: 'Download request JSON', zh: '下載請求 JSON' },
  'mx.pyTip': { ko: 'Python 스크립트 다운로드', en: 'Download Python script', zh: '下載 Python 腳本' },
  'mx.note': {
    ko: '단일층 PoC: 절점+요소 기하 정합. 재질=더미(CNS560), 단면=측정 기하. ⚠️ Gen NX 실행 중이어야 전송 동작. 브라우저 CORS 차단 시 Python/JSON 사용.',
    en: 'Single-floor PoC: nodes+elements geometry. Material=dummy (CNS560), sections=measured. ⚠️ Gen NX must be running to send. Use Python/JSON if browser CORS blocks.',
    zh: '單層 PoC：節點+元素幾何。材料=虛擬(CNS560)，斷面=量測值。⚠️ 須執行 Gen NX 才能傳送。瀏覽器 CORS 受阻時改用 Python/JSON。',
  },
  'mx.alExtract': { ko: '먼저 CAD를 불러오고 "정밀 구조모델 추출"을 실행하세요.', en: 'Load a CAD and run "Extract Structural Model" first.', zh: '請先載入 CAD 並執行「萃取結構模型」。' },
  'mx.alNoMembers': { ko: '추출된 구조부재가 없습니다. "정밀 구조모델 추출" 먼저 실행하세요.', en: 'No extracted members. Run "Extract Structural Model" first.', zh: '尚無萃取構件。請先執行「萃取結構模型」。' },
  'mx.alKey': { ko: 'MAPI-Key를 입력하세요. (MIDAS Gen NX 앱에서 발급)', en: 'Enter your MAPI-Key (issued in MIDAS Gen NX).', zh: '請輸入 MAPI-Key（由 MIDAS Gen NX 發行）。' },
  'mx.sum': { ko: '절점 {0} · 기둥 {1} · 벽 {2} · 보 {3} · 단면 {4} · 두께 {5}', en: 'nodes {0} · columns {1} · walls {2} · beams {3} · sections {4} · thik {5}', zh: '節點 {0} · 柱 {1} · 牆 {2} · 梁 {3} · 斷面 {4} · 厚度 {5}' },
  'mx.logStart': { ko: '전송 시작 · {0}', en: 'Sending · {0}', zh: '開始傳送 · {0}' },
  'mx.logReq': { ko: '요청 {0}건 → {1}', en: '{0} requests → {1}', zh: '請求 {0} 筆 → {1}' },
  'mx.logDone': { ko: '✅ 완료! Gen NX 화면(Fit View)을 확인하세요.', en: '✅ Done! Check Gen NX (Fit View).', zh: '✅ 完成！請於 Gen NX 檢視（Fit View）。' },
  'mx.logFail': { ko: '❌ 실패 — Gen NX 실행 여부/MAPI-Key/CORS를 확인하세요.', en: '❌ Failed — check Gen NX running / MAPI-Key / CORS.', zh: '❌ 失敗 — 請確認 Gen NX 執行、MAPI-Key、CORS。' },

  // ── Help Panel ──
  'help.title': { ko: '도움말', en: 'Help', zh: '說明' },
  'help.usage': { ko: '기본 사용 방법', en: 'Getting Started', zh: '基本使用方法' },
  'help.release': { ko: '릴리즈 노트', en: 'Release Notes', zh: '版本說明' },
  'help.warn': {
    ko: '⚠️ MIDAS 전송은 MIDAS Gen NX 실행 + MAPI-Key가 필요합니다(서버 경유). 브라우저 CORS로 막히면 Python/JSON 다운로드를 사용하세요.',
    en: '⚠️ MIDAS send requires MIDAS Gen NX running + a MAPI-Key (via server). If browser CORS blocks it, use the Python/JSON download.',
    zh: '⚠️ MIDAS 傳送需執行 MIDAS Gen NX 並具備 MAPI-Key（經伺服器）。若瀏覽器 CORS 受阻，請改用 Python/JSON 下載。',
  },
  'help.fulllog': { ko: '전체 변경 이력은 README의 Changelog를 참고하세요.', en: 'See the README Changelog for full history.', zh: '完整變更紀錄請參考 README Changelog。' },

  // ── Workspace ──
  'ws.hintSelect': { ko: '💡 객체 클릭→이동/크기 조절 · 선은 노란 끝점을 끌어 편집 | [Alt+드래그] 이동 · [휠] 줌', en: '💡 Click object → move/resize · drag yellow endpoints to edit lines | [Alt+drag] pan · [wheel] zoom', zh: '💡 點擊物件→移動/縮放 · 拖曳黃色端點編輯線 | [Alt+拖曳] 平移 · [滾輪] 縮放' },
  'ws.hintDelete': { ko: '🧽 삭제 모드: 지울 객체를 클릭하세요. [Alt + 드래그] 이동 | [휠] 줌', en: '🧽 Delete mode: click an object to remove. [Alt+drag] pan | [wheel] zoom', zh: '🧽 刪除模式：點擊欲刪除的物件。[Alt+拖曳] 平移 | [滾輪] 縮放' },
  'ws.hintDraw': { ko: '✏️ 도형 및 선 그리기 모드. Ctrl+Z 실행취소 | [Alt + 드래그] 이동 | [휠] 줌', en: '✏️ Draw shapes/lines. Ctrl+Z undo | [Alt+drag] pan | [wheel] zoom', zh: '✏️ 繪製圖形/線。Ctrl+Z 復原 | [Alt+拖曳] 平移 | [滾輪] 縮放' },
  'ws.dropTitle': { ko: '여기에 파일을 놓으세요', en: 'Drop your file here', zh: '將檔案拖放至此' },
  'ws.dropSub': { ko: '이미지 (PNG/JPG 등) 또는 CAD (DXF/DWG)', en: 'Image (PNG/JPG…) or CAD (DXF/DWG)', zh: '影像 (PNG/JPG…) 或 CAD (DXF/DWG)' },
  'ws.loading': { ko: '불러오는 중...', en: 'Loading...', zh: '載入中…' },
};

// 현재 언어로 키를 번역하고 {0},{1}… 자리표시자를 치환. 미정의 키는 ko→key 폴백.
export const translate = (lang: Lang, key: string, ...args: (string | number)[]): string => {
  const e = D[key];
  let s = e ? (e[lang] ?? e.ko) : key;
  args.forEach((a, i) => { s = s.replace(`{${i}}`, String(a)); });
  return s;
};

// 컴포넌트용 훅: 스토어 lang 구독 → t(key, ...args)
export const useT = () => {
  const lang = useDrawingStore((s) => s.lang);
  return { lang, t: (key: string, ...args: (string | number)[]) => translate(lang, key, ...args) };
};
