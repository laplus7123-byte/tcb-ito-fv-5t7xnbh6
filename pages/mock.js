(() => {
  const R = window.REVIEW;
  const pid = document.body.dataset.p;
  const P = R.patterns.find((p) => p.id === pid);
  const pr = R.proposals[pid];
  const sec = (id) => R.sections.find((s) => s.id === id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s) => document.querySelector(s);
  const file = (id) => (id === "p0" ? "current.html" : `${id}.html`);
  const LABEL_KEY = "tcbfv-labels";

  const isCurrent = pid === "p0";
  let mode = !isCurrent && new URLSearchParams(location.search).get("mode") === "proposal" ? "proposal" : "asis";
  let labels = localStorage.getItem(LABEL_KEY) !== "0";
  const peek = new Set();

  const item = (sid) => (isCurrent ? null : pr.items[sid] || { s: "keep", why: "" });
  const isGone = (sid) => mode === "proposal" && item(sid) && item(sid).s === "delete";
  const imgOf = (sid) => "../" + (sid === "fv" && !isCurrent ? P.img : sec(sid).img);
  const nameOf = (sid) => (sid === "fv" && !isCurrent ? `FV（${P.no} ${P.name}）` : sec(sid).name);
  const badge = (sid) => { const it = item(sid); return it ? `<span class="badge badge--${it.s}">${esc(R.status[it.s])}</span>` : ""; };
  const order = () => (mode === "proposal" ? pr.order : R.sections.map((s) => s.id));

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
        html.push(`<div class="gone" id="sec-${sid}"><span class="num">${s.no}</span><span class="txt">${esc(nameOf(sid))}（当社案では削除）</span><button type="button" data-peek="${sid}">${peek.has(sid) ? "隠す" : "見る"}</button></div>`);
        if (!peek.has(sid)) return;
      }
      html.push(`<section class="sec ${it ? `is-${it.s}` : ""} ${gone ? "sec--peek" : ""}" ${gone ? "" : `id="sec-${sid}"`}>
        <div class="sec__label"><span class="num">${s.no}</span><span class="name">${esc(nameOf(sid))}</span>${badge(sid)}</div>
        ${sid === "fv" && !isCurrent ? '<p class="pr">PR：TCB</p>' : ""}
        <img src="${imgOf(sid)}" alt="${esc(nameOf(sid))}" ${sid === "fv" ? "" : 'loading="lazy"'}>
      </section>`);
    });
    $("#phone").innerHTML = html.join("");
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
      <ol class="list">${order().map((sid) => {
        const s = sec(sid);
        const it = item(sid);
        const why = it ? it.why : s.note;
        return `<li class="${isGone(sid) ? "is-gone" : ""}"><button type="button" data-go="${sid}">
          <span class="num">${s.no}</span>
          <span class="head">${esc(nameOf(sid))}${badge(sid)}</span>
          ${why ? `<span class="why">${esc(why)}</span>` : ""}
        </button></li>`;
      }).join("")}</ol>`;
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

  document.addEventListener("click", (e) => {
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
    if (e.target.closest("#fab")) { $("#side").classList.toggle("is-open"); return; }
    if (e.target.closest("[data-close]")) { $("#side").classList.remove("is-open"); return; }
    if (e.target.closest("#popup")) { $("#popup").hidden = true; }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id !== "labels") return;
    labels = e.target.checked;
    localStorage.setItem(LABEL_KEY, labels ? "1" : "0");
    document.body.classList.toggle("no-labels", !labels);
  });

  document.title = `${isCurrent ? "現行" : `${P.no} ${P.name}`}｜TCB糸リフト 全ページ確認`;
  render();
  if (popupVisible() && !new URLSearchParams(location.search).has("nopopup")) showPopup();
})();
