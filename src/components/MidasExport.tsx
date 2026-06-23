import React, { useState } from 'react';
import { useDrawingStore } from '../store/useDrawingStore';
import { buildMidasRequests, toPythonScript, sendMidas, MIDAS_BASE_DEFAULT, MidasBuild, SendLog } from '../utils/midasExport';
import { useT } from '../i18n';
import { Send, Download, FileCode, Server, ChevronDown, ChevronRight } from 'lucide-react';

const download = (name: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const MidasExport: React.FC = () => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [stories, setStories] = useState(1);
  const [storyH, setStoryH] = useState(3200);
  const [grade, setGrade] = useState('C280');
  const [baseUrl, setBaseUrl] = useState(MIDAS_BASE_DEFAULT);
  const [mapiKey, setMapiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const build = (): MidasBuild | null => {
    const st = useDrawingStore.getState();
    if (!st.dxfTransform) { alert(t('mx.alExtract')); return null; }
    const cad = st.lines.filter((l) => l.source === 'CAD');
    if (!cad.length) { alert(t('mx.alNoMembers')); return null; }
    return buildMidasRequests(cad, st.dxfTransform, { stories, storyHeightMm: storyH, concGrade: grade });
  };

  const summarize = (b: MidasBuild) =>
    t('mx.sum', b.summary.nodes, b.summary.columns, b.summary.walls, b.summary.beams, b.summary.sections, b.summary.thiks);

  const onJson = () => { const b = build(); if (b) download('struxure_midas.json', JSON.stringify(b.requests, null, 2), 'application/json'); };
  const onPy = () => { const b = build(); if (b) download('struxure_midas.py', toPythonScript(b.requests, baseUrl), 'text/x-python'); };

  const onSend = async () => {
    const b = build(); if (!b) return;
    if (!mapiKey.trim()) { alert(t('mx.alKey')); return; }
    setBusy(true); setLog([t('mx.logStart', summarize(b)), t('mx.logReq', b.requests.length, baseUrl)]);
    const logs: SendLog[] = await sendMidas(b.requests, baseUrl, mapiKey, (lg, i, total) => {
      setLog((prev) => [...prev, `[${i + 1}/${total}] ${lg.command} → ${lg.status}${lg.ok ? ' ✓' : ' ✗ ' + (lg.detail || '')}`]);
    });
    const ok = logs.every((l) => l.ok);
    setLog((prev) => [...prev, ok ? t('mx.logDone') : t('mx.logFail')]);
    setBusy(false);
  };

  return (
    <div className="border-t border-zinc-800">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-sky-300 hover:bg-zinc-800/50">
        <span className="flex items-center space-x-1.5"><Server size={14} /><span>{t('mx.title')}</span></span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="p-2.5 space-y-2 bg-zinc-900/40">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-zinc-400">{t('mx.stories')}
              <input type="number" min={1} value={stories} onChange={(e) => setStories(Math.max(1, Math.floor(+e.target.value || 1)))}
                className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
            </label>
            <label className="text-[11px] text-zinc-400">{t('mx.storyH')}
              <input type="number" value={storyH} onChange={(e) => setStoryH(+e.target.value || 0)}
                className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
            </label>
            <label className="text-[11px] text-zinc-400">{t('mx.grade')}
              <input value={grade} onChange={(e) => setGrade(e.target.value)}
                className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
            </label>
          </div>
          <label className="block text-[11px] text-zinc-400">{t('mx.baseUrl')}
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
          </label>
          <label className="block text-[11px] text-zinc-400">{t('mx.keyLabel')} <span className="text-zinc-600">{t('mx.keyHint')}</span>
            <input type="password" value={mapiKey} onChange={(e) => setMapiKey(e.target.value)} placeholder="eyJhbGciOi..."
              className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px]" />
          </label>
          <div className="flex space-x-1.5">
            <button onClick={onSend} disabled={busy}
              className={`flex-1 flex items-center justify-center space-x-1 text-[11px] px-2 py-1.5 rounded border ${busy ? 'bg-zinc-800 text-zinc-600 border-zinc-800' : 'bg-sky-600/20 text-sky-300 border-sky-500/30 hover:bg-sky-600/40'}`}>
              <Send size={12} /><span>{busy ? t('mx.sending') : t('mx.send')}</span>
            </button>
            <button onClick={onJson} title={t('mx.jsonTip')} className="flex items-center justify-center text-[11px] px-2 py-1.5 rounded border bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
              <Download size={12} />
            </button>
            <button onClick={onPy} title={t('mx.pyTip')} className="flex items-center justify-center text-[11px] px-2 py-1.5 rounded border bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
              <FileCode size={12} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 leading-snug">{t('mx.note')}</p>
          {log.length > 0 && (
            <pre className="text-[10px] text-zinc-400 bg-black/40 rounded p-1.5 max-h-40 overflow-auto whitespace-pre-wrap">{log.join('\n')}</pre>
          )}
        </div>
      )}
    </div>
  );
};
