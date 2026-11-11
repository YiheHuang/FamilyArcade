import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { desktopLog } from './desktop-update';
import { maybeRunDevAuto } from './devAuto';
import { attachLanHost } from './lanHost';
import './styles.css';

// 渲染端异常上报：桌面端会落进 %APPDATA%/Splendor/logs（浏览器端静默丢弃）
window.addEventListener('error', (e) => {
  desktopLog(`window.error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  desktopLog(`unhandledrejection: ${String(e.reason)}`, 'error');
});

// 桌面壳（Tauri）：先挂上主机权威端，再渲染界面
attachLanHost();

maybeRunDevAuto();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
