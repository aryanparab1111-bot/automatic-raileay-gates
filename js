"use strict";
/* ---------- Constants (scene units: 0-100 = scene width %) ---------- */
const SENSOR = 5, ZS = 42, ZE = 58, LEN = 30, END = 100 + LEN + 2;
const SPEEDS = { slow: 5, normal: 8, fast: 12 };   // units per second
const WARN_DELAY = 1.5, CLEAR_HOLD = 1.5, BAR_TIME = 1.2; // seconds of simulated time
const $ = id => document.getElementById(id);

/* ---------- State ---------- */
const S = {};
function initState() {
  Object.assign(S, {
    paused: false, waiting: false, stepMode: false, speed: "normal",
    B: true, manual: false,
    trainActive: false, front: 0,
    latch: false, warnAge: 0, holdT: 0,   // warning latch, time since warning began, clear-hold timer
    d: 0,                                  // barrier lowered fraction 0 (open) .. 1 (closed)
    prev: { latch: false, target: 0, closed: false, open: true },
    ev: {}, A: false, and: false, or: false, not: true
  });
}
initState();

/* ---------- Event log (only on state transitions) ---------- */
function addLogEvent(msg, milestone) {
  const li = document.createElement("li");
  li.innerHTML = "<time>" + new Date().toLocaleTimeString() + "</time>" + msg;
  const log = $("log"); log.prepend(li);
  while (log.children.length > 150) log.lastChild.remove();
  if (milestone && S.stepMode) { S.waiting = true; }   // step mode: halt at each safety milestone
}
function once(key, msg, milestone) { if (!S.ev[key]) { S.ev[key] = true; addLogEvent(msg, milestone); } }

/* ---------- Controls ---------- */
function startSimulation() {
  if (S.paused) return resumeSimulation();
  if (S.trainActive) return;
  S.ev = {}; S.trainActive = true; S.front = 0; S.waiting = false;
  addLogEvent("Simulation started");
}
function pauseSimulation() { if (!S.paused) { S.paused = true; addLogEvent("Simulation paused"); } }
function resumeSimulation() { if (S.paused) { S.paused = false; addLogEvent("Simulation resumed"); } }
function resetSimulation() {
  initState(); $("log").innerHTML = "";
  $("spd").value = "normal"; $("tSys").checked = true; $("tMan").checked = false; $("tStep").checked = false;
  addLogEvent("Simulation reset"); render();
}

/* ---------- Logic ---------- */
function updateSensors() {
  const tail = S.front - LEN;
  const trainSensed = S.trainActive && S.front >= SENSOR && tail < ZE;  // approach zone through crossing
  S.A = trainSensed || S.manual;
}
function evaluateLogicGates() {
  S.and = S.A && S.B; S.or = S.A || S.B; S.not = !S.A;
}
function updateWarningLights(dt) {
  if (S.and) { S.latch = true; S.holdT = 0; }                 // warning = A AND B
  else if (S.latch) {
    if (!S.B) S.latch = false;                                // system inactive: lights drop out (fault)
    else { S.holdT += dt; if (S.holdT >= CLEAR_HOLD) S.latch = false; } // brief hold after clear
  }
  S.warnAge = S.latch ? S.warnAge + dt : 0;
}
function controlBarrier(dt) {
  const target = S.latch && S.warnAge >= WARN_DELAY ? 1 : 0;  // lower only after the warning period
  const step = dt / BAR_TIME;
  S.d = target ? Math.min(1, S.d + step) : Math.max(0, S.d - step);
  return target;
}
function moveTrain(dt) {
  if (!S.trainActive) return;
  const holding = S.B && S.front >= ZS - 2 && S.front < ZS && S.d < 1;
  if (holding) { S.front = ZS - 2; once("hold", "Train holding at stop line until barrier is down"); return; }
  S.front += SPEEDS[S.speed] * dt;
}
function logTransitions(target) {
  const tail = S.front - LEN, p = S.prev;
  if (S.trainActive && S.front >= SENSOR && S.A) once("det", "Train detected in approach zone", true);
  if (S.latch && !p.latch) addLogEvent("Warning lights activated");
  if (!S.latch && p.latch) addLogEvent("Warning lights off");
  if (target && !p.target) addLogEvent("Barrier lowering");
  const closed = S.d >= 1, open = S.d <= 0;
  if (closed && !p.closed) addLogEvent("Barrier fully lowered", true);
  if (open && p.open === false) addLogEvent("Barrier raised", true);
  if (S.trainActive && S.front >= ZS) once("enter", S.d < 1 ? "Train entering crossing with barrier NOT down (fault)" : "Train entering crossing", true);
  if (S.trainActive && tail >= ZE) once("clear", "Train cleared crossing", true);
  if (S.trainActive && !S.B && S.A) once("fault", "FAULT: system inactive, crossing unprotected");
  S.prev = { latch: S.latch, target, closed, open };
}
function tick(dt) {
  if (S.paused || S.waiting) return;
  moveTrain(dt); updateSensors(); evaluateLogicGates(); updateWarningLights(dt);
  const target = controlBarrier(dt); logTransitions(target);
  if (S.trainActive && S.front >= END) { S.trainActive = false; once("done", "Train left the area"); }
}

