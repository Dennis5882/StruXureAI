import { FloorModel } from '../types/structural';

// ── MIDAS Gen NX Open API 내보내기 ──────────────────────────
// 정식 구조모델(FloorModel, 월드 mm 절점-부재 그래프) → MIDAS API 요청 시퀀스.
// 스키마 근거: Dennis5882/MIDAS-API + e:/AI Study/Story 대만 RC 에이전트(v2.3.0, live-verified).
//  · 모든 /db/* 는 PUT, /doc/* 는 POST · 바디 {Assign:{id:{}}}
//  · 재료=CNS560(RC) 대만표준 · 단면 vSIZE[H,B,0,0,0,0,0] · 보/기둥 STYPE0 · 벽=PLATE(두께는 thik→SECT참조) STYPE1
// PoC 범위(Gemini): 절점+선/판 요소 기하 정합. 재질·등급은 더미(MIDAS에서 일괄 대입).

export interface MidasRequest { method: 'POST' | 'PUT' | 'GET' | 'DELETE'; command: string; body?: any; }
export interface MidasBuild {
  requests: MidasRequest[];
  summary: { nodes: number; columns: number; walls: number; beams: number; sections: number; thiks: number };
}

export const MIDAS_BASE_DEFAULT = 'https://moa-engineers.midasit.com:443/gen';

type MNode = { id: number; x: number; y: number; z: number };
type MElem = { id: number; TYPE: string; MATL: number; SECT: number; NODE: number[]; ANGLE: number; STYPE: number };
type MSect = { id: number; name: string; h: number; w: number };
type MThik = { id: number; name: string; t: number };
interface MidasOpts { storyHeightMm?: number; stories?: number; unitDist?: string; unitForce?: string; concGrade?: string }

// nodes/elems/sects/thiks → MIDAS API 요청 시퀀스 (단일층·다층 공용 조립부).
const assembleRequests = (nodes: MNode[], elems: MElem[], sects: MSect[], thiks: MThik[], opts?: MidasOpts): MidasRequest[] => {
  const grade = opts?.concGrade ?? 'C280'; // 대만 RC 기본
  const requests: MidasRequest[] = [];
  requests.push({ method: 'POST', command: '/doc/new', body: {} });
  requests.push({ method: 'PUT', command: '/db/unit', body: { Assign: { '1': { FORCE: opts?.unitForce ?? 'N', DIST: opts?.unitDist ?? 'MM', HEAT: 'KJ', TEMPER: 'C' } } } });
  requests.push({ method: 'PUT', command: '/db/matl', body: { Assign: { '1': { TYPE: 'CONC', NAME: grade, DAMP_RAT: 0.05, PARAM: [{ P_TYPE: 1, STANDARD: 'CNS560(RC)', DB: grade }] } } } });
  if (sects.length) {
    const a: any = {};
    for (const s of sects) a[s.id] = { SECTTYPE: 'DBUSER', SECT_NAME: s.name, SECT_BEFORE: { SHAPE: 'SB', DATATYPE: 2, SECT_I: { vSIZE: [s.h, s.w, 0, 0, 0, 0, 0] }, USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: false } };
    requests.push({ method: 'PUT', command: '/db/sect', body: { Assign: a } });
  }
  if (thiks.length) {
    const a: any = {};
    for (const th of thiks) a[th.id] = { NAME: th.name, TYPE: 'VALUE', bINOUT: false, T_IN: th.t, T_OUT: 0, O_VALUE: 0 };
    requests.push({ method: 'PUT', command: '/db/thik', body: { Assign: a } });
  }
  { const a: any = {}; for (const n of nodes) a[n.id] = { X: n.x, Y: n.y, Z: n.z }; requests.push({ method: 'PUT', command: '/db/node', body: { Assign: a } }); }
  { const a: any = {}; for (const e of elems) { const { id, ...rest } = e; a[id] = rest; } requests.push({ method: 'PUT', command: '/db/elem', body: { Assign: a } }); }
  { // 최하단(base) 절점 고정 — 노드ID로 키잉, CONSTRAINT 7자리(베이스='1111110')
    const minZ = nodes.reduce((m, n) => Math.min(m, n.z), Infinity);
    const base = nodes.filter((n) => Math.abs(n.z - minZ) < 1);
    if (base.length) { const a: any = {}; base.forEach((n, k) => { a[n.id] = { ITEMS: [{ ID: k + 1, CONSTRAINT: '1111110', GROUP_NAME: '' }] }; }); requests.push({ method: 'PUT', command: '/db/cons', body: { Assign: a } }); }
  }
  return requests;
};

