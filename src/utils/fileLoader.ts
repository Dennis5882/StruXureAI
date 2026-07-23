// @ts-ignore
import DxfParser from 'dxf-parser';
import { useDrawingStore } from '../store/useDrawingStore';
import { decodeDxfBytes } from './decodeDxf';

// AutoCAD Color Index → HEX 변환 (자주 쓰이는 색만 매핑, 그 외는 기본 회색)
const aciToHex: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
  5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
};

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

// ── 2D affine 변환 (INSERT 블록 전개용) ────────────────────────────────
// 행렬 [a,b,c,d,e,f]:  x' = a·x + c·y + e ,  y' = b·x + d·y + f
type Mat = [number, number, number, number, number, number];
const deg2rad = (d: number) => (d * Math.PI) / 180;
// m1 ∘ m2 (m2를 먼저 적용한 뒤 m1 적용)
const mul = (m1: Mat, m2: Mat): Mat => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const scaleM = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
const rotateM = (rad: number): Mat => {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
};
const applyPt = (m: Mat, p: any) => ({ ...p, x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
// 평행이동 제외 (벡터 변환: 타원 장축 등)
const applyVec = (m: Mat, p: any) => ({ ...p, x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y });
const matScale = (m: Mat) => Math.hypot(m[0], m[1]);
const matRot = (m: Mat) => Math.atan2(m[1], m[0]);

// 좌표를 가진 엔티티를 행렬로 변환한 복제본 반환
const transformEntity = (e: any, m: Mat): any => {
  const sc = matScale(m);
  const rot = matRot(m);
  const out: any = { ...e };
  if (Array.isArray(e.vertices)) out.vertices = e.vertices.map((v: any) => applyPt(m, v));
  if (e.center) out.center = applyPt(m, e.center);
  if (typeof e.radius === 'number') out.radius = e.radius * sc;
  if (e.startPoint) out.startPoint = applyPt(m, e.startPoint);
  if (e.endPoint) out.endPoint = applyPt(m, e.endPoint);
  if (e.position) out.position = applyPt(m, e.position);
  if (e.controlPoints) out.controlPoints = e.controlPoints.map((p: any) => applyPt(m, p));
  if (e.fitPoints) out.fitPoints = e.fitPoints.map((p: any) => applyPt(m, p));
  if (e.majorAxisEndPoint) out.majorAxisEndPoint = applyVec(m, e.majorAxisEndPoint);
  // 호/타원 각도에 회전량 더함 (라디안 가정; 도 단위면 Workspace의 toRad가 보정)
  if (typeof e.startAngle === 'number') out.startAngle = e.startAngle + rot;
  if (typeof e.endAngle === 'number') out.endAngle = e.endAngle + rot;
  // TEXT/MTEXT/INSERT의 자체 회전각(도 단위, DXF group 50)에도 블록 회전을 더해야
  // 블록 안에 회전되어 삽입된 텍스트(예: 회전된 그리드 버블)가 원래 각도로 그려진다.
  if (typeof e.rotation === 'number') out.rotation = e.rotation + (rot * 180) / Math.PI;
  return out;
};

// INSERT(블록 참조)/DIMENSION을 블록 정의 엔티티로 펼친다 (중첩 블록은 재귀).
// blocks: 이름→{ position(기준점), entities }
const expandEntities = (entities: any[], blocks: Record<string, any>, parent: Mat, inheritLayer: string | undefined, depth: number): any[] => {
  if (depth > 12) return []; // 순환/과도한 중첩 방어
  const out: any[] = [];
  for (const e of entities) {
    const type = (e.type || '').toUpperCase();
    if (type === 'INSERT' && e.name && blocks[e.name]) {
      const blk = blocks[e.name];
      const base = blk.position || { x: 0, y: 0 };
      const pos = e.position || { x: 0, y: 0 };
      const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
      const rot = deg2rad(e.rotation ?? 0);
      const cols = Math.max(1, e.columnCount ?? 1), rows = Math.max(1, e.rowCount ?? 1);
      const cspac = e.columnSpacing ?? 0, rspac = e.rowSpacing ?? 0;
      const childLayer = e.layer && e.layer !== '0' ? e.layer : inheritLayer;
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          // T(insert) · R(rot) · T(셀오프셋) · S(scale) · T(-기준점)
          let m = translate(pos.x, pos.y);
          m = mul(m, rotateM(rot));
          if (cspac || rspac) m = mul(m, translate(ci * cspac, ri * rspac));
          m = mul(m, scaleM(sx, sy));
          m = mul(m, translate(-base.x, -base.y));
          out.push(...expandEntities(blk.entities || [], blocks, mul(parent, m), childLayer, depth + 1));
        }
      }
    } else if (type === 'DIMENSION' && e.block && blocks[e.block]) {
      // 치수는 익명 블록(*D…)에 실제 선/문자가 들어있음 (이미 월드 좌표)
      out.push(...expandEntities(blocks[e.block].entities || [], blocks, parent, e.layer ?? inheritLayer, depth + 1));
    } else {
      const te = depth === 0 ? e : transformEntity(e, parent);
      // 블록 내 '0' 레이어 엔티티는 INSERT의 레이어를 상속 (CAD 관례)
      if (inheritLayer && (!te.layer || te.layer === '0')) te.layer = inheritLayer;
      out.push(te);
    }
  }
  return out;
};

