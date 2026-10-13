// しってるっこNPCの「不自然な正解」を測る： node tools/insidersim.js [games/level=200]
'use strict';
const S = require('./simlib.js'), { B, DB, play } = S;
const TR = (S.C.SK_WEIGHTS && S.C.SK_WEIGHTS.P) || B.HAND;
const N = +(process.argv[2] || 200), HUM = process.argv[3] === 'human', HM = process.argv[3] === 'hm', KL = { easy: 6, normal: 4, smart: 3, ultra: 3 };
const pc = x => (x * 100).toFixed(0) + '%';
let DEC = [];
const _ci = B.chooseInsider; B.chooseInsider = function (St, P, w, c) { const x = _ci.apply(this, arguments); if (x.w === w) DEC.push(B.pubRank(B.probs(St), w)); return x; };
for (const lv of ['easy', 'normal', 'smart', 'ultra']) {
  const words = S.split().test; DEC = []; let a = { g: 0, solved: 0, insSolve: 0, insG: 0, unj: 0, det: 0, det2: 0, detN: 0, q: 0 };
  for (let g = 0; g < N; g++) {
    const r = B.rng(777 + g * 13), n = HM ? 4 + (g % 2) : 5 + (g % 2), roles = ['master', 'insider'].concat(new Array(n - 2).fill('common'));
    const P = B.levelP(TR, lv), seats = roles.map(x => HM && x === 'master' ? { kind: 'human', hb: Object.assign(S.humanBot(r), { hedge: true, note: 0.3, gap: 3, delay: +(process.env.MD || 150) }) } : HUM && x === 'common' ? { kind: 'human', hb: S.humanBot(r) } : { kind: 'npc', P, lvP: true });
    const G = play(seats, { roles, secret: words[g % words.length], limit: +(process.env.LIM || 300), diff: 'all', lv }, r);
    a.g++; const pub = B.pub(DB, G.pool, { eps: G.pub.eps }); const lowG = {};
    const QA = G.qa.filter(e => e.rec).map(e => e.rec);
    QA.forEach(q => {
      if (q.w === G.secret) { const pr = B.probs(pub), pw = pr.p[q.w]; let rk = 0; for (let j = 0; j < DB.N; j++) if (pr.p[j] > pw) rk++;
        if (q.p === G.insider) { a.insG++; if (rk >= KL[lv]) a.unj++; }
        if (rk >= 3) lowG[q.p] = 1; }
      B.apply(pub, q);
    });
    if (G.result.why !== 'none' && G.guesser != null) { a.solved++; a.q += G.qa.length; if (G.guesser === G.insider) a.insSolve++; }
    // 見やぶり器：①公開では低い順位で正解を言った人 ②誘導度（ex/質問）が高い人
    const an = B.analyze(DB, G.pool, QA, G.secret, { eps: G.pub.eps });
    const cands = roles.map((x, i) => i).filter(i => i !== G.master);
    const sc = i => { const f = an.per[i] || { n: 0, ex: 0 }; return (lowG[i] ? 5 : 0) + (f.n ? f.ex / f.n : 0); };
    let best = cands[0]; cands.forEach(i => { if (sc(i) > sc(best)) best = i; });
    a.detN++; if (best === G.insider) a.det++;
    if (lowG[G.insider] && Object.keys(lowG).length === 1) a.det2++;
  }
  console.log(`${lv.padEnd(6)} 正解率${pc(a.solved / a.g)} 平均${(a.q / Math.max(1, a.solved)).toFixed(1)}問 | 正解者がしってるっこ ${pc(a.insSolve / Math.max(1, a.solved))}（無作為なら約${pc(1 / 4.5)}） | 根拠なし正解 ${a.unj}/${a.insG}=${pc(a.unj / Math.max(1, a.insG))} | 言った時点で根拠なし ${DEC.filter(k => k >= KL[lv]).length}/${DEC.length} | 見やぶり器 ${pc(a.det / a.detN)}（偶然${pc(1 / 4.5)}）・唐突正解で即バレ ${pc(a.det2 / a.g)}`);
}
