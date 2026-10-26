(() => {
  const R = window.REVIEW;
  const pid = document.body.dataset.p;
  const P = R.patterns.find((p) => p.id === pid);
  const pr = R.proposals[pid];
  const sec = (id) => R.sections.find((s) => s.id === id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const file = (id) => (id === "p0" ? "current.html" : `${id}.html`);
  const LABEL_KEY = "tcbfv-labels";
  const NAME_KEY = "tcbfv-review-name";
  const LOCAL_KEY = "tcbfv-page-comments";
  const EP = R.commentEndpoint || "";

  const isCurrent = pid === "p0";
  let mode = !isCurrent && new URLSearchParams(location.search).get("mode") === "proposal" ? "proposal" : "asis";
  let labels = localStorage.getItem(LABEL_KEY) !== "0";
  const peek = new Set();

  const item = (sid) => (isCurrent ? null : pr.items[sid] || { s: "keep", why: "" });
  const isGone = (sid) => mode === "proposal" && item(sid) && item(sid).s === "delete";
  const imgOf = (sid) => "../" + (sid === "fv" && !isCurrent ? P.img : sec(sid).img);
  const nameOf = (sid, p = P) => (sid === "fv" && p.id !== "p0" ? `FV（${p.no} ${p.name}）` : sec(sid).name);
  const badge = (sid) => { const it = item(sid); return it ? `<span class="badge badge--${it.s}">${esc(R.status[it.s])}</span>` : ""; };
  const order = () => (mode === "proposal" ? pr.order : R.sections.map((s) => s.id));
  const tgt = (sid) => `${pid}:${sid}`;

  // ---------- コメントの保存 ----------
  const myName = () => (localStorage.getItem(NAME_KEY) || "").trim();
  const fmt = (ts) => {
    const d = new Date(Number(ts));
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const C = {
    items: [],
    ok: true,
    async load() {
      if (!EP) { this.items = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); return true; }
      try {
        const r = await fetch(`${EP}?t=${Date.now()}`);
        const j = await r.json();
        if (!j.ok) throw new Error("load");
        const changed = JSON.stringify(j.items) !== JSON.stringify(this.items);
        this.items = j.items;
        this.ok = true;
        return changed;
      } catch (e) { this.ok = false; return false; }
    },
    async post(body) {
      const r = await fetch(EP, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save");
      return j;
    },
    async add(target, text) {
      const it = { target, author: myName(), text };
      if (EP) {
        const j = await this.post({ a: "add", item: it });
        this.items.push(j.item);
      } else {
        Object.assign(it, { id: Math.random().toString(16).slice(2, 14), ts: Date.now() });
        this.items.push(it);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(this.items));
      }
    },
    async del(id) {
      if (EP) await this.post({ a: "delete", id, author: myName() });
      this.items = this.items.filter((x) => x.id !== id);
      if (!EP) localStorage.setItem(LOCAL_KEY, JSON.stringify(this.items));
    },
    of(target) { return this.items.filter((x) => x.target === target).sort((a, b) => a.ts - b.ts); }
  };

  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- 描画 ----------
  function renderBar() {
    $("#bar").innerHTML = `<div class="bar__in">
      <div class="bar__title">TCB糸リフト 全ページ確認<a href="../index.html">5案を並べて比較する</a></div>
      <nav class="vers" aria-label="版の切り替え">${R.patterns.map((p) =>
        `<a href="${file(p.id)}${mode === "proposal" && p.id !== "p0" ? "?mode=proposal" : ""}" ${p.id === pid ? 'aria-current="page"' : ""}>${esc(p.id === "p0" ? "現行" : `${p.no} ${p.name}`)}</a>`).join("")}</nav>
      ${isCurrent ? "" : `<div class="modes" role="group" aria-label="表示">
        <button type="button" data-mode="asis" aria-pressed="${mode === "asis"}">FVだけ差し替え</button>
        <button type="button" data-mode="proposal" aria-pressed="${mode === "proposal"}">当社案の構成</button>
      </div>`}
      <label class="toggle"><input type="checkbox" id="labels" ${labels ? "checked" : ""}> 番号と当社案を表示</label>
    </div>`;
  }

  function renderPhone() {
    const html = [];
    order().forEach((sid) => {
      if (sid === "popup") return;
      const s = sec(sid);
      const it = item(sid);
      const gone = isGone(sid);
      if (gone) {
        html.push(`<div class="gone" id="sec-${sid}"><span class="num">${s.no}</span><span class="txt">${esc(nameOf(sid))}（当社案では削除）</span><span class="cnt" data-cnt="${tgt(sid)}"></span><button type="button" data-peek="${sid}">${peek.has(sid) ? "隠す" : "見る"}</button></div>`);
        if (!peek.has(sid)) return;
      }
      html.push(`<section class="sec ${it ? `is-${it.s}` : ""} ${gone ? "sec--peek" : ""}" ${gone ? "" : `id="sec-${sid}"`}>
        <div class="sec__label"><span class="num">${s.no}</span><span class="name">${esc(nameOf(sid))}</span><button type="button" class="cnt" data-cnt="${tgt(sid)}" data-talk="${sid}"></button>${badge(sid)}</div>
        ${sid === "fv" && !isCurrent ? '<p class="pr">PR：TCB</p>' : ""}
        <img src="${imgOf(sid)}" alt="${esc(nameOf(sid))}" ${sid === "fv" ? "" : 'loading="lazy"'}>
      </section>`);
    });
    $("#phone").innerHTML = html.join("");
  }

  function threadHTML(target, placeholder) {
    return `<div class="cm" data-target="${esc(target)}">
      <div class="cm__list"></div>
      <form class="cm__form">
        <textarea rows="1" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></textarea>
        <button type="submit">送信</button>
      </form>
    </div>`;
  }

  function renderSide() {
    const how = isCurrent
      ? "今のページをそのまま並べています。番号は案1〜5のページでも共通です。"
      : mode === "asis"
        ? "FVだけを差し替え、ほかは今のまま並べています。上の「当社案の構成」に切り替えると、削除・移動を反映した並びになります。"
        : "当社案の削除・移動を反映した並びです。番号は今のページの順番のままなので、「3は残したい」「5を上へ」のように番号で話せます。";
    $("#side").innerHTML = `
      <button type="button" class="sheet-close" data-close>閉じる</button>
      <h1>${esc(isCurrent ? "現行ページ" : `${P.no} ${P.name}`)}</h1>
      <p class="type">${esc(isCurrent ? "比較用" : P.type)}</p>
      <div class="summary"><b>${isCurrent ? "今のページの作り" : "当社案"}</b>${esc(isCurrent
        ? "開いた直後に年代ポップアップ → FV → 4問アンケート（全問答えるまで本文は出ない）→ 本文。"
        : pr.summary)}</div>
      <p class="how">${esc(how)}</p>
      <div class="me">
        <label for="myName">コメントするときのお名前</label>
        <input id="myName" type="text" maxlength="40" placeholder="例：Let's 山田" value="${esc(myName())}">
        <p class="me__mode ${EP ? "" : "is-local"}">${EP ? "コメントは関係者全員に共有されます" : "この端末だけに保存中（共有の設定前）"}</p>
      </div>
      <ol class="list">${order().map((sid) => {
        const s = sec(sid);
        const it = item(sid);
        const why = it ? it.why : s.note;
        return `<li class="${isGone(sid) ? "is-gone" : ""}" id="item-${sid}">
          <button type="button" class="list__go" data-go="${sid}">
            <span class="num">${s.no}</span>
            <span class="head">${esc(nameOf(sid))}${badge(sid)}</span>
            ${why ? `<span class="why">${esc(why)}</span>` : ""}
          </button>
          ${threadHTML(tgt(sid), `${s.no}へのコメント`)}
        </li>`;
      }).join("")}</ol>
      <div class="page-cm">
        <b>このページ全体へのコメント</b>
        ${threadHTML(tgt("all"), "ページ全体へのコメント")}
      </div>
      <button type="button" class="copy-all" data-copy>全ページのコメントをテキストでコピー</button>`;
    refreshComments();
  }

  function commentHTML(c) {
    const mine = c.author === myName();
    return `<div class="cmt" data-id="${esc(c.id)}">
      <div class="cmt__meta"><b>${esc(c.author)}</b><span>${fmt(c.ts)}</span>${mine ? '<button type="button" data-del>削除</button>' : ""}</div>
      <p class="cmt__text">${esc(c.text)}</p>
    </div>`;
  }

  function refreshComments() {
    $$(".cm[data-target]").forEach((el) => {
      $(".cm__list", el).innerHTML = C.of(el.dataset.target).map(commentHTML).join("");
    });
    $$("[data-cnt]").forEach((el) => {
      const n = C.of(el.dataset.cnt).length;
      el.textContent = n ? `コメント${n}` : "";
      el.hidden = !n;
    });
    const total = C.items.filter((x) => x.target.startsWith(`${pid}:`)).length;
    $("#fab").textContent = total ? `セクション一覧・コメント${total}` : "セクション一覧・コメント";
    const m = $(".me__mode");
    if (m && EP && !C.ok) { m.textContent = "コメントを読み込めませんでした。時間をおいて開き直してください"; m.classList.add("is-local"); }
  }

  function exportText() {
    const now = new Date();
    const lines = [`TCB糸リフト 全ページ確認 コメント（${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}時点）`];
    R.patterns.forEach((p) => {
      const rows = [];
      R.sections.map((s) => s.id).concat("all").forEach((sid) => {
        const list = C.of(`${p.id}:${sid}`);
        if (!list.length) return;
        const it = p.id === "p0" || sid === "all" ? null : R.proposals[p.id].items[sid];
        rows.push(sid === "all" ? "ページ全体" : `${sec(sid).no} ${nameOf(sid, p)}${it ? `（当社案：${R.status[it.s]}）` : ""}`);
        list.forEach((c) => rows.push(`  ・${c.author}（${fmt(c.ts)}）：${c.text.replace(/\n/g, " ")}`));
      });
      if (rows.length) lines.push("", `【${p.id === "p0" ? "現行" : `${p.no} ${p.name}`}】`, ...rows);
    });
    return lines.length > 1 ? lines.join("\n") : "";
  }

  function popupVisible() { return !isGone("popup"); }
  function showPopup() {
    $("#popup").innerHTML = `<div class="popup__box">
      <img src="../${sec("popup").img}" alt="年代を聞くポップアップ">
      <p class="popup__note">0 年代を聞くポップアップ（開いた直後に表示）｜タップで閉じる</p>
    </div>`;
    $("#popup").hidden = false;
  }

  function render() {
    document.body.classList.toggle("no-labels", !labels);
    renderBar();
    renderPhone();
    renderSide();
  }

  // ---------- 操作 ----------
  document.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-mode]");
    if (m) {
      mode = m.dataset.mode;
      history.replaceState(null, "", mode === "proposal" ? "?mode=proposal" : location.pathname);
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    const pk = e.target.closest("[data-peek]");
    if (pk) {
      const id = pk.dataset.peek;
      peek.has(id) ? peek.delete(id) : peek.add(id);
      renderPhone();
      refreshComments();
      return;
    }
    const talk = e.target.closest("[data-talk]");
    if (talk) {
      $("#side").classList.add("is-open");
      const li = document.getElementById(`item-${talk.dataset.talk}`);
      if (li) { li.scrollIntoView({ behavior: "smooth", block: "center" }); $("textarea", li).focus({ preventScroll: true }); }
      return;
    }
    const go = e.target.closest("[data-go]");
    if (go) {
      const id = go.dataset.go;
      $("#side").classList.remove("is-open");
      if (id === "popup") { if (popupVisible()) showPopup(); return; }
      const el = document.getElementById(`sec-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!confirm("このコメントを削除しますか？")) return;
      try { await C.del(del.closest(".cmt").dataset.id); refreshComments(); } catch (err) { toast("削除できませんでした"); }
      return;
    }
    if (e.target.closest("[data-copy]")) {
      const text = exportText();
      if (!text) { toast("まだコメントはありません"); return; }
      try { await navigator.clipboard.writeText(text); } catch (err) {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }
      toast("コピーしました。LINEやメールに貼り付けられます");
      return;
    }
    if (e.target.closest("#fab")) { $("#side").classList.toggle("is-open"); return; }
    if (e.target.closest("[data-close]")) { $("#side").classList.remove("is-open"); return; }
    if (e.target.closest("#popup")) { $("#popup").hidden = true; }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target.closest(".cm__form");
    if (!form) return;
    e.preventDefault();
    const ta = $("textarea", form);
    const text = ta.value.trim();
    if (!text) return;
    if (!myName()) { toast("先にお名前を入れてください"); $("#myName").focus(); return; }
    const btn = $("button", form);
    btn.disabled = true;
    try {
      await C.add(form.closest(".cm").dataset.target, text);
      ta.value = "";
      ta.style.height = "";
      refreshComments();
    } catch (err) { toast("保存できませんでした。時間をおいてもう一度お試しください"); }
    btn.disabled = false;
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches(".cm__form textarea") && e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.target.form.requestSubmit();
  });
  document.addEventListener("input", (e) => {
    if (!e.target.matches(".cm__form textarea")) return;
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "myName") {
      localStorage.setItem(NAME_KEY, e.target.value.trim());
      refreshComments();
      return;
    }
    if (e.target.id !== "labels") return;
    labels = e.target.checked;
    localStorage.setItem(LABEL_KEY, labels ? "1" : "0");
    document.body.classList.toggle("no-labels", !labels);
  });

  document.title = `${isCurrent ? "現行" : `${P.no} ${P.name}`}｜TCB糸リフト 全ページ確認`;
  render();
  if (popupVisible() && !new URLSearchParams(location.search).has("nopopup")) showPopup();
  C.load().then(refreshComments);
  if (EP) {
    setInterval(async () => {
      if (document.hidden) return;
      if (await C.load()) refreshComments();
    }, 20000);
  }
})();
