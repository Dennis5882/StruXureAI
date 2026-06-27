import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppNext } from './next/AppNext';
import './index.css';
import { useDrawingStore } from './store/useDrawingStore';

// 품질 점검용: ?debug=1 일 때만 스토어 노출 (기존 main.tsx와 동일 정책)
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as any).__store = useDrawingStore;
}

// 새 청크 해시 변경 시 세션당 1회 자동 새로고침 (기존 정책 유지)
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('sx_chunk_reloaded')) {
    sessionStorage.setItem('sx_chunk_reloaded', '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppNext />
  </React.StrictMode>,
);
