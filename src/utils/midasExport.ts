import { StructureLineData } from '../types/drawing';
import { DxfTransform } from '../store/useDrawingStore';

// ── MIDAS Gen NX Open API 내보내기 ──────────────────────────
// 캔버스 px 구조부재 → 월드(mm) 단일층 구조모델 → MIDAS API 요청 시퀀스.
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

/**
 * 추출된 구조부재(px)를 MIDAS API 요청 시퀀스로 변환 (단일층 PoC).
 * - 기둥: (x,y,0)→(x,y,-H) 수직 BEAM 요소 (단면 = depth×width)
 * - 벽: 평면 축선을 -H까지 수직 압출한 4점 PLATE (두께 thik→SECT 참조)
 * - 보: Z=0 평면의 수평 BEAM 요소 (단면 = 폭×2폭 더미 춤)
 * - 하단(z=-H) 절점 고정 지지('1111110'), 재질 1개(CNS560 더미).
 */
export const buildMidasRequests = (
  members: StructureLineData[],
  t: DxfTransform,
  opts?: { storyHeightMm?: number; unitDist?: string; unitForce?: string; concGrade?: string },
): MidasBuild => {
  const H = opts?.storyHeightMm ?? 3200;
  const scale = t.scale || 1;
  const wx = (px: number) => t.minX + (px - t.pad) / scale; // px → 월드 X(mm)
  const wy = (py: number) => t.maxY - (py - t.pad) / scale; // px → 월드 Y(mm, DXF Y up)
  const f4 = (v: number) => +v.toFixed(4);

  // 절점 레지스트리 (1mm 반올림 키로 중복 통합)
  const nodes: { id: number; x: number; y: number; z: number }[] = [];
  const nmap = new Map<string, number>();
  const nodeId = (x: number, y: number, z: number): number => {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    const hit = nmap.get(key); if (hit) return hit;
    const id = nodes.length + 1; nmap.set(key, id); nodes.push({ id, x: f4(x), y: f4(y), z: f4(z) }); return id;
  };

  // 단면(기둥·보) 레지스트리 — id 공간은 thik과 분리(요소 타입으로 구분됨)
  const sects: { id: number; name: string; h: number; w: number }[] = [];
  const smap = new Map<string, number>();
  const sectId = (h: number, w: number, prefix: string): number => {
    const name = `${prefix}_${Math.round(h)}x${Math.round(w)}`;
    const hit = smap.get(name); if (hit) return hit;
    const id = sects.length + 1; smap.set(name, id); sects.push({ id, name, h, w }); return id;
  };
  // 벽 두께(thik) 레지스트리
  const thiks: { id: number; name: string; t: number }[] = [];
  const tmap = new Map<number, number>();
  const thikId = (th: number): number => {
    const k = Math.round(th); const hit = tmap.get(k); if (hit) return hit;
    const id = thiks.length + 1; tmap.set(k, id); thiks.push({ id, name: `W${k}`, t: k }); return id;
  };

  type Elem = { id: number; TYPE: string; MATL: number; SECT: number; NODE: number[]; ANGLE: number; STYPE: number };
  const elems: Elem[] = [];
  let columns = 0, walls = 0, beams = 0;

  for (const m of members) {
    if (m.source !== 'CAD' || m.coordinates.length < 2) continue;
    const a = m.coordinates[0], b = m.coordinates[1];
    if (m.type === 'COLUMN' && m.shape === 'rect') {
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const X = wx(cx), Y = wy(cy);
      const top = nodeId(X, Y, 0), bot = nodeId(X, Y, -H);
      const w = Math.round(m.properties?.width_mm ?? Math.abs(wx(b.x) - wx(a.x)));
      const d = Math.round(m.properties?.depth_mm ?? Math.abs(wy(a.y) - wy(b.y)));
      const sid = sectId(d, w, 'C');
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [bot, top], ANGLE: Math.round(m.properties?.rotation_deg ?? 0), STYPE: 0 });
      columns++;
    } else if (m.type === 'WALL' && m.shape === 'line') {
      const tA0 = nodeId(wx(a.x), wy(a.y), 0), tB0 = nodeId(wx(b.x), wy(b.y), 0);
      const tB1 = nodeId(wx(b.x), wy(b.y), -H), tA1 = nodeId(wx(a.x), wy(a.y), -H);
      const tid = thikId(m.properties?.thickness_mm ?? 200);
      elems.push({ id: elems.length + 1, TYPE: 'PLATE', MATL: 1, SECT: tid, NODE: [tA0, tB0, tB1, tA1], ANGLE: 0, STYPE: 1 });
      walls++;
    } else if (m.type === 'BEAM' && m.shape === 'line') {
      const i = nodeId(wx(a.x), wy(a.y), 0), j = nodeId(wx(b.x), wy(b.y), 0);
      const w = Math.round(m.properties?.width_mm ?? 300);
      const sid = sectId(w * 2, w, 'B'); // 춤(depth) 미상 → 폭의 2배 더미
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [i, j], ANGLE: 0, STYPE: 0 });
      beams++;
    }
  }

  // ── 요청 시퀀스 (모든 /db/* 는 PUT, /doc/* 는 POST) ──
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
  { // 하단(base) 절점 고정 — 노드ID로 키잉, CONSTRAINT 7자리(베이스='1111110')
    const base = nodes.filter((n) => n.z < -1);
    if (base.length) { const a: any = {}; base.forEach((n, k) => { a[n.id] = { ITEMS: [{ ID: k + 1, CONSTRAINT: '1111110', GROUP_NAME: '' }] }; }); requests.push({ method: 'PUT', command: '/db/cons', body: { Assign: a } }); }
  }
  // 주: /doc/save 는 자동 호출하지 않음 — 새 문서 저장은 Gen NX에서 "다른 이름으로 저장" 대화상자를
  //     띄워 API를 블록하므로(Story 에이전트도 빌드시 저장 안 함), 모델 생성까지만 수행한다.

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
