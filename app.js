/* しってるっこ：流れ・ボタン操作・タイトル（最後に読み込む） */
'use strict';
// テスト・デバッグ用（render より前に用意しておく）
window.__sk = { view: null, autoplay: false, bgm: function () { return BGM.state(); },
  act: function (a, v) { return act(a, v); }, role: function () { return host ? 'host' : client ? 'client' : 'none'; },
  hostRoom: function () { return host ? host.room : null; }, refresh: function () { if (host) hostBroadcast(); } };

// ---- 操作（ホストも参加者も同じ入口） ----
function act(a, val) {
  var v = lastView; if (!v || (v.phase !== 'game' && v.phase !== 'end') || !v.g) return false;
  unlockAudio();
  var m = { t: 'act', a: a, v: val, g: v.gameNo };
  if (host) { var err = hostAction(1, m); if (err) { toast(err); return false; } return true; }
  return send(m);
}
function curMode() { return ui.mode; }
function submitInput() {
  var v = lastView, inp = $('msgIn'), t = inp.value.trim(); if (!v || !v.g) return;
  var mode = curMode();
  if (!t) { if (mode === 'q') toast('質問を入力するか、🧩から えらんでね'); return; }
  if (mode === 'q') {
    if (v.g.word && v.g.role === 'insider' && K.norm(t).indexOf(K.norm(v.g.word)) >= 0 && !/[?？]$/.test(t)) { toast('お題そのものを言うのは「🎯答え」でね'); return; }
    if (act('ask', t)) { inp.value = ''; }
  } else if (mode === 'guess') {
    if (act('askG', t)) { inp.value = ''; ui.ansMode = false; render(lastView); }
  } else if (mode === 'mchat' || mode === 'chat') {
    var mv = mode === 'mchat' && v.g.toAnswer ? masterWord(t) : null;
    if (mode === 'mchat' && v.g.toAnswer && /^\s*(yep|yeah|aye|yup|ye)\s*[.!]?\s*$/i.test(t)) { toast('「はい」と「いいえ」どっち？ ボタンでえらんでね'); return; }   // 音声のあいまいな聞き取り
    if (mv) { act('answer', { qid: v.g.toAnswer.qid, ans: mv, note: t.length > 3 ? t.slice(0, 40) : '' }); inp.value = ''; return; }
    if (act('chat', t)) inp.value = '';
  }
}
// おだいばんが 声や文字で「はい／いいえ／わからない」と言ったとき
function masterWord(t) { return K.parseAnswer(t); }   // 「部分的にそう」「もっと具体的に」なども読む（kb.js）
$('sendBtn').onclick = submitInput;
$('msgIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submitInput(); } });
$('msgIn').addEventListener('input', function () { if (curMode() === 'guess') paintSugg(); });
$('qbBtn').onclick = function () { ui.qbOpen = !ui.qbOpen; ui.ansMode = false; $('qb').dataset.k = ''; if (lastView) render(lastView); };
$('ansBtn').onclick = function () { ui.ansMode = !ui.ansMode; ui.qbOpen = false; if (lastView) render(lastView); if (ui.ansMode) $('msgIn').focus(); };
$('qb').addEventListener('click', function (e) {
  var t = e.target.closest('button[data-t]'); if (t) { ui.qbTab = t.dataset.t; $('qb').dataset.k = ''; paintQb(); return; }
  var b = e.target.closest('button[data-a]'); if (b) { if (act('askA', +b.dataset.a)) { b.classList.add('sent'); setTimeout(function () { b.classList.remove('sent'); }, 600); } }
});
$('sugg').addEventListener('click', function (e) { var b = e.target.closest('button[data-g]'); if (b && act('askG', b.dataset.g)) { $('msgIn').value = ''; ui.ansMode = false; render(lastView); } });
$('quick').addEventListener('click', function (e) { var b = e.target.closest('button[data-q]'); if (b) act('chat', b.dataset.q); });
$('mPanel').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-ans]'); if (!b || !lastView || !lastView.g || !lastView.g.toAnswer) return;
  var ans = b.dataset.ans, qid = lastView.g.toAnswer.qid;
  if (ans === 'correct') confirmBox('正解にしますか？', '「' + lastView.g.toAnswer.text + '」を お題と同じ意味とみなして 正解にします。', '🎯 正解にする', function () { act('answer', { qid: qid, ans: 'correct' }); });
  else if (ans === 'near') act('answer', { qid: qid, ans: 'pn', note: '近い' });   // 「いいえ、でも近い」
  else act('answer', { qid: qid, ans: ans });
});
$('v1Btns').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-y]'); if (!b || !lastView || !lastView.g) return;
  var yes = b.dataset.y === '1', nm = lastView.g.players[lastView.g.guesser].name;
  confirmBox(yes ? nm + ' は しってるっこ！' : nm + ' は ちがう', '投票は1回だけ。変更できません。', '投票する', function () { act('vote1', yes); });
});
$('voteGrid').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-v]'); if (!b || !lastView || !lastView.g) return;
  var i = +b.dataset.v, pl = lastView.g.players[i], tie = b.dataset.m === 'tie';
  confirmBox(pl.name + (tie ? ' を えらびますか？' : ' に投票しますか？'), tie ? 'あなたの決定で しってるっこ候補が決まります。' : '投票は1回だけ。変更できません。', tie ? '決める' : '投票する', function () { act(tie ? 'tie' : 'vote2', i); });
});
$('skipBtn').onclick = function () { act('skip'); };
$('hideBtn').onclick = function () { ui.hide = !ui.hide; store(LS_HIDE, ui.hide ? '1' : null); if (lastView && lastView.g) renderGame(lastView); };
$('myWord').onclick = function () { if (ui.hide) { var w = $('myWord'); w.classList.remove('hid'); setTimeout(function () { if (ui.hide) w.classList.add('hid'); }, 1500); } };
// プレイヤーのカード→キャラ紹介／その人の質問
$('players').addEventListener('click', function (e) {
  var c = e.target.closest('.pc[data-p]'); if (!c || !lastView || !lastView.g) return;
  var g = lastView.g, p = +c.dataset.p, pl = g.players[p], ch = pl.kind === 'npc' ? L.charById(pl.ch) : null;
  var qs = g.log.filter(function (x) { return x.t === 'q' && x.p === p; }).map(function (x) { return '「' + esc(x.text) + '」'; });
  $('chTitle').innerHTML = avHtml(pl, 'big') + ' ' + esc(dispName(pl));
  $('chText').innerHTML = (ch ? '<p>' + esc(ch.desc) + '</p>' : '') + '<p><b>この人の質問：</b>' + (qs.length ? qs.join(' ') : 'まだ') + '</p>';
  overlay('charModal', true);
});
$('chClose').onclick = function () { overlay('charModal', false); };
$('logBtn').onclick = function () { overlay('logModal', true); };
$('logClose').onclick = function () { overlay('logModal', false); };

