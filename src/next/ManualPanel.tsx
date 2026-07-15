import React from 'react';
import { X, BookOpen, Layers, Crop, AlertTriangle, Lightbulb } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';

type Lang = 'ko' | 'en' | 'zh';
type L = Record<Lang, string>;

// 매뉴얼 본문은 분량이 많아 flat DICT 대신 여기 구조화해 둔다(한/영/중).
// 블록 종류: p=문단, step=번호단계, tip=파란 팁, warn=주황 주의.
interface Block { kind: 'p' | 'tip' | 'warn'; label?: L; text: L; }
interface Section { id: string; icon: React.ReactNode; title: L; blocks: Block[]; }

const t = (ko: string, en: string, zh: string): L => ({ ko, en, zh });

const SECTIONS: Section[] = [
  {
    id: 'what',
    icon: <BookOpen size={15} />,
    title: t('StruXureAI란?', 'What is StruXureAI?', '什麼是 StruXureAI？'),
    blocks: [
      { kind: 'p', text: t(
        '건축 구조 도면(DWG/DXF)에서 기둥·벽·보를 자동으로 읽어 절점-부재 구조모델을 만들고, MIDAS Gen NX로 넘겨주는 도구입니다.',
        'A tool that automatically reads columns, walls and beams from structural drawings (DWG/DXF), builds a node–member structural model, and hands it off to MIDAS Gen NX.',
        '本工具能自動從結構圖（DWG/DXF）讀取柱、牆、梁，建立節點—構件結構模型，並交付給 MIDAS Gen NX。') },
      { kind: 'warn', label: t('작업 범위', 'Scope', '作業範圍'), text: t(
        '이 앱은 “모델링 + 핸드오프”까지만 담당합니다. 하중·지진·풍·하중조합·해석 실행은 MIDAS Gen NX에서 하세요.',
        'This app only covers “modeling + handoff.” Loads, seismic, wind, load combinations and analysis are done in MIDAS Gen NX.',
        '本工具僅負責「建模＋交付」。荷載、地震、風、載重組合與分析請於 MIDAS Gen NX 中進行。') },
    ],
  },
  {
    id: 'quickstart',
    icon: <Layers size={15} />,
    title: t('빠른 시작 — 5단계', 'Quick start — 5 steps', '快速上手 — 5 步'),
    blocks: [
      { kind: 'p', label: t('① 도면 열기', '① Open drawing', '① 開啟圖面'), text: t(
        '상단 “CAD” 버튼으로 DWG 또는 DXF 파일을 엽니다. (스캔·사진은 “이미지” 버튼)',
        'Open a DWG or DXF via the top “CAD” button. (Use “Image” for scans/photos.)',
        '用上方「CAD」按鈕開啟 DWG 或 DXF 檔。（掃描／照片用「影像」按鈕）') },
      { kind: 'p', label: t('② 구조 레이어', '② Structural layers', '② 結構圖層'), text: t(
        '“구조 레이어 자동필터”를 누르면 기둥·벽·보·축선 레이어만 남깁니다. 잘못 분류된 레이어는 오른쪽 목록에서 직접 벽/기둥/보/제외로 바꿀 수 있습니다.',
        'Click “Auto-filter structural” to keep only column/wall/beam/axis layers. Re-assign any mis-classified layer to wall/column/beam/exclude in the right list.',
        '點「自動篩選結構圖層」只保留柱／牆／梁／軸線圖層。分類錯誤的圖層可在右側清單改為牆／柱／梁／排除。') },
      { kind: 'p', label: t('③ 추출', '③ Extract', '③ 擷取'), text: t(
        '“구조 모델 추출”을 누르면 부재를 인식해 절점-부재 그래프(접합부에서 절점 공유)를 만듭니다.',
        'Click “Extract structure” to recognize members and build a node–member graph (shared nodes at joints).',
        '點「擷取結構」辨識構件並建立節點—構件圖（接點處共用節點）。') },
      { kind: 'p', label: t('④ 검토', '④ Review', '④ 檢視'), text: t(
        '부재를 클릭하면 단면·두께·춤을 편집할 수 있습니다. 연결되지 않은 자유단은 주황 링으로 표시됩니다. 부재 삭제·추가도 가능합니다.',
        'Click a member to edit its section, thickness and depth. Unconnected free ends are marked with an amber ring. You can also delete or add members.',
        '點選構件可編輯斷面、厚度與梁高。未連接的自由端會以橘色圈標示。也可刪除或新增構件。') },
      { kind: 'p', label: t('⑤ Gen NX', '⑤ Gen NX', '⑤ Gen NX'), text: t(
        'MIDAS Gen NX로 직접 전송하거나, DXF·JSON으로 내보냅니다. (전송에는 MAPI-Key가 필요하며 저장되지 않습니다.)',
        'Send directly to MIDAS Gen NX, or export as DXF/JSON. (Sending needs a MAPI-Key, which is never stored.)',
        '可直接傳送至 MIDAS Gen NX，或匯出為 DXF／JSON。（傳送需 MAPI-Key，且不會被儲存。）') },
    ],
  },
  {
    id: 'drawing',
    icon: <Crop size={15} />,
    title: t('도면 처리 팁 (중요)', 'Drawing tips (important)', '圖面處理要點（重要）'),
    blocks: [
      { kind: 'tip', label: t('큰 도면은 한 층만 CROP', 'Crop one plan on big drawings', '大圖請框選單一平面'), text: t(
        '한 파일에 여러 평면이 들어 있으면(도면 범위가 매우 큼), 상단 CROP으로 한 층(평면)만 선택한 뒤 추출하세요. 그러면 화면이 확대되어 벽 두께·보 폭·보-기둥 연결까지 정밀하게 잡힙니다. 크롭 없이 큰 도면 전체를 추출하면 벽·보가 단선으로만 대충 잡힙니다.',
        'If one file holds several plans (very large extent), use CROP to pick a single floor plan before extracting. It zooms in so wall thickness, beam width and beam–column links come out precisely. Extracting a huge drawing whole leaves walls/beams as coarse single lines.',
        '若一個檔案含多張平面（範圍很大），請先用 CROP 框選單一樓層平面再擷取。畫面會放大，牆厚、梁寬與梁柱連接皆可精確擷取。未框選而整張大圖擷取，牆／梁只會粗略呈現為單線。') },
      { kind: 'tip', label: t('축척 자동 보정', 'Automatic scale correction', '比例自動校正'), text: t(
        '중국 시공도(PKPM/YJK)는 실제 치수의 2배로 그리고 치수만 참값으로 표기하는 경우가 흔합니다. 이 앱은 치수 문자를 근거로 이를 자동 감지해 실제 mm로 보정합니다. CROP 패널의 파란 배너에서 배율과 근거를 확인하고, 필요하면 보정을 끄고 켤 수 있습니다.',
        'Chinese construction drawings (PKPM/YJK) are often drawn at 2× actual size with only the dimension text showing the true value. This app detects that from the dimension text and converts the model to real mm. Check the factor and evidence in the blue banner of the CROP panel, and toggle correction on/off if needed.',
        '中國施工圖（PKPM/YJK）常以實際尺寸的 2 倍繪製，僅標註文字為真實值。本工具會依標註文字自動偵測並換算為真實 mm。可於 CROP 面板的藍色橫幅查看比例與依據，必要時開關校正。') },
      { kind: 'p', label: t('평법 집중표주 읽기', 'Reads flat-method labels', '讀取平法集中標註'), text: t(
        '“KL(1) 200X400” 같은 집중표주에서 보 부호·폭·춤(높이)을 자동으로 읽습니다. 춤은 평면 기하만으로는 알 수 없어 이 라벨이 유일한 출처입니다.',
        'Reads beam mark, width and depth from labels like “KL(1) 200X400.” Depth cannot be known from plan geometry alone, so the label is its only source.',
        '從「KL(1) 200X400」等集中標註自動讀取梁編號、寬度與梁高。梁高無法僅由平面幾何得知，故此標註為唯一來源。') },
      { kind: 'p', label: t('한자 인코딩 자동 판별', 'Auto CJK encoding', '自動辨識中文編碼'), text: t(
        '简体/繁體 도면의 레이어명이 깨지지 않도록 인코딩(GBK/Big5/UTF-8)을 자동으로 판별합니다.',
        'Auto-detects encoding (GBK/Big5/UTF-8) so layer names in Simplified/Traditional Chinese drawings do not break.',
        '自動辨識編碼（GBK/Big5/UTF-8），使簡體／繁體圖面的圖層名稱不會亂碼。') },
    ],
  },
  {
    id: 'trouble',
    icon: <AlertTriangle size={15} />,
    title: t('자주 겪는 문제', 'Troubleshooting', '常見問題'),
    blocks: [
      { kind: 'p', label: t('아무것도 안 보여요', 'Nothing shows up', '什麼都看不到'), text: t(
        '① 아주 오래된 DWG(2000 이전)는 열리지 않을 수 있습니다 — CAD에서 2013/2018 버전으로 다시 저장해 보세요. ② 레이어가 모두 꺼져 있을 수 있으니 “자동필터”를 눌러 보세요.',
        '① Very old DWG (pre-2000) may not open — re-save as 2013/2018 in CAD. ② All layers may be hidden — try “Auto-filter.”',
        '① 太舊的 DWG（2000 前）可能無法開啟——請在 CAD 另存為 2013/2018 版。② 圖層可能全部關閉——請點「自動篩選」。') },
      { kind: 'p', label: t('부재 크기가 2배로 이상해요', 'Members look 2× off', '構件尺寸像差了 2 倍'), text: t(
        'CROP 패널의 파란 축척 배너를 확인하세요. 도면이 2배로 그려진 경우이며, 자동 보정이 켜져 있어야 실제 치수가 나옵니다.',
        'Check the blue scale banner in the CROP panel. The drawing is drawn at 2× and auto-correction must be on for real dimensions.',
        '請查看 CROP 面板的藍色比例橫幅。此圖以 2 倍繪製，需開啟自動校正才會得到真實尺寸。') },
      { kind: 'p', label: t('벽·보가 선 하나로만 나와요', 'Walls/beams come as single lines', '牆／梁只呈現單線'), text: t(
        '도면이 너무 큰 상태로 추출한 것입니다. CROP으로 한 층만 선택한 뒤 다시 추출하세요.',
        'You extracted while the drawing was too large. Crop a single floor plan and extract again.',
        '這是在圖面過大時擷取的結果。請用 CROP 框選單一平面後重新擷取。') },
      { kind: 'p', label: t('기둥이 너무 많이 잡혀요', 'Too many columns', '柱抓取過多'), text: t(
        '철근·치수 레이어가 기둥으로 오인된 경우입니다. “자동필터”를 사용하거나, 오른쪽 레이어 목록에서 해당 레이어를 “제외”로 지정하세요.',
        'Rebar/dimension layers were mistaken for columns. Use “Auto-filter,” or set those layers to “exclude” in the right layer list.',
        '鋼筋／標註圖層被誤認為柱。請使用「自動篩選」，或在右側圖層清單將該圖層設為「排除」。') },
    ],
  },
];

