"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell,
} = require("electron");
const src = require("./sources");
const { circlePng } = require("./icon");

const POLL_MS = 8000;
const COLLAPSED_HEIGHT = 44;
const TOGGLE_SHORTCUT = "CommandOrControl+Alt+J";
const ACCENT = [34, 211, 238];
const WARN = [245, 158, 11];

if (!app.requestSingleInstanceLock()) app.quit();

const statePath = () => path.join(app.getPath("userData"), "sticky-state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return {};
  }
}

let state = {};
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(statePath()), { recursive: true });
      fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
    } catch {
      // Losing the window position is not worth a crash.
    }
  }, 300);
}

let win = null;
let tray = null;
let config = null;
let pollTimer = null;
let prevStatuses = null;
let latest = { sessions: [], counts: { running: 0, needYou: 0, total: 0 }, cloud: {}, local: {} };
const sessionsByKey = new Map();

function defaultBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 300;
  const height = 380;
  return { width, height, x: workArea.x + workArea.width - width - 24, y: workArea.y + 24 };
}

// Saved bounds can point at a monitor that's since been unplugged.
function onScreen(b) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + 20 > a.y,
  );
}

function createWindow() {
  const saved = state.bounds && onScreen(state.bounds) ? state.bounds : defaultBounds();
  const expandedHeight = state.expandedHeight || saved.height;
  win = new BrowserWindow({
    ...saved,
    height: state.collapsed ? COLLAPSED_HEIGHT : expandedHeight,
    minWidth: 220,
    minHeight: COLLAPSED_HEIGHT,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    backgroundColor: "#161616",
    title: "Claude sessions",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(0.97);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => {
    if (!state.hidden) win.showInactive();
  });

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    state.bounds = b;
    if (!state.collapsed) state.expandedHeight = b.height;
    saveState();
  };
  win.on("moved", remember);
  win.on("resized", remember);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

function setVisible(visible) {
  if (!win) return;
  state.hidden = !visible;
  saveState();
  if (visible) win.showInactive();
  else win.hide();
  refreshTrayMenu();
}

function toggleVisible() {
  setVisible(!(win && win.isVisible()));
}

function setCollapsed(collapsed) {
  if (!win) return;
  const b = win.getBounds();
  if (collapsed && !state.collapsed) state.expandedHeight = b.height;
  state.collapsed = collapsed;
  win.setBounds({ ...b, height: collapsed ? COLLAPSED_HEIGHT : state.expandedHeight || 380 });
  saveState();
}

function trayImage(needYou) {
  const img = nativeImage.createFromBuffer(circlePng(32, needYou ? WARN : ACCENT), { scaleFactor: 2 });
  return img;
}

function refreshTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: win && win.isVisible() ? "Hide note" : "Show note", accelerator: TOGGLE_SHORTCUT, click: toggleVisible },
      { label: "Refresh now", click: () => poll() },
      { type: "separator" },
      // Under `npm start` a login item would launch bare Electron, not this app.
      app.isPackaged
        ? {
            label: "Open at login",
            type: "checkbox",
            checked: login,
            click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
          }
        : { label: "Open at login (installed app only)", enabled: false },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

function updateTray() {
  if (!tray) return;
  const { running, needYou } = latest.counts;
  tray.setImage(trayImage(needYou));
  tray.setToolTip(`Claude sessions — ${running} running, ${needYou} need you`);
  if (process.platform === "darwin") tray.setTitle(needYou ? String(needYou) : "");
}

function createTray() {
  tray = new Tray(trayImage(0));
  tray.on("click", toggleVisible);
  refreshTrayMenu();
  updateTray();
}

function notifyWaiting(sessions) {
  if (!Notification.isSupported()) return;
  for (const s of sessions) {
    const n = new Notification({ title: `Claude needs you · ${s.title}`, body: s.lastAction || "Waiting for your input", silent: false });
    n.on("click", () => setVisible(true));
    n.show();
  }
}

