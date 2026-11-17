/* ===== 1. DATA: saved in LocalStorage as JSON ===== */
const KEY = "studypulse_v1";
let state = loadData();      // { activities: [...], goals: [...] }
let editingId = null;        // id of the activity being edited (null = adding new)
let viewMode = "day";        // "day" or "week"
let pieChart = null, barChart = null;

function loadData() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { activities: [], goals: [] }; }
  catch (e) { return { activities: [], goals: [] }; }
}
function saveData() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ===== 2. HELPER FUNCTIONS ===== */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
// Build "YYYY-MM-DD" from local date (toISOString would shift the day by timezone)
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const weekStart = d => addDays(d, -((d.getDay() + 6) % 7));   // Monday
const fmt = min => (min >= 60 ? Math.floor(min / 60) + "h " : "") + (min % 60) + "m";
const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pct = list => list.length ? Math.round(list.filter(a => a.status === "done").length / list.length * 100) : 0;
const sum = (list, key) => list.reduce((t, a) => t + a[key], 0);
const between = (from, to) => state.activities.filter(a => a.date >= from && a.date <= to);

// Dates covered by the current view (one day, or Monday to Sunday)
function getRange() {
  const sel = parseDate($("viewDate").value);
  if (viewMode === "day") return [iso(sel), iso(sel)];
  const s = weekStart(sel);
  return [iso(s), iso(addDays(s, 6))];
}

/* ===== 3. RENDER: draw everything from the data ===== */
function render() {
  const [from, to] = getRange();
  const list = between(from, to);
  renderSubjects();
  renderStats(list);
  renderList(list, from);
  renderCharts(list);
  renderHeatmap();
  renderGoals();
  renderInsights();
}

function renderSubjects() {
  const subjects = [...new Set(state.activities.map(a => a.subject))];
  $("subjectList").innerHTML = subjects.map(s => `<option value="${esc(s)}">`).join("");
}

function renderStats(list) {
  const sel = parseDate($("viewDate").value);
  const ws = weekStart(sel);
  $("statDay").textContent = pct(between(iso(sel), iso(sel))) + "%";
  $("statWeek").textContent = pct(between(iso(ws), iso(addDays(ws, 6)))) + "%";
  $("statStreak").textContent = streak();
  $("statTime").textContent = fmt(sum(list, "actual")) + " / " + fmt(sum(list, "planned"));
}

function itemHTML(a) {
  const time = a.start ? a.start + ", " : "";
  return `<div class="item ${a.status}">
    <div><strong>${esc(a.title)}</strong>
      <small>${esc(a.subject)}: ${time}planned ${fmt(a.planned)}, actual ${fmt(a.actual)} (${a.status})</small></div>
    <div class="btns">
      <button data-act="done" data-id="${a.id}" title="Mark completed">&#10003;</button>
      <button data-act="missed" data-id="${a.id}" title="Mark missed">&#10007;</button>
      <button data-act="edit" data-id="${a.id}" title="Edit">Edit</button>
      <button data-act="delete" data-id="${a.id}" title="Delete">Delete</button>
    </div></div>`;
}

function renderList(list, from) {
  const days = viewMode === "day" ? [from] : [0, 1, 2, 3, 4, 5, 6].map(i => iso(addDays(parseDate(from), i)));
  let html = "";
  days.forEach(ds => {
    const items = list.filter(a => a.date === ds).sort((a, b) => a.start.localeCompare(b.start));
    if (viewMode === "week") {
      html += `<h3 class="dayhead"><span>${parseDate(ds).toDateString()}</span><span>${pct(items)}%</span></h3>`;
      if (!items.length) html += '<p class="muted">Nothing planned.</p>';
    }
    html += items.map(itemHTML).join("");
  });
  if (!list.length && viewMode === "day") html = '<p class="muted">Nothing planned for this day. Add an activity above.</p>';
  $("activityList").innerHTML = html;
}

