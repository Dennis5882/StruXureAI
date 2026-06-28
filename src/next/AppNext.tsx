import React, { useState, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Workspace } from '../components/Workspace';
import { useDrawingStore } from '../store/useDrawingStore';
import { extractStructuralModel, ThicknessProfile } from '../utils/geometry';
import { buildStructuralModel } from '../utils/structuralModel';
import { StepperBar } from './StepperBar';
import { RightDock, TabKey } from './RightDock';
import { BottomBar } from './BottomBar';
import { useNext } from './strings';
import type { StructureType } from '../types/drawing';
import { type CropBBox, filterEntitiesByCrop } from './CropPanel';

export type LayerTypeOverrides = Record<string, StructureType | 'EXCLUDE'>;
export type LineLayerIncludes = Record<string, boolean>; // 사용자가 "LINE도 기둥/벽/보로 처리" 승인한 레이어

export const AppNext: React.FC = () => {
  const { n } = useNext();
  const [tab, setTab] = useState<TabKey>('layers');
  const [profile, setProfile] = useState<ThicknessProfile>('raw');
  const [layerTypeOverrides, setLayerTypeOverrides] = useState<LayerTypeOverrides>({});
  const [lineLayerIncludes, setLineLayerIncludes] = useState<LineLayerIncludes>({});
  const [cropBBox, setCropBBox] = useState<CropBBox | null>(null);

  const setLayerOverride = useCallback((layerName: string, type: StructureType | 'EXCLUDE' | 'AUTO') => {
    setLayerTypeOverrides((prev) => {
      const next = { ...prev };
      if (type === 'AUTO') delete next[layerName];
      else next[layerName] = type;
      return next;
    });
  }, []);

  const setLineInclude = useCallback((layerName: string, include: boolean) => {
    setLineLayerIncludes((prev) => ({ ...prev, [layerName]: include }));
  }, []);

  // ③ 추출: 부재 추출 → FloorModel 승격 → setModel. 결과는 alert 대신 검토 탭으로.
  const extract = useCallback(() => {
    const st = useDrawingStore.getState();
    if (!st.dxfEntities.length || !st.dxfTransform) { alert(n('loadFirst')); return; }
    const entitiesToExtract = filterEntitiesByCrop(st.dxfEntities, cropBBox);
    const { members, grid } = extractStructuralModel(entitiesToExtract, st.dxfLayers, st.dxfTransform, { thicknessProfile: profile, layerTypeOverrides, lineLayerIncludes });
    if (members.length === 0) { alert(n('noStruct')); return; }
    st.addLines(members);
    const model = buildStructuralModel(members, grid, st.dxfTransform, { name: 'B1F' });
    st.setModel(model);
    st.setMode('SELECT');
    setTab('review'); // 추출 직후 자동으로 검토 패널 표시
  }, [profile, n, layerTypeOverrides, lineLayerIncludes, cropBBox]);

  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-950 overflow-hidden text-zinc-100">
      <StepperBar onExtract={extract} setTab={setTab} />
      <div className="flex-1 w-full relative flex overflow-hidden">
        <div className="flex-1 relative min-w-0">
          <Workspace />
        </div>
        <RightDock tab={tab} setTab={setTab} onExtract={extract} profile={profile} setProfile={setProfile} layerTypeOverrides={layerTypeOverrides} setLayerOverride={setLayerOverride} lineLayerIncludes={lineLayerIncludes} setLineInclude={setLineInclude} cropBBox={cropBBox} setCropBBox={setCropBBox} />
      </div>
      <BottomBar />
      <Analytics />
    </div>
  );
};