/**
 * 정식 구조모델(FloorModel) → MIDAS API 요청 시퀀스. 모델의 절점 그래프를 그대로 사용하므로
 * 접합부 절점 공유가 MIDAS 절점 공유로 직결된다(단일 진실 소스).
 * - 기둥: (node,k-1)→(node,k) 수직 BEAM 요소 (단면 = depth×width)
 * - 벽: 축선(i,j)을 층 사이 4점 PLATE로 압출 (두께 thik→SECT 참조)
 * - 보: 각 층 바닥의 수평 BEAM 요소
 * - 베이스(z=0) 절점 고정 지지('1111110'), 재질 1개(CNS560 더미).
 */
export const buildMidasRequests = (
  model: FloorModel,
  opts?: { storyHeightMm?: number; stories?: number; unitDist?: string; unitForce?: string; concGrade?: string },
): MidasBuild => {
  const H = opts?.storyHeightMm ?? 3200;
  const N = Math.max(1, Math.floor(opts?.stories ?? 1)); // 층수 (표준층 1:N 수직 복제)
  const f4 = (v: number) => +v.toFixed(4);

  // MIDAS 절점: (평면 절점 id, 레벨 k) → 고유 번호. 모델의 절점 그래프를 층별로 복제.
  const planById = new Map(model.nodes.map((n) => [n.id, n]));
  const nodes: { id: number; x: number; y: number; z: number }[] = [];
  const nmap = new Map<string, number>();
  const nodeAt = (planId: string, k: number): number => {
    const key = `${planId}@${k}`;
    const hit = nmap.get(key); if (hit) return hit;
    const p = planById.get(planId)!;
    const id = nodes.length + 1; nmap.set(key, id);
    nodes.push({ id, x: f4(p.x), y: f4(p.y), z: f4(k * H) }); return id;
  };

  // 단면(기둥·보) / 두께(벽) 레지스트리
  const sects: { id: number; name: string; h: number; w: number }[] = [];
  const smap = new Map<string, number>();
  // mark = 도면 설계 부호(KL1 등) → 있으면 단면명에 붙여 Gen NX에서 도면과 대조 가능.
  const sectId = (h: number, w: number, prefix: string, mark?: string): number => {
    const name = `${mark ? `${mark}_` : `${prefix}_`}${Math.round(h)}x${Math.round(w)}`;
    const hit = smap.get(name); if (hit) return hit;
    const id = sects.length + 1; smap.set(name, id); sects.push({ id, name, h, w }); return id;
  };
  const thiks: { id: number; name: string; t: number }[] = [];
  const tmap = new Map<number, number>();
  const thikId = (th: number): number => {
    const k = Math.round(th); const hit = tmap.get(k); if (hit) return hit;
    const id = thiks.length + 1; tmap.set(k, id); thiks.push({ id, name: `W${k}`, t: k }); return id;
  };

  const elems: MElem[] = [];

  for (const c of model.columns) {
    const sid = sectId(c.depth, c.width, 'C');
    for (let k = 1; k <= N; k++) // 각 층: 아래 레벨(k-1)→위 레벨(k) 수직 기둥
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [nodeAt(c.node, k - 1), nodeAt(c.node, k)], ANGLE: Math.round(c.rotation || 0), STYPE: 0 });
  }
  for (const w of model.walls) {
    const tid = thikId(w.thickness);
    for (let k = 1; k <= N; k++) // 각 층: 축선(i,j)을 아래→위로 압출한 수직 벽 패널
      elems.push({ id: elems.length + 1, TYPE: 'PLATE', MATL: 1, SECT: tid, NODE: [nodeAt(w.i, k), nodeAt(w.j, k), nodeAt(w.j, k - 1), nodeAt(w.i, k - 1)], ANGLE: 0, STYPE: 1 });
  }
  for (const bm of model.beams) {
    // 춤(depth)은 평면 기하로 못 얻어 예전엔 폭×2 더미였음 → 평법 라벨("KL(1) 200X400")에서 읽으면 실제값 사용.
    const sid = sectId(bm.depth ?? bm.width * 2, bm.width, 'B', bm.mark);
    for (let k = 1; k <= N; k++) // 각 층 바닥의 수평 보
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [nodeAt(bm.i, k), nodeAt(bm.j, k)], ANGLE: 0, STYPE: 0 });
  }
  const columns = model.columns.length, walls = model.walls.length, beams = model.beams.length;

  const requests = assembleRequests(nodes, elems, sects, thiks, opts);
  return { requests, summary: { nodes: nodes.length, columns, walls, beams, sections: sects.length, thiks: thiks.length } };
};