// ---- ホストのロビー操作 ----
$('seatList').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
  var R = host.room, seat = seatBySid(+b.dataset.sid);
  if (!seat || seat.kind !== 'remote' || R.phase !== 'lobby') return;
  var doRemove = function () {
    var c = host.conns[seat.clientId]; if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
    R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
  };
  if (seat.connected) confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', doRemove); else doRemove();
});
$('npcGrid').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-ch]'); if (!b || !host || host.room.phase !== 'lobby') return;
  var o = host.room.opts, id = b.dataset.ch, k = o.npcs.indexOf(id);
  if (k >= 0) o.npcs.splice(k, 1);
  else { if (host.room.seats.length + o.npcs.length >= MAX_TOTAL) { toast('合計' + MAX_TOTAL + '人までです'); return; } o.npcs.push(id); var c = L.charById(id); if (c) toast(c.e + ' ' + c.name + '「' + pick(c.L.greet) + '」'); }
  if (host.room.seats.length + o.npcs.length < 6) o.follower = false;
  hostBroadcast();
});
function segClick(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b || b.disabled || !host || host.room.phase !== 'lobby') return; fn(b.dataset.v); hostBroadcast(); }); }
segClick('lvSeg', function (v) { host.room.opts.lv = v; });
segClick('roleSeg', function (v) { host.room.opts.myRole = v; });
segClick('diffSeg', function (v) { host.room.opts.diff = v; });
segClick('limitSeg', function (v) { host.room.opts.limit = +v; });
segClick('folSeg', function (v) { host.room.opts.follower = v === 'on'; });
segClick('bgSeg', function (v) { host.room.opts.blackGuess = v === 'on'; });
$('startBtn').onclick = function () { if (host) { unlockAudio(); hostStartGame(); } };
$('againBtn').onclick = function () { if (host && host.room.phase === 'end') { unlockAudio(); hostStartGame(); } };
$('toLobbyBtn').onclick = function () { if (host && host.room.phase === 'end') hostToLobby('ロビーに戻りました'); };
function copyUrl() {
  var u = $('inviteUrl').textContent;
  function legacy() { try { var ta = document.createElement('textarea'); ta.value = u; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, u.length); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
  var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(u) : Promise.reject();
  p.then(function () { toast('招待URLをコピーしました'); }, function () { toast(legacy() ? '招待URLをコピーしました' : 'URLを長押ししてコピーしてください'); });
}
$('copyBtn').onclick = copyUrl;
$('shareBtn').onclick = function () {
  var data = { title: 'しってるっこ', text: 'いっしょに「しってるっこ」で遊ぼう！ 部屋コード ' + $('codeBig').textContent, url: $('inviteUrl').textContent };
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return copyUrl();
  try { navigator.share(data).catch(function (e) { if (!e || e.name !== 'AbortError') copyUrl(); }); } catch (e) { copyUrl(); }
};

// ---- 退出・メニュー ----
function leaveRoom() {
  if (host) {
    var solo = host.room.solo;
    confirmBox(solo ? 'ゲームをやめますか？' : '部屋を閉じますか？', solo ? 'タイトルに戻ります。' : '参加者全員の接続が切れ、ゲームは終了します。', solo ? 'やめる' : '部屋を閉じる', function () {
      Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
      store(LS_HOST, null);
      setTimeout(function () { try { if (host.peer) host.peer.destroy(); } catch (e) {} location.href = location.pathname + location.search.replace(/([?&])room=[^&]*/, '$1'); }, 300);
    });
  } else confirmBox('部屋を出ますか？', 'ゲーム中に出た場合も、同じニックネームで入り直せば元の席に戻れます。', '部屋を出る', function () { sstore(SS_CLIENT, null); leaveClient(true); });
}
$('leaveBtn1').onclick = $('leaveBtn2').onclick = leaveRoom;
$('menuBtn').onclick = function () { overlay('menuModal', true); };
function confirmAbort() {
  confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者・設定はそのままです。', '中断してロビーへ', function () {
    if (host && host.room.phase !== 'lobby') hostToLobby('⏸️ ホストがゲームを中断しました');
  });
}
$('menuAbort').onclick = function () { overlay('menuModal', false); confirmAbort(); };
$('menuReq').onclick = function () { overlay('menuModal', false); if (send({ t: 'lobbyReq' })) toast('ホストに「ロビーに戻りたい」と伝えました'); };
$('menuLeave').onclick = function () { overlay('menuModal', false); leaveRoom(); };
$('menuRules').onclick = function () { overlay('menuModal', false); overlay('rulesModal', true); };
$('menuClose').onclick = function () { overlay('menuModal', false); };
$('lobbyReqBar').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
  if (b.dataset.lr === 'no') { host.room.lobbyReq = null; hostBroadcast(); } else confirmAbort();
});

