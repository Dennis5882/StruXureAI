import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Workspace } from '../components/Workspace';
import { useDrawingStore } from '../store/useDrawingStore';
import { extractStructuralModel, ThicknessProfile } from '../utils/geometry';
import { buildStructuralModel } from '../utils/structuralModel';
import { StepperBar } from './StepperBar';
import { RightDock, TabKey } from './RightDock';
import { BottomBar } from './BottomBar';
import { ManualPanel } from './ManualPanel';
import { useNext } from './strings';
import type { StructureType } from '../types/drawing';
import { filterEntitiesByCrop } from './CropPanel';

export type LayerTypeOverrides = Record<string, StructureType | 'EXCLUDE'>;
export type LineLayerIncludes = Record<string, boolean>; // 사용자가 "LINE도 기둥/벽/보로 처리" 승인한 레이어

export const AppNext: React.FC = () => {
  const { n } = useNext();
  const [tab, setTab] = useState<TabKey>('layers');
  const [profile, setProfile] = useState<ThicknessProfile>('raw');
  const [layerTypeOverrides, setLayerTypeOverrides] = useState<LayerTypeOverrides>({});
  const [lineLayerIncludes, setLineLayerIncludes] = useState<LineLayerIncludes>({});
  // crop 범위는 store가 단일 출처 — 캔버스 CROP 모드와 미니맵이 공유, 파일 로드 시 자동 초기화.
  const cropBBox = useDrawingStore((s) => s.cropBBox);
  const setCropBBox = useDrawingStore((s) => s.setCropBBox);
  const cropHintedRef = useRef(false); // 크롭 권유 힌트는 세션당 1회만
  // 사용 설명서: 처음 방문 시 자동으로 펼쳐 발견성↑, 한 번 닫으면 기억해 다시 강제로 열지 않음.
  const [manualOpen, setManualOpen] = useState(() => {
    try { return !localStorage.getItem('sx_manual_seen'); } catch { return true; }
  });
  const closeManual = useCallback(() => {
    setManualOpen(false);
    try { localStorage.setItem('sx_manual_seen', '1'); } catch { /* ignore */ }
  }, []);

  // 캔버스에서 부재를 클릭해 선택하면(selectedMemberId 설정) 검토 탭을 자동으로 연다.
  const selectedMemberId = useDrawingStore((s) => s.selectedMemberId);
  useEffect(() => {
    if (selectedMemberId) setTab('review');
  }, [selectedMemberId]);

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
    const entitiesToExtract = filterEntitiesByCrop(st.dxfEntities, st.cropBBox);
    const { members, grid } = extractStructuralModel(entitiesToExtract, st.dxfLayers, st.dxfTransform, { thicknessProfile: profile, layerTypeOverrides, lineLayerIncludes });
    if (members.length === 0) { alert(n('noStruct')); return; }
    st.clearCadLines(); // 이전 추출 부재 제거 → 재추출 시 겹침 방지 (수동 편집은 유지)
    st.addLines(members);
    const model = buildStructuralModel(members, grid, st.dxfTransform, { name: 'B1F' });
    st.setModel(model);
    st.setMode('SELECT');
    setTab('review'); // 추출 직후 자동으로 검토 패널 표시
    // 스케일 과소(거대 미크롭 도면) 감지: 벽 대부분이 단일선 = 이중선 면쌍이 sub-pixel로 실패한 상태.
    // → 한 층만 CROP하면 스케일이 살아나 두께/폭까지 정밀 추출됨을 안내(세션당 1회, 비차단).
    const singleWalls = model.walls.filter((w) => w.singleLine).length;
    if (!st.cropBBox && !cropHintedRef.current && model.walls.length >= 15 && singleWalls / model.walls.length > 0.85) {
      cropHintedRef.current = true;
      setTimeout(() => alert(n('cropHint')), 150);
    }
  }, [profile, n, layerTypeOverrides, lineLayerIncludes]);

  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-950 overflow-hidden text-zinc-100">
      <StepperBar onExtract={extract} setTab={setTab} onToggleManual={() => setManualOpen((v) => !v)} />
      <div className="flex-1 w-full relative flex overflow-hidden">
        <div className="flex-1 relative min-w-0">
          <Workspace />
        </div>
        <RightDock tab={tab} setTab={setTab} onExtract={extract} profile={profile} setProfile={setProfile} layerTypeOverrides={layerTypeOverrides} setLayerOverride={setLayerOverride} lineLayerIncludes={lineLayerIncludes} setLineInclude={setLineInclude} cropBBox={cropBBox} setCropBBox={setCropBBox} />
        <ManualPanel open={manualOpen} onClose={closeManual} />
      </div>
      <BottomBar />
      <Analytics />
    </div>
  );
};