// 무거운 동기 작업 직전에 호출해 오버레이(진행률)가 실제로 리페인트되도록 이벤트루프를 양보.
const paintYield = () => new Promise<void>((res) => setTimeout(res, 24));

// DXF 텍스트 → 스토어(레이어/엔티티) 적용. DXF·DWG 변환본이 공유.
// 각 단계 사이에 진행률을 갱신하고 UI를 양보한다(0.6~1.0 구간을 담당).
const parseDxfText = async (text: string) => {
  const store = useDrawingStore.getState();
  store.setLoadingProgress(0.62, '도면 파싱 중…'); await paintYield();
  const parser = new DxfParser();
  const dxf = parser.parseSync(text); // 동기 파싱(대용량이면 잠깐 블록)
  if (!dxf) throw new Error('빈 DXF');

  const layerTable = dxf.tables?.layer?.layers ?? {};
  const layers = Object.keys(layerTable).map((name) => ({
    name,
    visible: true,
    color: aciToHex[layerTable[name].color] || '#d4d4d8',
  }));

  store.setLoadingProgress(0.82, '블록 전개 중…'); await paintYield();
  const rawEntities = Array.isArray(dxf.entities) ? dxf.entities : [];
  // INSERT(블록)/DIMENSION을 실제 도형으로 전개 → 평면도가 비어 보이던 문제 해결
  const blocks = (dxf.blocks || {}) as Record<string, any>;
  const entities = expandEntities(rawEntities, blocks, [1, 0, 0, 1, 0, 0], undefined, 0);

  const known = new Set(layers.map((l) => l.name));
  entities.forEach((e: any) => {
    if (e.layer && !known.has(e.layer)) {
      known.add(e.layer);
      layers.push({ name: e.layer, visible: true, color: '#d4d4d8' });
    }
  });

  // 엔티티가 하나도 없으면 = 지원 안 되는 오래된 DWG 버전(예: R10 AC1006)이거나 손상.
  // 리셋 '전에' 던져서 직전 도면 상태를 보존한다(빈 도면으로 덮어쓰지 않음).
  if (entities.length === 0) throw new Error('NO_ENTITIES');

  store.setLoadingProgress(0.93, '레이어 정리·렌더 중…'); await paintYield();
  // 새 파일 로드 전, 직전 파일에서 추출된 구조모델/부재/뷰포트를 초기화한다.
  // (이걸 안 하면 이전 도면의 그리드 라벨·기둥이 새 도면 위에 겹쳐 보인다)
  store.setModel(null);
  store.clearLines();
  store.resetViewport();
  store.setCropBBox(null);
  // 축척 판정은 도면마다 다시 한다 — 이전 도면의 사용자 오버라이드가 남으면 조용히 잘못 적용된다.
  store.setScaleInfo(null);
  store.setScaleOverride(null);
  store.setDxfLayers(layers);
  store.setDxfEntities(entities);
  if (!store.isSidebarOpen) store.toggleSidebar();
  store.setLoadingProgress(1, '완료'); await paintYield();
};

const loadDxf = async (file: File) => {
  const store = useDrawingStore.getState();
  store.setLoadingFile(true, 'DXF 읽는 중…');
  try {
    store.setLoadingProgress(0.3, 'DXF 읽는 중…'); await paintYield();
    const text = await file.text();
    await parseDxfText(text);
  } catch (err) {
    const msg = String((err as any)?.message || err);
    alert(/NO_ENTITIES/.test(msg)
      ? '이 DXF에서 도형을 읽지 못했습니다. 빈 도면이거나 지원되지 않는 형식일 수 있습니다.'
      : 'DXF 파일을 읽는 데 실패했습니다.');
  } finally {
    store.setLoadingFile(false);
  }
};