// ---------------- タイトル ----------------
function renderTitle() {
  if (!$('nameIn').value) $('nameIn').value = load(LS_NAME) || '';
  var inv = normCode(Q.get('room'));
  $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none';
  $('invCode').textContent = inv;
  if (inv.length === 4) $('codeIn').value = inv;
  var saved = load(LS_HOST, true), ok = saved && saved.room && Date.now() - saved.saved < 12 * 3600 * 1000;
  $('resumeBtn').style.display = ok ? '' : 'none';
  if (ok) $('resumeBtn').textContent = saved.room.solo ? '前回のひとり用の部屋を再開する' : '前回の部屋（' + saved.room.code + '）を再開する';
  var joined = sload(SS_CLIENT);
  $('rejoinBtn').style.display = joined ? '' : 'none';
  if (joined) $('rejoinBtn').textContent = '部屋 ' + joined.code + ' に戻る（' + joined.name + '）';
}
function getName(optional) {
  var n = cleanName($('nameIn').value);
  if (!n) { if (optional) return 'あなた'; toast('ニックネームを入力してください'); $('nameIn').focus(); return null; }
  if (NPC_NAMES.indexOf(n) >= 0) { toast('その名前はNPCが使っています'); return null; }
  store(LS_NAME, n); return n;
}
$('createBtn').onclick = function () { var n = getName(); if (n) { unlockAudio(); store(LS_HOST, null); startHost(n, null, false); } };
$('soloBtn').onclick = function () { var n = getName(true); if (!n) return; unlockAudio(); store(LS_HOST, null); startHost(n, null, true); };
$('resumeBtn').onclick = function () {
  var saved = load(LS_HOST, true); if (!saved) return; unlockAudio();
  startHost(saved.room.seats[0].name, saved.room, saved.room.solo); host.resuming = true;
};
function join(code) {
  var n = getName(); if (!n) return;
  code = normCode(code);
  if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; }
  unlockAudio(); startClient(code, n);
}
$('joinBtn').onclick = function () { join($('codeIn').value); };
$('joinInvitedBtn').onclick = function () { join(Q.get('room')); };
$('rejoinBtn').onclick = function () { var j = sload(SS_CLIENT); if (j) { $('nameIn').value = j.name; unlockAudio(); startClient(j.code, j.name); } };
$('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });
if (location.protocol === 'file:') setTimeout(function () { toast('ファイルを直接開いています。招待URLは公開URL（https）でのみ使えます。'); }, 500);

// ---- iPhone のキーボード：見えている範囲（visualViewport）にゲーム画面を合わせる ----
function vvUpdate() {
  var vv = window.visualViewport, root = document.documentElement;
  if (!vv) return;
  var h = Math.round(vv.height), top = Math.round(vv.offsetTop);
  var typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && document.body.classList.contains('in-game');
  var kb = typing && (window.innerHeight - h > 120);
  root.style.setProperty('--vvh', kb ? h + 'px' : '100%');
  root.style.setProperty('--vvtop', kb ? top + 'px' : '0px');
  document.body.classList.toggle('kb', kb);
  if (kb) { var lg = $('log'); lg.scrollTop = lg.scrollHeight; }
  if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
}
if (window.visualViewport) { visualViewport.addEventListener('resize', vvUpdate); visualViewport.addEventListener('scroll', vvUpdate); }
document.addEventListener('focusin', function () { setTimeout(vvUpdate, 60); setTimeout(vvUpdate, 350); });
document.addEventListener('focusout', function () { setTimeout(vvUpdate, 60); setTimeout(vvUpdate, 350); });
window.addEventListener('scroll', function () { if (window.scrollY && document.body.classList.contains('in-game')) window.scrollTo(0, 0); });

// ---- ページ全体の引っぱり（バウンス・プルで閉じる・プルで再読み込み）とピンチを止める ----
var touch0 = null;
document.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (!e.cancelable) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  if (!touch0) return;
  var t = e.touches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return;
  for (var el = e.target; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
    var cs = getComputedStyle(el);
    var canV = ay >= ax * 0.5 && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1));
    var canH = ax >= ay * 0.5 && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1));
    if (canV || canH) return;
  }
  e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

