"use strict";

const $ = (id) => document.getElementById(id);
const api = window.sticky;

const STATUS_WORD = {
  in_progress: "Running",
  waiting_input: "Needs you",
  completed: "Done",
  failed: "Failed",
};

let collapsed = false;
let toastTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function summaryText({ running, needYou, total }) {
  if (!total) return "No active sessions";
  const parts = [];
  if (needYou) parts.push(`${needYou} need${needYou === 1 ? "s" : ""} you`);
  parts.push(`${running} running`);
  return parts.join(" · ");
}

function renderRow(s) {
  const li = el("li", `row ${s.status}`);
  if (s.stale) li.classList.add("stale");
  if (s.status === "completed") li.classList.add("done");
  li.tabIndex = 0;

  const hint = s.url ? (s.remote ? "Click to open this session in Claude" : "Click to open the chat") : s.resume ? `Click to copy: ${s.resume}` : "";
  li.title = [s.prompt ? `Last prompt: ${s.prompt}` : null, hint].filter(Boolean).join("\n");

  li.append(el("span", "dot"));

  const main = el("div", "main");
  main.append(el("div", "title", s.title));
  if (s.subtitle) main.append(el("div", "sub", s.subtitle));
  const word = s.stale ? "Stale" : STATUS_WORD[s.status] || s.status;
  const action = s.lastAction && s.lastAction !== word ? `${word} · ${s.lastAction}` : word;
  main.append(el("div", "meta", action));
  li.append(main);

  const side = el("div", "side");
  if (s.remote) side.append(el("span", "kind cloud", "cloud"));
  else if (s.type === "web_chat") side.append(el("span", "kind", "web"));
  side.append(el("span", "ago", s.ago));
  const dismiss = el("button", "dismiss", "×");
  dismiss.title = "Dismiss";
  dismiss.setAttribute("aria-label", `Dismiss ${s.title}`);
  dismiss.addEventListener("click", async (e) => {
    e.stopPropagation();
    li.style.opacity = "0.3";
    const res = await api.dismiss(s.key);
    if (!res.ok) {
      li.style.opacity = "";
      toast(res.error || "Couldn't dismiss");
    }
  });
  side.append(dismiss);
  li.append(side);

  const activate = async () => {
    const res = await api.activate(s.key);
    if (res.action === "copied") toast("Resume command copied");
    else if (!res.ok) toast("Nothing to open for this one");
  };
  li.addEventListener("click", activate);
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter") activate();
  });
  return li;
}

function renderFoot({ cloud, local }) {
  const foot = $("foot");
  foot.replaceChildren();
  let cloudText;
  if (!cloud.configured) cloudText = "Cloud off · run npm run setup";
  else if (cloud.error) cloudText = `Cloud error: ${cloud.error}`;
  else cloudText = "Cloud ✓";
  const c = el("span", cloud.error ? "err" : "", cloudText);
  c.title = cloud.error || "";
  foot.append(c, document.createTextNode(` · ${local.count} local transcript${local.count === 1 ? "" : "s"}`));
}

function render(payload) {
  const { sessions, counts } = payload;
  $("summary-text").textContent = summaryText(counts);
  const pip = $("pip");
  pip.className = `pip${counts.needYou ? " needs" : counts.running ? " running" : ""}`;
  $("list").replaceChildren(...sessions.map(renderRow));
  $("empty").hidden = sessions.length > 0;
  renderFoot(payload);
}

function setCollapsed(next) {
  collapsed = next;
  document.body.classList.toggle("collapsed", collapsed);
  api.collapse(collapsed);
}

function openAdd(open) {
  const form = $("add-form");
  form.hidden = !open;
  $("add-error").textContent = "";
  if (open) {
    if (collapsed) setCollapsed(false);
    $("add-title").focus();
  } else {
    form.reset();
  }
}

$("summary").addEventListener("click", () => setCollapsed(!collapsed));
$("hide").addEventListener("click", () => api.hide());
$("refresh").addEventListener("click", async () => render(await api.refresh()));
$("add").addEventListener("click", () => openAdd($("add-form").hidden));
$("add-cancel").addEventListener("click", () => openAdd(false));
$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await api.addWeb({ title: $("add-title").value, url: $("add-url").value });
  if (res.ok) {
    openAdd(false);
    toast("Chat added");
  } else {
    $("add-error").textContent = res.error || "Couldn't add it";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("add-form").hidden) openAdd(false);
});

api.onUpdate(render);
api.windowState().then((s) => {
  collapsed = s.collapsed;
  document.body.classList.toggle("collapsed", collapsed);
});
api.refresh().then(render);