function renderCharts(list) {
  if (typeof Chart === "undefined") return;   // Chart.js failed to load (offline)
  const count = { done: 0, missed: 0, pending: 0 };
  list.forEach(a => count[a.status]++);
  const bySubject = {};
  list.forEach(a => {
    bySubject[a.subject] = bySubject[a.subject] || { planned: 0, actual: 0 };
    bySubject[a.subject].planned += a.planned;
    bySubject[a.subject].actual += a.actual;
  });
  const names = Object.keys(bySubject);
  if (pieChart) pieChart.destroy();
  if (barChart) barChart.destroy();
  pieChart = new Chart($("pieChart"), {
    type: "pie",
    data: { labels: ["Completed", "Missed", "Pending"],
      datasets: [{ data: [count.done, count.missed, count.pending], backgroundColor: ["#1f9d55", "#d64550", "#8a94a6"] }] },
    options: { maintainAspectRatio: false, plugins: { title: { display: true, text: "Status of activities" } } }
  });
  barChart = new Chart($("barChart"), {
    type: "bar",
    data: { labels: names, datasets: [
      { label: "Planned (min)", data: names.map(n => bySubject[n].planned), backgroundColor: "#8a94a6" },
      { label: "Actual (min)", data: names.map(n => bySubject[n].actual), backgroundColor: "#0f9d8a" } ] },
    options: { maintainAspectRatio: false, plugins: { title: { display: true, text: "Planned vs actual by subject" } } }
  });
}

function renderHeatmap() {
  const today = new Date();
  const start = addDays(weekStart(today), -77);   // 12 weeks ending this week
  let html = "";
  for (let i = 0; i < 84; i++) {
    const d = addDays(start, i), ds = iso(d);
    const list = state.activities.filter(a => a.date === ds);
    const p = pct(list);
    const level = !list.length || p === 0 ? 0 : p < 40 ? 1 : p < 70 ? 2 : p < 100 ? 3 : 4;
    const future = d > today ? " future" : "";
    html += `<div class="cell l${level}${future}" title="${d.toDateString()}: ${list.length ? p + "% done" : "no activities"}"></div>`;
  }
  $("heatmap").innerHTML = html;
}

function renderGoals() {
  const ws = weekStart(parseDate($("viewDate").value));
  const week = between(iso(ws), iso(addDays(ws, 6)));
  if (!state.goals.length) { $("goalList").innerHTML = '<p class="muted">No goals yet. Set one above.</p>'; return; }
  $("goalList").innerHTML = state.goals.map((g, i) => {
    const done = sum(week.filter(a => a.subject.toLowerCase() === g.subject.toLowerCase()), "actual");
    return `<div class="goal"><div><span>${esc(g.subject)}: ${fmt(done)} of ${fmt(g.minutes)}</span>
      <button class="ghost" data-goal="${i}">Remove</button></div>
      <progress value="${Math.min(done, g.minutes)}" max="${g.minutes}"></progress></div>`;
  }).join("");
}

/* ===== 4. CONSISTENCY AND INSIGHTS ===== */
function dayPct(ds) { const l = state.activities.filter(a => a.date === ds); return l.length ? pct(l) : 0; }
// A day is "consistent" when at least 50% of its activities are done
function streak() {
  let d = new Date(), n = 0;
  if (dayPct(iso(d)) < 50) d = addDays(d, -1);   // today may still be in progress
  while (dayPct(iso(d)) >= 50) { n++; d = addDays(d, -1); }
  return n;
}

function renderInsights() {
  const acts = state.activities, done = acts.filter(a => a.status === "done");
  const out = [];
  if (!acts.length) {
    out.push("Add some activities, or load the sample data, to see insights.");
  } else {
    const time = {}, missed = {}, weekday = [0, 0, 0, 0, 0, 0, 0];
    done.forEach(a => { time[a.subject] = (time[a.subject] || 0) + a.actual; weekday[parseDate(a.date).getDay()]++; });
    acts.filter(a => a.status === "missed").forEach(a => missed[a.subject] = (missed[a.subject] || 0) + 1);
    const top = obj => Object.keys(obj).sort((x, y) => obj[y] - obj[x])[0];
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (top(time)) out.push(`You study ${top(time)} the most: ${fmt(time[top(time)])} in total.`);
    if (top(missed)) out.push(`${top(missed)} is missed most often (${missed[top(missed)]} times). Try a shorter or earlier slot for it.`);
    if (done.length) out.push(`${days[weekday.indexOf(Math.max(...weekday))]} is your most productive day.`);
    const ratio = sum(done, "planned") ? Math.round(sum(done, "actual") / sum(done, "planned") * 100) : 0;
    if (done.length) out.push(`On completed tasks you used ${ratio}% of your planned time. ` +
      (ratio < 80 ? "Your plans may be too long; try smaller blocks." : ratio > 120 ? "You often need more time than planned; add some buffer." : "Your planning is realistic."));
    out.push(`Overall completion rate: ${pct(acts)}%. Current streak: ${streak()} day(s).`);
  }
  $("insights").innerHTML = out.map(t => `<li>${t}</li>`).join("");
}

