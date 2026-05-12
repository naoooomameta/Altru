/* ════════════════════════════════════════════════════════════════
   Altru — Plan Selector & Schedule Recommender + 先行登録フォーム
   ────────────────────────────────────────────────────────────────
   独立JS。即時関数で包んでグローバル名前空間を汚しません。

   設定箇所:
     - LINE_ADD_URL: LINE友だち追加URL（要書き換え）
     - WEBHOOK_URL : メアドを送信するエンドポイント（任意）

   外部公開API:
     window.AltruForm.getData()  // 現在の入力データを取得
     window.AltruForm.reset()    // フォームを初期状態に戻す

   発火イベント (window.dataLayer がある場合):
     - altru_form_plan_selected   { plan }
     - altru_form_schedule_shown  { plan, date, occasion, relation }
     - altru_form_line_clicked    { plan, date, occasion, relation }
   ════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────
     ⚙ CONFIG — 必ず本番のURLに差し替え
     ───────────────────────────────── */
  // TODO: 本番LINE友だち追加URLに書き換えること
  const LINE_ADD_URL = 'https://lin.ee/YOUR_LINE_ID'; // ← LINE公式アカウント友だち追加URL
  const WEBHOOK_URL  = '';                              // ← メアドPOST先（空ならスキップ）
  const STORAGE_KEY  = 'altru_form_data';               // localStorage キー

  /* ─────────────────────────────────
     プラン定義
     ───────────────────────────────── */
  const PLANS = {
    monthly: {
      name: 'Altru Monthly',
      interval: 1, count: 12, per: 5000, annual: 60000, monthly: 5000,
      philosophy: '「特別な日」を待たなくていい。<em>日常そのもの</em>を、少しだけ特別にするプラン。毎月、あの人の暮らしに花がある——その積み重ねが、二人の関係を静かに、確かに変えていきます。',
    },
    seasonal: {
      name: 'Altru Seasonal',
      interval: 3, count: 4, per: 6000, annual: 24000, monthly: 2000,
      philosophy: '3ヶ月に一度という、<em>ちょうどいい間隔</em>。春夏秋冬の便りとともに、季節の移ろいを花と一緒に感じてもらう。日常の中に、四季を運ぶ豊かさを。',
    },
    halfyear: {
      name: 'Altru Half Year',
      interval: 6, count: 2, per: 8000, annual: 16000, monthly: 1333,
      philosophy: '半年に一度——<em>"特別感"と"続けやすさ"</em>のもっともバランスの取れた頻度。大切な日に確実に届け、その半年後に"何でもない日"のサプライズを添える。最も多くの方が、このリズムを選びます。',
    },
    anniversary: {
      name: 'Altru Anniversary',
      interval: 12, count: 1, per: 12000, annual: 12000, monthly: 1000,
      philosophy: '一年に一度だからこそ、<em>絶対に忘れたくない日</em>に。4プランの中で最もボリュームのあるプレミアムブーケを、最大の特別感とともにお届けします。',
    },
  };

  /* ─────────────────────────────────
     STATE
     ───────────────────────────────── */
  const state = {
    plan: null,
    anchorDate: null,
    occasion: '',
    relation: null,
    currentPanel: 1,
    schedule: [],
  };

  /* ─────────────────────────────────
     ROOT
     ───────────────────────────────── */
  const root = document.getElementById('altru-form');
  if (!root) {
    console.warn('[altru-form] #altru-form not found in DOM');
    return;
  }

  const $  = (sel) => root.querySelector(sel);
  const $$ = (sel) => Array.from(root.querySelectorAll(sel));

  /* ─────────────────────────────────
     PANEL TRANSITION
     ───────────────────────────────── */
  function goToPanel(n) {
    $$('.altru-form__panel').forEach((p) => p.classList.remove('active'));
    const target = root.querySelector('[data-panel="' + n + '"]');
    if (!target) return;
    target.classList.add('active');
    state.currentPanel = n;

    // ステッパー更新
    $$('.altru-form__stepper .step-dot').forEach((dot) => {
      const step = parseInt(dot.dataset.step, 10);
      dot.classList.remove('active', 'done');
      if (step < n) dot.classList.add('done');
      else if (step === n) dot.classList.add('active');
    });
    $$('.altru-form__stepper .step-label').forEach((lbl) => {
      const step = parseInt(lbl.dataset.step, 10);
      lbl.classList.toggle('active', step === n);
    });

    // スクロール
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ─────────────────────────────────
     PLAN SELECTION
     ───────────────────────────────── */
  $$('.plan-card').forEach((card) => {
    card.addEventListener('click', () => {
      $$('.plan-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state.plan = card.dataset.plan;
      pushEvent('altru_form_plan_selected', { plan: state.plan });

      // 選択した瞬間に次パネルへ遷移（350ms は選択フィードバックを見せるための遅延）
      $('#afStripName').textContent  = PLANS[state.plan].name;
      $('#afStripPrice').textContent = '¥' + PLANS[state.plan].per.toLocaleString() + ' / 回';
      setTimeout(() => goToPanel(2), 350);
    });
  });

  /* ─────────────────────────────────
     OCCASION CHIPS
     ───────────────────────────────── */
  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      $('#afOccasion').value = chip.dataset.occasion;
      checkStep2();
    });
  });

  /* ─────────────────────────────────
     RELATION
     ───────────────────────────────── */
  $$('.rel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.rel-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.relation = btn.dataset.rel;
      checkStep2();
    });
  });

  /* ─────────────────────────────────
     DATE / OCCASION INPUT
     ───────────────────────────────── */
  $('#afDate').addEventListener('change', function () {
    const selected = new Date(this.value);
    const minD     = new Date($('#afDate').min);
    selected.setHours(0, 0, 0, 0);
    minD.setHours(0, 0, 0, 0);
    const hintEl = $('#afDateHint');
    const errEl  = $('#afDateError');
    if (this.value && selected < minD) {
      hintEl.style.display = 'none';
      errEl.style.display  = 'flex';
      this.value = '';
      $('[data-action="next-2"]').disabled = true;
    } else {
      hintEl.style.display = 'flex';
      errEl.style.display  = 'none';
    }
    checkStep2();
  });

  $('#afOccasion').addEventListener('input', () => {
    $$('.chip').forEach((c) => c.classList.remove('active'));
    checkStep2();
  });

  function checkStep2() {
    // Occasion は任意項目 — Date と Recipient が揃えば次へ進める
    const date = $('#afDate').value;
    $('[data-action="next-2"]').disabled = !(date && state.relation);
  }

  /* ─────────────────────────────────
     NAVIGATION BUTTONS
     ───────────────────────────────── */
  root.addEventListener('click', (e) => {
    // スケジュール行の日付編集
    const editBtn = e.target.closest('.schedule__edit-btn');
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.rowIndex, 10);
      const rowEl = editBtn.closest('.schedule__row');
      if (rowEl) openRowEditor(idx, rowEl);
      return;
    }

    const action = e.target.dataset.action;
    if (!action) return;

    switch (action) {
      case 'change-plan':
      case 'back-2':
        goToPanel(1);
        break;

      case 'next-2':
        state.anchorDate = $('#afDate').value;
        state.occasion   = $('#afOccasion').value.trim();
        renderResult();
        pushEvent('altru_form_schedule_shown', {
          plan: state.plan, date: state.anchorDate,
          occasion: state.occasion, relation: state.relation,
        });
        goToPanel(3);
        break;

      case 'back-3':
        goToPanel(2);
        break;

      case 'confirm':
        // 診断データを hidden に保存
        $('#afDataPlan').value     = state.plan;
        $('#afDataDate').value     = state.anchorDate;
        $('#afDataOccasion').value = state.occasion;
        $('#afDataRelation').value = state.relation;
        renderBridgePill();
        goToPanel(4);
        break;

      case 'back-4':
        goToPanel(3);
        break;

      case 'line-add':
        handleLineAdd();
        break;
    }
  });

  /* ─────────────────────────────────
     LINE ADD
     ───────────────────────────────── */
  function handleLineAdd() {
    // localStorage 保存（LIFFアプリ等の後続処理用）
    saveToStorage();

    // Webhook 送信（設定されていれば）— LINE クリック時に診断データを送る
    if (WEBHOOK_URL) {
      try {
        fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getData()),
          keepalive: true,
        }).catch((err) => console.warn('[altru-form] webhook failed', err));
      } catch (_) {}
    }

    pushEvent('altru_form_line_clicked', getData());

    // 別タブで LINE 友だち追加を開く
    window.open(LINE_ADD_URL, '_blank', 'noopener');

    // 完了画面へ
    renderBridgePill();
    setTimeout(() => goToPanel(5), 600);
  }

  /* ─────────────────────────────────
     SCHEDULE LOGIC
     ───────────────────────────────── */
  function getSeason(d) {
    const m = d.getMonth() + 1;
    if (m >= 3 && m <= 5)  return { name: '春', en: 'Spring', flowers: '桜・チューリップ・ラナンキュラス' };
    if (m >= 6 && m <= 8)  return { name: '夏', en: 'Summer', flowers: 'ひまわり・トルコキキョウ・紫陽花' };
    if (m >= 9 && m <= 11) return { name: '秋', en: 'Autumn', flowers: 'ダリア・コスモス・ケイトウ' };
    return { name: '冬', en: 'Winter', flowers: 'アネモネ・ラナンキュラス・白椿' };
  }

  function getEverydayLabel(month) {
    const labels = {
      1: '新年の挨拶として', 2: '春の予感を',     3: '春のはじまりに',
      4: '新緑の季節に',     5: '初夏の便り',     6: '梅雨の合間に',
      7: '夏の盛りに',       8: '盆休みの帰省に', 9: '実りの秋に',
      10: '秋の深まりに',   11: '冬支度の前に',  12: '年の終わりに',
    };
    return labels[month] || (month + '月のお届け');
  }

  function calcAnchorDelivery(anchor, occasion) {
    const d = new Date(anchor);
    if (/母の日|父の日/.test(occasion)) d.setDate(d.getDate() - 1);
    else d.setDate(d.getDate() - 2);
    return d;
  }

  function offsetMonths(d, m) {
    const r = new Date(d);
    r.setMonth(r.getMonth() + m);
    return r;
  }

  function calcSchedule(plan, dateStr, occasion) {
    const first = calcAnchorDelivery(new Date(dateStr), occasion);
    const anchorLabel = occasion || '大切な日';
    const arr = [];
    if (plan === 'anniversary') {
      arr.push({ date: first, label: anchorLabel, sub: 'プレミアムブーケ', type: 'anchor' });
    } else if (plan === 'halfyear') {
      arr.push({ date: first, label: anchorLabel, sub: '記念日のお届け', type: 'anchor' });
      const second = offsetMonths(first, 6);
      arr.push({ date: second, label: '何でもない日に', sub: getEverydayLabel(second.getMonth() + 1), type: 'routine' });
    } else if (plan === 'seasonal') {
      for (let i = 0; i < 4; i++) {
        const d = offsetMonths(first, i * 3);
        const s = getSeason(d);
        arr.push({
          date: d,
          label: i === 0 ? anchorLabel : s.name + 'のお届け',
          sub:   i === 0 ? '記念日のお届け' : s.flowers,
          type:  i === 0 ? 'anchor' : 'season',
        });
      }
    } else if (plan === 'monthly') {
      for (let i = 0; i < 12; i++) {
        const d = offsetMonths(first, i);
        const s = getSeason(d);
        arr.push({
          date: d,
          label: i === 0 ? anchorLabel : getEverydayLabel(d.getMonth() + 1),
          sub:   i === 0 ? '記念日のお届け（特別仕様）' : s.flowers,
          type:  i === 0 ? 'anchor' : 'routine',
        });
      }
    }
    return arr;
  }

  function fmtDate(d) {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const wj  = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    const we  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    return '<span class="y">' + y + '</span>' + m + ' / ' + day +
           ' <span class="week">' + wj + ' · ' + we + '</span>';
  }

  /* ─────────────────────────────────
     RESULT RENDER
     ───────────────────────────────── */
  function renderResult() {
    const plan     = PLANS[state.plan];
    const schedule = calcSchedule(state.plan, state.anchorDate, state.occasion);
    state.schedule = schedule;

    $('#afResultPlanName').textContent = plan.name;

    const anchor = new Date(state.anchorDate);
    const occasionLabel = state.occasion || '大切な日';
    $('#afResultContext').innerHTML =
      'Anchor Date: <b>' + anchor.getFullYear() + '年' + (anchor.getMonth() + 1) + '月' +
      anchor.getDate() + '日 — ' + occasionLabel + '</b>（' + state.relation + '）<br>' +
      'この日を起点に、Altruが ' + plan.count + '回 のお届けを設計しました。';

    $('#afPhilosophyText').innerHTML  = plan.philosophy;
    $('#afSumCount').textContent      = plan.count + '回';
    $('#afSumPer').textContent        = '¥' + plan.per.toLocaleString();
    $('#afSumAnnual').textContent     = '¥' + plan.annual.toLocaleString();
    $('#afSumMonthly').textContent    = '¥' + plan.monthly.toLocaleString();

    renderTimeline(schedule);
    renderSeasonAccent();
  }

  function renderTimeline(sched) {
    const wrap = $('#afSchedule');
    wrap.innerHTML = '';

    const sectionTitles = {
      anniversary: 'Annual Delivery — 年に一度の特別',
      halfyear:    'Bi-Annual Delivery — 半年に一度のリズム',
      seasonal:    'Quarterly Delivery — 四季のリズム',
      monthly:     'Monthly Delivery — 毎月のリズム',
    };
    const t = document.createElement('div');
    t.className = 'schedule__section-title';
    t.textContent = sectionTitles[state.plan];
    wrap.appendChild(t);

    let display = sched;
    let hidden  = [];
    if (state.plan === 'monthly') {
      display = sched.slice(0, 6);
      hidden  = sched.slice(6);
    }
    display.forEach((it, i) => wrap.appendChild(makeRow(it, i)));

    if (hidden.length > 0) {
      const toggle = document.createElement('div');
      toggle.className = 'schedule__collapse';
      toggle.innerHTML = '▼ 残り ' + hidden.length + '回 を表示（年12回すべて）';
      wrap.appendChild(toggle);
      const hw = document.createElement('div');
      hw.style.display = 'none';
      hidden.forEach((it, i) => hw.appendChild(makeRow(it, i + 6)));
      wrap.appendChild(hw);
      toggle.addEventListener('click', () => {
        if (hw.style.display === 'none') {
          hw.style.display = 'block';
          toggle.innerHTML = '▲ 残りを閉じる';
        } else {
          hw.style.display = 'none';
          toggle.innerHTML = '▼ 残り ' + hidden.length + '回 を表示（年12回すべて）';
        }
      });
    }

    // リードタイムのフットノート
    const note = document.createElement('div');
    note.className = 'schedule__note';
    note.innerHTML =
      '<span class="note-mark">✦</span><span>鮮度を保つため、各お届けは記念日の<b>1〜2日前</b>に到着するよう設計しています。お申込みから<b>最短2日後</b>からの配送に対応しています。</span>';
    wrap.appendChild(note);

    // 2回目以降の変更可否の案内（複数回お届けプランのみ）
    if (sched.length > 1) {
      const flexNote = document.createElement('div');
      flexNote.className = 'schedule__note';
      flexNote.innerHTML =
        '<span class="note-mark">✦</span><span><b>2回目以降のお届け</b>は、配送日の<b>2日前</b>までであれば花の内容やお届け日を自由に変更できます。気分や予定に合わせて、後から調整可能です。</span>';
      wrap.appendChild(flexNote);
    }
  }

  function makeRow(it, i) {
    const row = document.createElement('div');
    row.className = 'schedule__row' + (it.type === 'anchor' ? ' highlight' : '');
    row.dataset.rowIndex = i;
    let tag = '';
    if (it.type === 'anchor')       tag = '<span class="schedule__tag anchor">Anchor</span>';
    else if (it.type === 'season')  tag = '<span class="schedule__tag season">Season</span>';
    else                            tag = '<span class="schedule__tag routine">Routine</span>';
    // Anchor 以外は変更ボタンを付ける
    const editBtn = it.type !== 'anchor'
      ? '<button class="schedule__edit-btn" type="button" data-row-index="' + i + '">変更</button>'
      : '';
    row.innerHTML =
      '<div class="schedule__num">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div>' +
        '<div class="schedule__date">' + fmtDate(it.date) + editBtn + '</div>' +
        '<div class="schedule__meta">' + it.label + ' <span class="sub">— ' + it.sub + '</span></div>' +
      '</div>' +
      '<div>' + tag + '</div>';
    return row;
  }

  /* ─────────────────────────────────
     SCHEDULE ROW DATE EDIT
     ───────────────────────────────── */
  function openRowEditor(idx, rowEl) {
    const it = state.schedule[idx];
    if (!it || it.type === 'anchor') return;
    const dateEl = rowEl.querySelector('.schedule__date');
    const metaEl = rowEl.querySelector('.schedule__meta');
    const current = it.date;
    const ymd =
      current.getFullYear() + '-' +
      String(current.getMonth() + 1).padStart(2, '0') + '-' +
      String(current.getDate()).padStart(2, '0');
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'schedule__date-input';
    input.value = ymd;
    input.min = $('#afDate').min;
    dateEl.innerHTML = '';
    dateEl.appendChild(input);
    try { input.focus(); } catch (_) {}

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      if (input.value) {
        const newDate = new Date(input.value);
        if (!isNaN(newDate.getTime())) {
          it.date = newDate;
          // season 行は季節の花を、routine 行は月のラベルを再計算
          if (it.type === 'season') {
            it.sub = getSeason(newDate).flowers;
            it.label = getSeason(newDate).name + 'のお届け';
          } else if (it.type === 'routine') {
            it.sub = getEverydayLabel(newDate.getMonth() + 1);
          }
        }
      }
      dateEl.innerHTML =
        fmtDate(it.date) +
        '<button class="schedule__edit-btn" type="button" data-row-index="' + idx + '">変更</button>';
      if (metaEl) {
        metaEl.innerHTML = it.label + ' <span class="sub">— ' + it.sub + '</span>';
      }
    };

    input.addEventListener('change', commit);
    input.addEventListener('blur', () => setTimeout(commit, 150));
  }

  function renderSeasonAccent() {
    const el = $('#afSeasonAccent');
    const titleEl = $('#afSeasonTitle');
    const textEl  = $('#afSeasonText');
    if (state.plan === 'seasonal') {
      el.style.display = 'block';
      titleEl.textContent = '— 四季それぞれの便り';
      textEl.innerHTML = '春は桜やチューリップ、夏はひまわりや紫陽花、秋はダリアやコスモス、冬はアネモネや白椿。<br>その時期にしか出会えない花を、フローリストが一束ずつ仕立てます。';
    } else if (state.plan === 'monthly') {
      el.style.display = 'block';
      titleEl.textContent = '— 12ヶ月の花の旅';
      textEl.innerHTML = '毎月、その月にしか出会えない花を。記念日の月だけは特別仕様のプレミアムブーケに格上げします。';
    } else {
      el.style.display = 'none';
    }
  }


  /* ─────────────────────────────────
     BRIDGE PILL (診断結果の要約)
     ───────────────────────────────── */
  function renderBridgePill() {
    if (!state.plan || !state.anchorDate) return;
    const plan = PLANS[state.plan];
    const anchor = new Date(state.anchorDate);
    const anchorStr = (anchor.getMonth() + 1) + '/' + anchor.getDate();
    const occasionLabel = state.occasion ? ' ' + state.occasion : '';
    const html =
      '<b>' + plan.name + '</b><span class="sep">|</span>' +
      '<b>' + state.relation + '</b>へ<span class="sep">|</span>' +
      '<b>' + anchorStr + occasionLabel + '</b> 起点';

    const targets = ['#afBridgePill', '#afBridgePillFinal'];
    targets.forEach((id) => {
      const el = root.querySelector(id);
      if (el) el.innerHTML = html;
    });
  }

  /* ─────────────────────────────────
     DATA UTILITIES
     ───────────────────────────────── */
  function getData() {
    return {
      plan:     state.plan,
      date:     state.anchorDate,
      occasion: state.occasion,
      relation: state.relation,
    };
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getData()));
    } catch (_) {}
  }

  function pushEvent(name, data) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push(Object.assign({ event: name }, data));
      }
    } catch (_) {}
  }

  /* ─────────────────────────────────
     PUBLIC API
     ───────────────────────────────── */
  window.AltruForm = {
    getData: getData,
    reset: function () {
      state.plan = null; state.anchorDate = null; state.occasion = '';
      state.relation = null;
      $$('.plan-card').forEach((c) => c.classList.remove('selected'));
      $$('.chip').forEach((c) => c.classList.remove('active'));
      $$('.rel-btn').forEach((b) => b.classList.remove('active'));
      $('#afDate').value = '';
      $('#afOccasion').value = '';
      $('[data-action="next-2"]').disabled = true;
      goToPanel(1);
    },
  };

  /* ─────────────────────────────────
     INIT — 配送リードタイム2日後を最小日付に
     ───────────────────────────────── */
  (function init() {
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 2);
    const minStr =
      minDate.getFullYear() + '-' +
      String(minDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(minDate.getDate()).padStart(2, '0');
    $('#afDate').min = minStr;
  })();

})();
