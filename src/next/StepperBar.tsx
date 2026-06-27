import React, { useRef } from 'react';
import { Layers, ImagePlus, FileUp, ArrowRight, Check } from 'lucide-react';
import { useDrawingStore } from '../store/useDrawingStore';
import { loadFile } from '../utils/fileLoader';
import { LANGS } from '../i18n';
import { useNext } from './strings';
import { deriveWorkflow, NextKey } from './workflow';
import type { TabKey } from './RightDock';

interface Props {
  onExtract: () => void;
  setTab: (t: TabKey) => void;
}

export const StepperBar: React.FC<Props> = ({ onExtract, setTab }) => {
  const { n } = useNext();
  const lang = useDrawingStore((s) => s.lang);
  const setLang = useDrawingStore((s) => s.setLang);
  const backgroundImage = useDrawingStore((s) => s.backgroundImage);
  const dxfEntities = useDrawingStore((s) => s.dxfEntities);
  const model = useDrawingStore((s) => s.model);

  const cadRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const wf = deriveWorkflow({
    hasFile: !!backgroundImage || dxfEntities.length > 0,
    hasEntities: dxfEntities.length > 0,
    hasModel: !!model && model.nodes.length > 0,
  });

  const steps = [n('s1'), n('s2'), n('s3'), n('s4'), n('s5')];

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = '';
  };

  const ctaLabel: Record<NextKey, string> = {
    open: n('ctaOpen'), extract: n('ctaExtract'), review: n('ctaReview'), send: n('ctaSend'),
  };
  const runCta = () => {
    if (wf.next === 'open') cadRef.current?.click();
    else if (wf.next === 'extract') onExtract();
    else if (wf.next === 'review') setTab('review');
    else setTab('export');
  };

  return (
    <div className="w-full bg-zinc-900 border-b border-zinc-800 select-none z-20">
      {/* 상단 줄: 브랜드 · 파일 · 언어 · CTA */}
      <div className="h-12 flex items-center justify-between px-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Layers className="text-indigo-500 w-5 h-5" />
            <span className="font-bold text-sm tracking-wider text-zinc-100">StruXureAI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">{n('badge')}</span>
          </div>

          <input type="file" ref={imgRef} accept="image/*" hidden onChange={onFile} />
          <input type="file" ref={cadRef} accept=".dxf,.dwg" hidden onChange={onFile} />
          <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-md border border-zinc-800">
            <button onClick={() => imgRef.current?.click()} className="flex items-center space-x-1.5 text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded hover:bg-zinc-700 hover:text-white"><ImagePlus size={14} /><span>{n('openImage')}</span></button>
            <button onClick={() => cadRef.current?.click()} className="flex items-center space-x-1.5 text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded hover:bg-zinc-700 hover:text-white"><FileUp size={14} /><span>{n('openCad')}</span></button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* 다음 한 수 CTA */}
          <button onClick={runCta} className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 shadow-md">
            <span>{ctaLabel[wf.next]}</span>
            <ArrowRight size={14} />
          </button>
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-md border border-zinc-800">
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => setLang(l.id)} className={`text-[11px] px-1.5 py-1 rounded ${lang === l.id ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>{l.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 줄: 5단계 스테퍼 (클릭 시 해당 단계로 이동) */}
      <div className="h-10 flex items-center px-4 space-x-1 border-t border-zinc-800/60 bg-zinc-900/60">
        {steps.map((label, i) => {
          const state = wf.states[i];
          const cls = state === 'done'
            ? 'bg-emerald-600/15 text-emerald-300 border-emerald-500/30'
            : state === 'current'
            ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40'
            : 'bg-zinc-900 text-zinc-500 border-zinc-800';
          const goStep = () => {
            if (i === 0) cadRef.current?.click();
            else if (i === 1 || i === 2) setTab('layers');
            else if (i === 3) setTab('review');
            else setTab('export');
          };
          return (
            <React.Fragment key={i}>
              <button onClick={goStep} className={`flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors hover:brightness-125 ${cls}`}>
                {state === 'done' && <Check size={12} />}
                <span>{label}</span>
              </button>
              {i < steps.length - 1 && <div className={`h-px w-4 ${wf.states[i] === 'done' ? 'bg-emerald-500/40' : 'bg-zinc-700'}`} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