/* ===== 5. FORM: add and edit activities ===== */
function resetForm() {
  editingId = null;
  $("activityForm").reset();
  $("date").value = $("viewDate").value;
  $("formTitle").textContent = "Add activity";
  $("saveBtn").textContent = "Add activity";
  $("cancelBtn").hidden = true;
  $("formError").textContent = "";
}

$("activityForm").addEventListener("submit", e => {
  e.preventDefault();
  const data = {
    title: $("title").value.trim(), subject: $("subject").value.trim(), date: $("date").value,
    start: $("start").value, planned: parseInt($("planned").value) || 0,
    actual: parseInt($("actual").value) || 0, status: $("status").value
  };
  if (!data.title || !data.subject || !data.date) { $("formError").textContent = "Please fill in the title, subject and date."; return; }
  if (data.planned <= 0) { $("formError").textContent = "Planned time must be at least 1 minute."; return; }
  if (data.status === "missed") data.actual = 0;
  if (editingId) Object.assign(state.activities.find(a => a.id === editingId), data);
  else { data.id = newId(); state.activities.push(data); }
  saveData();
  $("viewDate").value = data.date;
  resetForm();
  render();
});

$("cancelBtn").addEventListener("click", resetForm);

/* ===== 6. TIMETABLE BUTTONS (event delegation) ===== */
$("activityList").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const a = state.activities.find(x => x.id === btn.dataset.id);
  if (!a) return;
  if (btn.dataset.act === "done") {
    const v = prompt("How many minutes did you actually study?", a.actual || a.planned);
    if (v === null) return;
    a.actual = Math.max(0, parseInt(v) || 0);
    a.status = "done";
  } else if (btn.dataset.act === "missed") {
    a.status = "missed"; a.actual = 0;
  } else if (btn.dataset.act === "delete") {
    if (!confirm("Delete this activity?")) return;
    state.activities = state.activities.filter(x => x.id !== a.id);
  } else if (btn.dataset.act === "edit") {
    editingId = a.id;
    ["title", "subject", "date", "start", "planned", "actual", "status"].forEach(f => $(f).value = a[f]);
    $("formTitle").textContent = "Edit activity";
    $("saveBtn").textContent = "Save changes";
    $("cancelBtn").hidden = false;
    $("activityForm").scrollIntoView({ behavior: "smooth" });
    return;
  }
  saveData(); render();
});

function setMode(mode) {
  viewMode = mode;
  $("dayBtn").classList.toggle("on", mode === "day");
  $("weekBtn").classList.toggle("on", mode === "week");
  render();
}
$("dayBtn").addEventListener("click", () => setMode("day"));
$("weekBtn").addEventListener("click", () => setMode("week"));
$("viewDate").addEventListener("change", () => { if ($("viewDate").value) render(); });

/* ===== 7. GOALS ===== */
$("goalForm").addEventListener("submit", e => {
  e.preventDefault();
  const subject = $("goalSubject").value.trim(), hours = parseFloat($("goalHours").value);
  if (!subject || !(hours > 0)) return;
  const minutes = Math.round(hours * 60), old = state.goals.find(g => g.subject.toLowerCase() === subject.toLowerCase());
  if (old) old.minutes = minutes; else state.goals.push({ subject, minutes });
  saveData(); $("goalForm").reset(); render();
});
$("goalList").addEventListener("click", e => {
  const i = e.target.dataset.goal;
  if (i === undefined) return;
  state.goals.splice(Number(i), 1);
  saveData(); render();
});

/* ===== 8. SAMPLE DATA AND RESET ===== */
$("sampleBtn").addEventListener("click", () => {
  if (!confirm("Add sample data from the last 3 weeks?")) return;
  const subjects = ["Maths", "Physics", "Programming", "English"];
  for (let i = 21; i >= 0; i--) {
    const ds = iso(addDays(new Date(), -i));
    for (let k = 0; k < 3; k++) {
      const planned = [45, 60, 90][k], r = Math.random();
      const status = i === 0 ? "pending" : r < 0.7 ? "done" : "missed";
      state.activities.push({ id: newId(), title: "Study session " + (k + 1), subject: subjects[(i + k) % 4], date: ds,
        start: pad(9 + k * 3) + ":00", planned, actual: status === "done" ? Math.round(planned * (0.7 + Math.random() * 0.4)) : 0, status });
    }
  }
  saveData(); render();
});
$("clearBtn").addEventListener("click", () => {
  if (!confirm("This deletes all activities and goals. Continue?")) return;
  state = { activities: [], goals: [] };
  saveData(); render();
});

/* ===== 9. START ===== */
$("viewDate").value = iso(new Date());
resetForm();
render();