// 층 목록 → MIDAS Story Data(STOR) 요청. 공식 스키마(db/STOR).
// 범위(모델링) 준수: 이름/레벨/층폭(bbox 기하)만 채우고 하중·지진 편심은 중립값(0/1) —
// 실제 풍/지진 파라미터는 Gen NX에서 코드별로 설정(해석 범위 밖).
const storyRequest = (floors: FloorModel[]): MidasRequest | null => {
  if (!floors.length) return null;
  const a: any = {};
  floors.forEach((f, i) => {
    const bb = f.bbox;
    const wx = bb ? bb.maxX - bb.minX : 0, wy = bb ? bb.maxY - bb.minY : 0;
    const cx = bb ? (bb.minX + bb.maxX) / 2 : 0, cy = bb ? (bb.minY + bb.maxY) / 2 : 0;
    a[i + 1] = {
      STORY_NAME: f.name || `${i + 1}F`,
      STORY_LEVEL: Math.round(f.elevation ?? 0),
      bFLOOR_DIAPHRAGM: false,
      WIND_FLOOR_WIDTH_X: Math.round(wx), WIND_FLOOR_WIDTH_Y: Math.round(wy),
      WIND_CENTER_X: Math.round(cx), WIND_CENTER_Y: Math.round(cy),
      WIND_ECCENT_X: 0, WIND_ECCENT_Y: 0,
      SEIS_ACC_ECCENT_X: 0, SEIS_ACC_ECCENT_Y: 0,
      SEIS_INHERENT_ECCENT_X: 0, SEIS_INHERENT_ECCENT_Y: 0,
      SEIS_TORSIONAL_AMP_FACTOR_X: 1, SEIS_TORSIONAL_AMP_FACTOR_Y: 1,
    };
  });
  return { method: 'PUT', command: '/db/STOR', body: { Assign: a } };
};

/**
 * 다층(Building) → MIDAS API 시퀀스. 각 층(FloorModel)을 자신의 elevation~elevation+height 에 배치.
 * MIDAS 절점은 월드 (x,y,z) 반올림 키로 병합 → 아래층 상단과 위층 하단이 같은 (x,y)면 절점 공유(기둥 연속).
 * - 기둥: 층 base→top 수직. 벽: base~top PLATE. 보: 층 base 레벨 수평.
 */
export const buildMidasRequestsBuilding = (floors: FloorModel[], opts?: MidasOpts): MidasBuild => {
  const f4 = (v: number) => +v.toFixed(4);
  const nodes: MNode[] = [];
  const nmap = new Map<string, number>();
  const nodeAt = (x: number, y: number, z: number): number => {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    const hit = nmap.get(key); if (hit) return hit;
    const id = nodes.length + 1; nmap.set(key, id);
    nodes.push({ id, x: f4(x), y: f4(y), z: f4(z) }); return id;
  };
  const sects: MSect[] = []; const smap = new Map<string, number>();
  // mark = 도면 설계 부호(KL1 등) → 있으면 단면명에 붙여 Gen NX에서 도면과 대조 가능.
  const sectId = (h: number, w: number, prefix: string, mark?: string): number => {
    const name = `${mark ? `${mark}_` : `${prefix}_`}${Math.round(h)}x${Math.round(w)}`;
    const hit = smap.get(name); if (hit) return hit;
    const id = sects.length + 1; smap.set(name, id); sects.push({ id, name, h, w }); return id;
  };
  const thiks: MThik[] = []; const tmap = new Map<number, number>();
  const thikId = (th: number): number => {
    const k = Math.round(th); const hit = tmap.get(k); if (hit) return hit;
    const id = thiks.length + 1; tmap.set(k, id); thiks.push({ id, name: `W${k}`, t: k }); return id;
  };

  const elems: MElem[] = [];
  let columns = 0, walls = 0, beams = 0;
  for (const f of floors) {
    const base = f.elevation ?? 0, top = base + (f.height ?? 3000);
    const p = new Map(f.nodes.map((n) => [n.id, n]));
    for (const c of f.columns) {
      const nd = p.get(c.node); if (!nd) continue;
      const sid = sectId(c.depth, c.width, 'C'); columns++;
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [nodeAt(nd.x, nd.y, base), nodeAt(nd.x, nd.y, top)], ANGLE: Math.round(c.rotation || 0), STYPE: 0 });
    }
    for (const w of f.walls) {
      const a = p.get(w.i), b = p.get(w.j); if (!a || !b) continue;
      const tid = thikId(w.thickness); walls++;
      elems.push({ id: elems.length + 1, TYPE: 'PLATE', MATL: 1, SECT: tid, NODE: [nodeAt(a.x, a.y, top), nodeAt(b.x, b.y, top), nodeAt(b.x, b.y, base), nodeAt(a.x, a.y, base)], ANGLE: 0, STYPE: 1 });
    }
    for (const bm of f.beams) {
      const a = p.get(bm.i), b = p.get(bm.j); if (!a || !b) continue;
      const sid = sectId(bm.depth ?? bm.width * 2, bm.width, 'B', bm.mark); beams++;
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [nodeAt(a.x, a.y, base), nodeAt(b.x, b.y, base)], ANGLE: 0, STYPE: 0 });
    }
  }

  const requests = assembleRequests(nodes, elems, sects, thiks, opts);
  const stor = storyRequest(floors);
  if (stor) requests.push(stor); // 층 메타(Story Data) 등록
  return { requests, summary: { nodes: nodes.length, columns, walls, beams, sections: sects.length, thiks: thiks.length } };
};

