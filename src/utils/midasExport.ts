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
  const sectId = (h: number, w: number, prefix: string): number => {
    const name = `${prefix}_${Math.round(h)}x${Math.round(w)}`;
    const hit = smap.get(name); if (hit) return hit;
    const id = sects.length + 1; smap.set(name, id); sects.push({ id, name, h, w }); return id;
  };
  const thiks: { id: number; name: string; t: number }[] = [];
  const tmap = new Map<number, number>();
  const thikId = (th: number): number => {
    const k = Math.round(th); const hit = tmap.get(k); if (hit) return hit;
    const id = thiks.length + 1; tmap.set(k, id); thiks.push({ id, name: `W${k}`, t: k }); return id;
  };

  type Elem = { id: number; TYPE: string; MATL: number; SECT: number; NODE: number[]; ANGLE: number; STYPE: number };
  const elems: Elem[] = [];

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
    const sid = sectId(bm.width * 2, bm.width, 'B'); // 춤(depth) 미상 → 폭의 2배 더미
    for (let k = 1; k <= N; k++) // 각 층 바닥의 수평 보
      elems.push({ id: elems.length + 1, TYPE: 'BEAM', MATL: 1, SECT: sid, NODE: [nodeAt(bm.i, k), nodeAt(bm.j, k)], ANGLE: 0, STYPE: 0 });
  }
  const columns = model.columns.length, walls = model.walls.length, beams = model.beams.length;

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
  { // 하단(base, z=0) 절점 고정 — 노드ID로 키잉, CONSTRAINT 7자리(베이스='1111110')
    const base = nodes.filter((n) => Math.abs(n.z) < 1);
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
