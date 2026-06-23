import React from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { useT, Lang } from '../i18n';
import { X, BookOpen, Rocket } from 'lucide-react';

type Tri = Record<Lang, string>;

// 기본 사용 흐름 (도면 → 구조모델 → MIDAS)
const STEPS: { title: Tri; desc: Tri }[] = [
  {
    title: { ko: '1. 도면 불러오기', en: '1. Load a drawing', zh: '1. 載入圖面' },
    desc: { ko: '상단 [CAD] 버튼 또는 드래그앤드롭으로 DWG/DXF를 엽니다. 사진/스캔은 [이미지].', en: 'Open DWG/DXF via the [CAD] button or drag-and-drop. Use [Image] for photos/scans.', zh: '透過 [CAD] 按鈕或拖放開啟 DWG/DXF。照片/掃描請用 [影像]。' },
  },
  {
    title: { ko: '2. 레이어 정리', en: '2. Filter layers', zh: '2. 整理圖層' },
    desc: { ko: '우측 [레이어] 패널에서 "구조 부재 자동 필터링"을 누르면 벽/기둥 레이어만 표시됩니다. 눈 아이콘으로 개별 토글.', en: 'In the right [Layers] panel, "Auto-filter Structural" shows only wall/column layers. Toggle each with the eye icon.', zh: '於右側 [圖層] 面板按「自動篩選結構構件」只顯示牆/柱圖層。可用眼睛圖示個別切換。' },
  },
  {
    title: { ko: '3. 정밀 구조모델 추출', en: '3. Extract structural model', zh: '3. 萃取結構模型' },
    desc: { ko: '"정밀 구조모델 추출" 클릭 → 벽(축선+두께), 기둥(단면+그리드 참조), 보를 자동 추출하고 교차부를 절점으로 연결합니다.', en: 'Click "Extract Structural Model" → auto-extract walls (axis+thickness), columns (section+grid ref), beams, and connect joints into nodes.', zh: '按「萃取結構模型」→ 自動萃取牆（軸線+厚度）、柱（斷面+網格參照）、梁，並將交點連成節點。' },
  },
  {
    title: { ko: '4. 두께 표준(선택)', en: '4. Thickness standard (optional)', zh: '4. 厚度標準（選用）' },
    desc: { ko: '"두께 표준"을 대만/동남아 또는 한국으로 두면 측정 두께를 표준 단면값으로 정리합니다 (MIDAS 단면 정리용).', en: 'Set "Thickness Std" to Taiwan/SEA or Korea to snap measured thickness to standard values (for MIDAS sections).', zh: '將「厚度標準」設為台灣/東南亞或韓國，可把量測厚度對齊標準值（供 MIDAS 斷面整理）。' },
  },
  {
    title: { ko: '5. 편집', en: '5. Edit', zh: '5. 編輯' },
    desc: { ko: '이동/선택 모드: 사각형·원은 드래그·크기조절, 선은 양 끝점 드래그. 팬=Alt+드래그, 줌=마우스휠, 삭제=지우개 모드.', en: 'Move/Select: drag/resize rects & circles, drag line endpoints. Pan=Alt+drag, Zoom=wheel, Delete=eraser mode.', zh: '移動/選取：拖曳/縮放矩形與圓，拖曳線端點。平移=Alt+拖曳，縮放=滾輪，刪除=橡皮擦模式。' },
  },
  {
    title: { ko: '6. MIDAS Gen NX 내보내기', en: '6. Export to MIDAS Gen NX', zh: '6. 匯出至 MIDAS Gen NX' },
    desc: { ko: '우측 패널 하단 "MIDAS Gen NX 내보내기" → 층고/등급/MAPI-Key 입력 → [API 전송](Gen NX 실행 필요) 또는 [JSON/Python 다운로드].', en: 'Bottom of right panel "MIDAS Gen NX Export" → enter story height/grade/MAPI-Key → [Send via API] (Gen NX must run) or [JSON/Python download].', zh: '右側面板下方「MIDAS Gen NX 匯出」→ 輸入樓高/等級/MAPI-Key → [API 傳送]（須執行 Gen NX）或 [JSON/Python 下載]。' },
  },
];