interface Props { open: boolean; onClose: () => void; }

export const ManualPanel: React.FC<Props> = ({ open, onClose }) => {
  const lang = useDrawingStore((s) => s.lang) as Lang;
  const heading = { ko: '사용 설명서', en: 'User guide', zh: '使用說明' }[lang];
  const sub = {
    ko: '도면을 구조모델로 바꿔 MIDAS Gen NX로 넘기기까지',
    en: 'From drawing to structural model to MIDAS Gen NX',
    zh: '從圖面到結構模型再到 MIDAS Gen NX',
  }[lang];

  return (
    <>
      {/* 바깥 클릭 시 닫기 (모바일·좁은 화면 대비 반투명 오버레이) */}
      {open && <div className="absolute inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden />}
      <aside
        className={`absolute top-0 left-0 h-full z-40 w-[380px] max-w-[86vw] bg-zinc-900 border-r border-zinc-800 shadow-2xl
          flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!open}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-zinc-100">{heading}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{sub}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="close">
            <X size={16} />
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {SECTIONS.map((sec) => (
            <section key={sec.id}>
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-indigo-300 mb-2">
                <span className="text-indigo-400">{sec.icon}</span>
                {sec.title[lang]}
              </h3>
              <div className="space-y-2">
                {sec.blocks.map((b, i) => {
                  if (b.kind === 'tip' || b.kind === 'warn') {
                    const c = b.kind === 'tip'
                      ? 'bg-sky-500/10 border-sky-500/30'
                      : 'bg-amber-500/10 border-amber-500/30';
                    const ic = b.kind === 'tip'
                      ? <Lightbulb size={13} className="text-sky-400 shrink-0 mt-0.5" />
                      : <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />;
                    const lc = b.kind === 'tip' ? 'text-sky-300' : 'text-amber-300';
                    return (
                      <div key={i} className={`flex gap-1.5 items-start rounded border px-2 py-1.5 ${c}`}>
                        {ic}
                        <div className="text-[11px] leading-relaxed">
                          {b.label && <span className={`font-medium ${lc}`}>{b.label[lang]} — </span>}
                          <span className="text-zinc-300">{b.text[lang]}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="text-[11px] leading-relaxed">
                      {b.label && <span className="font-medium text-zinc-200">{b.label[lang]} — </span>}
                      <span className="text-zinc-400">{b.text[lang]}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="pt-1 pb-4 text-[10px] text-zinc-600 leading-relaxed border-t border-zinc-800/60 mt-2">
            {lang === 'ko' && '더 자세한 도면 관례(레이어명·부호·인코딩·축척)는 저장소의 docs/DRAWING_CONVENTIONS.md 를 참고하세요.'}
            {lang === 'en' && 'For deeper drawing conventions (layer names, marks, encoding, scale) see docs/DRAWING_CONVENTIONS.md in the repository.'}
            {lang === 'zh' && '更詳細的圖面慣例（圖層名、編號、編碼、比例）請參考儲存庫的 docs/DRAWING_CONVENTIONS.md。'}
          </div>
        </div>
      </aside>
    </>
  );
};
