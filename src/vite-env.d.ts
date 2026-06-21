/// <reference types="vite/client" />

// vite.config.ts의 define으로 빌드 시 주입되는 전역 상수
declare const __APP_VERSION__: string;
declare const __APP_DEVELOPER__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_DATE__: string;
