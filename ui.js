/* しってるっこ：描画（ホスト・参加者で共通。受け取ったビューだけを使う） */
'use strict';
var ui = { gameKey: '', lid: 0, endKey: '', deadline: 0, hide: load(LS_HIDE) === '1', mode: '', ansMode: false, qbOpen: false, qbTab: 'kind', voteKey: '', lastTurnKey: '', awakened: '', tickSec: -1, sfxAt: 0, nightKey: '', dealKey: '', toAnsKey: '', suggKey: '', foundKey: '', revealKey: '' };
var ROLE_DESC = {
  master: 'お題を知っている 司会役。みんなの質問に「はい／いいえ／わからない／部分的にそう／部分的に違う」で答えます。たんていチームの仲間です。',
  insider: 'お題を こっそり知っている子。知らないふりで みんなを正解へ みちびいて、最後まで バレなければ勝ち！',
  common: 'お題を知らない。質問で お題を当てて、そのあと「知ってたっぽい子」を見つけよう！',
  follower: 'お題は知らないけど、しってるっこが だれか知っている。しってるっこを かばいきれば勝ち！'
};
function roleTag(r) { var R = L.ROLE[r]; return R ? R.e + ' ' + R.name : ''; }
function render(v) {
  lastView = v; window.__sk.view = v;
  var g = v.g;
  BGM.want(v.phase === 'game' && g && g.phase !== 'deal' && g.phase !== 'night' ? (g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; nightUi(null); return; }
  if (v.phase === 'end' && g && g.result) { show('end'); nightUi(null); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' && !host ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
// ---------------- ロビー ----------------
function seg(id, items, cur, isHost, dis) {
  $(id).innerHTML = items.map(function (it) { var off = !isHost || (dis && dis(it[0])); return '<button data-v="' + it[0] + '" class="' + (String(it[0]) === String(cur) ? 'on' : '') + '"' + (off ? ' disabled' : '') + '>' + it[1] + '</button>'; }).join('');
  $(id).classList.toggle('ro', !isHost);
}
function scoreHtml(v) {
  var keys = Object.keys(v.scores || {}); if (!keys.length) return '';
  keys.sort(function (a, b) { return v.scores[b] - v.scores[a]; });
  var top = v.scores[keys[0]];
  return keys.map(function (k) {
    var nm = k.indexOf('npc:') === 0 ? (function (c) { return c ? c.name + c.e : k; })(L.charById(k.slice(4))) : k.slice(2);
    return '<div class="sc' + (v.scores[k] === top && top > 0 ? ' top' : '') + '"><span class="nm">' + esc(nm) + '</span><span class="pt">' + v.scores[k] + '</span></div>';
  }).join('');
}
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length, o = v.opts;
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '">' + avHtml({ kind: 'human', name: s.name }) + '<span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  $('seatHint').textContent = '招待URLかQRで、各自のスマホから参加してね（人間は最大' + MAX_HUMANS + '人）。質問は口で言っても、入力してもOK。';
  $('npcGrid').innerHTML = window.SK_CHARS.map(function (c) {
    var on = o.npcs.indexOf(c.id) >= 0;
    return '<button class="npcCard' + (on ? ' on' : '') + '" data-ch="' + c.id + '"' + (isHost ? '' : ' disabled') + '><span class="em">' + c.e + '</span><span class="nm">' + c.name + '</span><span class="ds">' + esc(c.desc) + '</span></button>';
  }).join('');
  var tot = n + o.npcs.length, bad = tot < MIN_TOTAL || tot > MAX_TOTAL;
  $('totalLine').textContent = '合計 ' + tot + '人（人間' + n + '・NPC' + o.npcs.length + '）' + (tot < MIN_TOTAL ? ' → ' + MIN_TOTAL + '人以上にしてね' : tot > MAX_TOTAL ? ' → ' + MAX_TOTAL + '人までです' : '');
  $('totalLine').classList.toggle('bad', bad);
  seg('roleSeg', [['rand', 'おまかせ'], ['master', '自分が おだいばん（親）']], o.myRole || 'rand', isHost);
  $('roleCard').style.display = n === 1 ? '' : 'none'; $('myTopicBox').style.display = n === 1 && o.myRole === 'master' ? '' : 'none';
  seg('lvSeg', [['easy', 'やさしい'], ['normal', 'ふつう'], ['smart', 'かしこい'], ['ultra', 'アストラ<br>ウルトラ😎']], o.lv, isHost);
  seg('diffSeg', [['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい'], ['all', 'ぜんぶ']], o.diff, isHost);
  seg('limitSeg', [[180, '3分'], [240, '4分'], [300, '5分<small>きほん</small>'], [420, '7分'], [600, '10分']], o.limit, isHost);
  seg('folSeg', [['off', 'なし<small>きほん</small>'], ['on', 'あり<small>6人以上</small>']], o.follower ? 'on' : 'off', isHost, function (k) { return k === 'on' && tot < 6; });
  seg('bgSeg', [['off', 'なし<small>きほん</small>'], ['on', 'あり']], o.blackGuess ? 'on' : 'off', isHost);
  var sh = scoreHtml(v); $('scoreCard').style.display = sh ? '' : 'none'; $('scoreList').innerHTML = sh;
  $('startBtn').disabled = bad;
}
// ---------------- ゲーム ----------------
function phaseLabel(g) {
  return { deal: '🎴 役わりカード', night: '🌙 夜（目をとじる）', qa: '❓ 質問タイム', found: '🎉 正解！', talk: '⏳ 話し合い', v1: '✋ 投票①', v1show: '📣 投票①の結果', v2: '👉 投票②', v2show: '📣 投票②の結果', tie: '⚖️ 正解者が決める', reveal: '🥁 正体は…', end: '🏁 結果' }[g.phase] || '';
}
function pcHtml(g, i) {
  var pl = g.players[i], cls = 'pc', tags = '';
  if (i === g.me) cls += ' me'; if (g.off && g.off[i]) cls += ' off';
  if (i === g.master) { cls += ' master'; tags += '<span class="rt m">👑おだいばん</span>'; }
  else if (i === g.me && g.role) tags += '<span class="rt ' + g.role + '">' + roleTag(g.role) + '</span>';
  else if (g.pal === i) tags += '<span class="rt pal">' + roleTag(g.role === 'insider' ? 'follower' : 'insider') + '</span>';
  if (i === g.guesser) tags += '<span class="rt g">🎯正解者</span>';
  var asking = (g.pend || []).some(function (e) { return e.p === i; });
  var voted = (g.phase === 'v1' && g.v1 && g.v1.voters.indexOf(i) >= 0 && g.v1.voted[g.v1.voters.indexOf(i)]) || (g.phase === 'v2' && g.v2 && g.v2.voted[i]);
  var badge = voted ? '✅' : asking ? '❓' : g.off && g.off[i] ? '📴' : '';
  return '<div class="pc' + cls.slice(2) + '" data-p="' + i + '">' + (badge ? '<span class="bd">' + badge + '</span>' : '') + '<div class="hd">' + avHtml(pl) + '<span class="nm">' + esc(pl.name) + (i === g.me ? '（あなた）' : '') + '</span></div><div class="tg">' + tags + (i !== g.master ? '<span class="qn">質問 ' + (g.qn[i] || 0) + '</span>' : '') + '</div></div>';
}
var ANS = { y: ['はい', 'y', '⭕'], n: ['いいえ', 'n', '❌'], u: ['わからない', 'u', '🤷'], py: ['部分的にそう', 'py', '🔶'], pn: ['部分的に違う', 'pn', '🔸'], sp: ['はい、もっと具体的に', 'sp', '➡️'], correct: ['正解！', 'ok', '🎉'] };
function stampHtml(ans, auto) { var a = ANS[ans]; return a ? '<span class="st ' + a[1] + '">' + a[2] + ' ' + a[0] + (auto ? '<small>（おまかせ）</small>' : '') + '</span>' : '<span class="st wait">…</span>'; }
function entryHtml(g, e) {
  var pl = e.p != null && e.p >= 0 ? g.players[e.p] : null, mine = e.p === g.me;
  if (e.t === 'sys') return '<div class="lg-sys' + (e.big ? ' big' : '') + '">' + esc(e.text) + '</div>';
  if (e.t === 'q') return '<div class="lg-q' + (mine ? ' mine' : '') + (e.guess ? ' guess' : '') + '" data-qid="' + e.qid + '" style="--ac:' + (pl.col || '#888') + '">' + avHtml(pl) + '<div class="qb"><span class="who">' + esc(dispName(pl)) + (mine ? '（あなた）' : '') + '</span><span class="qt">' + (e.guess ? '🎯 ' : '') + esc(e.text) + '</span><div class="ar">' + stampHtml(null) + '</div></div></div>';
  if (e.t === 'npc' || e.t === 'chat') return '<div class="lg-row' + (mine ? ' mine' : '') + (pl.kind === 'npc' ? ' npc' : '') + (e.k === 'defend' ? ' defend' : '') + '" style="--ac:' + (pl.col || '#888') + '">' + (mine ? '' : avHtml(pl)) + '<div class="lg-b">' + (mine ? '' : '<span class="who">' + esc(dispName(pl)) + '</span>') + esc(e.text) + '</div></div>';
  if (e.t === 'v1') {
    var ys = [], ns = []; Object.keys(e.votes).forEach(function (k) { (e.votes[k] ? ys : ns).push(esc(g.players[k].name)); });
    return '<div class="lg-votes">✋ 投票①の結果：正解者 <b>' + esc(g.players[e.g].name) + '</b> は しってるっこ？<br>🙋 そう思う ' + e.yes + '票（' + (ys.join('・') || 'なし') + '）<br>🙅 ちがう ' + e.no + '票（' + (ns.join('・') || 'なし') + '）<br>→ ' + (e.maj ? '過半数！ ' + esc(g.players[e.g].name) + ' の正体は… <b>' + roleTag(e.role) + '</b>' : '過半数にならず。正解者の正体はふせたまま 投票②へ') + '</div>';
  }
  if (e.t === 'v2') {
    var lines = Object.keys(e.votes).filter(function (k) { return e.votes[k] >= 0; }).map(function (k) { return esc(g.players[k].name) + ' → <b>' + esc(g.players[e.votes[k]].name) + '</b>'; }).join('<br>');
    var cnt = Object.keys(e.count).map(function (j) { return esc(g.players[j].name) + ' ' + e.count[j] + '票'; }).join('・');
    return '<div class="lg-votes">👉 投票②の開票！<br>' + lines + '<br>📊 ' + cnt + '</div>';
  }
  return '';
}
function applyAnswers(g, list) {
  list.forEach(function (e) {
    if (e.t !== 'a') return;
    var el = $('log').querySelector('.lg-q[data-qid="' + e.qid + '"] .ar'); if (!el) return;
    el.innerHTML = stampHtml(e.ans, e.auto) + (e.say ? '<span class="sy">' + esc(g.players[g.master].e || '') + '「' + esc(e.say) + '」</span>' : '');
    if (e.ans === 'correct') el.parentNode.parentNode.classList.add('hit');
  });
}
function bigPop(text, red) { var p = $('bigPop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go' + (red ? ' red' : ''); }
function renderGame(v) {
  var g = v.g, me = g.me, key = v.code + ':' + v.gameNo;
  if (ui.gameKey !== key) {
    ui.gameKey = key; ui.lid = 0; $('log').innerHTML = ''; ui.voteKey = ''; ui.lastTurnKey = ''; ui.toAnsKey = ''; ui.ansMode = false; ui.qbOpen = false; $('msgIn').value = '';
    if (g.ultra && ui.awakened !== key && g.phase === 'deal') { ui.awakened = key; try { awaken(); } catch (e) {} }
  }
  $('phLabel').textContent = phaseLabel(g);
  ui.deadline = g.left ? Date.now() + g.left : 0; paintTimer();
  // 自分の役わり・お題
  $('roleChip').textContent = g.role ? roleTag(g.role) : '👀 観戦';
  $('roleChip').className = 'rchip ' + (g.role || '');
  var w = g.word || '？？？';
  $('myWord').textContent = w; $('myWord').classList.toggle('hid', ui.hide && !!g.word && (g.role === 'master' || g.role === 'insider') && g.phase === 'qa');
  $('myWord').classList.toggle('unk', !g.word);
  $('wordLb').textContent = g.word ? (g.phase === 'qa' || g.phase === 'night' ? 'お題（ないしょ）' : 'お題') : 'お題（ひみつ）';
  $('myWord').classList.toggle('long', w.length > 6);
  $('hideBtn').style.display = g.word && (g.role === 'master' || g.role === 'insider') && (g.phase === 'qa') ? '' : 'none';
  $('hideBtn').textContent = ui.hide ? 'みる' : 'かくす'; $('catTag').textContent = g.cat || '';
  $('catTag').style.display = g.cat ? '' : 'none';
  $('players').innerHTML = g.players.map(function (_, i) { return pcHtml(g, i); }).join('');
  // ログ（新しい分だけ足す）
  var box = $('log'), near = box.scrollHeight - box.scrollTop - box.clientHeight < 90, fresh = g.log.filter(function (e) { return e.id > ui.lid; });
  if (fresh.length) {
    box.insertAdjacentHTML('beforeend', fresh.map(function (e) { return entryHtml(g, e); }).join(''));
    applyAnswers(g, fresh);
    while (box.children.length > 160) box.removeChild(box.firstChild);
    var first = ui.lid === 0; ui.lid = g.lid;
    if (near || first || fresh.some(function (e) { return e.p === me || e.big || e.t === 'v1' || e.t === 'v2'; })) box.scrollTop = box.scrollHeight;
    if (!first) onFresh(g, fresh, me);
  }
  nightUi(g);
  // 自分の番の合図
  var tk = g.toAnswer ? 'a' + g.toAnswer.qid : g.phase === 'v1' && g.v1 && g.v1.voters.indexOf(me) >= 0 && g.v1.mine == null ? 'v1' : g.phase === 'v2' && g.v2 && g.v2.mine == null && g.v2.cands.length ? 'v2' : g.phase === 'tie' && g.guesser === me ? 'tie' : g.phase === 'qa' ? 'qa' : '';
  if (tk && tk !== ui.lastTurnKey) {
    var prev = ui.lastTurnKey; ui.lastTurnKey = tk;
    if (tk === 'qa') { if (!prev || prev === '') { /* 質問タイム開始の合図は onFresh で */ } }
    else { sfx.turn(); vibrate(60); if (tk[0] === 'a') { if (prev[0] !== 'a') bigPop('質問が来たよ！'); } else bigPop(tk === 'v1' ? '投票①！' : tk === 'v2' ? '投票②！' : 'あなたが決める！'); }
  } else if (!tk) ui.lastTurnKey = '';
  renderAct(v, g, me);
}
function onFresh(g, fresh, me) {
  var now = Date.now();
  fresh.forEach(function (e) {
    if (e.t === 'q') { if (e.p !== me && now - ui.sfxAt > 250) { ui.sfxAt = now; sfx.chat(); } }
    else if (e.t === 'a') { if (e.ans === 'y') sfx.yes(); else if (e.ans === 'n') sfx.no(); else if (e.ans === 'u') sfx.dunno(); }
    else if (e.t === 'v1' || e.t === 'v2') sfx.vote();
    else if (e.t === 'sys' && e.found) { sfx.correct(); confetti(40); bigPop('🎉 正解！「' + (g.word || '') + '」'); }
    else if (e.t === 'sys' && /目をとじて/.test(e.text) && e.big) sfx.night();
    else if (e.t === 'sys' && /質問タイム スタート/.test(e.text)) { sfx.turn(); bigPop('質問タイム！'); }
    else if (e.t === 'sys' && /砂時計/.test(e.text)) { sfx.flip(); bigPop('⏳ しってるっこは だれ？'); }
    else if ((e.t === 'npc' || e.t === 'chat') && e.p !== me && now - ui.sfxAt > 350) { ui.sfxAt = now; (e.t === 'npc' ? sfx.npc : sfx.chat)(); }
  });
  if (g.phase === 'reveal' && ui.revealKey !== ui.gameKey) {
    ui.revealKey = ui.gameKey; var acc = g.v2 && g.v2.accused;
    if (acc != null && acc >= 0) { var isIns = g.accRole === 'insider'; setTimeout(function () { sfx.drum(); }, 50); setTimeout(function () { bigPop(g.players[acc].name + ' は… ' + roleTag(g.accRole) + (isIns ? '！' : '…'), !isIns); if (isIns) sfx.wolf(); }, 900); }
  }
}
// 夜・役わりカードの全画面表示
function nightUi(g) {
  var ov = $('nightOv');
  if (!g || (g.phase !== 'deal' && g.phase !== 'night')) { if (ov.classList.contains('active')) { ov.classList.remove('active'); ui.nightKey = ''; } return; }
  var key = g.phase + ':' + g.nstep + ':' + (g.eyes || '') + ':' + (g.word || '') + ':' + g.swaps;
  ov.classList.add('active'); ov.classList.toggle('dark', g.phase === 'night' && g.eyes !== 'open' && g.eyes !== 'wake');
  if (key === ui.nightKey) return; ui.nightKey = key;
  var h = '', R = L.ROLE[g.role] || { e: '👀', name: '観戦' };
  if (g.phase === 'deal') {
    var pal = g.pal != null ? '<p class="pal">🤝 なかま：<b>' + esc(g.players[g.pal].name) + '</b>（' + roleTag(g.role === 'insider' ? 'follower' : 'insider') + '）</p>' : '';
    h = '<div class="nt">あなたの 役わりは…</div><div class="rcard ' + (g.role || '') + '"><div class="in"><div class="bk">？</div><div class="fr"><span class="em">' + R.e + '</span><b>' + R.name + '</b><p>' + esc(ROLE_DESC[g.role] || '') + '</p>' + pal + '</div></div></div>' +
      '<p class="nsub">👑 おだいばんは ' + esc(g.players[g.master].name) + '（みんなに公開）<br>しってるっこ は ひみつ。だれにも言わないでね🤫</p>' + (host ? '<button class="btn main" id="dealGo" style="max-width:280px">🌙 確認した！ 夜へ</button>' : '');
    sfx.flip(); setTimeout(sfx.flip, 600);
  } else if (g.eyes === 'open' && g.role === 'master') {
    h = '<div class="nt">👑 おだいばん だけ 目をあけて</div><div class="wcard"><small>お題</small><b>' + esc(g.word) + '</b><span class="cat">' + esc(g.cat || '') + '</span></div>' +
      '<p class="nsub">知らない言葉なら かえてね（ルール）</p><div class="row"><button class="btn" id="swapBtn"' + (g.swaps >= 30 ? ' disabled' : '') + '>🔄 お題をかえる</button><button class="btn main" id="mOkBtn">👌 OK・目をとじる</button></div>';
  } else if (g.eyes === 'open' && g.role === 'insider') {
    h = '<div class="nt">🤫 しってるっこ だけ 目をあけて</div><div class="wcard ins"><small>お題</small><b>' + esc(g.word) + '</b><span class="cat">' + esc(g.cat || '') + '</span></div><p class="nsub">おぼえたら 目をとじてね。バレないように みんなを ここへ みちびこう</p>';
    sfx.turn(); vibrate([60, 60, 60]);
  } else if (g.eyes === 'wake') {
    h = '<div class="nt big">☀️ みんな 目をあけて！</div>';
  } else {
    var who = g.nstep === 'master' ? '👑 おだいばんが お題を確認中…' : g.nstep === 'insider' ? '🤫 しってるっこが お題を確認中…' : '🌙 みんな 目をとじて…';
    h = '<div class="moon">🌙</div><div class="nt">目をとじてね</div><p class="nsub">' + who + '<br>（画面は見ないでね・ひとりのときは そのまま待ってOK）</p><div class="zz">💤</div>';
  }
  $('nightBox').innerHTML = h;
  var sb = $('swapBtn'); if (sb) sb.onclick = function () { act('swap'); };
  var ob = $('mOkBtn'); if (ob) ob.onclick = function () { act('masterOk'); };
  var dg = $('dealGo'); if (dg) dg.onclick = function () { act('skip'); };
}
var QUICK = ['あやしい…', '質問がうますぎ！', 'たまたまだよ', 'だれだと思う？', '🤔 うーん', 'わらった😂'];
function chipQ(q) { return q.replace(/^それは\s*/, '').replace(/[？?]$/, ''); }
function renderAct(v, g, me) {
  var mode = 'none', lab = '', P = function (i) { return g.players[i] ? g.players[i].name : ''; }, isMaster = me === g.master;
  if (g.phase === 'qa' && me >= 0 && isMaster) { mode = g.toAnswer ? 'master' : 'mwait'; lab = g.toAnswer ? '👑 ' + esc(P(g.toAnswer.p)) + ' の質問に答えてね' : '👑 質問を待っています…（はい／いいえ／わからない で答えます）'; }
  else if (g.phase === 'qa' && me >= 0) { mode = 'ask'; lab = ui.ansMode ? '🎯 答えがわかったら入力！（それは○○？）' : '❓ はい／いいえ で答えられる質問をしよう' + (g.role === 'insider' ? '（🤫 さりげなく みちびこう）' : ''); }
  else if (g.phase === 'qa') lab = '❓ 質問タイム（観戦中）';
  else if (g.phase === 'talk') { mode = 'chat'; lab = '⏳ 正解者 ' + esc(P(g.guesser)) + ' は しってるっこ？ 質問のしかたを ふりかえろう（口で話してもOK）'; }
  else if (g.phase === 'v1' && g.v1 && g.v1.voters.indexOf(me) >= 0 && g.v1.mine == null) { mode = 'v1'; lab = '✋ 正解者 <b>' + esc(P(g.guesser)) + '</b> は しってるっこ だと思う？'; }
  else if (g.phase === 'v1') lab = me === g.guesser ? '✋ あなたは正解者。みんなの投票を待っています…' : '✅ 投票しました。みんなを待っています…';
  else if (g.phase === 'v2' && g.v2 && g.v2.mine == null && g.v2.cands.length) { mode = 'v2'; lab = '👉 しってるっこ だと思う人をタップ'; }
  else if (g.phase === 'v2') lab = '✅ 投票しました。開票を待っています…';
  else if (g.phase === 'tie' && me === g.guesser) { mode = 'tie'; lab = '⚖️ 同数！ 正解者のあなたが決めてね'; }
  else if (g.phase === 'tie') lab = '⚖️ 正解者 ' + esc(P(g.guesser)) + ' が決めています…';
  else if (g.phase === 'found') lab = '🎉 正解！ 砂時計をひっくり返すよ…';
  else if (g.phase === 'v1show' || g.phase === 'v2show') lab = '📣 開票！';
  else if (g.phase === 'reveal') lab = '🥁 正体は…';
  else if (g.phase === 'deal' || g.phase === 'night') lab = '🌙';
  $('actLab').innerHTML = lab; $('actLab').classList.toggle('mine', mode === 'master' || mode === 'v1' || mode === 'v2' || mode === 'tie');
  // おだいばん（人間）の答えパネル
  var mp = $('mPanel');
  if (mode === 'master') {
    var t = g.toAnswer, k = 'q' + t.qid;
    if (ui.toAnsKey !== k) {
      ui.toAnsKey = k;
      var hint = t.hint ? '目安（ずかん）：<b>' + (ANS[t.hint.ans] ? ANS[t.hint.ans][0] : 'わからない') + '</b>　※ちがうと思ったら 自分の判断でOK' : '（ずかんでは判定できない質問。思ったとおりに答えてね）';
      $('mQ').innerHTML = '<span class="who">' + esc(P(t.p)) + '</span>「' + esc(t.text) + '」'; $('mHint').innerHTML = hint;
    }
    mp.style.display = '';
  } else { mp.style.display = 'none'; ui.toAnsKey = ''; }
  // 質問ビルダー
  $('qbBtn').style.display = mode === 'ask' ? '' : 'none';
  $('ansBtn').style.display = mode === 'ask' ? '' : 'none';
  $('ansBtn').textContent = ui.ansMode ? '❓質問' : '🎯答え'; $('ansBtn').classList.toggle('on', ui.ansMode);
  $('qb').style.display = mode === 'ask' && ui.qbOpen && !ui.ansMode ? '' : 'none';
  if (mode === 'ask' && ui.qbOpen) paintQb();
  if (mode === 'ask' && ui.ansMode) paintSugg(); else { $('sugg').style.display = 'none'; ui.suggKey = ''; }
  // 投票
  $('v1Btns').style.display = mode === 'v1' ? '' : 'none';
  var cands = mode === 'v2' ? g.v2.cands : mode === 'tie' ? g.v2.tops.filter(function (x) { return true; }) : [];
  var vk = mode + ':' + cands.join(',');
  if (vk !== ui.voteKey) { ui.voteKey = vk; $('voteGrid').innerHTML = cands.map(function (i) { return '<button data-v="' + i + '" data-m="' + mode + '">' + avHtml(g.players[i]) + '<span class="n">' + esc(g.players[i].name) + '</span></button>'; }).join(''); }
  $('voteGrid').style.display = cands.length ? '' : 'none';
  $('quick').style.display = mode === 'chat' || (g.phase === 'v1' || g.phase === 'v2') ? '' : 'none';
  if (!$('quick').innerHTML) $('quick').innerHTML = QUICK.map(function (q) { return '<button data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
  var showIn = mode === 'ask' || mode === 'chat' || mode === 'v1' || mode === 'v2' || mode === 'mwait' || mode === 'master' || g.phase === 'v1show' || g.phase === 'v2show' || g.phase === 'tie' || g.phase === 'found' || g.phase === 'reveal';
  $('inRow').style.display = showIn && me >= 0 ? '' : 'none';
  var im = mode === 'ask' ? (ui.ansMode ? 'guess' : 'q') : mode === 'master' || mode === 'mwait' ? 'mchat' : 'chat';
  if (ui.mode !== im) {
    ui.mode = im; var inp = $('msgIn');
    $('inRow').classList.toggle('qMode', im === 'q' || im === 'guess');
    inp.placeholder = im === 'q' ? '質問（例：それは食べもの？ 手より大きい？）' : im === 'guess' ? '答え（例：パンダ？）' : im === 'mchat' ? 'ひとこと（質問の答えは上のボタン）' : 'チャット（NPCの名前を呼ぶと返事するよ）';
    $('sendBtn').textContent = im === 'q' ? '質問' : im === 'guess' ? '答える' : '送信';
    if (im === 'guess' || im === 'q') inp.value = '';
  }
  var sb = $('skipBtn'), canSkip = !!host && (g.phase === 'talk' || g.phase === 'deal');
  sb.style.display = canSkip ? '' : 'none';
  sb.textContent = g.phase === 'deal' ? '▶ 夜へ（目をとじる）' : '⏭ 話し合いを終えて 投票①へ';
}
function paintQb() {
  var tabs = K.GROUPS.map(function (gr) { return '<button data-t="' + gr[0] + '" class="' + (gr[0] === ui.qbTab ? 'on' : '') + '">' + gr[1] + '</button>'; }).join('');
  var chips = K.ATTRS.filter(function (a) { return a.g === ui.qbTab; }).map(function (a) { return '<button data-a="' + a.i + '">' + esc(chipQ(a.q)) + '？</button>'; }).join('');
  var key = ui.qbTab; if ($('qb').dataset.k === key) return; $('qb').dataset.k = key;
  $('qb').innerHTML = '<div class="qtabs">' + tabs + '</div><div class="qchips">' + chips + '</div>';
}
function paintSugg() {
  var q = K.norm($('msgIn').value), key = q;
  if (key === ui.suggKey) return; ui.suggKey = key;
  if (!q) { $('sugg').style.display = 'none'; return; }
  var hits = []; for (var i = 0; i < DB.words.length && hits.length < 8; i++) { var w = DB.words[i]; if (K.norm(w.w).indexOf(q) === 0) hits.push(w.w); }
  $('sugg').innerHTML = hits.map(function (w) { return '<button data-g="' + esc(w) + '">' + esc(w) + '？</button>'; }).join('');
  $('sugg').style.display = hits.length ? '' : 'none';
}
function paintTimer() {
  var el = $('timer'); if (!el) return;
  var left = ui.deadline ? Math.max(0, ui.deadline - Date.now()) : 0, v = lastView, g = v && v.g;
  if (!left || !g || g.phase === 'end' || g.phase === 'deal' || g.phase === 'night') { el.style.visibility = 'hidden'; return; }
  el.style.visibility = ''; var s = Math.ceil(left / 1000); if (g.phase === 'qa' && g.limitSec) s = Math.min(s, g.limitSec);   // 制限時間より大きくは出さない
  el.textContent = (g.phase === 'talk' ? '⏳ ' : '⏱ ') + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
  el.classList.toggle('low', s <= (g.phase === 'qa' ? 30 : 10));
  if ((g.phase === 'qa' && s <= 10 || (g.toAnswer && s <= 5)) && s !== ui.tickSec) { ui.tickSec = s; sfx.tick(); }
}
setInterval(paintTimer, 250);
// ---------------- 結果 ----------------
var WHY = { none: '⌛ 時間切れ… 正解が出なかったので 全員の負け', v1catch: '投票①で 正解者＝しってるっこ を見やぶった！', v1miss: '正解者が しってるっこ だったのに 見のがした…', v1wrong: '正解者は たんていだったのに「しってるっこ」と判定してしまった…', v2catch: '投票②で しってるっこを 見つけた！', v2miss: '投票②で 別の人を えらんでしまった…' };
function renderEnd(v) {
  var g = v.g, r = g.result, me = g.me, key = v.code + ':' + v.gameNo;
  $('scoreList2').innerHTML = scoreHtml(v) || '<p class="hint">まだありません</p>';
  if (ui.endKey === key) return; ui.endKey = key;
  var ins = r.roles.indexOf('insider'), fol = r.roles.indexOf('follower');
  $('pairRow').innerHTML = '<div class="pairCard" style="--d:.3s"><div class="in"><div class="fr"><span class="lb">お題</span><span class="w">' + esc(r.word) + '</span><span class="lb">' + esc(r.cat || '') + '</span></div><div class="bk">❓</div></div></div>' +
    '<div class="pairCard wolf" style="--d:1s"><div class="in"><div class="fr"><span class="lb">🤫 しってるっこ</span><span class="w">' + esc(g.players[ins].name) + '</span>' + (fol >= 0 ? '<span class="lb">🐾 おとも：' + esc(g.players[fol].name) + '</span>' : '') + '</div><div class="bk">❓</div></div></div>';
  var iWon = me >= 0 && r.winners.indexOf(me) >= 0;
  var cls = r.winner === 'commons' ? 'cit' : r.winner === 'insider' ? 'wolf' : 'none';
  $('winBan').className = 'winBan ' + cls;
  $('winBan').innerHTML = (r.winner === 'commons' ? '🔍 たんていチームの勝ち！' : r.winner === 'insider' ? '🤫 しってるっこの勝ち！' : '⌛ 全員の負け…') + '<small>' + esc(WHY[r.why] || '') + (me >= 0 ? (iWon ? '　あなたの勝ち！' : '　あなたの負け…') : '') + '</small>';
  $('revList').innerHTML = g.players.map(function (pl, i) {
    var rl = r.roles[i], lk = r.leak && r.leak[i], w = r.winners.indexOf(i) >= 0;
    var lkTxt = rl === 'master' ? '' : lk ? '質問' + lk.n + '・もれ ' + (lk.ex > 0 ? '+' : '') + lk.ex.toFixed(1) : '質問0';
    return '<div class="rv' + (rl === 'insider' || rl === 'follower' ? ' wolf' : '') + '" style="--d:' + (1.5 + i * 0.16).toFixed(2) + 's">' + avHtml(pl) + '<span class="nm">' + esc(dispName(pl)) + (i === me ? '（あなた）' : '') + (i === r.guesser ? ' 🎯' : '') + (w ? ' 🏆' : '') + '</span><span class="vt">' + esc(lkTxt) + '</span><span class="wd">' + roleTag(rl) + '</span></div>';
  }).join('');
  $('endLine').innerHTML = (g.endLines || []).map(function (l) { var pl = g.players[l.p]; return pl.e + '「' + esc(l.text) + '」'; }).join('　');
  // 質問ふりかえり（情報もれ）
  var qa = g.qaFull || [];
  $('qaCard').style.display = qa.length ? '' : 'none';
  $('qaList').innerHTML = qa.map(function (e) {
    var pl = g.players[e.p], x = e.ex == null ? 0 : e.ex, wd = Math.min(100, Math.abs(x) * 40);
    return '<div class="qr' + (r.roles[e.p] === 'insider' ? ' ins' : '') + '"><span class="nm">' + esc(pl.name) + '</span><span class="tx">' + esc(e.text) + '</span><span class="an">' + (ANS[e.ans] ? ANS[e.ans][2] : '') + '</span><span class="bar"><i style="width:' + wd + '%;' + (x < 0 ? 'background:#9ab' : '') + '"></i></span></div>';
  }).join('');
  var th = g.players.map(function (pl, i) {
    if (!r.thoughts[i]) return '';
    return '<details class="th"' + (r.roles[i] === 'insider' ? ' open' : '') + '><summary>' + avHtml(pl) + esc(dispName(pl)) + '（' + roleTag(r.roles[i]) + '）</summary><ol>' + r.thoughts[i].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></details>';
  }).join('');
  $('thCard').style.display = th ? '' : 'none'; $('thList').innerHTML = th;
  var box = document.createElement('div'); box.id = 'logCopyIn'; $('logCopy').innerHTML = '';
  $('logCopy').innerHTML = g.log.map(function (e) { return entryHtml(g, e); }).join('');
  g.log.forEach(function (e) { if (e.t !== 'a') return; var el = $('logCopy').querySelector('.lg-q[data-qid="' + e.qid + '"] .ar'); if (el) el.innerHTML = stampHtml(e.ans, e.auto); });
  $('end').scrollTop = 0;
  sfx.drum(); setTimeout(sfx.flip, 300); setTimeout(sfx.flip, 1000);
  setTimeout(function () { if (iWon || me < 0) { sfx.win(); confetti(70); } else sfx.lose(); }, 2200);
}
