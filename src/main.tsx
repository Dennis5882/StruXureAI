import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 🔄 새 배포로 청크 해시가 바뀌면, 예전 페이지가 더 이상 없는 청크(예: DWG 변환용 LibreDWG)를
//    동적 import할 때 실패한다. 이때 세션당 1회 자동 새로고침해 최신 자산을 받게 한다(무한루프 방지).
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('sx_chunk_reloaded')) {
    sessionStorage.setItem('sx_chunk_reloaded', '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