// テスト用：自動で進める（window.__sk.autoplay = true）
var autoAt = 0, AUTOQ = ['それは生き物？', '食べもの？', '手より大きい？', '家の中にある？', '機械？', '赤い？', '動物？', '乗り物？', '外で使う？', '丸い？'];
setInterval(function () {
  var v = lastView; if (!window.__sk.autoplay || !v || v.phase !== 'game' || !v.g) return;
  var g = v.g, me = g.me, now = Date.now(); if (now - autoAt < (TURBO ? 150 : 900)) return;
  if (g.phase === 'night' && g.eyes === 'open' && g.role === 'master') { autoAt = now; act('masterOk'); }
  else if (g.phase === 'qa' && g.toAnswer) { autoAt = now; act('answer', { qid: g.toAnswer.qid, ans: g.toAnswer.hint ? (g.toAnswer.hint.ans === 'correct' ? 'y' : g.toAnswer.hint.ans) : 'u' }); }
  else if (g.phase === 'qa' && me !== g.master && me >= 0 && !(g.pend || []).some(function (e) { return e.p === me; }) && now - autoAt > (TURBO ? 400 : 4000)) { autoAt = now; act('ask', AUTOQ[(g.qn[me] || 0) % AUTOQ.length]); }
  else if (g.phase === 'v1' && g.v1 && g.v1.voters.indexOf(me) >= 0 && g.v1.mine == null) { autoAt = now; act('vote1', false); }
  else if (g.phase === 'v2' && g.v2 && g.v2.mine == null && g.v2.cands.length) { autoAt = now; act('vote2', g.v2.cands[0]); }
  else if (g.phase === 'tie' && g.guesser === me) { autoAt = now; act('tie', g.v2.tops[0]); }
  else if (host && (g.phase === 'talk' || g.phase === 'deal')) { autoAt = now; act('skip'); }
}, 60);
renderTitle();

// ---- ひろばの「みんなの部屋」：同じメンバーで自動入室＋ホストは「つぎのゲーム」 ----
if (PARTY) {
  FuuParty.init({ game: 'shitterukko',
    isHost: function () { return !!host && !host.room.solo; },
    canSwitch: function () { return !host || host.room.phase === 'lobby' || host.room.phase === 'end'; },
    broadcast: function (m) { if (host) Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send(m); } catch (e) {} }); } });
  FuuParty.status = function () { return host ? { host: 1, n: Object.keys(host.conns).filter(function (k) { return host.conns[k].open; }).length } : { host: 0, joined: !!(client && client.everJoined) }; };
  $('nameIn').value = cleanName(PARTY.name) || 'ななし';
  setTimeout(function () {
    if (PARTY.host) { store(LS_HOST, null); startHost(cleanName(PARTY.name) || 'ホスト', null, false); }
    else startClient(PARTY.code, cleanName(PARTY.name) || 'ななし');
  }, 50);
}
