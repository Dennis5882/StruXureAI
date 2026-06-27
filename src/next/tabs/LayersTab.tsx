import React from 'react';
import { Eye, EyeOff, Filter, Shapes } from 'lucide-react';
import { useDrawingStore } from '../../store/useDrawingStore';
import { ThicknessProfile } from '../../utils/geometry';
import { useNext } from '../strings';

interface Props {
  onExtract: () => void;
  profile: ThicknessProfile;
  setProfile: (p: ThicknessProfile) => void;
}

export const LayersTab: React.FC<Props> = ({ onExtract, profile, setProfile }) => {
  const { n } = useNext();
  const dxfLayers = useDrawingStore((s) => s.dxfLayers);
  const dxfEntities = useDrawingStore((s) => s.dxfEntities);
  const toggleDxfLayer = useDrawingStore((s) => s.toggleDxfLayer);
  const setDxfLayers = useDrawingStore((s) => s.setDxfLayers);

  const autoFilter = () => {
    const kw = ['S-', 'COL', 'WALL', 'CONC', '기둥', '옹벽'];
    setDxfLayers(dxfLayers.map((l) => ({ ...l, visible: kw.some((k) => l.name.toUpperCase().includes(k)) })));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-zinc-800 bg-zinc-900/50 space-y-1.5">
        <button onClick={autoFilter} className="w-full flex items-center justify-center space-x-1.5 text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-2 rounded hover:bg-indigo-600/40">
          <Filter size={14} /><span>{n('autofilter')}</span>
        </button>
        <button
          onClick={onExtract}
          disabled={dxfEntities.length === 0}
          className={`w-full flex items-center justify-center space-x-1.5 text-xs px-2 py-2 rounded border ${
            dxfEntities.length === 0 ? 'bg-zinc-800/40 text-zinc-600 border-zinc-800' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/40'
          }`}
        >
          <Shapes size={14} /><span>{n('extract')}</span>
        </button>
        <label className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
          <span>{n('thickness')}</span>
          <select value={profile} onChange={(e) => setProfile(e.target.value as ThicknessProfile)} className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-emerald-500/50">
            <option value="raw">{n('profRaw')}</option>
            <option value="TW-Standard">TW-Standard</option>
            <option value="KR-Standard">KR-Standard</option>
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {dxfLayers.length === 0 ? (
          <div className="text-xs text-zinc-600 text-center mt-10 leading-relaxed whitespace-pre-line">{n('noLayers')}</div>
        ) : (
          dxfLayers.map((layer) => (
            <div key={layer.name} className="flex items-center justify-between p-1.5 hover:bg-zinc-800 rounded group">
              <span className={`text-xs truncate w-44 ${layer.visible ? 'text-zinc-200' : 'text-zinc-600'}`} title={layer.name}>{layer.name}</span>
              <button onClick={() => toggleDxfLayer(layer.name)} className="text-zinc-500 group-hover:text-zinc-300">
                {layer.visible ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
