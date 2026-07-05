// DWG → DXF 변환을 메인 스레드 밖(Web Worker)에서 수행한다.
// 변환(dwg_write_dxf)은 동기 블록이라 메인에서 돌리면 UI가 수 초 얼어붙음 → 워커로 격리.
// @ts-ignore — 라이브러리 타입 없음
import { LibreDwg } from '@mlightcad/libredwg-web';
import { decodeDxfBytes } from '../utils/decodeDxf';

self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const lib = await LibreDwg.create();
    const dxfBytes = lib.dwg_write_dxf(e.data);
    if (!dxfBytes) throw new Error('DWG → DXF 변환 실패');
    const text = decodeDxfBytes(dxfBytes as Uint8Array); // 코드페이지 자동 판별(GBK/Big5 등)
    (self as any).postMessage({ ok: true, text });
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: String(err?.message || err) });
  }
};
