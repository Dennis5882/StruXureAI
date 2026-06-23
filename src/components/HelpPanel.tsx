import React from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { X, BookOpen, Rocket } from 'lucide-react';

// 기본 사용 흐름 (도면 → 구조모델 → MIDAS)
const STEPS: { title: string; desc: string }[] = [
  { title: '1. 도면 불러오기', desc: '상단 [CAD] 버튼 또는 드래그앤드롭으로 DWG/DXF를 엽니다. 사진/스캔은 [이미지].' },
  { title: '2. 레이어 정리', desc: '우측 [레이어] 패널에서 "구조 부재 자동 필터링"을 누르면 벽/기둥 레이어만 표시됩니다. 눈 아이콘으로 개별 토글.' },
  { title: '3. 정밀 구조모델 추출', desc: '"정밀 구조모델 추출" 클릭 → 벽(축선+두께), 기둥(단면+그리드 참조), 보를 자동 추출하고 교차부를 절점으로 연결합니다.' },
  { title: '4. 두께 표준(선택)', desc: '"두께 표준"을 대만/동남아 또는 한국으로 두면 측정 두께를 표준 단면값으로 정리합니다 (MIDAS 단면 정리용).' },
  { title: '5. 편집', desc: '이동/선택 모드: 사각형·원은 드래그·크기조절, 선은 양 끝점 드래그. 팬=Alt+드래그, 줌=마우스휠, 삭제=지우개 모드.' },
  { title: '6. MIDAS Gen NX 내보내기', desc: '우측 패널 하단 "MIDAS Gen NX 내보내기" → 층고/등급/MAPI-Key 입력 → [API 전송](Gen NX 실행 필요) 또는 [JSON/Python 다운로드].' },
];

// 릴리즈 노트 (요약). 상세 변경은 README Changelog 참고.
const RELEASES: { ver: string; title: string; items: string[] }[] = [
  { ver: 'v0.20.0', title: '도움말 패널', items: ['좌측 도움말 — 기본 사용 방법 + 릴리즈 노트'] },
  { ver: 'v0.19.0', title: 'MIDAS Gen NX 내보내기 (단일층)', items: ['구조부재 → 월드(mm) → MIDAS API 요청 생성/전송', '기둥·보=BEAM, 벽=PLATE, CNS560 더미재질', 'API 전송 / JSON·Python 다운로드 패널'] },
  { ver: 'v0.18.0', title: '두께 양자화 프리셋', items: ['대만/한국 표준 두께로 측정값 스냅 (원본 보존)'] },
  { ver: 'v0.17.0', title: '보(Beam) 추출', items: ['이중선=축선+폭, 단일선=중심선'] },
  { ver: 'v0.16.1', title: '리사이즈 정합 버그수정', items: ['창 크기 변경 시 도면-부재 어긋남 해결'] },
  { ver: 'v0.16.0', title: '벽 통심선 라벨링', items: ['벽이 어느 통심선 위인지 태깅'] },
  { ver: 'v0.15.0', title: '기둥 회전/단면 정밀화', items: ['최소면적 직사각형으로 사선 기둥 단면·회전각 산출'] },
  { ver: 'v0.14.0', title: '위상 정리 (절점-부재 그래프)', items: ['벽 축선을 기둥/교차점에 연결, 절점 ID 부여'] },
  { ver: 'v0.13.x', title: '정밀 구조모델 추출 (P1)', items: ['벽 축선+두께, 기둥 단면+그리드, 버블 라벨 정합'] },
];

export const HelpPanel: React.FC = () => {
  const { isHelpOpen, toggleHelp } = useDrawingStore();
  if (!isHelpOpen) return null;

  return (
    <div className="w-80 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full text-zinc-300 select-none z-10 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center space-x-2">
          <BookOpen size={16} className="text-sky-400" />
          <span className="font-bold text-sm">도움말</span>
          <span className="text-[10px] text-zinc-500">v{__APP_VERSION__}</span>
        </div>
        <button onClick={toggleHelp} className="text-zinc-500 hover:text-white transition-colors"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* 사용 방법 */}
        <section>
          <h3 className="flex items-center space-x-1.5 text-xs font-bold text-zinc-200 mb-2">
            <Rocket size={13} className="text-emerald-400" /><span>기본 사용 방법</span>
          </h3>
          <ol className="space-y-2.5">
            {STEPS.map((s) => (
              <li key={s.title} className="bg-zinc-900/60 border border-zinc-800 rounded-md p-2">
                <div className="text-[12px] font-semibold text-zinc-100">{s.title}</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{s.desc}</div>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
            ⚠️ MIDAS 전송은 <b>MIDAS Gen NX 실행 + MAPI-Key</b>가 필요합니다(서버 경유). 브라우저 CORS로 막히면 Python/JSON 다운로드를 사용하세요.
          </p>
        </section>

        {/* 릴리즈 노트 */}
        <section>
          <h3 className="flex items-center space-x-1.5 text-xs font-bold text-zinc-200 mb-2">
            <BookOpen size={13} className="text-sky-400" /><span>릴리즈 노트</span>
          </h3>
          <div className="space-y-2.5">
            {RELEASES.map((r) => (
              <div key={r.ver} className="border-l-2 border-sky-500/40 pl-2.5">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-[11px] font-bold text-sky-300">{r.ver}</span>
                  <span className="text-[11px] text-zinc-300">{r.title}</span>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {r.items.map((it, i) => (
                    <li key={i} className="text-[10.5px] text-zinc-500 leading-relaxed">· {it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">전체 변경 이력은 README의 Changelog를 참고하세요.</p>
        </section>
      </div>
    </div>
  );
};