async function collect() {
  config = await src.loadConfig();
  const now = Date.now();
  const cloud = { configured: config.configured, error: null };
  const [rows, locals] = await Promise.all([
    src.fetchWorkstreams(config).catch((err) => {
      cloud.error = err.name === "TimeoutError" ? "Supabase timed out" : err.message;
      return [];
    }),
    src.scanLocalSessions(config.projectsDir, now),
  ]);
  const merged = src.mergeSessions(rows, locals);
  const visible = src.sortForNote(src.visibleSessions(merged, now, state.dismissedLocal || {}), now);
  return {
    now,
    cloud,
    local: { dir: config.projectsDir, count: locals.length },
    counts: src.counts(visible, now),
    sessions: visible.map((s) => ({
      ...s,
      stale: src.isStale(s, now),
      ago: src.relativeTime(s.updatedAt, now),
      resume: src.resumeCommand(s),
    })),
  };
}

let polling = null;
async function poll() {
  if (polling) return polling;
  polling = (async () => {
    clearTimeout(pollTimer);
    try {
      latest = await collect();
      sessionsByKey.clear();
      for (const s of latest.sessions) sessionsByKey.set(s.key, s);
      notifyWaiting(src.newlyWaiting(prevStatuses, latest.sessions));
      prevStatuses = src.statusMap(latest.sessions);
      updateTray();
      if (win && !win.isDestroyed()) win.webContents.send("sessions:update", latest);
    } catch (err) {
      console.error("[session-sticky] poll failed:", err);
    } finally {
      polling = null;
      pollTimer = setTimeout(poll, POLL_MS);
    }
    return latest;
  })();
  return polling;
}

function pruneDismissed() {
  const cutoff = Date.now() - src.LOCAL_WINDOW_MS - src.ACTIVE_VISIBLE_MS;
  const d = state.dismissedLocal || {};
  for (const [id, ts] of Object.entries(d)) if (ts < cutoff) delete d[id];
  state.dismissedLocal = d;
}

function registerIpc() {
  ipcMain.handle("sessions:refresh", () => poll());

  ipcMain.handle("sessions:dismiss", async (_e, key) => {
    const s = sessionsByKey.get(key);
    if (!s) return { ok: false };
    if (s.sessionId) {
      state.dismissedLocal = { ...(state.dismissedLocal || {}), [s.sessionId]: Date.now() };
      pruneDismissed();
      saveState();
    }
    if (s.id) {
      try {
        await src.dismissWorkstream(config, s.id);
      } catch (err) {
        if (!s.sessionId) return { ok: false, error: err.message };
      }
    }
    await poll();
    return { ok: true };
  });

  ipcMain.handle("sessions:addWeb", async (_e, input) => {
    if (!config || !config.configured) return { ok: false, error: "Supabase isn't configured — see README." };
    const title = String((input && input.title) || "").trim();
    if (!title) return { ok: false, error: "Give it a title." };
    if (input.url && !src.normaliseUrl(input.url)) return { ok: false, error: "That link isn't a web address." };
    try {
      await src.addWebSession(config, { title, url: input.url });
    } catch (err) {
      return { ok: false, error: err.message };
    }
    await poll();
    return { ok: true };
  });

  ipcMain.handle("sessions:activate", async (_e, key) => {
    const s = sessionsByKey.get(key);
    if (!s) return { ok: false };
    if (s.url) {
      const url = src.normaliseUrl(s.url);
      if (url) await shell.openExternal(url);
      return { ok: Boolean(url), action: "opened" };
    }
    if (s.resume) {
      clipboard.writeText(s.resume);
      return { ok: true, action: "copied", text: s.resume };
    }
    return { ok: false };
  });

  ipcMain.handle("window:collapse", (_e, collapsed) => setCollapsed(Boolean(collapsed)));
  ipcMain.handle("window:hide", () => setVisible(false));
  ipcMain.handle("window:state", () => ({ collapsed: Boolean(state.collapsed) }));
}

app.on("second-instance", () => setVisible(true));

app.whenReady().then(() => {
  state = loadState();
  if (process.platform === "darwin" && app.dock) app.dock.hide();
  // First run of the installed app: start at login so it never needs launching
  // again. Only once — unticking it in the tray menu sticks.
  if (app.isPackaged && !state.loginItemSet) {
    app.setLoginItemSettings({ openAtLogin: true });
    state.loginItemSet = true;
    saveState();
  }
  registerIpc();
  createWindow();
  createTray();
  globalShortcut.register(TOGGLE_SHORTCUT, toggleVisible);
  poll();
});

app.on("will-quit", () => globalShortcut.unregisterAll());
// The tray keeps the app alive with the note hidden.
app.on("window-all-closed", (e) => e.preventDefault());