// 릴리즈 노트 (요약)
const RELEASES: { ver: string; title: Tri; items: Tri[] }[] = [
  { ver: 'v0.21.0', title: { ko: '다국어 지원', en: 'Multilingual', zh: '多語系' }, items: [{ ko: '한국어 / English / 繁體中文 전환', en: 'Switch Korean / English / Traditional Chinese', zh: '切換 한국어 / English / 繁體中文' }] },
  { ver: 'v0.20.0', title: { ko: '도움말 패널', en: 'Help panel', zh: '說明面板' }, items: [{ ko: '좌측 도움말 — 사용법 + 릴리즈 노트', en: 'Left help — guide + release notes', zh: '左側說明 — 使用方法 + 版本說明' }] },
  { ver: 'v0.19.0', title: { ko: 'MIDAS Gen NX 내보내기 (단일층)', en: 'MIDAS Gen NX export (single floor)', zh: 'MIDAS Gen NX 匯出（單層）' }, items: [{ ko: '구조부재 → MIDAS API 생성/전송', en: 'Members → MIDAS API build/send', zh: '構件 → MIDAS API 產生/傳送' }, { ko: '기둥·보=BEAM, 벽=PLATE, API/JSON/Python', en: 'columns·beams=BEAM, walls=PLATE, API/JSON/Python', zh: '柱·梁=BEAM，牆=PLATE，API/JSON/Python' }] },
  { ver: 'v0.18.0', title: { ko: '두께 양자화 프리셋', en: 'Thickness quantize presets', zh: '厚度量化預設' }, items: [{ ko: '대만/한국 표준 두께 스냅', en: 'Snap to Taiwan/Korea standard', zh: '對齊台灣/韓國標準厚度' }] },
  { ver: 'v0.17.0', title: { ko: '보(Beam) 추출', en: 'Beam extraction', zh: '梁萃取' }, items: [{ ko: '이중선=축선+폭, 단일선=중심선', en: 'double-line=axis+width, single=centerline', zh: '雙線=軸線+寬，單線=中心線' }] },
  { ver: 'v0.16.x', title: { ko: '벽 통심선 라벨 · 리사이즈 수정', en: 'Wall grid-line label · resize fix', zh: '牆通軸標註 · 縮放修正' }, items: [{ ko: '벽 통심선 태깅, 창 크기 변경 정합', en: 'wall grid-line tagging, resize alignment', zh: '牆通軸標記、視窗縮放對位' }] },
  { ver: 'v0.15.0', title: { ko: '기둥 회전/단면 정밀화', en: 'Column rotation/section', zh: '柱旋轉/斷面精化' }, items: [{ ko: '최소면적 직사각형으로 사선 기둥 산출', en: 'min-area rectangle for skewed columns', zh: '以最小面積矩形求傾斜柱' }] },
  { ver: 'v0.14.0', title: { ko: '위상 정리 (절점-부재 그래프)', en: 'Topology (node-member graph)', zh: '拓樸整理（節點-構件圖）' }, items: [{ ko: '벽 축선을 기둥/교차점에 연결', en: 'connect wall axes to columns/joints', zh: '將牆軸線連至柱/交點' }] },
  { ver: 'v0.13.x', title: { ko: '정밀 구조모델 추출 (P1)', en: 'Structural extraction (P1)', zh: '結構萃取（P1）' }, items: [{ ko: '벽 축선+두께, 기둥 단면+그리드', en: 'wall axis+thickness, column section+grid', zh: '牆軸線+厚度、柱斷面+網格' }] },
];

export const HelpPanel: React.FC = () => {
  const { isHelpOpen, toggleHelp } = useDrawingStore();
  const { t, lang } = useT();
  if (!isHelpOpen) return null;

  return (
    <div className="w-80 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full text-zinc-300 select-none z-10 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center space-x-2">
          <BookOpen size={16} className="text-sky-400" />
          <span className="font-bold text-sm">{t('help.title')}</span>
          <span className="text-[10px] text-zinc-500">v{__APP_VERSION__}</span>
        </div>
        <button onClick={toggleHelp} className="text-zinc-500 hover:text-white transition-colors"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* 사용 방법 */}
        <section>
          <h3 className="flex items-center space-x-1.5 text-xs font-bold text-zinc-200 mb-2">
            <Rocket size={13} className="text-emerald-400" /><span>{t('help.usage')}</span>
          </h3>
          <ol className="space-y-2.5">
            {STEPS.map((s) => (
              <li key={s.title.en} className="bg-zinc-900/60 border border-zinc-800 rounded-md p-2">
                <div className="text-[12px] font-semibold text-zinc-100">{s.title[lang]}</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{s.desc[lang]}</div>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">{t('help.warn')}</p>
        </section>

        {/* 릴리즈 노트 */}
        <section>
          <h3 className="flex items-center space-x-1.5 text-xs font-bold text-zinc-200 mb-2">
            <BookOpen size={13} className="text-sky-400" /><span>{t('help.release')}</span>
          </h3>
          <div className="space-y-2.5">
            {RELEASES.map((r) => (
              <div key={r.ver} className="border-l-2 border-sky-500/40 pl-2.5">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-[11px] font-bold text-sky-300">{r.ver}</span>
                  <span className="text-[11px] text-zinc-300">{r.title[lang]}</span>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {r.items.map((it, i) => (
                    <li key={i} className="text-[10.5px] text-zinc-500 leading-relaxed">· {it[lang]}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">{t('help.fulllog')}</p>
        </section>
      </div>
    </div>
  );
};
