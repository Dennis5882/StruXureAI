// @ts-ignore
import DxfParser from 'dxf-parser';
import { useDrawingStore } from '../store/useDrawingStore';

// AutoCAD Color Index → HEX 변환 (자주 쓰이는 색만 매핑, 그 외는 기본 회색)
const aciToHex: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
  5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
};

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

const loadDxf = (file: File) => {
  const store = useDrawingStore.getState();
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(evt.target?.result as string);
      if (!dxf) throw new Error('빈 DXF');

      const layerTable = dxf.tables?.layer?.layers ?? {};
      const layers = Object.keys(layerTable).map((name) => ({
        name,
        visible: true,
        color: aciToHex[layerTable[name].color] || '#d4d4d8',
      }));

      const entities = Array.isArray(dxf.entities) ? dxf.entities : [];
      const known = new Set(layers.map((l) => l.name));
      entities.forEach((e: any) => {
        if (e.layer && !known.has(e.layer)) {
          known.add(e.layer);
          layers.push({ name: e.layer, visible: true, color: '#d4d4d8' });
        }
      });

      store.setDxfLayers(layers);
      store.setDxfEntities(entities);
      if (!store.isSidebarOpen) store.toggleSidebar();
    } catch (err) {
      alert('DXF 파일을 읽는 데 실패했습니다.');
    }
  };
  reader.readAsText(file);
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
  const isCad = ext === 'dxf' || ext === 'dwg';
  const isImage = !isCad && (file.type.startsWith('image/') || IMAGE_EXTS.includes(ext));

  if (isCad) {
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
