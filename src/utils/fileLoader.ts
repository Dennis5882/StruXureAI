// @ts-ignore
import DxfParser from 'dxf-parser';
import { useDrawingStore } from '../store/useDrawingStore';

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

// DXF 텍스트 → 스토어(레이어/엔티티) 적용. DXF·DWG 변환본이 공유.
const parseDxfText = (text: string) => {
  const store = useDrawingStore.getState();
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);
  if (!dxf) throw new Error('빈 DXF');

  const layerTable = dxf.tables?.layer?.layers ?? {};
  const layers = Object.keys(layerTable).map((name) => ({
    name,
    visible: true,
    color: aciToHex[layerTable[name].color] || '#d4d4d8',
  }));

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

  // 새 파일 로드 전, 직전 파일에서 추출된 구조모델/부재/뷰포트를 초기화한다.
  // (이걸 안 하면 이전 도면의 그리드 라벨·기둥이 새 도면 위에 겹쳐 보인다)
  store.setModel(null);
  store.clearLines();
  store.resetViewport();
  store.setCropBBox(null);
  store.setDxfLayers(layers);
  store.setDxfEntities(entities);
  if (!store.isSidebarOpen) store.toggleSidebar();
};

const loadDxf = (file: File) => {
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      parseDxfText(evt.target?.result as string);
    } catch (err) {
      alert('DXF 파일을 읽는 데 실패했습니다.');
    }
  };
  reader.readAsText(file);
};

// 바이너리 DWG → (LibreDWG WASM) DXF 변환 → 파싱.
// WASM(~9MB)은 DWG를 처음 열 때만 동적 로드된다.
const loadDwg = async (file: File) => {
  const store = useDrawingStore.getState();
  store.setLoadingFile(true, 'DWG 도면 변환 중...');
  try {
    const buffer = await file.arrayBuffer();
    const { LibreDwg } = await import('@mlightcad/libredwg-web');
    // Vite가 번들 시 emit한 wasm 자산을 자동 로드 (new URL(..., import.meta.url) 처리)
    const lib = await LibreDwg.create();
    const dxfBytes = lib.dwg_write_dxf(buffer);
    if (!dxfBytes) throw new Error('DWG → DXF 변환 실패');
    const text = new TextDecoder('utf-8').decode(dxfBytes);
    parseDxfText(text);
  } catch (err) {
    console.error('[StruXureAI] DWG 로드 실패', err);
    // 동적 import(청크) 로드 실패 = 새 배포 후 예전 페이지에 남은 경우 → 새로고침 안내
    const msg = String((err as any)?.message || err);
    if (/dynamically imported module|Failed to fetch|importing|chunk|preload/i.test(msg)) {
      alert('새 버전이 배포되어 변환 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    } else {
      alert('DWG 파일을 여는 데 실패했습니다. (지원되지 않는 버전이거나 손상된 파일일 수 있습니다)');
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
