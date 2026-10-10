/* 2T2F Book widgets. Each widget is a small explanatory model, not an RTL measurement. */
(function () {
  "use strict";

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return e;
  }
  function stat(k, v, cls) {
    return el("div", { class: "stat " + (cls || "") }, [el("div", { class: "k" }, [k]), el("div", { class: "v", html: v })]);
  }
  function range(label, min, max, step, val, onchange, fmt) {
    const inp = el("input", { type: "range", min, max, step, value: val });
    const out = el("b", {}, [fmt ? fmt(val) : String(val)]);
    inp.addEventListener("input", () => { out.textContent = fmt ? fmt(inp.value) : inp.value; onchange(Number(inp.value)); });
    return { node: el("label", {}, [label, inp, out]), input: inp };
  }
  function title(text, tag) {
    return el("div", { class: "w-title" }, [text, el("span", { class: "tag" }, [tag || "설명용 모델"])]);
  }

  /* ---- 실험 1: 공급량 ---- */
  function supply(root) {
    let L = 4, s = 3;
    const out = el("div", { class: "out" });
    function render() {
      const bytes = L * s;
      const before = L;            // one block per cycle
      const twoOk = 2 * bytes <= 64;
      const after = twoOk ? 2 * L : L;
      out.innerHTML = "";
      out.appendChild(stat("블록 크기", `${bytes}<small>바이트</small>`));
      out.appendChild(stat("이전: 사이클당 명령어", `${before}<small>개</small>`));
      out.appendChild(stat("두 블록 합", `${2 * bytes}<small>바이트</small>`, twoOk ? "ok" : "no"));
      out.appendChild(stat("이후: 사이클당 최대", `${after}<small>개</small>`, twoOk ? "ok" : ""));
      out.appendChild(stat("decode가 받는 수", `${Math.min(8, after)}<small>/8</small>`));
    }
    root.appendChild(title("실험 1 · 공급량을 손으로 세기"));
    const r1 = range("taken 분기 간격 L", 1, 24, 1, L, v => { L = v; render(); }, v => v + " 명령어");
    const r2 = range("평균 명령어 크기 s", 2, 4, 1, s, v => { s = v; render(); }, v => v + "B");
    root.appendChild(el("div", { class: "row" }, [r1.node, r2.node]));
    root.appendChild(out);
    root.appendChild(el("div", { class: "note" }, ["두 블록은 크기 합이 64바이트 이하일 때만 2-fetch로 묶인다. L을 20 이상으로 밀면 2-fetch가 묶이지 않고, 블록 하나가 이미 decode 폭 8을 채운다."]));
    render();
  }

  /* ---- 실험 3: confidence 추적 ---- */
  function conf(root) {
    let confv = 0, slot2 = null, killOnly = true, thr = 2, mode = "direct";
    const log = [];
    const out = el("div", { class: "out" });
    const tbl = el("div", { class: "log" });
    function fireable() { return slot2 !== null && confv >= thr; }
    function render() {
      out.innerHTML = "";
      out.appendChild(stat("slot2", slot2 ? "BR2" : "비어 있음", slot2 ? "" : "no"));
      out.appendChild(stat("confidence", `${confv}<small>/15</small>`));
      out.appendChild(stat("문턱", `${thr}`));
      out.appendChild(stat("발화 가능", fireable() ? "예" : "아니오", fireable() ? "ok" : "no"));
      let rows = '<table><tr><th>#</th><th>뒤 블록의 결과</th><th>slot2</th><th>conf</th><th>발화</th></tr>';
      log.forEach((r, i) => { rows += `<tr><td>${i + 1}</td><td>${r.ev}</td><td>${r.slot}</td><td>${r.c}</td><td>${r.f ? "예" : "아니오"}</td></tr>`; });
      tbl.innerHTML = rows + "</table>";
      tbl.scrollTop = tbl.scrollHeight;
    }
    function step(ev) {
      let slot;
      if (ev === "taken") {
        if (slot2 === null) { slot2 = "BR2"; confv = 1; slot = "BR2 기록"; }
        else { confv = Math.min(15, confv + 1); slot = "유지"; }
      } else if (ev === "nottaken" || ev === "diff" || ev === "misp") {
        if (killOnly || ev === "misp") { slot2 = null; confv = 0; slot = "무효화"; }
        else { confv = Math.max(0, confv - 1); slot = confv === 0 ? "무효화" : "유지"; if (confv === 0) slot2 = null; }
      }
      const names = { taken: `B, taken, ${mode}`, nottaken: "B, not taken", diff: "B, 다른 분기", misp: "second에 backend redirect" };
      log.push({ ev: names[ev], slot, c: confv, f: fireable() });
      render();
    }
    root.appendChild(title("실험 3 · confidence를 따라가 보기"));
    const modeSel = el("select", { onchange: e => { mode = e.target.value; thr = mode === "direct" ? 2 : 4; render(); } }, [
      el("option", { value: "direct" }, ["BR2 = direct jump (문턱 2)"]),
      el("option", { value: "cond" }, ["BR2 = conditional (문턱 4)"])]);
    const polSel = el("select", { onchange: e => { killOnly = e.target.value === "kill"; render(); } }, [
      el("option", { value: "kill" }, ["kill only (기준 코드)"]),
      el("option", { value: "dec" }, ["1 감소 (비교용)"])]);
    root.appendChild(el("div", { class: "row" }, [el("label", {}, ["BR2 종류", modeSel]), el("label", {}, ["어긋남 처리", polSel])]));
    root.appendChild(el("div", { class: "row" }, [
      el("button", { class: "primary", onclick: () => step("taken") }, ["B taken (chain)"]),
      el("button", { onclick: () => step("nottaken") }, ["B not taken"]),
      el("button", { onclick: () => step("diff") }, ["B의 분기가 다름"]),
      el("button", { onclick: () => step("misp") }, ["second에 redirect"]),
      el("button", { onclick: () => { confv = 0; slot2 = null; log.length = 0; render(); } }, ["초기화"])]));
    root.appendChild(out);
    root.appendChild(tbl);
    root.appendChild(el("div", { class: "note" }, ["slot1은 이미 BR1로 채워져 있다고 가정한다. '1 감소'로 바꾸고 taken과 not taken을 번갈아 눌러 보자. 문턱 근처에서 오르내리며 계속 발화하는 pair가 보인다. 기준 코드는 그래서 kill only다."]));
    render();
  }

  /* ---- 실험 4: PHR 2단 shift ---- */
  function phr(root) {
    const N = 12, SHAMT = 2;
    let buf = new Array(N).fill("·"), ptr = 0, metaPtr = null, lastDesc = "";
    const ring = el("div", { class: "ring" });
    const out = el("div", { class: "out" });
    function render() {
      ring.innerHTML = "";
      for (let i = 0; i < N; i++) {
        const c = el("div", { class: "cell" + (i === ptr ? " ptr" : "") + (metaPtr === i ? " meta" : "") + (buf[i] === "1" ? " br1" : buf[i] === "2" ? " br2" : "") }, [buf[i] === "·" ? "" : buf[i]]);
        c.appendChild(el("span", { class: "idx" }, [String(i)]));
        ring.appendChild(c);
      }
      out.innerHTML = "";
      out.appendChild(stat("포인터 P", String(ptr)));
      out.appendChild(stat("second meta의 P", metaPtr === null ? "–" : String(metaPtr)));
      out.appendChild(stat("마지막 동작", lastDesc || "–"));
    }
    function write(tag) { for (let k = 0; k < SHAMT; k++) buf[(ptr + k) % N] = tag; ptr = (ptr + SHAMT) % N; }
    root.appendChild(title("실험 4 · PHR을 손으로 두 번 밀기"));
    root.appendChild(el("div", { class: "row" }, [
      el("button", { onclick: () => { write("1"); metaPtr = null; lastDesc = "single: hash 기록, P += Shamt"; render(); } }, ["single (BR1)"]),
      el("button", { onclick: () => { write("2"); metaPtr = null; lastDesc = "single: hash 기록, P += Shamt"; render(); } }, ["single (BR2)"]),
      el("button", { class: "primary", onclick: () => { write("1"); metaPtr = ptr; write("2"); lastDesc = "pair: BR1 다음 BR2, P += 2·Shamt. second meta는 중간 상태"; render(); } }, ["pair (BR1 → BR2)"]),
      el("button", { onclick: () => { if (metaPtr !== null) { ptr = metaPtr; for (let k = 0; k < SHAMT; k++) buf[(ptr + k) % N] = "·"; metaPtr = null; lastDesc = "second redirect: meta 상태(P − Shamt)로 복구. 이제 교정된 BR2를 single로 얹으면 된다"; render(); } } }, ["second에 redirect"]),
      el("button", { onclick: () => { buf = new Array(N).fill("·"); ptr = 0; metaPtr = null; lastDesc = ""; render(); } }, ["초기화"])]));
    root.appendChild(ring);
    root.appendChild(out);
    root.appendChild(el("div", { class: "note" }, ["12칸 원형 버퍼, Shamt = 2. 파란 칸이 BR1 hash, 노란 칸이 BR2 hash다. 'single(BR1)' 뒤 'single(BR2)'를 누른 결과와 'pair'를 한 번 누른 결과가 같은지 비교해 보자. 점선 테두리가 second 엔트리 meta에 저장되는 포인터다."]));
    render();
  }

  /* ---- 실험 5: guard ---- */
  function guard(root) {
    let s2 = 1, s3 = 1, dist = 4;
    const out = el("div", { class: "out" });
    function render() {
      const g = 1 + s2 + s3;
      const ok = dist > g;
      out.innerHTML = "";
      out.appendChild(stat("guard = 1 + S2 + S3", String(g)));
      out.appendChild(stat("bpuPtr − fetchPtr", String(dist)));
      out.appendChild(stat("2-fetch 가능", ok ? "예 (거리 > guard)" : "아니오", ok ? "ok" : "no"));
    }
    const opts = () => [el("option", { value: 0 }, ["버블 (0)"]), el("option", { value: 1, selected: "" }, ["single (1)"]), el("option", { value: 2 }, ["pair (2)"])];
    root.appendChild(title("실험 5 · 안전거리 guard를 계산하기"));
    const r = range("bpuPtr − fetchPtr", 1, 8, 1, dist, v => { dist = v; render(); });
    root.appendChild(el("div", { class: "row" }, [
      el("label", {}, ["S2에 있는 예측", el("select", { onchange: e => { s2 = Number(e.target.value); render(); } }, opts())]),
      el("label", {}, ["S3에 있는 예측", el("select", { onchange: e => { s3 = Number(e.target.value); render(); } }, opts())]),
      r.node]));
    root.appendChild(out);
    root.appendChild(el("div", { class: "note" }, ["S3 override는 S2, S3에 있는 예측이 넣은 엔트리와 지금 S1 자리(1)까지 되감을 수 있다. 두 번째 블록이 그 범위 밖이어야 ICache와 IFU가 첫 블록의 ftqIdx만 검사해도 된다. pair가 연속이면 guard는 5다."]));
    render();
  }

  /* ---- 실험 6: MetaArray 포트 ---- */
  function meta(root) {
    let a0 = 10, c0 = false, a1 = 12, c1 = false;
    const out = el("div", { class: "out" });
    const viz = el("div", { class: "lineviz" });
    function classify() {
      const l0 = c0 ? [a0, a0 + 1] : [a0];
      const l1 = c1 ? [a1, a1 + 1] : [a1];
      if (a0 === a1) return ["SameLine", "그 line과 다음 line"];
      if (c0 && !c1 && a1 === a0 + 1) return ["Overlap1", "fb0의 두 line"];
      if (c1 && !c0 && a0 === a1 + 1) return ["Overlap2", "fb1의 두 line"];
      if (!c0 && !c1 && (a0 % 2) !== (a1 % 2)) return ["Interleave", "각자의 line"];
      void l0; void l1;
      return ["Conflict", "fb0만 single prefetch"];
    }
    function render() {
      const [cs, reads] = classify();
      out.innerHTML = "";
      out.appendChild(stat("fb0 line", (c0 ? `${a0}, ${a0 + 1}` : String(a0)) + `<small>${a0 % 2 ? "홀" : "짝"}</small>`));
      out.appendChild(stat("fb1 line", (c1 ? `${a1}, ${a1 + 1}` : String(a1)) + `<small>${a1 % 2 ? "홀" : "짝"}</small>`));
      out.appendChild(stat("경우", cs, cs === "Conflict" ? "no" : "ok"));
      out.appendChild(stat("읽는 line", reads));
      viz.innerHTML = "";
      const lo = Math.min(a0, a1) - 1, hi = Math.max(a0 + (c0 ? 1 : 0), a1 + (c1 ? 1 : 0)) + 1;
      for (let L = lo; L <= hi; L++) {
        const d = el("div", { class: "ln" + (L % 2 ? " odd" : "") }, [String(L)]);
        if (L === a0 || (c0 && L === a0 + 1)) d.appendChild(el("div", { class: "fb fb0" }));
        if (L === a1 || (c1 && L === a1 + 1)) d.appendChild(el("div", { class: "fb fb1" }));
        viz.appendChild(d);
      }
    }
    root.appendChild(title("실험 6 · 두 블록이 포트에 들어맞는가"));
    const n0 = el("input", { type: "number", min: 1, max: 60, value: a0, oninput: e => { a0 = Number(e.target.value) || 1; render(); } });
    const n1 = el("input", { type: "number", min: 1, max: 60, value: a1, oninput: e => { a1 = Number(e.target.value) || 1; render(); } });
    const k0 = el("input", { type: "checkbox", onchange: e => { c0 = e.target.checked; render(); } });
    const k1 = el("input", { type: "checkbox", onchange: e => { c1 = e.target.checked; render(); } });
    root.appendChild(el("div", { class: "row" }, [el("label", {}, ["fb0 시작 line", n0]), el("label", {}, [k0, "fb0이 line을 넘음"])]));
    root.appendChild(el("div", { class: "row" }, [el("label", {}, ["fb1 시작 line", n1]), el("label", {}, [k1, "fb1이 line을 넘음"])]));
    root.appendChild(viz);
    root.appendChild(out);
    root.appendChild(el("div", { class: "note" }, ["빗금 칸이 홀수 set, 빈 칸이 짝수 set이다. 파란 막대가 fb0, 노란 막대가 fb1. 짝수 포트와 홀수 포트가 각각 line 하나씩만 읽을 수 있으므로, 두 블록의 line이 두 포트에 나눠 떨어질 때만 2-prefetch가 된다."]));
    render();
  }

  /* ---- 실험 7: 기대 범위 모델 ---- */
  function model(root) {
    let L = 8, s = 3, hit = 0.8, p1 = 0.85, p2 = 0.85;
    const out = el("div", { class: "out" });
    const bars = el("div", { class: "bars" });
    const labs = el("div", { class: "barlab" });
    function pcum(L, n) { const p = 1 / L; return 1 - Math.pow(1 - p, n - 1) * (1 + (n - 1) * p); }
    function render() {
      const n = Math.floor(64 / s);
      const pf = pcum(L, n);
      const q = hit * p1 * p2 * pf;
      out.innerHTML = "";
      out.appendChild(stat("64B 안에 두 블록이 들어갈 확률", `${(pf * 100).toFixed(0)}<small>%</small>`));
      out.appendChild(stat("pair 발화율 q", `${(q * 100).toFixed(0)}<small>%</small>`));
      out.appendChild(stat("사이클당 명령어 비율", `${(1 + q).toFixed(2)}<small>배</small>`, "ok"));
      out.appendChild(stat("조건 없는 상한", `${(1 + pf).toFixed(2)}<small>배</small>`));
      bars.innerHTML = ""; labs.innerHTML = "";
      [[4, "L=4"], [6, "L=6"], [8, "L=8"], [10, "L=10"], [14, "L=14"], [20, "L=20"]].forEach(([LL, lab]) => {
        const qq = hit * p1 * p2 * pcum(LL, n);
        const b = el("div", { class: "bar" + (LL === L ? "" : " base") });
        b.style.height = `${Math.round((qq) / 1.0 * 100)}%`;
        b.appendChild(el("span", {}, [(1 + qq).toFixed(2)]));
        bars.appendChild(b);
        labs.appendChild(el("div", {}, [lab]));
      });
    }
    root.appendChild(title("실험 7 · 기대 범위 모델"));
    root.appendChild(el("div", { class: "row" }, [
      range("taken 분기 간격 L", 2, 24, 1, L, v => { L = v; render(); }, v => v + " 명령어").node,
      range("평균 명령어 크기 s", 2, 4, 1, s, v => { s = v; render(); }, v => v + "B").node]));
    root.appendChild(el("div", { class: "row" }, [
      range("uBTB pair hit", 0, 1, 0.05, hit, v => { hit = v; render(); }, v => Math.round(v * 100) + "%").node,
      range("첫 분기 조건 통과", 0, 1, 0.05, p1, v => { p1 = v; render(); }, v => Math.round(v * 100) + "%").node,
      range("둘째 분기 조건 통과", 0, 1, 0.05, p2, v => { p2 = v; render(); }, v => Math.round(v * 100) + "%").node]));
    root.appendChild(out);
    root.appendChild(bars);
    root.appendChild(labs);
    root.appendChild(el("div", { class: "note" }, ["막대는 다른 L에서의 비율(1 + q)이다. 비율 = 1 + hit × p1 × p2 × P(X₁ + X₂ ≤ ⌊64/s⌋), X는 평균 L의 기하 분포. 측정값이 아니라 모델값이다. ICache miss, redirect 복구 사이클은 전후 같다고 보고 제외했다."]));
    render();
  }

  const REG = { supply, conf, phr, guard, meta, model };
  document.querySelectorAll(".widget[data-widget]").forEach(node => {
    const fn = REG[node.getAttribute("data-widget")];
    if (fn) fn(node);
  });

  // close mobile nav on link click
  document.querySelectorAll(".side a").forEach(a => a.addEventListener("click", () => document.body.classList.remove("nav-open")));
})();