// 바이너리 DWG → (LibreDWG WASM) DXF 변환 → 파싱.
// WASM(~9MB)은 DWG를 처음 열 때만 동적 로드된다.
// DWG(ArrayBuffer) → DXF 텍스트. 워커에서 변환하고, 실패 시 메인 스레드로 폴백.
// 변환 중 메인 스레드가 자유로우므로 바를 부드럽게 크립(creep)시킨다.
const convertDwgToDxf = async (buffer: ArrayBuffer): Promise<string> => {
  const store = useDrawingStore.getState();
  let creep = 0.3;
  const iv = setInterval(() => { creep = Math.min(0.58, creep + 0.015); store.setLoadingProgress(creep, 'DWG→DXF 변환 중…'); }, 150);
  try {
    // 1) 워커 경로 (UI 안 멈춤)
    const worker = new Worker(new URL('../workers/dwgWorker.ts', import.meta.url), { type: 'module' });
    try {
      return await new Promise<string>((resolve, reject) => {
        worker.onmessage = (ev: MessageEvent<{ ok: boolean; text?: string; error?: string }>) =>
          ev.data.ok ? resolve(ev.data.text as string) : reject(new Error(ev.data.error || 'DWG 변환 실패'));
        worker.onerror = (ev) => reject(new Error(ev.message || 'DWG 워커 오류'));
        worker.postMessage(buffer); // 복제 전송(원본 유지 → 폴백 가능)
      });
    } finally {
      worker.terminate();
    }
  } catch (werr) {
    // 2) 폴백: 메인 스레드 변환 (워커 미지원/로드 실패 시)
    console.warn('[StruXureAI] DWG 워커 실패 → 메인 스레드 폴백', werr);
    const { LibreDwg } = await import('@mlightcad/libredwg-web');
    const lib = await LibreDwg.create();
    const dxfBytes = lib.dwg_write_dxf(buffer);
    if (!dxfBytes) throw new Error('DWG → DXF 변환 실패');
    return decodeDxfBytes(dxfBytes as Uint8Array); // 코드페이지 자동 판별(GBK/Big5 등)
  } finally {
    clearInterval(iv);
  }
};

// DWG 헤더(첫 6바이트, 예: "AC1024")를 사람이 읽는 버전으로 매핑. libredwg는 AC1015(2000) 미만은 불안정.
const DWG_VER: Record<string, string> = {
  AC1006: 'R10 (1988)', AC1009: 'R11/12', AC1012: 'R13', AC1014: 'R14',
  AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018',
};
const dwgVersion = (buffer: ArrayBuffer): { code: string; label?: string; old: boolean } => {
  const code = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, 6));
  return { code, label: DWG_VER[code], old: code < 'AC1015' };
};

const loadDwg = async (file: File) => {
  const store = useDrawingStore.getState();
  store.setLoadingFile(true, '파일 읽는 중…');
  let ver: ReturnType<typeof dwgVersion> | null = null;
  try {
    store.setLoadingProgress(0.05, '파일 읽는 중…'); await paintYield();
    const buffer = await file.arrayBuffer();
    ver = dwgVersion(buffer);
    // DWG→DXF 변환(수 초, 동기 블록)은 워커로 격리 → 변환 중에도 UI 반응.
    store.setLoadingProgress(0.3, 'DWG→DXF 변환 중…'); await paintYield();
    const text = await convertDwgToDxf(buffer);
    await parseDxfText(text);
  } catch (err) {
    console.error('[StruXureAI] DWG 로드 실패', err);
    // 동적 import(청크) 로드 실패 = 새 배포 후 예전 페이지에 남은 경우 → 새로고침 안내
    const msg = String((err as any)?.message || err);
    const verTxt = ver?.label ? `AutoCAD ${ver.label}` : (ver?.code || '알 수 없는 버전');
    if (/dynamically imported module|Failed to fetch|importing|chunk|preload/i.test(msg)) {
      alert('새 버전이 배포되어 변환 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    } else if (ver?.old || /NO_ENTITIES/.test(msg)) {
      alert(`이 DWG에서 도형을 읽지 못했습니다. 버전: ${verTxt}. 너무 오래된 형식은 지원되지 않습니다 — AutoCAD 2000 이상 형식(또는 DXF)으로 저장해 다시 시도해주세요.`);
    } else {
      alert(`DWG 파일을 여는 데 실패했습니다. (버전: ${verTxt} — 지원되지 않는 버전이거나 손상된 파일일 수 있습니다)`);
    }
  } finally {
    store.setLoadingFile(false);
  }
};

/**
 * 파일 1개를 종류에 따라 스토어에 로드한다.
 * - 이미지: 배경 이미지로 설정
 * - DXF/DWG: 파싱하여 레이어/엔티티 설정 + 사이드바 열기
 * 첨부 버튼과 드래그앤드롭이 공유하는 단일 진입점.
 */
export const loadFile = (file: File) => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  // ⚠️ 확장자(CAD)를 MIME보다 우선 판정한다.
  //    DXF의 표준 MIME이 'image/vnd.dxf'라서 MIME만 보면 이미지로 오인됨.
  const isImage = ext !== 'dxf' && ext !== 'dwg' && (file.type.startsWith('image/') || IMAGE_EXTS.includes(ext));

  if (ext === 'dwg') {
    loadDwg(file);
  } else if (ext === 'dxf') {
    loadDxf(file);
  } else if (isImage) {
    useDrawingStore.getState().setBackgroundImage(URL.createObjectURL(file));
  } else {
    alert('지원하지 않는 파일 형식입니다. 이미지 또는 DXF/DWG 파일을 넣어주세요.');
  }
};

/** 여러 파일을 한 번에 처리 (드롭 시 다중 파일 대응) */
export const loadFiles = (files: FileList | File[]) => {
  Array.from(files).forEach((f) => loadFile(f));
};