// 요청 시퀀스를 그대로 재현하는 Python 스크립트(MidasAPI 헬퍼)로 직렬화.
export const toPythonScript = (requests: MidasRequest[], baseUrl = MIDAS_BASE_DEFAULT): string => {
  const lines = [
    'import requests',
    '',
    `BASE_URL = "${baseUrl}"`,
    'MAPI_KEY = "your-mapi-key-here"  # Gen NX 앱에서 발급',
    '',
    'def MidasAPI(method, command, body=None):',
    '    url = BASE_URL + command',
    '    headers = {"Content-Type": "application/json", "MAPI-Key": MAPI_KEY}',
    '    res = getattr(requests, method.lower())(url, headers=headers, json=body)',
    '    print(method, command, "->", res.status_code)',
    '    return res.json() if res.text else None',
    '',
    '# StruXureAI 자동 생성 — 단일층 구조모델 (MIDAS Gen NX)',
  ];
  for (const r of requests) {
    const body = r.body !== undefined ? `, ${JSON.stringify(r.body)}` : '';
    lines.push(`MidasAPI("${r.method}", "${r.command}"${body})`);
  }
  lines.push('print("완료! MIDAS Gen NX 화면을 확인하세요. (Gen NX 실행 + MAPI-Key 필요)")');
  return lines.join('\n');
};

export interface SendLog { command: string; status: number | 'ERR'; ok: boolean; detail?: string; }

// 요청 시퀀스를 MIDAS 서버로 순차 전송 (브라우저 fetch). Gen NX 실행 + 유효 MAPI-Key 필요.
export const sendMidas = async (
  requests: MidasRequest[], baseUrl: string, mapiKey: string,
  onProgress?: (log: SendLog, i: number, total: number) => void,
): Promise<SendLog[]> => {
  const logs: SendLog[] = [];
  for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    let log: SendLog;
    try {
      const res = await fetch(baseUrl + r.command, {
        method: r.method,
        headers: { 'Content-Type': 'application/json', 'MAPI-Key': mapiKey },
        body: r.body !== undefined ? JSON.stringify(r.body) : undefined,
      });
      const txt = await res.text().catch(() => '');
      let j: any = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* non-json */ }
      const ok = res.ok && !(j && j.error); // Story 방식: 200이어도 JSON error면 실패
      log = { command: `${r.method} ${r.command}`, status: res.status, ok };
      if (!ok) log.detail = (j && j.error && j.error.message) || txt.slice(0, 200);
    } catch (e: any) {
      log = { command: `${r.method} ${r.command}`, status: 'ERR', ok: false, detail: String(e?.message || e).slice(0, 200) };
    }
    logs.push(log); onProgress?.(log, i, requests.length);
    if (!log.ok) break; // 실패 시 중단(앞 단계 의존)
  }
  return logs;
};
