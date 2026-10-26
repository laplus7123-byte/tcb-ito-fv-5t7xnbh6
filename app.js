(() => {
  const R = window.REVIEW;
  const LOCAL_KEY = "tcbfv-review-items";
  const NAME_KEY = "tcbfv-review-name";
  const VIEW_KEY = "tcbfv-review-view";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pat = (id) => R.patterns.find((p) => p.id === id);
  const sec = (id) => R.sections.find((s) => s.id === id);
  const ques = (id) => R.questions.find((q) => q.id === id);

  const view = Object.assign({ tab: "compare", page: "p1", shown: R.patterns.map((p) => p.id), size: window.innerWidth >= 1100 ? "s" : "m", hideDeleted: false, onlyOpen: true },
    JSON.parse(localStorage.getItem(VIEW_KEY) || "{}"));
  const saveView = () => localStorage.setItem(VIEW_KEY, JSON.stringify(view));

  // ---------- 保存 ----------
  const Store = {
    mode: "local",
    items: [],
    async init() {
      if (R.comments === false) { this.mode = "off"; return; }
      try {
        const r = await fetch("api.php", { cache: "no-store" });
        const j = await r.json();
        if (j && j.ok) { this.mode = "server"; this.items = j.items || []; return; }
      } catch (e) { /* サーバーなし */ }
      this.mode = "local";
      this.items = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    },
    saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.items)); },
    async refresh() {
      if (this.mode !== "server") return false;
      try {
        const r = await fetch("api.php", { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) return false;
        const changed = JSON.stringify(j.items) !== JSON.stringify(this.items);
        this.items = j.items;
        return changed;
      } catch (e) { return false; }
    },
    async add(item) {
      if (this.mode === "server") {
        const r = await fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: "add", item }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "save failed");
        this.items.push(j.item);
        return j.item;
      }
      const it = Object.assign({ id: Math.random().toString(16).slice(2, 14), ts: Date.now(), text: "", value: "", resolved: false }, item);
      this.items.push(it);
      this.saveLocal();
      return it;
    },
    async update(id, op, extra = {}) {
      if (this.mode === "server") {
        const r = await fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ a: "update", id, op, author: myName() }, extra)) });
        const j = await r.json();
        if (!j.ok) throw new Error("update failed");
      }
      const i = this.items.findIndex((x) => x.id === id);
      if (i < 0) return;
      if (op === "resolve") this.items[i].resolved = !!extra.resolved;
      if (op === "delete") this.items.splice(i, 1);
      if (this.mode === "local") this.saveLocal();
    },
    comments(target) { return this.items.filter((x) => x.kind === "comment" && x.target === target).sort((a, b) => a.ts - b.ts); },
    // 同じ人の最新の選択だけを有効にする
    states(target) {
      const latest = {};
      this.items.filter((x) => x.kind === "state" && x.target === target).sort((a, b) => a.ts - b.ts).forEach((x) => { latest[x.author] = x.value; });
      return Object.entries(latest).filter(([, v]) => v).map(([author, value]) => ({ author, value }));
    }
  };

  const myName = () => ($("#myName").value || "").trim();
  const toast = (msg) => {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2400);
  };
  const needName = () => {
    if (myName()) return false;
    toast("先に右上（スマホは上）にお名前を入れてください");
    $("#myName").focus();
    return true;
  };
  const fmt = (ts) => {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // ---------- 対象の名前 ----------
  function targetLabel(t) {
    const [kind, a, b] = t.split(":");
    if (t === "general") return "全体へのコメント";
    if (kind === "pat" || kind === "vote") { const p = pat(a); return `${p.no} ${p.name}`; }
    if (kind === "sec" || kind === "dec") { const p = pat(a); const s = sec(b); return `${p.no} ${p.name}／${s.id === "fv" ? "FV" : s.name}`; }
    if (kind === "q" || kind === "qa") return `確認：${ques(a).title}`;
    return t;
  }
  function targetLink(t) {
    const [kind, a] = t.split(":");
    if (kind === "pat") return { tab: "compare" };
    if (kind === "sec") return { tab: "page", page: a, anchor: `row-${t.split(":")[2]}` };
    if (kind === "q") return { tab: "questions", anchor: `q-${a}` };
    return { tab: "questions" };
  }

  // ---------- コメントなし（見る用）の場合 ----------
  const OFF = () => Store.mode === "off";
  const pageFile = (id) => `pages/${id === "p0" ? "current" : id}.html`;

  // ---------- 部品：コメント欄 ----------
  function threadHTML(target) {
    if (OFF()) return "";
    return `<div class="thread" data-target="${esc(target)}"></div>`;
  }
  function mountThreads(root = document) {
    $$(".thread[data-target]", root).forEach((el) => {
      if (el.dataset.mounted) return;
      el.dataset.mounted = "1";
      el.innerHTML = `
        <div class="thread__list"></div>
        <form class="thread__form">
          <textarea placeholder="コメントを書く（Ctrl/⌘＋Enterで送信）" aria-label="コメント"></textarea>
          <button class="btn" type="submit">送信</button>
        </form>`;
      const form = $("form", el);
      const ta = $("textarea", el);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text || needName()) return;
        const btn = $("button", form);
        btn.disabled = true;
        try {
          await Store.add({ kind: "comment", target: el.dataset.target, author: myName(), text });
          ta.value = "";
          refreshAll();
        } catch (err) {
          toast("保存できませんでした。時間をおいてもう一度お試しください");
        }
        btn.disabled = false;
      });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.requestSubmit();
      });
    });
    refreshThreads(root);
  }
  function commentHTML(c, withTarget = false) {
    const mine = c.author === myName();
    return `<div class="cmt ${c.resolved ? "is-resolved" : ""}" data-id="${esc(c.id)}">
      ${withTarget ? `<button class="all-item__target" data-goto="${esc(c.target)}">${esc(targetLabel(c.target))}</button>` : ""}
      <div class="cmt__meta"><b>${esc(c.author)}</b><span>${fmt(c.ts)}</span>${c.resolved ? "<span>解決済み</span>" : ""}
        <span class="cmt__act">
          <button type="button" data-act="resolve">${c.resolved ? "未解決に戻す" : "解決済みにする"}</button>
          ${mine ? '<button type="button" data-act="delete">削除</button>' : ""}
        </span>
      </div>
      <p class="cmt__text">${esc(c.text)}</p>
    </div>`;
  }
  function refreshThreads(root = document) {
    $$(".thread[data-mounted]", root).forEach((el) => {
      $(".thread__list", el).innerHTML = Store.comments(el.dataset.target).map((c) => commentHTML(c)).join("");
    });
  }
  document.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const id = act.closest(".cmt").dataset.id;
    const item = Store.items.find((x) => x.id === id);
    if (!item) return;
    try {
      if (act.dataset.act === "resolve") await Store.update(id, "resolve", { resolved: !item.resolved });
      if (act.dataset.act === "delete") {
        if (!confirm("このコメントを削除しますか？")) return;
        await Store.update(id, "delete");
      }
      refreshAll();
    } catch (err) { toast("更新できませんでした"); }
  });

  // ---------- 部品：選択ボタン（評価・判断・回答） ----------
  function choiceHTML(target, options) {
    if (OFF()) {
      return target.startsWith("qa:") ? `<ul class="opt-list">${options.map((o) => `<li>${esc(o.label)}</li>`).join("")}</ul>` : "";
    }
    return `<div class="choice" data-state="${esc(target)}">
      <div class="vote-row">${options.map((o) => `<button type="button" class="vote" data-value="${esc(o.v)}">${esc(o.label)}</button>`).join("")}</div>
      <p class="vote-tally"></p>
    </div>`;
  }
  function refreshChoices(root = document) {
    $$(".choice[data-state]", root).forEach((el) => {
      const st = Store.states(el.dataset.state);
      const mine = st.find((x) => x.author === myName());
      $$(".vote", el).forEach((b) => b.setAttribute("aria-pressed", String(!!mine && mine.value === b.dataset.value)));
      const labels = {};
      $$(".vote", el).forEach((b) => { labels[b.dataset.value] = b.textContent; });
      $(".vote-tally", el).textContent = st.length ? st.map((x) => `${x.author}：${labels[x.value] || x.value}`).join("　") : "まだ選択はありません";
    });
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(".choice .vote");
    if (!b || needName()) return;
    const el = b.closest(".choice");
    const mine = Store.states(el.dataset.state).find((x) => x.author === myName());
    const value = mine && mine.value === b.dataset.value ? "" : b.dataset.value;
    try {
      await Store.add({ kind: "state", target: el.dataset.state, author: myName(), value });
      refreshAll();
    } catch (err) { toast("保存できませんでした"); }
  });

  // ---------- 拡大表示 ----------
  const LB = { list: [], i: 0 };
  function openLightbox(list, i) {
    LB.list = list;
    LB.i = i;
    showLightbox();
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function showLightbox() {
    const it = LB.list[LB.i];
    $("#lightbox img").src = it.src;
    $("#lightbox img").alt = it.cap;
    $("#lightbox figcaption").textContent = it.cap;
    $$("#lightbox .lightbox__nav").forEach((b) => { b.style.visibility = LB.list.length > 1 ? "visible" : "hidden"; });
  }
  function closeLightbox() { $("#lightbox").hidden = true; document.body.style.overflow = ""; }
  $("#lightbox .prev").addEventListener("click", () => { LB.i = (LB.i - 1 + LB.list.length) % LB.list.length; showLightbox(); });
  $("#lightbox .next").addEventListener("click", () => { LB.i = (LB.i + 1) % LB.list.length; showLightbox(); });
  $("#lightbox .lightbox__close").addEventListener("click", closeLightbox);
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox" || e.target.tagName === "FIGURE") closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if ($("#lightbox").hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") $("#lightbox .prev").click();
    if (e.key === "ArrowRight") $("#lightbox .next").click();
  });

  // ---------- タブ1：並べて比較 ----------
  function renderCompare() {
    $("#compareFilter").innerHTML = R.patterns.map((p) =>
      `<button class="chip" data-p="${p.id}" aria-pressed="${view.shown.includes(p.id)}">${esc(p.no === "現行" ? "現行" : `${p.no} ${p.name}`)}</button>`).join("");
    $$(".sizes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.size === view.size)));
    const box = $("#compare");
    box.dataset.size = view.size;
    const list = R.patterns.filter((p) => view.shown.includes(p.id));
    box.innerHTML = list.map((p, i) => `
      <article class="pcol ${p.id === "p0" ? "pcol--current" : ""}">
        <div class="pcol__head">
          <div class="pcol__no">${esc(p.no)}</div>
          <h2 class="pcol__name">${esc(p.name)}</h2>
          <div class="pcol__type">${esc(p.type)}</div>
        </div>
        <div class="pcol__img"><button type="button" data-zoom="${i}"><img src="${esc(p.img)}" alt="${esc(p.no)} ${esc(p.name)}のFV" loading="lazy"></button></div>
        <div class="pcol__votes">${OFF() ? `<a class="page-link" href="${pageFile(p.id)}">全ページを見る</a>` : p.id === "p0" ? '<p class="vote-tally">比較用の現行FV</p>' : choiceHTML(`vote:${p.id}`, R.votes)}</div>
        <p class="pcol__hook">${esc(p.hook)}</p>
        <div class="pcol__more">
          <details><summary>画面の構成</summary><ul>${p.parts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
          ${p.origin ? `<details><summary>移植元（スルリムLPの実績）</summary><p>${esc(p.origin)}</p></details>` : ""}
          <details><summary>実装の想定</summary><p>${esc(p.build)}</p></details>
        </div>
        <div class="pcol__thread">${threadHTML(`pat:${p.id}`)}</div>
      </article>`).join("") || '<p class="empty">表示する案を上で選んでください。</p>';
    box.onclick = (e) => {
      const z = e.target.closest("[data-zoom]");
      if (!z) return;
      openLightbox(list.map((p) => ({ src: p.src || p.img, cap: `${p.no} ${p.name}` })), Number(z.dataset.zoom));
    };
    mountThreads(box);
    refreshChoices(box);
  }
  $("#compareFilter").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const id = c.dataset.p;
    view.shown = view.shown.includes(id) ? view.shown.filter((x) => x !== id) : R.patterns.map((p) => p.id).filter((x) => x === id || view.shown.includes(x));
    saveView();
    renderCompare();
  });
  $(".sizes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]");
    if (!b) return;
    view.size = b.dataset.size;
    saveView();
    renderCompare();
  });

  // ---------- タブ2：ページ全体 ----------
  function renderPage() {
    if (OFF()) {
      $("#tab-page .toolbar").hidden = true;
      $("#pageSummary").innerHTML = `<p>現行と案1〜5のそれぞれで、FVを差し替えた状態のページを最後まで見られます。セクションには番号（現行の順番）と当社案が付いているので、「案2なら3は消す」のように番号で相談できます。各ページの上で「FVだけ差し替え」と「当社案の構成」を切り替えられます。</p>`;
      $("#pageRows").innerHTML = `<div class="hub">${R.patterns.map((p) => {
        const pr = R.proposals[p.id];
        const counts = {};
        pr.order.forEach((sid) => { const s = (pr.items[sid] || {}).s; if (s && s !== "keep" && s !== "swap") counts[s] = (counts[s] || 0) + 1; });
        return `<a class="hub__item" href="${pageFile(p.id)}">
          <img src="${esc(p.img)}" alt="" loading="lazy">
          <span class="hub__body">
            <span class="hub__no">${esc(p.no)}</span>
            <b>${esc(p.id === "p0" ? "現行ページ" : p.name)}</b>
            <span class="hub__sum">${esc(pr.summary)}</span>
            ${Object.keys(counts).length ? `<span class="counts">${Object.entries(counts).map(([s, n]) => `<span class="badge badge--${s}">${esc(R.status[s])} ${n}</span>`).join("")}</span>` : ""}
            <span class="hub__go">全ページを見る</span>
          </span>
        </a>`;
      }).join("")}</div>`;
      return;
    }
    $("#pagePick").innerHTML = R.patterns.map((p) =>
      `<button class="chip" data-p="${p.id}" aria-pressed="${p.id === view.page}">${esc(p.no === "現行" ? "現行" : `${p.no} ${p.name}`)}</button>`).join("");
    $("#hideDeleted").checked = view.hideDeleted;
    const p = pat(view.page);
    const pr = R.proposals[p.id];
    const counts = {};
    pr.order.forEach((sid) => { const s = (pr.items[sid] || {}).s; if (s && s !== "keep") counts[s] = (counts[s] || 0) + 1; });
    $("#pageSummary").innerHTML = `
      <h2>${esc(p.no)} ${esc(p.name)}${p.id === "p0" ? "" : "にした場合のページ構成（当社案）"}</h2>
      <p>${esc(pr.summary)}</p>
      ${Object.keys(counts).length ? `<div class="counts">${Object.entries(counts).map(([s, n]) => `<span class="badge badge--${s}">${esc(R.status[s])} ${n}</span>`).join("")}</div>` : ""}`;

    let pos = 0;
    const rows = pr.order.map((sid) => {
      const s = sec(sid);
      const it = pr.items[sid] || { s: "keep", why: "" };
      const deleted = it.s === "delete";
      if (deleted && view.hideDeleted) return "";
      if (!deleted) pos += 1;
      const img = sid === "fv" && p.id !== "p0" ? p.img : s.img;
      const name = sid === "fv" && p.id !== "p0" ? `FV（${p.no} ${p.name}）` : s.name;
      const isCurrent = p.id === "p0";
      return `
        <div class="prow ${deleted ? "is-deleted" : ""}" id="row-${sid}">
          <div class="prow__shot"><button type="button" data-zoom-sec="${sid}"><img src="${esc(img)}" alt="${esc(name)}" loading="lazy"></button></div>
          <div class="prow__body">
            <div class="prow__pos">${deleted ? "削除する予定の部分" : `上から${pos}番目`}</div>
            <div class="prow__title"><h3>${esc(name)}</h3>${isCurrent ? "" : `<span class="badge badge--${it.s}">${esc(R.status[it.s])}</span>`}</div>
            ${s.note && sid !== "fv" ? `<p class="prow__note">現状：${esc(s.note)}</p>` : ""}
            ${!isCurrent && it.why ? `<div class="prow__why"><b>当社の提案</b>${esc(it.why)}</div>` : ""}
            ${isCurrent || OFF() ? "" : `<div class="prow__decide"><b>このセクションをどうするか</b>${choiceHTML(`dec:${p.id}:${sid}`, R.decisions)}</div>`}
            ${OFF() ? "" : `<div class="prow__thread">${threadHTML(`sec:${p.id}:${sid}`)}</div>`}
          </div>
        </div>`;
    });
    const box = $("#pageRows");
    box.innerHTML = rows.join("");
    box.onclick = (e) => {
      const z = e.target.closest("[data-zoom-sec]");
      if (!z) return;
      const shots = $$(".prow__shot img", box).map((img) => ({ src: img.getAttribute("src"), cap: img.alt }));
      const i = $$("[data-zoom-sec]", box).indexOf(z);
      openLightbox(shots, i);
    };
    mountThreads(box);
    refreshChoices(box);
  }
  $("#pagePick").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    view.page = c.dataset.p;
    saveView();
    renderPage();
  });
  $("#hideDeleted").addEventListener("change", (e) => { view.hideDeleted = e.target.checked; saveView(); renderPage(); });

  // ---------- タブ3：確認したいこと ----------
  function renderQuestions() {
    $("#questionList").innerHTML = R.questions.map((q, i) => `
      <div class="q" id="q-${q.id}">
        <h3>${i + 1}. ${esc(q.title)}</h3>
        <p>${esc(q.body)}</p>
        ${choiceHTML(`qa:${q.id}`, q.options.map((o) => ({ v: o, label: o })))}
        ${threadHTML(`q:${q.id}`)}
      </div>`).join("");
    if (OFF()) $(".q.general").hidden = true;
    mountThreads($("#tab-questions"));
    refreshChoices($("#tab-questions"));
  }

  // ---------- タブ4：一覧 ----------
  function renderAll() {
    if (OFF()) return;
    $("#onlyOpen").checked = view.onlyOpen;
    const list = Store.items.filter((x) => x.kind === "comment" && (!view.onlyOpen || !x.resolved)).sort((a, b) => b.ts - a.ts);
    $("#allList").innerHTML = list.length
      ? list.map((c) => `<div class="all-item">${commentHTML(c, true)}</div>`).join("")
      : `<p class="empty">${view.onlyOpen ? "未解決のコメントはありません。" : "まだコメントはありません。"}</p>`;
    const open = Store.items.filter((x) => x.kind === "comment" && !x.resolved).length;
    $("#unresolvedCount").textContent = open ? String(open) : "";
  }
  $("#onlyOpen").addEventListener("change", (e) => { view.onlyOpen = e.target.checked; saveView(); renderAll(); });
  $("#allList").addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (!g) return;
    const link = targetLink(g.dataset.goto);
    if (link.page) { view.page = link.page; renderPage(); }
    setTab(link.tab);
    if (link.anchor) setTimeout(() => { const el = document.getElementById(link.anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  });

  // ---------- テキスト書き出し ----------
  function exportText() {
    const lines = [];
    const now = new Date();
    const cm = (t) => Store.comments(t).map((c) => `  ・${c.author}（${fmt(c.ts)}）${c.resolved ? "［解決済み］" : ""}：${c.text.replace(/\n/g, " ")}`);
    const st = (t, labels) => Store.states(t).map((x) => `${labels[x.value] || x.value}（${x.author}）`).join("、");
    const vLabels = Object.fromEntries(R.votes.map((v) => [v.v, v.label]));
    const dLabels = Object.fromEntries(R.decisions.map((v) => [v.v, v.label]));
    lines.push(`${R.title} やり取りまとめ（${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}時点）`, "");
    lines.push("■ 5案の評価");
    R.patterns.filter((p) => p.id !== "p0").forEach((p) => {
      lines.push(`${p.no} ${p.name}：${st(`vote:${p.id}`, vLabels) || "未評価"}`);
      lines.push(...cm(`pat:${p.id}`));
    });
    lines.push("", "■ セクションごとの判断");
    R.patterns.forEach((p) => {
      const pr = R.proposals[p.id];
      const rows = [];
      pr.order.forEach((sid) => {
        const it = pr.items[sid];
        const d = st(`dec:${p.id}:${sid}`, dLabels);
        const c = cm(`sec:${p.id}:${sid}`);
        if (!d && !c.length) return;
        rows.push(`${sec(sid).name}（当社案：${it ? R.status[it.s] : "現状"}）${d ? ` → ${d}` : ""}`, ...c);
      });
      if (rows.length) lines.push(`【${p.no} ${p.name}】`, ...rows);
    });
    lines.push("", "■ 確認したいこと");
    R.questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.title}：${Store.states(`qa:${q.id}`).map((x) => `${x.value}（${x.author}）`).join("、") || "未回答"}`);
      lines.push(...cm(`q:${q.id}`));
    });
    const g = cm("general");
    if (g.length) lines.push("", "■ 全体へのコメント", ...g);
    return lines.join("\n");
  }
  $("#copyAll").addEventListener("click", async () => {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました。LINEやメールに貼り付けられます");
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("コピーしました");
    }
  });

  // ---------- タブ切り替え ----------
  function setTab(tab) {
    view.tab = tab;
    saveView();
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $$(".tab-panel").forEach((p) => { p.hidden = p.id !== `tab-${tab}`; });
    window.scrollTo({ top: 0 });
  }
  $(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) setTab(b.dataset.tab);
  });

  function refreshAll() {
    refreshThreads();
    refreshChoices();
    renderAll();
  }

  // ---------- 起動 ----------
  async function start() {
    $("#liveLink").href = R.liveUrl;
    $("#pdfLink").href = R.pdf;
    $("#updated").textContent = `更新 ${R.updated}`;
    const nameInput = $("#myName");
    nameInput.value = localStorage.getItem(NAME_KEY) || "";
    nameInput.addEventListener("change", () => {
      localStorage.setItem(NAME_KEY, myName());
      refreshAll();
    });

    await Store.init();
    const sm = $("#saveMode");
    if (OFF()) {
      $(".top__me").hidden = true;
      $("#pdfLink").hidden = true;
      $('.tabs [data-tab="all"]').hidden = true;
      $('.tabs [data-tab="page"]').textContent = "全ページを見る";
      if (view.tab === "all") view.tab = "compare";
      $("#tab-compare .lead").textContent = "案をタップで出し入れできます。画像を押すと拡大します。各案の「全ページを見る」で、FVを差し替えたページを最後まで確認できます。";
      $("#tab-questions .lead").textContent = "FVを差し替えるにあたって、先に決めておきたいことです。";
    } else if (Store.mode === "server") {
      sm.textContent = "コメントは関係者全員に共有されます";
    } else {
      sm.textContent = "この端末だけに保存中（共有は「コメント一覧」からテキストでコピー）";
      sm.classList.add("is-local");
    }

    const params = new URLSearchParams(location.search);
    if (params.get("tab")) view.tab = params.get("tab");
    if (params.get("p") && pat(params.get("p"))) view.page = params.get("p");

    renderCompare();
    renderPage();
    renderQuestions();
    renderAll();
    setTab(view.tab);

    if (Store.mode === "server") {
      setInterval(async () => {
        if (document.hidden) return;
        if (await Store.refresh()) refreshAll();
      }, 15000);
    }
  }
  start();
})();
