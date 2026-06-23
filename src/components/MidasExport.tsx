import React, { useState } from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { buildMidasRequests, toPythonScript, sendMidas, MIDAS_BASE_DEFAULT, MidasBuild, SendLog } from '../utils/midasExport';
import { Send, Download, FileCode, Server, ChevronDown, ChevronRight } from 'lucide-react';

const download = (name: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const MidasExport: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [storyH, setStoryH] = useState(3200);
  const [grade, setGrade] = useState('C280');
  const [baseUrl, setBaseUrl] = useState(MIDAS_BASE_DEFAULT);
  const [mapiKey, setMapiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const build = (): MidasBuild | null => {
    const st = useDrawingStore.getState();
    if (!st.dxfTransform) { alert('먼저 CAD를 불러오고 "정밀 구조모델 추출"을 실행하세요.'); return null; }
    const cad = st.lines.filter((l) => l.source === 'CAD');
    if (!cad.length) { alert('추출된 구조부재가 없습니다. "정밀 구조모델 추출" 먼저 실행하세요.'); return null; }
    return buildMidasRequests(cad, st.dxfTransform, { storyHeightMm: storyH, concGrade: grade });
  };

  const summarize = (b: MidasBuild) =>
    `절점 ${b.summary.nodes} · 기둥 ${b.summary.columns} · 벽 ${b.summary.walls} · 보 ${b.summary.beams} · 단면 ${b.summary.sections} · 두께 ${b.summary.thiks}`;

  const onJson = () => { const b = build(); if (b) download('struxure_midas.json', JSON.stringify(b.requests, null, 2), 'application/json'); };
  const onPy = () => { const b = build(); if (b) download('struxure_midas.py', toPythonScript(b.requests, baseUrl), 'text/x-python'); };

  const onSend = async () => {
    const b = build(); if (!b) return;
    if (!mapiKey.trim()) { alert('MAPI-Key를 입력하세요. (MIDAS Gen NX 앱에서 발급)'); return; }
    setBusy(true); setLog([`전송 시작 · ${summarize(b)}`, `요청 ${b.requests.length}건 → ${baseUrl}`]);
    const logs: SendLog[] = await sendMidas(b.requests, baseUrl, mapiKey, (lg, i, total) => {
      setLog((prev) => [...prev, `[${i + 1}/${total}] ${lg.command} → ${lg.status}${lg.ok ? ' ✓' : ' ✗ ' + (lg.detail || '')}`]);
    });
    const ok = logs.every((l) => l.ok);
    setLog((prev) => [...prev, ok ? '✅ 완료! Gen NX 화면(Fit View)을 확인하세요.' : '❌ 실패 — Gen NX 실행 여부/MAPI-Key/CORS를 확인하세요.']);
    setBusy(false);
  };

  return (
    <div className="border-t border-zinc-800">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-sky-300 hover:bg-zinc-800/50">
        <span className="flex items-center space-x-1.5"><Server size={14} /><span>MIDAS Gen NX 내보내기</span></span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="p-2.5 space-y-2 bg-zinc-900/40">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">층고(mm)
              <input type="number" value={storyH} onChange={(e) => setStoryH(+e.target.value || 0)}
                className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
            </label>
            <label className="text-[11px] text-zinc-400">콘크리트 등급
              <input value={grade} onChange={(e) => setGrade(e.target.value)}
                className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
            </label>
          </div>
          <label className="block text-[11px] text-zinc-400">Base URL
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
          </label>
          <label className="block text-[11px] text-zinc-400">MAPI-Key <span className="text-zinc-600">(Gen NX 발급, 저장 안 함)</span>
            <input type="password" value={mapiKey} onChange={(e) => setMapiKey(e.target.value)} placeholder="eyJhbGciOi..."
              className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
          </label>
          <div className="flex space-x-1.5">
            <button onClick={onSend} disabled={busy}
              className={`flex-1 flex items-center justify-center space-x-1 text-[11px] px-2 py-1.5 rounded border ${busy ? 'bg-zinc-800 text-zinc-600 border-zinc-800' : 'bg-sky-600/20 text-sky-300 border-sky-500/30 hover:bg-sky-600/40'}`}>
              <Send size={12} /><span>{busy ? '전송 중…' : 'API 전송'}</span>
            </button>
            <button onClick={onJson} title="API 요청 JSON 다운로드" className="flex items-center justify-center text-[11px] px-2 py-1.5 rounded border bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
              <Download size={12} />
            </button>
            <button onClick={onPy} title="Python 스크립트 다운로드" className="flex items-center justify-center text-[11px] px-2 py-1.5 rounded border bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
              <FileCode size={12} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 leading-snug">단일층 PoC: 절점+요소 기하 정합. 재질=더미(CNS560), 단면=측정 기하. ⚠️ Gen NX 실행 중이어야 전송 동작. 브라우저 CORS 차단 시 Python/JSON 사용.</p>
          {log.length > 0 && (
            <pre className="text-[10px] text-zinc-400 bg-black/40 rounded p-1.5 max-h-40 overflow-auto whitespace-pre-wrap">{log.join('\n')}</pre>
          )}
        </div>
      )}
    </div>
  );
};
