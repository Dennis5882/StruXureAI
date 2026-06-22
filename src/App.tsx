import React from 'react';
import { Toolbar } from './components/Toolbar';
import { Workspace } from './components/Workspace';
import { LayerSidebar } from './components/LayerSidebar';

function App() {
  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-950 overflow-hidden text-zinc-100">
      <Toolbar />
      <div className="flex-1 w-full relative flex overflow-hidden">
        {/* 메인 캔버스 영역 (min-w-0: 사이드바가 열려도 캔버스 영역이 줄어들 수 있게 함) */}
        <div className="flex-1 relative min-w-0">
          <Workspace />
        </div>
        
        {/* 우측 레이어 패널 (Phase 3) */}
        <LayerSidebar />
      </div>
    </div>
  );
}

export default App;
