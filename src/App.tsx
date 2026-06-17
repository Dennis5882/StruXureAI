import React from 'react';
import { Toolbar } from './components/Toolbar';
import { Workspace } from './components/Workspace';

function App() {
  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-950 overflow-hidden text-zinc-100">
      {/* 상단 툴바 제어 영역 */}
      <Toolbar />
      
      {/* 메인 캔버스 워크스페이스 영역 */}
      <div className="flex-1 w-full relative">
        <Workspace />
      </div>
    </div>
  );
}

export default App;