/* ---------- Rendering ---------- */
const gateDefs = {
  AND: '<path d="M30 8h28a27 27 0 0 1 0 54H30z"/>',
  OR: '<path d="M24 8c20 0 44 4 62 27-18 23-42 27-62 27 12-18 12-36 0-54z"/>',
  NOT: '<path d="M30 8l44 27-44 27z"/><circle class="sym" cx="79" cy="35" r="5"/>'
};
function buildGates() {
  $("gates").innerHTML = ["AND", "OR", "NOT"].map(t => {
    const two = t !== "NOT", outX = t === "NOT" ? 84 : t === "AND" ? 85 : 86;
    return `<div class="gate"><b>${t} Gate</b>
      <svg viewBox="0 0 140 70" aria-label="${t} gate symbol">${gateDefs[t]}
      ${two ? `<line data-w="${t}a" x1="2" y1="22" x2="28" y2="22"/><line data-w="${t}b" x1="2" y1="48" x2="28" y2="48"/>` : `<line data-w="${t}a" x1="2" y1="35" x2="30" y2="35"/>`}
      <line data-w="${t}q" x1="${outX}" y1="35" x2="138" y2="35"/></svg>
      <div class="row" style="justify-content:center">
        <button class="tg" data-in="A" aria-label="Toggle input A for ${t} gate">A: 0</button>
        ${two ? `<button class="tg" data-in="B" aria-label="Toggle input B for ${t} gate">B: 0</button>` : ""}
        <span class="led" data-q="${t}"></span><b data-qv="${t}">Q=0</b></div>
      <div class="expr">${t === "AND" ? "Q = A · B" : t === "OR" ? "Q = A + B" : "Q = A'"}</div>
      <div class="sim" data-d="${t}"></div></div>`;
  }).join("");
  $("gates").addEventListener("click", e => {
    const b = e.target.closest("button[data-in]"); if (!b) return;
    if (b.dataset.in === "A") { S.manual = !S.manual; $("tMan").checked = S.manual; }
    else { S.B = !S.B; $("tSys").checked = S.B; }
    addLogEvent("Input " + b.dataset.in + " toggled by user"); render();
  });
  [["AND", [[0,0],[0,1],[1,0],[1,1]], (a,b) => a&b], ["OR", [[0,0],[0,1],[1,0],[1,1]], (a,b) => a|b], ["NOT", [[0],[1]], a => +!a]]
    .forEach(([n, rows, f]) => rows.forEach(r => {
      $("t" + n).insertAdjacentHTML("beforeend", `<tr data-r="${r.join("")}">${r.map(v => "<td>" + v + "</td>").join("")}<td>${f(...r)}</td></tr>`);
    }));
}
function buildStrips() {
  const s = $("sleepers"); let h = "";
  for (let x = 6; x < 1000; x += 26) h += `<line x1="${x}" y1="200" x2="${x}" y2="260"/>`;
  s.innerHTML = h;
}
function card(label, val, cls, extra) {
  return `<div class="st"><small>${label}</small><b><span class="led ${cls}"></span>${val}</b><span class="sim">${extra || "simulated"}</span></div>`;
}
function render() {
  const A = +S.A, B = +S.B, tail = S.front - LEN;
  const inCross = S.trainActive && S.front >= ZS && tail < ZE;
  // Scene
  $("train").setAttribute("transform", `translate(${(S.front - LEN) * 10},0)`);
  $("train").style.display = S.trainActive ? "" : "none";
  const ang = 78 * (1 - S.d);
  $("barL").setAttribute("transform", `translate(420,186) rotate(${-ang})`);
  $("barR").setAttribute("transform", `translate(580,276) rotate(${-ang})`);
  $("sig").setAttribute("class", S.latch ? "bl" : "");
  ["lampL1","lampL2","lampR1","lampR2"].forEach(i => $(i).style.opacity = S.latch ? "" : ".25");
  $("root").classList.toggle("frozen", S.paused || S.waiting);
  $("mark").style.left = Math.max(0, Math.min(100, S.trainActive ? S.front : 0)) + "%";
  // Gates
  const out = { AND: +S.and, OR: +S.or, NOT: +S.not };
  document.querySelectorAll(".gate").forEach(g => {
    const t = g.querySelector("[data-q]").dataset.q;
    g.querySelectorAll("button[data-in]").forEach(b => { const v = b.dataset.in === "A" ? A : B; b.textContent = b.dataset.in + ": " + v; b.classList.toggle("on", !!v); });
    g.querySelectorAll("line[data-w]").forEach(l => {
      const w = l.dataset.w.slice(-1), v = w === "a" ? A : w === "b" ? B : out[t]; l.classList.toggle("on", !!v);
    });
    g.querySelector("[data-q]").className = "led " + (out[t] ? "g" : "");
    g.querySelector("[data-qv]").textContent = "Q=" + out[t];
    g.querySelector("[data-d]").textContent = t === "AND" ? (out.AND ? "Warning enabled" : "Warning not enabled") : t === "OR" ? (out.OR ? "Input present" : "No inputs") : (out.NOT ? "Track clear" : "Track occupied");
  });
  document.querySelectorAll("#tAND tr[data-r],#tOR tr[data-r]").forEach(r => r.classList.toggle("hl", r.dataset.r === "" + A + B));
  document.querySelectorAll("#tNOT tr[data-r]").forEach(r => r.classList.toggle("hl", r.dataset.r === "" + A));
  // Status cards
  const bar = S.d >= 1 ? "CLOSED" : S.d <= 0 ? "OPEN" : "MOVING";
  const dist = S.trainActive ? (S.front < ZS ? Math.round((ZS - S.front) * 4) + " m" : tail < ZE ? "IN CROSSING" : "PASSED") : "NO TRAIN";
  let cross, cc;
  if (!S.B && (S.A || inCross)) { cross = "FAULT"; cc = "r"; }
  else if (!S.B) { cross = "INACTIVE"; cc = "a"; }
  else if (inCross) { cross = "OCCUPIED"; cc = "r"; }
  else if (S.latch || S.A) { cross = "WARNING"; cc = "a"; }
  else if (S.d > 0) { cross = "WARNING"; cc = "a"; }
  else { cross = "SAFE"; cc = "g"; }
  $("cards").innerHTML =
    card("Train Detection Sensor", S.A ? "DETECTED" : "CLEAR", S.A ? "r" : "g") +
    card("System Active", S.B ? "ACTIVE" : "INACTIVE", S.B ? "g" : "a") +
    card("Barrier Position", bar, S.d >= 1 ? "r" : S.d <= 0 ? "g" : "a") +
    card("Warning Lights", S.latch ? "BLINKING" : "OFF", S.latch ? "r" : "") +
    card("Crossing Status", cross, cc, cross === "SAFE" ? "simulated, not a real safety claim" : "simulated") +
    card("Train Distance", dist, "b");
  // Header + alert
  const al = $("alert");
  if (!S.B) { al.className = "alert on red"; al.textContent = "System inactive: the crossing is NOT protected" + (S.A ? ". Sensor fault: train detected but no warning issued." : "."); }
  else if (S.waiting) { al.className = "alert on"; al.textContent = "Step mode: milestone reached. Press Next Step to continue."; }
  else al.className = "alert";
  $("badgeTxt").textContent = S.B ? (S.paused ? "SYSTEM PAUSED" : "SYSTEM ONLINE") : "SYSTEM FAULT";
  $("badge").className = "badge" + (S.B && !S.paused ? "" : " off");
  $("badge").firstChild.className = "led " + (S.B ? (S.paused ? "a" : "g") : "r");
  $("bPause").textContent = S.paused ? "Resume" : "Pause";
  $("bStart").disabled = S.trainActive && !S.paused;
  $("bNext").disabled = !S.waiting;
  $("stepNote").textContent = S.stepMode ? (S.waiting ? "Waiting for Next Step." : "Runs to the next milestone.") : "Step mode off.";
}

/* ---------- Wiring ---------- */
$("bStart").onclick = () => { startSimulation(); render(); };
$("bPause").onclick = () => { S.paused ? resumeSimulation() : pauseSimulation(); render(); };
$("bReset").onclick = resetSimulation;
$("bClear").onclick = () => { $("log").innerHTML = ""; };
$("bNext").onclick = () => { S.waiting = false; render(); };
$("spd").onchange = e => { S.speed = e.target.value; addLogEvent("Train speed set to " + S.speed); };
$("tSys").onchange = e => { S.B = e.target.checked; addLogEvent("System " + (S.B ? "activated" : "deactivated (fault state)")); render(); };
$("tMan").onchange = e => { S.manual = e.target.checked; addLogEvent("Manual detection " + (S.manual ? "ON" : "OFF")); render(); };
$("tStep").onchange = e => { S.stepMode = e.target.checked; if (!S.stepMode) S.waiting = false; render(); };

buildGates(); buildStrips(); render();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt); render(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
