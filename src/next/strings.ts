// 새 UI(v2) 전용 문구 — 기존 src/i18n.ts 를 건드리지 않기 위해 로컬 사전으로 분리.
// 재사용 컴포넌트(Workspace/MidasExport)는 기존 i18n 을 그대로 사용한다.
import { useDrawingStore } from '../store/useDrawingStore';

type Lang = 'ko' | 'en' | 'zh';

const DICT: Record<string, Record<Lang, string>> = {
  badge:        { ko: 'UI v2 · 검토용', en: 'UI v2 · preview', zh: 'UI v2 · 預覽' },

  // 스테퍼 단계
  s1:           { ko: '① 도면 열기', en: '① Open', zh: '① 開啟圖面' },
  s2:           { ko: '② 구조 레이어', en: '② Layers', zh: '② 結構圖層' },
  s3:           { ko: '③ 추출', en: '③ Extract', zh: '③ 擷取' },
  s4:           { ko: '④ 검토', en: '④ Review', zh: '④ 檢視' },
  s5:           { ko: '⑤ Gen NX', en: '⑤ Gen NX', zh: '⑤ Gen NX' },

  // 다음 행동 CTA
  ctaOpen:      { ko: '도면 열기 (DWG/DXF)', en: 'Open drawing (DWG/DXF)', zh: '開啟圖面 (DWG/DXF)' },
  ctaExtract:   { ko: '구조 추출 실행', en: 'Run extraction', zh: '執行擷取' },
  ctaReview:    { ko: '검토 패널 열기', en: 'Open review', zh: '開啟檢視' },
  ctaSend:      { ko: 'Gen NX 전송 열기', en: 'Open Gen NX export', zh: '開啟 Gen NX 傳送' },
  next:         { ko: '다음', en: 'Next', zh: '下一步' },

  openImage:    { ko: '이미지', en: 'Image', zh: '影像' },
  openCad:      { ko: 'CAD', en: 'CAD', zh: 'CAD' },

  // 탭
  tabLayers:    { ko: '레이어', en: 'Layers', zh: '圖層' },
  tabReview:    { ko: '검토', en: 'Review', zh: '檢視' },
  tabExport:    { ko: '내보내기', en: 'Export', zh: '匯出' },

  // 레이어 탭
  autofilter:   { ko: '구조 레이어 자동필터', en: 'Auto-filter structural', zh: '自動篩選結構圖層' },
  extract:      { ko: '구조 모델 추출', en: 'Extract structure', zh: '擷取結構' },
  thickness:    { ko: '두께 표준', en: 'Thickness std', zh: '厚度標準' },
  profRaw:      { ko: '측정값(원본)', en: 'Measured (raw)', zh: '量測值（原始）' },
  noLayers:     { ko: '도면을 먼저 열어 주세요.\n(CAD 버튼)', en: 'Open a drawing first.\n(CAD button)', zh: '請先開啟圖面。\n（CAD 按鈕）' },
  loadFirst:    { ko: '먼저 DWG/DXF 를 여세요.', en: 'Open a DWG/DXF first.', zh: '請先開啟 DWG/DXF。' },
  noStruct:     { ko: '구조 부재를 찾지 못했습니다. 보이는 레이어를 확인하세요.', en: 'No members found. Check visible layers.', zh: '未找到構件，請檢查可見圖層。' },
  cropHint:     { ko: '도면이 커서 벽·보를 정밀하게 추출하지 못했습니다(대부분 단선 처리). 상단 CROP으로 한 층(평면)만 선택한 뒤 다시 추출하면 두께·폭까지 정확해집니다.', en: 'The drawing is large, so walls/beams were extracted coarsely (mostly single-line). Use CROP to select one floor plan, then extract again for accurate thickness/width.', zh: '圖面過大，牆／梁僅粗略擷取（多為單線）。請用上方 CROP 框選單一樓層平面後重新擷取，即可取得精確厚度／寬度。' },
  cropBigTitle: { ko: '큰 도면입니다 (여러 평면 포함 가능)', en: 'Large drawing (may contain several plans)', zh: '圖面很大（可能含多張平面）' },
  cropBigBody:  { ko: '한 층(평면)만 선택하면 그 영역이 확대되어 벽 두께·보 폭·보-기둥 연결까지 정밀하게 추출됩니다.', en: 'Select one floor plan — it zooms in so walls, beam widths and beam–column links extract precisely.', zh: '框選單一樓層平面後會放大該區，牆厚、梁寬與梁柱連接皆可精確擷取。' },

  // 검토 탭 — 품질
  qTitle:       { ko: '추출 품질', en: 'Extraction quality', zh: '擷取品質' },
  qEmpty:       { ko: '아직 추출된 모델이 없습니다.\n③ 추출을 먼저 실행하세요.', en: 'No model yet.\nRun ③ Extract first.', zh: '尚無模型。\n請先執行 ③ 擷取。' },
  qNodes:       { ko: '절점', en: 'Nodes', zh: '節點' },
  qMembers:     { ko: '부재', en: 'Members', zh: '構件' },
  qShared:      { ko: '공유 절점', en: 'Shared nodes', zh: '共用節點' },
  qFree:        { ko: '자유단', en: 'Free ends', zh: '自由端' },
  qWalls:       { ko: '벽', en: 'Walls', zh: '牆' },
  qColumns:     { ko: '기둥', en: 'Columns', zh: '柱' },
  qBeams:       { ko: '보', en: 'Beams', zh: '梁' },
  qGrid:        { ko: '그리드축', en: 'Grid axes', zh: '網格軸' },
  qFreeHint:    { ko: '자유단 = 벽/보 끝이 어디에도 연결 안 됨. 적을수록 좋음.', en: 'Free ends = wall/beam endpoints with no connection. Lower is better.', zh: '自由端＝牆/梁端點未連接。越少越好。' },
  qSingle:      { ko: '단일선', en: 'single-line', zh: '單線' },
  listWalls:    { ko: '벽 목록', en: 'Walls', zh: '牆清單' },
  listCols:     { ko: '기둥 목록', en: 'Columns', zh: '柱清單' },
  listBeams:    { ko: '보 목록', en: 'Beams', zh: '梁清單' },

  // 검토 탭 — 인라인 수정(U3)
  editHint:     { ko: '부재를 클릭하면 캔버스에서 강조되고 값을 수정할 수 있어요.', en: 'Click a member to highlight it on canvas and edit its values.', zh: '點擊構件即可在畫布上標示並編輯數值。' },
  edWidth:      { ko: '폭 b', en: 'Width b', zh: '寬 b' },
  edDepth:      { ko: '깊이 h', en: 'Depth h', zh: '深 h' },
  edRot:        { ko: '회전°', en: 'Rot°', zh: '旋轉°' },
  edThick:      { ko: '두께 t', en: 'Thick t', zh: '厚 t' },
  edBeamW:      { ko: '폭 w', en: 'Width w', zh: '寬 w' },
  edDone:       { ko: '닫기', en: 'Close', zh: '關閉' },
  edDelete:     { ko: '삭제', en: 'Delete', zh: '刪除' },

  // 부재 추가 / 자유단 연결
  addTitle:     { ko: '부재 추가', en: 'Add member', zh: '新增構件' },
  addWall:      { ko: '벽 추가', en: 'Add wall', zh: '新增牆' },
  addColumn:    { ko: '기둥 추가', en: 'Add column', zh: '新增柱' },
  addHint:      { ko: '버튼 후 캔버스에 드래그하면 새 부재가 추가됩니다.', en: 'After clicking, drag on the canvas to add a new member.', zh: '點擊後於畫布拖曳即可新增構件。' },
  autoConnect:  { ko: '자유단 자동 연결', en: 'Auto-connect free ends', zh: '自動連接自由端' },
  autoConnectHint: { ko: '≤300mm 근접 자유단을 이웃 절점에 병합합니다.', en: 'Merges free ends within 300mm to a neighbor node.', zh: '將 ≤300mm 的自由端併入鄰近節點。' },

  // 내보내기 탭 — 체크리스트
  ckTitle:      { ko: '전송 준비 체크리스트', en: 'Export checklist', zh: '傳送檢查清單' },
  ckFile:       { ko: '도면 로드됨', en: 'Drawing loaded', zh: '已載入圖面' },
  ckExtract:    { ko: '구조 모델 추출됨', en: 'Structure extracted', zh: '已擷取結構' },
  ckModel:      { ko: '절점 그래프 생성됨', en: 'Node graph built', zh: '已建立節點圖' },
  ckReady:      { ko: '아래에서 층수·층고·MAPI-Key 입력 후 전송', en: 'Enter stories/height/MAPI-Key below, then send', zh: '於下方輸入層數/層高/MAPI-Key 後傳送' },
  exDxf:        { ko: 'DXF 내보내기', en: 'Export DXF', zh: '匯出 DXF' },
  exDxfHint:    { ko: '편집 반영된 구조모델을 DXF(mm)로 저장', en: 'Save the edited model as DXF (mm)', zh: '將編輯後的模型存為 DXF (mm)' },
  exBldgDxf:    { ko: '빌딩 DXF (3D)', en: 'Building DXF (3D)', zh: '建物 DXF (3D)' },

  // 다층(Building)
  flTitle:      { ko: '층 구성 (Building)', en: 'Floors (Building)', zh: '樓層 (Building)' },
  flSave:       { ko: '현재 층 저장', en: 'Save current floor', zh: '儲存目前樓層' },
  flEmpty:      { ko: '추출·검토한 층을 저장해 여러 층을 쌓으세요.', en: 'Save extracted floors to stack a building.', zh: '儲存已擷取的樓層以堆疊建物。' },
  flName:       { ko: '층명', en: 'Name', zh: '樓層名' },
  flElev:       { ko: '레벨', en: 'Level', zh: '標高' },
  flHeight:     { ko: '층고', en: 'Height', zh: '層高' },
  flCount:      { ko: '개 층', en: ' floors', zh: ' 層' },
  flNoModel:    { ko: '먼저 구조를 추출하세요.', en: 'Extract a structure first.', zh: '請先擷取結構。' },
};

export function useNext() {
  const lang = useDrawingStore((s) => s.lang) as Lang;
  const n = (key: keyof typeof DICT) => DICT[key]?.[lang] ?? DICT[key]?.ko ?? String(key);
  return { n, lang };
}
