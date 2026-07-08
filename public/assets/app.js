const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function appRequest(path, init = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || "GET", path, true);
    xhr.withCredentials = init.credentials !== "omit";
    Object.entries(init.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) xhr.setRequestHeader(key, value);
    });
    xhr.onload = () => resolve({
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      text: xhr.responseText || "",
    });
    xhr.onerror = () => reject(new Error("network request failed"));
    xhr.ontimeout = () => reject(new Error("network request timeout"));
    xhr.send(init.body || null);
  });
}

function appBlobRequest(path, init = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || "GET", path, true);
    xhr.withCredentials = init.credentials !== "omit";
    xhr.responseType = "blob";
    Object.entries(init.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) xhr.setRequestHeader(key, value);
    });
    xhr.onload = () => resolve({
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      blob: xhr.response,
      headers: {
        get: (name) => xhr.getResponseHeader(name),
      },
      text: () => new Promise((resolveText) => {
        const reader = new FileReader();
        reader.onload = () => resolveText(String(reader.result || ""));
        reader.onerror = () => resolveText("");
        reader.readAsText(xhr.response);
      }),
    });
    xhr.onerror = () => reject(new Error("network request failed"));
    xhr.ontimeout = () => reject(new Error("network request timeout"));
    xhr.send(init.body || null);
  });
}

const icons = {
  "layout-dashboard": "M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Zm12-2h4V5h-4v14Z",
  inbox: "M4 4h16l2 10v6H2v-6L4 4Zm2 2-1.2 6H9l2 3h2l2-3h4.2L18 6H6Z",
  mail: "M3 5h18v14H3V5Zm2 3v9h14V8l-7 5-7-5Zm13-1H6l6 4 6-4Z",
  "list-filter": "M4 6h16v2H4V6Zm3 5h10v2H7v-2Zm3 5h4v2h-4v-2Z",
  "key-round": "M14 14a5 5 0 1 1 1.4-3.6L22 17v3h-3v-3h-3l-2-2Zm-5-1.5A2.5 2.5 0 1 0 9 7a2.5 2.5 0 0 0 0 5.5Z",
  shield: "M12 2 20 5v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5l8-3Zm0 2.2L6 6.4V11c0 3.8 2.3 6.8 6 8.6 3.7-1.8 6-4.8 6-8.6V6.4l-6-2.2Z",
  "log-in": "M10 17v-2h4V9h-4V7l7 5-7 5ZM3 4h8v2H5v12h6v2H3V4Z",
  "log-out": "M14 17v-2h-4V9h4V7l7 5-7 5ZM3 4h8v2H5v12h6v2H3V4Z",
  "refresh-cw": "M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.3L13 11h8V3l-3.3 3.3Z",
  "scan-line": "M4 5h16v2H4V5Zm0 12h16v2H4v-2Zm2-6h12v2H6v-2Z",
  upload: "M12 3 7 8h3v7h4V8h3l-5-5ZM5 19h14v2H5v-2Z",
  download: "M12 18l5-5h-3V4h-4v9H7l5 5ZM5 20h14v2H5v-2Z",
  box: "M4 7 12 3l8 4v10l-8 4-8-4V7Zm3.2.2L12 9.6l4.8-2.4L12 4.8 7.2 7.2ZM6 8.8v7l5 2.5v-7l-5-2.5Zm7 9.5 5-2.5v-7l-5 2.5v7Z",
  search: "M10 4a6 6 0 1 1-3.7 10.7L3 18l-1.4-1.4 3.3-3.3A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  save: "M5 3h12l2 2v16H5V3Zm2 2v5h10V6.2L15.8 5H7Zm0 14h10v-7H7v7Z",
  settings: "M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2.6-1.5L14 2h-4l-.4 3a7 7 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5A8 8 0 0 0 4.5 12c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2.6 1.5l.4 3h4l.4-3a7 7 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z",
  plug: "M7 2h2v6h2V2h2v6h2V2h2v6a5 5 0 0 1-4 4.9V16h3v2h-3v4h-2v-4H8v-2h3v-3.1A5 5 0 0 1 7 8V2Z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  x: "m6 5 6 6 6-6 1 1-6 6 6 6-1 1-6-6-6 6-1-1 6-6-6-6 1-1Z",
};

let currentUser = null;
let categories = [];
let mailboxTotals = { total: 0, used: 0, available: 0, takeable: 0 };
let usedBreakdown = [];
let accounts = [];
let accountPage = 1;
let accountTotal = 0;
let selectedAccountIds = new Set();
let gptAccounts = [];
let gptAccountPage = 1;
let gptAccountTotal = 0;
let selectedGptAccountIds = new Set();
let gptAccountCounts = [];
let gptAccountResultCounts = [];
let gptRefreshJobs = [];
let gptInspectionJobs = [];
let gptErrorRules = [];
let phoneCodePool = [];
let gptExports = [];
let gptEvents = [];
let selectedGptExportId = "";
let selectedGptExportDetail = null;
let gptNativePanel = "warehouse";
let gptRefreshRunning = false;
let gptRefreshStopRequested = false;
let gptRefreshRows = [];
let gptCpaRows = [];
let selectedCpaRows = new Set();
let gptSessionConverted = [];
let gptSessionSkipped = [];
let gptSessionOutputText = "";
let selectedEmail = "";
let scanTimer = null;
let mailboxGroupOpen = {};
let codeHealth = {};
let invites = [];
let invitePage = 1;
let inviteTotal = 0;
let adminUsers = [];
let adminUserPage = 1;
let adminUserTotal = 0;
const DELIVERY_TEST_UI_ENABLED = false;
const GPT_CONFIG_STORAGE_KEY = "mailops.gpt.workbench.config.v1";
const GPT_CONFIG_FIELDS = [
  "gpt-import-proxy",
  "gpt-import-sub2-group",
  "gpt-import-result",
  "gpt-refresh-proxy",
  "gpt-refresh-cpa-base",
  "gpt-refresh-cpa-key",
  "gpt-refresh-mode",
  "gpt-refresh-phone-api",
  "gpt-cpa-base-url",
  "gpt-cpa-key",
  "gpt-cpa-limit",
  "gpt-cpa-use-proxy",
  "gpt-cpa-proxy",
  "gpt-converter-format",
];
const WENAS_CONFIG_FIELD_MAP = {
  "gpt-wenas-base-url": "base_url",
  "gpt-wenas-api-key": "api_key",
  "gpt-wenas-api-secret": "api_secret",
  "gpt-wenas-source-platform": "source_platform",
  "gpt-wenas-product-id": "product_id",
  "gpt-wenas-product-slug": "product_slug",
  "gpt-wenas-external-product-id": "external_product_id",
  "gpt-wenas-sku-id": "sku_id",
  "gpt-wenas-sku-code": "sku_code",
  "gpt-wenas-batch-prefix": "batch_no_prefix",
  "gpt-wenas-callback-url": "supplier_callback_url",
};
let gptWorkbenchConfigReady = false;
let gptWorkbenchConfigSaveTimer = null;

const pageMeta = {
  overview: ["概览", "资产、扫描、验证码和接口状态"],
  mailboxes: ["邮箱资产", "导入、筛选、扫描和导出 OAuth 邮箱池"],
  gptaccounts: ["GPT账号", "注册机上报、账号状态、CPA/Sub2 导出"],
  messages: ["邮件查看", "按邮箱和文件夹查看已缓存邮件"],
  rules: ["分类规则", "用可视化规则管理 safe/free/套餐 等分类"],
  api: ["API 中心", "兼容 MailManage 的外部接口和 API Key"],
  admin: ["管理员", "注册开关与邀请码"],
};

function mountIcons() {
  qsa(".icon").forEach((el) => {
    const name = el.dataset.icon;
    const path = icons[name] || icons.search;
    el.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function maskEmail(value) {
  const s = String(value || "");
  const at = s.indexOf("@");
  if (at < 2) return s;
  return `${s.slice(0, 2)}***${s.slice(at)}`;
}

function categoryLabel(value) {
  const text = String(value ?? "").trim();
  const lower = text.toLowerCase();
  const labels = {
    safe: "可用",
    new: "未扫描",
    used: "已用",
    free: "免费",
    plus: "套餐",
    pro: "套餐",
    team: "套餐",
    plan: "套餐",
    error: "错误",
    invalid: "失效",
    no_code: "不收码",
    unknown: "未识别",
    "待确认": "待确认",
    "套餐": "套餐",
  };
  return labels[text] || labels[lower] || text || "未分类";
}

function metricNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function api(path, options = {}) {
  const init = {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  };
  return appRequest(path, init)
    .then((r) => {
      const text = r.text;
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text || `HTTP ${r.status}` }; }
      if (!r.ok && data.ok !== false) data = { ok: false, error: data.error || `HTTP ${r.status}` };
      if (data.error === "unauthorized" && !options.silentAuth) showLogin();
      return data;
    })
    .catch((err) => ({ ok: false, error: err.message || "网络请求失败" }));
}

function toast(message, ok = true) {
  const el = $("toast");
  el.textContent = message;
  el.style.background = ok ? "#0f172a" : "#b91c1c";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2400);
}

function fmtDate(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

function colorClass(value) {
  const s = String(value || "new").toLowerCase();
  if (["safe", "free", "error", "invalid", "new", "plus", "pro", "team", "used"].includes(s)) return s;
  if (value === "套餐") return "plan";
  if (value === "待确认" || s === "review") return "review";
  return "new";
}

function currentFilterQuery() {
  const v = $("status-filter").value || "";
  if (v === "used") return "used=1&include_used=1&include_unhealthy=1";
  if (v.startsWith("usedcat:")) return `used=1&include_used=1&include_unhealthy=1&category=${encodeURIComponent(v.slice(8))}`;
  if (v === "unused") return "unused=1&include_reserved=1&include_unhealthy=1";
  if (v === "takeable") return "takeable=1";
  if (v.startsWith("cat:")) return `category=${encodeURIComponent(v.slice(4))}`;
  if (v.startsWith("status:")) return `status=${encodeURIComponent(v.slice(7))}`;
  return "";
}

function currentFilterObject() {
  const v = $("status-filter").value || "";
  if (v === "used") return { used: true, include_used: true };
  if (v.startsWith("usedcat:")) return { used: true, include_used: true, category: v.slice(8) };
  if (v === "unused") return { scope: "unused" };
  if (v === "takeable") return { takeable: true };
  if (v.startsWith("cat:")) return { category: v.slice(4) };
  if (v.startsWith("status:")) return { status: v.slice(7) };
  return {};
}

function pageSize() {
  return parseInt($("page-size").value, 10) || 20;
}

function showLogin() {
  clearTimeout(scanTimer);
  currentUser = null;
  adminUsers = [];
  invites = [];
  applyRoleUI();
  setTab("overview");
  $("app-view").classList.add("hidden");
  $("auth-view").classList.remove("hidden");
}

function showApp() {
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  loadMe().then(() => {
    loadCategories();
    loadAccounts();
    loadRules();
    loadApiKeys();
    loadStats();
    pollScan();
  });
}

function setTab(name) {
  if (name === "admin" && (!currentUser || currentUser.role !== "admin")) name = "overview";
  qsa(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  qsa(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelector(".workspace")?.classList.toggle("mailboxes-workspace", name === "mailboxes");
  const meta = pageMeta[name] || pageMeta.overview;
  $("page-title").textContent = meta[0];
  $("page-subtitle").textContent = meta[1];
  if (name === "gptaccounts") { loadGptAccounts(); loadGptWorkbench(); }
  if (name === "messages") loadViewerMailboxes();
  if (name === "api") loadStats();
}

function clearAdminUiIfNeeded(isAdmin) {
  if (isAdmin) return;
  if ($("tab-admin")?.classList.contains("active")) setTab("overview");
  adminUsers = [];
  invites = [];
  inviteTotal = 0;
  adminUserTotal = 0;
  if ($("users-body")) $("users-body").innerHTML = "";
  if ($("invites-body")) $("invites-body").innerHTML = "";
  if ($("invite-summary")) $("invite-summary").textContent = "";
  if ($("admin-user-page-info")) $("admin-user-page-info").textContent = "";
}

function applyRoleUI() {
  const isAdmin = currentUser && currentUser.role === "admin";
  const isPrimaryAdmin = isAdmin && currentUser.username === "admin";
  qsa(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin));
  qsa(".primary-admin-only").forEach((el) => el.classList.toggle("hidden", !isPrimaryAdmin));
  $("role-badge").textContent = isAdmin ? "admin" : "user";
  clearAdminUiIfNeeded(isAdmin);
  $("user-chip").textContent = `${currentUser?.username || ""} · ${isAdmin ? "管理员" : "用户"}`;
}

async function loadMe() {
  const d = await api("/api/me", { silentAuth: true });
  if (!d.ok) return showLogin();
  currentUser = d.user;
  applyRoleUI();
  if ($("registration-enabled")) $("registration-enabled").checked = !!(d.settings && d.settings.registration_enabled);
  if (currentUser.role === "admin") {
    if (currentUser.username === "admin") loadInvites();
    loadUsers();
  }
}

async function loadCategories() {
  const d = await api("/api/categories");
  if (!d.ok) return;
  categories = d.categories || [];
  usedBreakdown = d.used_breakdown || [];
  mailboxTotals = {
    total: parseInt(d.total, 10) || 0,
    used: parseInt(d.used_count, 10) || 0,
    available: parseInt(d.available_count, 10) || 0,
    takeable: parseInt(d.takeable_count, 10) || 0,
  };
  renderStats();
  refreshFilterOptions();
}

function renderStats() {
  const total = metricNumber(mailboxTotals.total, categories.reduce((sum, c) => sum + metricNumber(c.count), 0));
  const used = metricNumber(mailboxTotals.used, metricNumber((categories.find((c) => c.category === "used") || {}).count));
  const available = metricNumber(mailboxTotals.available, Math.max(0, total - used));
  const takeable = metricNumber(mailboxTotals.takeable);
  const reviewCount = metricNumber((categories.find((c) => c.category === "待确认") || {}).count);
  const healthCards = [
    { category: "收码正常", count: codeHealth.healthy || 0, health: "healthy" },
    { category: "收码观察", count: codeHealth.suspect || 0, health: "suspect" },
    { category: "不收码", count: codeHealth.no_code || 0, health: "no_code" },
  ];
  const categoryCards = (categories.length ? categories : [
    { category: "free", count: 0 },
    { category: "套餐", count: 0 },
    { category: "未识别/失败", count: 0 },
  ]).filter((item) => !["used", "no_code"].includes(String(item.category || "").toLowerCase()))
    .map((item) => ({ ...item, displayCategory: categoryLabel(item.category), categoryPart: true }));
  const usedCards = usedBreakdown.map((item) => ({ ...item, displayCategory: `${categoryLabel(item.category)}已用`, usedPart: true }));
  const order = [
    { category: "总邮箱", count: total },
    { category: "已用", count: used, usedAll: true },
    { category: "未用", count: available },
    { category: "可取号", count: takeable, takeable: true },
    { category: "待确认", count: reviewCount, review: true },
    ...categoryCards,
    ...usedCards,
    ...healthCards,
  ];
  $("stats-grid").innerHTML = order.map((c) => `
    <article class="metric-card" data-category="${esc(c.category)}" data-health="${esc(c.health || "")}" data-category-part="${c.categoryPart ? "1" : ""}" data-used-part="${c.usedPart ? "1" : ""}" data-used-all="${c.usedAll ? "1" : ""}" data-takeable="${c.takeable ? "1" : ""}" data-review="${c.review ? "1" : ""}">
      <strong>${esc(c.count)}</strong>
      <span>${esc(c.displayCategory || c.category)}</span>
    </article>
  `).join("");
  qsa(".metric-card").forEach((card) => {
    card.onclick = () => {
      const cat = card.dataset.category;
      const health = card.dataset.health;
      setTab("mailboxes");
      if (health === "no_code") $("status-filter").value = "cat:no_code";
      else if (card.dataset.usedAll) $("status-filter").value = "used";
      else if (card.dataset.usedPart) $("status-filter").value = cat === "未识别/失败" ? "used" : `usedcat:${cat}`;
      else if (card.dataset.categoryPart) $("status-filter").value = `cat:${cat}`;
      else if (card.dataset.takeable) $("status-filter").value = "takeable";
      else if (card.dataset.review) $("status-filter").value = "cat:待确认";
      else if (cat === "未用") $("status-filter").value = "unused";
      accountPage = 1;
      loadAccounts();
    };
  });
}

function refreshFilterOptions() {
  const current = $("status-filter").value;
  let html = "<option value=''>全部</option><option value='takeable'>可取号</option><option value='unused'>正常未用（可用/未扫描）</option><option value='status:new'>未扫描</option><option value='status:invalid'>失效</option><option value='status:error'>错误</option>";
  categories.forEach((c) => {
    const value = c.category === "used" ? "used" : `cat:${esc(c.category)}`;
    const label = c.category === "used" ? "已用" : `分类: ${esc(categoryLabel(c.category))}`;
    html += `<option value="${value}">${label} (${esc(c.count)})</option>`;
  });
  $("status-filter").innerHTML = html;
  $("status-filter").value = current;
}

async function loadAccounts() {
  const q = currentFilterQuery();
  const search = $("account-search").value.trim();
  const params = [q, `page=${accountPage}`, `limit=${pageSize()}`];
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  const d = await api(`/api/accounts?${params.filter(Boolean).join("&")}`);
  if (!d.ok) return toast(d.error || "加载失败", false);
  accounts = d.accounts || [];
  accountTotal = d.total || accounts.length;
  renderAccounts();
  loadCategories();
}

function updateSelectionUI() {
  const pageIds = accounts.map((a) => String(a.id));
  const selectedOnPage = pageIds.filter((id) => selectedAccountIds.has(id));
  const allBox = $("select-page-accounts");
  if (allBox) {
    allBox.checked = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
    allBox.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
  }
  const delBtn = $("delete-selected-btn");
  if (delBtn) {
    delBtn.disabled = selectedAccountIds.size === 0;
    delBtn.textContent = selectedAccountIds.size ? `删除选中 ${selectedAccountIds.size}` : "删除选中";
  }
  const restoreBtn = $("restore-selected-btn");
  if (restoreBtn) {
    restoreBtn.disabled = selectedAccountIds.size === 0;
    restoreBtn.textContent = selectedAccountIds.size ? `恢复选中为 safe ${selectedAccountIds.size}` : "恢复选中为 safe";
  }
  const restoreUsedBtn = $("restore-used-selected-btn");
  if (restoreUsedBtn) {
    restoreUsedBtn.disabled = selectedAccountIds.size === 0;
    restoreUsedBtn.textContent = selectedAccountIds.size ? `恢复选中为已用 ${selectedAccountIds.size}` : "恢复选中为已用";
  }
  const testBtn = $("test-selected-btn");
  if (testBtn) {
    testBtn.disabled = selectedAccountIds.size === 0;
    testBtn.textContent = selectedAccountIds.size ? `测试连接 ${selectedAccountIds.size}` : "测试连接";
  }
  const bar = $("selection-bar");
  if (bar) {
    bar.classList.toggle("hidden", selectedAccountIds.size === 0);
    $("selection-count").textContent = `已选择 ${selectedAccountIds.size} 个邮箱`;
    $("select-page-link").textContent = selectedOnPage.length === pageIds.length && pageIds.length ? "取消本页选择" : "本页全选";
  }
}

function renderAccounts() {
  $("mailbox-count").textContent = `${accountTotal} 个邮箱`;
  if (!accounts.length) {
    $("accounts-body").innerHTML = `<tr><td colspan="11"><div class="empty">当前没有邮箱账号。请导入邮箱或调整筛选。</div></td></tr>`;
    renderPager();
    updateSelectionUI();
    return;
  }
  $("accounts-body").innerHTML = accounts.map((a, i) => {
    const id = String(a.id);
    return `
    <tr>
      <td><input class="account-select" type="checkbox" data-id="${esc(id)}" ${selectedAccountIds.has(id) ? "checked" : ""} aria-label="选择 ${esc(a.email)}"></td>
      <td>${(accountPage - 1) * pageSize() + i + 1}</td>
      <td class="email-cell"><strong>${esc(a.email)}</strong><small>${esc(a.tag || a.provider || "")}</small></td>
      <td><span class="badge ${colorClass(a.category)}">${esc(categoryLabel(a.category || "new"))}</span></td>
      <td>${esc(a.status || "")}</td>
      <td>${a.used ? '<span class="badge invalid">已用</span>' : a.reserved ? '<span class="badge free">已预留</span>' : '<span class="badge safe">可用</span>'}</td>
      <td>${codeHealthBadge(a)}</td>
      <td>${esc(a.message_count || 0)}</td>
      <td class="reason-cell">${esc(oneLine(a.reason || ""))}</td>
      <td>${esc(fmtDate(a.last_scan_at))}</td>
      <td>
        <div class="row-actions">
          <button class="button ghost view-mail-btn" data-email="${esc(a.email)}">查看邮件</button>
          <button class="button danger delete-btn" data-id="${a.id}">移除</button>
        </div>
      </td>
    </tr>
  `;
  }).join("");
  qsa(".account-select").forEach((box) => box.onchange = () => {
    const id = String(box.dataset.id || "");
    if (box.checked) selectedAccountIds.add(id);
    else selectedAccountIds.delete(id);
    updateSelectionUI();
  });
  qsa(".delete-btn").forEach((btn) => btn.onclick = () => deleteAccount(btn.dataset.id));
  qsa(".view-mail-btn").forEach((btn) => btn.onclick = () => openMailboxMessages(btn.dataset.email));
  renderPager();
  updateSelectionUI();
}

function toggleCurrentPageSelection() {
  const pageIds = accounts.map((a) => String(a.id));
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedAccountIds.has(id));
  pageIds.forEach((id) => {
    if (allSelected) selectedAccountIds.delete(id);
    else selectedAccountIds.add(id);
  });
  renderAccounts();
}

function clearAccountSelection() {
  selectedAccountIds.clear();
  renderAccounts();
}

function gptPageSize() {
  return parseInt($("gpt-page-size").value, 10) || 20;
}

function gptStatusLabel(value) {
  return {
    pending_export: "待导出",
    exported: "已导出",
    archived: "已归档",
    exception: "异常",
    failed: "注册失败",
    needs_review: "需复查",
  }[value] || value || "";
}

function gptResultLabel(value) {
  return { success: "成功", partial: "部分完成", failed: "失败" }[value] || value || "";
}

function gptSourceLabel(value) {
  const stage = String(value?.stage || "");
  const raw = String(value?.raw_payload || "");
  const dedupe = String(value?.dedupe_key || "");
  if (stage === "session_converter") return "Session";
  if (stage === "manual_import" || dedupe.startsWith("manual:")) return "手动";
  if (stage.startsWith("cpa") || raw.includes('"source":"cpa"')) return "CPA";
  if (stage.startsWith("sub2") || raw.includes('"source":"sub2"')) return "Sub2";
  if (raw.includes("gpt_account_report") || raw.includes("chatgpt-auto-register") || ["uploaded", "registered", "register_failed"].includes(stage)) return "注册机";
  return stage || "未知";
}

function gptExportLabel(account) {
  if (account.status === "archived") return '<span class="badge new">已归档</span>';
  if (account.exported_at || account.status === "exported") {
    const fmt = String(account.export_format || "").toUpperCase();
    return `<span class="badge new">已导出${fmt ? " " + esc(fmt) : ""}</span>`;
  }
  return '<span class="badge safe">未导出</span>';
}

function gptWenasLabel(account) {
  const status = account.wenas_sync_status || (account.wenas_card_secret_id ? "synced" : "");
  const label = `<span class="badge ${gptBadgeClass(status)}">${esc(gptWenasStatusLabel(status))}</span>`;
  const details = [];
  if (account.wenas_card_secret_id) details.push(`卡密#${account.wenas_card_secret_id}`);
  if (account.wenas_batch_no) details.push(account.wenas_batch_no);
  if (account.wenas_sync_error) details.push(account.wenas_sync_error);
  return `${label}${details.length ? `<small class="muted block-text">${esc(details.join(" · "))}</small>` : ""}`;
}

function gptLivecheckLabel(account) {
  const result = account.livecheck_result || "";
  const status = result || account.livecheck_status || "";
  const label = `<span class="badge ${gptBadgeClass(status)}">${esc(result || gptLivecheckStatusLabel(status))}</span>`;
  const details = [];
  if (account.wenas_check_task_id) details.push(`任务#${account.wenas_check_task_id}`);
  if (account.livecheck_message) details.push(account.livecheck_message);
  if (account.livecheck_checked_at) details.push(fmtDate(account.livecheck_checked_at));
  return `${label}${details.length ? `<small class="muted block-text">${esc(details.join(" · "))}</small>` : ""}`;
}

function gptExportFormatLabel(value) {
  const v = String(value || "").toUpperCase();
  return v || "导出";
}

function eventDetailText(value) {
  if (!value) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadJsonFile(fileName, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getTimestampToken(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function epochSecondsFromValue(value) {
  if (value === undefined || value === null || value === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
}

function setGptNativePanel(name) {
  gptNativePanel = name || "warehouse";
  qsa(".gpt-native-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.gptPanel === gptNativePanel));
  qsa(".gpt-native-panel").forEach((panel) => {
    const active = panel.id === `gpt-panel-${gptNativePanel}`;
    panel.classList.toggle("active", active);
    panel.classList.toggle("hidden", !active);
  });
}

function readGptWorkbenchConfig() {
  try {
    return JSON.parse(localStorage.getItem(GPT_CONFIG_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeGptWorkbenchConfig(config) {
  try {
    localStorage.setItem(GPT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage can be disabled; the app should keep working without persistence.
  }
}

function applyGptWorkbenchConfig() {
  const config = readGptWorkbenchConfig();
  GPT_CONFIG_FIELDS.forEach((id) => {
    const el = $(id);
    if (!el || config[id] === undefined) return;
    if (el.type === "checkbox") el.checked = Boolean(config[id]);
    else el.value = config[id];
  });
}

function collectGptWorkbenchConfig() {
  const config = {};
  GPT_CONFIG_FIELDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    config[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return config;
}

async function loadGptWorkbenchConfig() {
  const localConfig = readGptWorkbenchConfig();
  if (Object.keys(localConfig).length) applyGptWorkbenchConfig();
  const d = await api("/api/gpt-workbench/config", { silentAuth: true });
  if (d.ok && d.config) {
    writeGptWorkbenchConfig(d.config);
    applyGptWorkbenchConfig();
  }
  gptWorkbenchConfigReady = true;
}

async function saveGptWorkbenchConfig() {
  if (!gptWorkbenchConfigReady) return;
  const config = collectGptWorkbenchConfig();
  writeGptWorkbenchConfig(config);
  const d = await api("/api/gpt-workbench/config", {
    method: "POST",
    body: JSON.stringify({ config }),
    silentAuth: true,
  });
  if (!d.ok) {
    console.warn("GPT workbench config save failed", d.error || d);
  }
}

function bindGptWorkbenchConfigPersistence() {
  loadGptWorkbenchConfig();
  GPT_CONFIG_FIELDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const eventName = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
    el.addEventListener(eventName, () => {
      clearTimeout(gptWorkbenchConfigSaveTimer);
      gptWorkbenchConfigSaveTimer = setTimeout(saveGptWorkbenchConfig, 350);
    });
  });
}

function gptWenasStatusLabel(value) {
  return {
    created: "已同步",
    synced: "已同步",
    skipped: "已存在",
    failed: "失败",
    pending: "待同步",
  }[value] || value || "未同步";
}

function gptLivecheckStatusLabel(value) {
  return {
    queued: "已排队",
    running: "检测中",
    completed: "已完成",
    failed: "失败",
    alive: "可用",
    dead: "不可用",
    unknown: "未知",
  }[value] || value || "未测活";
}

function gptBadgeClass(value) {
  const v = String(value || "");
  if (["success", "pending_export", "available", "ok", "alive", "created", "synced"].includes(v)) return "safe";
  if (["partial", "needs_review", "exception", "queued", "running", "reserved", "warning"].includes(v)) return "free";
  if (["failed", "invalid", "danger", "dead", "locked", "risk"].includes(v)) return "invalid";
  if (["exported", "archived", "used", "paused", "cancelled", "skipped", "unknown"].includes(v)) return "new";
  return "new";
}

function updateGptSelectionUI() {
  const pageIds = gptAccounts.map((a) => String(a.id));
  const selectedOnPage = pageIds.filter((id) => selectedGptAccountIds.has(id));
  const allBox = $("select-page-gpt-accounts");
  if (allBox) {
    allBox.checked = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
    allBox.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
  }
  const hasSelection = selectedGptAccountIds.size > 0;
  ["gpt-export-sub2-btn", "gpt-export-cpa-btn", "gpt-export-cockpit-btn", "gpt-archive-btn", "gpt-delete-btn", "gpt-refresh-queue-btn", "gpt-inspect-queue-btn", "gpt-native-refresh-selected-btn", "gpt-wenas-sync-btn", "gpt-wenas-check-btn", "gpt-wenas-result-btn"].forEach((id) => {
    if ($(id)) $(id).disabled = !hasSelection;
  });
  const bar = $("gpt-selection-bar");
  if (bar) {
    bar.classList.toggle("hidden", !hasSelection);
    $("gpt-selection-count").textContent = `已选择 ${selectedGptAccountIds.size} 个账号`;
    $("gpt-select-page-link").textContent = selectedOnPage.length === pageIds.length && pageIds.length ? "取消本页选择" : "本页全选";
  }
}

function renderGptSummary() {
  const countMap = Object.fromEntries((gptAccountCounts || []).map((x) => [x.status, x.count]));
  const resultMap = Object.fromEntries((gptAccountResultCounts || []).map((x) => [x.result, x.count]));
  const pending = countMap.pending_export || 0;
  const exported = countMap.exported || 0;
  const exception = countMap.exception || countMap.needs_review || 0;
  const failed = countMap.failed || 0;
  if ($("gpt-metric-pending")) $("gpt-metric-pending").textContent = pending;
  if ($("gpt-metric-exported")) $("gpt-metric-exported").textContent = exported;
  if ($("gpt-metric-exception")) $("gpt-metric-exception").textContent = exception;
  if ($("gpt-metric-failed")) $("gpt-metric-failed").textContent = failed;
  const items = [
    ["待导出", pending, "safe"],
    ["已导出", exported, "new"],
    ["异常", exception, "free"],
    ["注册失败", failed, "invalid"],
    ["成功", resultMap.success || 0, "safe"],
    ["部分完成", resultMap.partial || 0, "free"],
  ];
  $("gpt-status-summary").innerHTML = items.map(([label, count, cls]) => `<span class="badge ${cls}">${esc(label)} ${esc(count)}</span>`).join("");
}

async function loadGptAccounts() {
  const params = [`page=${gptAccountPage}`, `limit=${gptPageSize()}`];
  const status = $("gpt-status-filter").value;
  const result = $("gpt-result-filter").value;
  const source = $("gpt-source-filter")?.value || "";
  const exportState = $("gpt-export-filter")?.value || "";
  const search = $("gpt-search").value.trim();
  if (status) params.push(`status=${encodeURIComponent(status)}`);
  if (result) params.push(`result=${encodeURIComponent(result)}`);
  if (source) params.push(`source=${encodeURIComponent(source)}`);
  if (exportState) params.push(`export=${encodeURIComponent(exportState)}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  const d = await api(`/api/gpt-accounts?${params.join("&")}`);
  if (!d.ok) return toast(d.error || "GPT账号加载失败", false);
  gptAccounts = d.accounts || [];
  gptAccountTotal = d.total || gptAccounts.length;
  gptAccountCounts = d.counts || [];
  gptAccountResultCounts = d.result_counts || [];
  renderGptAccounts();
}

async function loadGptWorkbench() {
  await Promise.all([
    loadGptRefreshJobs(),
    loadGptInspectionJobs(),
    loadGptErrorRules(),
    loadPhoneCodePool(),
    loadGptExports(),
    loadGptEvents(),
  ]);
}

function selectedGptIds() {
  return [...selectedGptAccountIds].filter(Boolean);
}

function setWenasStatus(message, ok = true) {
  const el = $("gpt-wenas-status");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("danger-text", !ok);
}

function collectWenasConfig() {
  const config = {};
  Object.entries(WENAS_CONFIG_FIELD_MAP).forEach(([id, key]) => {
    const el = $(id);
    if (el) config[key] = String(el.value || "").trim();
  });
  return config;
}

function fillWenasConfig(config = {}, configured = false) {
  Object.entries(WENAS_CONFIG_FIELD_MAP).forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.value = config[key] || "";
  });
  if ($("gpt-wenas-api-secret")) {
    $("gpt-wenas-api-secret").placeholder = configured ? "已保存，留空不修改" : "";
  }
}

async function loadWenasConfig() {
  const d = await api("/api/wenas/config");
  if (!d.ok) {
    setWenasStatus(d.error || "卡密配置加载失败", false);
    return;
  }
  fillWenasConfig(d.config || {}, !!d.configured);
  setWenasStatus(d.configured ? "卡密配置已保存" : "请先保存 Wenas OpenAPI 配置");
}

async function saveWenasConfig() {
  const d = await api("/api/wenas/config", {
    method: "POST",
    body: JSON.stringify({ config: collectWenasConfig() }),
  });
  if (!d.ok) {
    setWenasStatus(d.error || "卡密配置保存失败", false);
    return toast(d.error || "卡密配置保存失败", false);
  }
  fillWenasConfig(d.config || {}, !!d.configured);
  setWenasStatus(d.configured ? "配置已保存，可同步卡密" : "配置已保存，但缺少地址、Key 或 Secret", !!d.configured);
  toast("卡密配置已保存");
}

async function testWenasConfig() {
  setWenasStatus("正在测试连接...");
  const d = await api("/api/wenas/test", { method: "POST", body: "{}" });
  if (!d.ok) {
    setWenasStatus(d.error || "Wenas 连接失败", false);
    return toast(d.error || "Wenas 连接失败", false);
  }
  setWenasStatus("Wenas 连接正常");
  toast("Wenas 连接正常");
}

async function toggleWenasPanel() {
  const panel = $("gpt-wenas-panel");
  if (!panel) return;
  const willOpen = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !willOpen);
  if (willOpen) await loadWenasConfig();
}

async function syncSelectedGptToWenas() {
  const ids = selectedGptIds();
  if (!ids.length) return toast("先选择 GPT 账号", false);
  if (!confirm(`确定把选中的 ${ids.length} 个 GPT 账号同步到卡密系统？\n\n已同步过的账号会按外部账号 ID 幂等跳过。`)) return;
  setWenasStatus("正在同步卡密...");
  const d = await api("/api/wenas/inventory/sync", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!d.ok) {
    setWenasStatus(d.error || "卡密同步失败", false);
    return toast(d.error || "卡密同步失败", false);
  }
  setWenasStatus(`同步完成：新建 ${d.created || 0}，跳过 ${d.skipped || 0}`);
  toast(`卡密同步完成：新建 ${d.created || 0}，跳过 ${d.skipped || 0}`);
  await Promise.all([loadGptAccounts(), loadGptEvents()]);
}

async function createWenasCheckTasks() {
  const ids = selectedGptIds();
  if (!ids.length) return toast("先选择 GPT 账号", false);
  if (!confirm(`确定为选中的 ${ids.length} 个账号创建测活任务？`)) return;
  setWenasStatus("正在创建测活任务...");
  const d = await api("/api/wenas/check-tasks", {
    method: "POST",
    body: JSON.stringify({ ids, scenario: "patrol", checker_type: "mailops" }),
  });
  if (!d.ok) {
    setWenasStatus(d.error || "测活任务创建失败", false);
    return toast(d.error || "测活任务创建失败", false);
  }
  const count = (d.created || []).length;
  setWenasStatus(`已创建 ${count} 个测活任务`);
  toast(`已创建 ${count} 个测活任务`);
  await Promise.all([loadGptAccounts(), loadGptEvents()]);
}

async function submitWenasCheckResultForSelected() {
  const ids = selectedGptIds();
  if (!ids.length) return toast("先选择 GPT 账号", false);
  const result = $("gpt-wenas-result")?.value || "unknown";
  const confidence = Math.round(Math.max(0, Math.min(1, Number($("gpt-wenas-confidence")?.value || 1))) * 100);
  const message = $("gpt-wenas-message")?.value || "";
  const applyBusinessResult = $("gpt-wenas-apply-result")?.checked !== false;
  if (!confirm(`确定把选中的 ${ids.length} 个账号回写为 ${result}？`)) return;
  setWenasStatus("正在回写测活结果...");
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    const d = await api("/api/wenas/check-tasks/result", {
      method: "POST",
      body: JSON.stringify({ id, result, confidence, message, apply_business_result: applyBusinessResult }),
    });
    if (d.ok) ok += 1;
    else failed += 1;
  }
  setWenasStatus(`测活回写完成：成功 ${ok}，失败 ${failed}`, failed === 0);
  toast(`测活回写完成：成功 ${ok}，失败 ${failed}`, failed === 0);
  await Promise.all([loadGptAccounts(), loadGptEvents()]);
}

async function importGptAccounts() {
  const text = $("gpt-import-text").value.trim();
  if (!text) return toast("先粘贴要导入的账号", false);
  const d = await api("/api/gpt-accounts/import", {
    method: "POST",
    body: JSON.stringify({
      text,
      defaults: {
        batch_id: $("gpt-import-batch").value.trim(),
        proxy: $("gpt-import-proxy").value.trim(),
        sub2_group: $("gpt-import-sub2-group").value.trim(),
        result: $("gpt-import-result").value,
      },
    }),
  });
  if (!d.ok) return toast(d.error || "导入失败", false);
  $("gpt-import-result-text").textContent = `导入 ${d.total} 个，新增 ${d.created} 个，更新 ${d.updated} 个`;
  toast("GPT账号导入完成");
  gptAccountPage = 1;
  selectedGptAccountIds.clear();
  loadGptAccounts();
  loadGptEvents();
}

function fillGptImportSample() {
  $("gpt-import-text").value = JSON.stringify([
    {
      email: "demo@example.com",
      password: "password",
      refresh_token: "rt_xxx",
      access_token: "at_xxx",
      id_token: "id_xxx",
      session_token: "sess_xxx",
      chatgpt_account_id: "acct_xxx",
      chatgpt_plan_type: "free"
    }
  ], null, 2);
}

async function loadGptImportFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const result = $("gpt-import-result-text");
  try {
    const entries = [];
    for (const file of files) {
      const text = await file.text();
      const clean = text.trim();
      if (!clean) continue;
      let parsed = null;
      if (clean.startsWith("{") || clean.startsWith("[")) {
        try { parsed = JSON.parse(clean); } catch { parsed = null; }
      }
      if (Array.isArray(parsed)) {
        entries.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.accounts)) entries.push(...parsed.accounts);
        else entries.push(parsed);
      } else {
        clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => entries.push(line));
      }
    }
    if (!entries.length) {
      if (result) result.textContent = "选择的文件没有可导入内容";
      return toast("文件为空", false);
    }
    const textarea = $("gpt-import-text");
    const current = textarea.value.trim();
    let currentEntries = [];
    if (current) {
      try {
        const parsedCurrent = JSON.parse(current);
        if (Array.isArray(parsedCurrent)) currentEntries = parsedCurrent;
        else if (parsedCurrent && typeof parsedCurrent === "object" && Array.isArray(parsedCurrent.accounts)) currentEntries = parsedCurrent.accounts;
        else if (parsedCurrent && typeof parsedCurrent === "object") currentEntries = [parsedCurrent];
        else currentEntries = [current];
      } catch {
        currentEntries = current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      }
    }
    textarea.value = JSON.stringify([...currentEntries, ...entries], null, 2);
    if (result) result.textContent = `已载入 ${files.length} 个文件，共 ${entries.length} 条，检查后点击“导入账号”`;
    toast(`已载入 ${entries.length} 条账号`);
  } catch (error) {
    if (result) result.textContent = error.message || "文件读取失败";
    toast(error.message || "文件读取失败", false);
  } finally {
    event.target.value = "";
  }
}

function clearGptImportText() {
  $("gpt-import-text").value = "";
  $("gpt-import-result-text").textContent = "";
}

async function queueGptRefresh() {
  const ids = selectedGptIds();
  if (!ids.length) return toast("先选择 GPT 账号", false);
  setGptNativePanel("refresh");
  renderGptRefreshLiveRows(ids.map((id) => ({ id, email: gptAccounts.find((a) => String(a.id) === String(id))?.email || id, status: "待刷新" })));
  toast(`已带入 ${ids.length} 个账号到刷新工作台`);
}

async function queueGptInspection() {
  const ids = selectedGptIds();
  if (!ids.length) return toast("先选择 GPT 账号", false);
  const d = await api("/api/gpt-inspection-jobs", {
    method: "POST",
    body: JSON.stringify({ ids, target: "cpa" }),
  });
  if (!d.ok) return toast(d.error || "创建巡检队列失败", false);
  toast(`已加入巡检队列 ${d.created} 个`);
  loadGptInspectionJobs();
  loadGptEvents();
}

function listEmpty(text) {
  return `<div class="empty compact-empty">${esc(text)}</div>`;
}

async function loadGptRefreshJobs() {
  const d = await api("/api/gpt-refresh-jobs?limit=80");
  if (!d.ok) return;
  gptRefreshJobs = d.jobs || [];
  if ($("gpt-metric-refresh")) $("gpt-metric-refresh").textContent = gptRefreshJobs.filter((j) => ["queued", "running"].includes(j.status)).length;
  renderGptRefreshJobs();
}

function renderGptRefreshJobs() {
  const el = $("gpt-refresh-jobs");
  if (!el) return;
  if (!gptRefreshJobs.length) {
    el.innerHTML = listEmpty("暂无刷新任务");
    return;
  }
  el.innerHTML = gptRefreshJobs.map((j) => `
    <div class="compact-item">
      <div><strong>${esc(j.bind_email || j.email || j.phone || "未知账号")}</strong><small>${esc(j.job_type)} · ${esc(fmtDate(j.created_at))}</small></div>
      <span class="badge ${gptBadgeClass(j.status)}">${esc(j.status)}</span>
      <button class="link-button job-success-btn" data-kind="refresh" data-id="${esc(j.id)}">标记成功</button>
      <button class="link-button job-fail-btn" data-kind="refresh" data-id="${esc(j.id)}">标记失败</button>
    </div>
  `).join("");
  qsa(".job-success-btn[data-kind='refresh']").forEach((btn) => btn.onclick = () => updateRefreshJob(btn.dataset.id, "success"));
  qsa(".job-fail-btn[data-kind='refresh']").forEach((btn) => btn.onclick = () => updateRefreshJob(btn.dataset.id, "failed"));
}

async function updateRefreshJob(id, status) {
  const error = status === "failed" ? (prompt("失败原因", "刷新失败") || "") : "";
  const d = await api("/api/gpt-refresh-jobs/update", {
    method: "POST",
    body: JSON.stringify({ id, status, result: status === "success" ? "手动标记成功" : "", error }),
  });
  if (!d.ok) return toast(d.error || "更新刷新任务失败", false);
  toast("刷新任务已更新");
  loadGptRefreshJobs();
  loadGptAccounts();
  loadGptEvents();
}

async function loadGptInspectionJobs() {
  const d = await api("/api/gpt-inspection-jobs?limit=80");
  if (!d.ok) return;
  gptInspectionJobs = d.jobs || [];
  renderGptInspectionJobs();
}

function renderGptInspectionJobs() {
  const el = $("gpt-inspection-jobs");
  if (!el) return;
  if (!gptInspectionJobs.length) {
    el.innerHTML = listEmpty("暂无巡检任务");
    return;
  }
  el.innerHTML = gptInspectionJobs.map((j) => `
    <div class="compact-item">
      <div><strong>${esc(j.bind_email || j.email || j.phone || "未知账号")}</strong><small>${esc(j.target)} · ${esc(j.error_category || j.result || "")}</small></div>
      <span class="badge ${gptBadgeClass(j.status)}">${esc(j.status)}</span>
      <button class="link-button job-success-btn" data-kind="inspection" data-id="${esc(j.id)}">正常</button>
      <button class="link-button job-warning-btn" data-id="${esc(j.id)}">警告</button>
      <button class="link-button job-fail-btn" data-kind="inspection" data-id="${esc(j.id)}">异常</button>
    </div>
  `).join("");
  qsa(".job-success-btn[data-kind='inspection']").forEach((btn) => btn.onclick = () => updateInspectionJob(btn.dataset.id, "success"));
  qsa(".job-warning-btn").forEach((btn) => btn.onclick = () => updateInspectionJob(btn.dataset.id, "warning"));
  qsa(".job-fail-btn[data-kind='inspection']").forEach((btn) => btn.onclick = () => updateInspectionJob(btn.dataset.id, "failed"));
}

async function updateInspectionJob(id, status) {
  const error = status === "success" ? "" : (prompt("巡检原因", status === "warning" ? "需复查" : "巡检异常") || "");
  const d = await api("/api/gpt-inspection-jobs/update", {
    method: "POST",
    body: JSON.stringify({ id, status, result: status === "success" ? "巡检正常" : "", error }),
  });
  if (!d.ok) return toast(d.error || "更新巡检任务失败", false);
  toast("巡检任务已更新");
  loadGptInspectionJobs();
  loadGptAccounts();
  loadGptEvents();
}

async function loadGptErrorRules() {
  const d = await api("/api/gpt-error-rules");
  if (!d.ok) return;
  gptErrorRules = d.rules || [];
  renderGptErrorRules();
}

function renderGptErrorRules() {
  const el = $("gpt-error-rules");
  if (!el) return;
  if (!gptErrorRules.length) {
    el.innerHTML = listEmpty("暂无规则");
    return;
  }
  el.innerHTML = gptErrorRules.map((r) => `
    <div class="compact-item">
      <div><strong>${esc(r.name)}</strong><small>${esc(r.category)} · ${esc(r.keywords)}</small></div>
      <span class="badge ${gptBadgeClass(r.severity)}">${esc(r.severity)}</span>
      <button class="link-button rule-edit-btn" data-id="${esc(r.id)}">编辑</button>
      <button class="link-button rule-delete-btn" data-id="${esc(r.id)}">删除</button>
    </div>
  `).join("");
  qsa(".rule-edit-btn").forEach((btn) => btn.onclick = () => editGptRule(btn.dataset.id));
  qsa(".rule-delete-btn").forEach((btn) => btn.onclick = () => deleteGptRule(btn.dataset.id));
}

function editGptRule(id) {
  const r = gptErrorRules.find((x) => String(x.id) === String(id));
  if (!r) return;
  $("gpt-rule-id").value = r.id;
  $("gpt-rule-name").value = r.name || "";
  $("gpt-rule-category").value = r.category || "";
  $("gpt-rule-keywords").value = r.keywords || "";
  $("gpt-rule-severity").value = r.severity || "warning";
}

async function saveGptRule() {
  const d = await api("/api/gpt-error-rules", {
    method: "POST",
    body: JSON.stringify({
      id: $("gpt-rule-id").value,
      name: $("gpt-rule-name").value.trim(),
      category: $("gpt-rule-category").value.trim(),
      keywords: $("gpt-rule-keywords").value.trim(),
      severity: $("gpt-rule-severity").value,
      enabled: true,
    }),
  });
  if (!d.ok) return toast(d.error || "保存规则失败", false);
  ["gpt-rule-id", "gpt-rule-name", "gpt-rule-category", "gpt-rule-keywords"].forEach((id) => $(id).value = "");
  toast("规则已保存");
  loadGptErrorRules();
}

async function deleteGptRule(id) {
  if (!confirm("确定删除这条错误规则？")) return;
  const d = await api(`/api/gpt-error-rules/${id}/delete`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "删除规则失败", false);
  toast("规则已删除");
  loadGptErrorRules();
}

async function loadPhoneCodePool() {
  const d = await api("/api/phone-code-pool?limit=100");
  if (!d.ok) return;
  phoneCodePool = d.phones || [];
  if ($("gpt-metric-phone")) $("gpt-metric-phone").textContent = phoneCodePool.length;
  renderPhoneCodePool();
}

function renderPhoneCodePool() {
  const el = $("phone-code-pool-list");
  if (!el) return;
  if (!phoneCodePool.length) {
    el.innerHTML = listEmpty("暂无手机池记录");
    return;
  }
  el.innerHTML = phoneCodePool.map((p) => `
    <div class="compact-item">
      <div><strong>${esc(p.phone || p.provider)}</strong><small>${esc(p.provider)} · ${esc(p.api_url || p.note || "")}</small></div>
      <span class="badge ${gptBadgeClass(p.status)}">${esc(p.status)}</span>
      <button class="link-button phone-edit-btn" data-id="${esc(p.id)}">编辑</button>
      <button class="link-button phone-delete-btn" data-id="${esc(p.id)}">删除</button>
    </div>
  `).join("");
  qsa(".phone-edit-btn").forEach((btn) => btn.onclick = () => editPhoneCode(btn.dataset.id));
  qsa(".phone-delete-btn").forEach((btn) => btn.onclick = () => deletePhoneCode(btn.dataset.id));
}

function editPhoneCode(id) {
  const p = phoneCodePool.find((x) => String(x.id) === String(id));
  if (!p) return;
  $("phone-id").value = p.id;
  $("phone-provider").value = p.provider || "";
  $("phone-number").value = p.phone || "";
  $("phone-api-url").value = p.api_url || "";
  $("phone-status").value = p.status || "available";
  $("phone-note").value = p.note || "";
}

async function savePhoneCode() {
  const d = await api("/api/phone-code-pool", {
    method: "POST",
    body: JSON.stringify({
      id: $("phone-id").value,
      provider: $("phone-provider").value.trim(),
      phone: $("phone-number").value.trim(),
      api_url: $("phone-api-url").value.trim(),
      status: $("phone-status").value,
      note: $("phone-note").value.trim(),
    }),
  });
  if (!d.ok) return toast(d.error || "保存手机失败", false);
  ["phone-id", "phone-provider", "phone-number", "phone-api-url", "phone-note"].forEach((id) => $(id).value = "");
  $("phone-status").value = "available";
  toast("手机池已保存");
  loadPhoneCodePool();
}

async function deletePhoneCode(id) {
  if (!confirm("确定删除这条手机池记录？")) return;
  const d = await api(`/api/phone-code-pool/${id}/delete`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "删除手机记录失败", false);
  toast("手机记录已删除");
  loadPhoneCodePool();
}

async function loadGptExports() {
  const d = await api("/api/gpt-exports?limit=80");
  if (!d.ok) return;
  gptExports = d.exports || [];
  if (selectedGptExportId && !gptExports.some((x) => String(x.id) === String(selectedGptExportId))) {
    selectedGptExportId = "";
    selectedGptExportDetail = null;
  }
  renderGptExports();
  renderGptExportDetail();
}

function renderGptExports() {
  const el = $("gpt-exports-list");
  if (!el) return;
  if (!gptExports.length) {
    el.innerHTML = listEmpty("暂无导出记录");
    return;
  }
  el.innerHTML = gptExports.map((x) => `
    <div class="compact-item export-item ${String(x.id) === String(selectedGptExportId) ? "active" : ""}" data-id="${esc(x.id)}">
      <div><strong>${esc(gptExportFormatLabel(x.format))}</strong><small>${esc(x.account_count)} 个账号 · ${esc(fmtDate(x.created_at))}</small></div>
      <span class="badge new">#${esc(x.id)}</span>
      <button class="link-button export-open-btn" data-id="${esc(x.id)}">查看</button>
      <button class="link-button export-download-btn" data-id="${esc(x.id)}">重下</button>
    </div>
  `).join("");
  qsa(".export-item").forEach((item) => item.onclick = (ev) => {
    if (ev.target.closest("button")) return;
    loadGptExportDetail(item.dataset.id);
  });
  qsa(".export-open-btn").forEach((btn) => btn.onclick = () => loadGptExportDetail(btn.dataset.id));
  qsa(".export-download-btn").forEach((btn) => btn.onclick = () => downloadGptExportBatch(btn.dataset.id));
}

async function loadGptEvents() {
  const suffix = selectedGptExportId ? `?export_id=${encodeURIComponent(selectedGptExportId)}&limit=120` : "?limit=100";
  const d = await api(`/api/gpt-events${suffix}`);
  if (!d.ok) return;
  gptEvents = d.events || [];
  renderGptEvents();
}

async function loadGptExportDetail(id) {
  if (!id) return;
  selectedGptExportId = String(id);
  const d = await api(`/api/gpt-export?id=${encodeURIComponent(id)}`);
  if (!d.ok) {
    selectedGptExportDetail = null;
    renderGptExportDetail();
    return toast(d.error || "导出详情加载失败", false);
  }
  selectedGptExportDetail = d;
  gptEvents = d.events || [];
  renderGptExports();
  renderGptExportDetail();
  renderGptEvents();
}

function renderGptExportDetail() {
  const el = $("gpt-export-detail");
  if (!el) return;
  if (!selectedGptExportId || !selectedGptExportDetail?.export) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const batch = selectedGptExportDetail.export;
  const accounts = selectedGptExportDetail.accounts || [];
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="export-detail-head">
      <div>
        <strong>${esc(gptExportFormatLabel(batch.format))} 批次 #${esc(batch.id)}</strong>
        <small>${esc(batch.account_count)} 个账号 · ${esc(fmtDate(batch.created_at))}</small>
      </div>
      <div class="button-row">
        <button class="button ghost export-copy-accounts-btn" type="button">复制账号</button>
        <button class="button ghost export-detail-download-btn" type="button"><span class="icon" data-icon="download"></span>重新下载</button>
        <button class="button danger export-detail-delete-btn" type="button">删除记录</button>
      </div>
    </div>
    <div class="export-account-list">
      ${accounts.length ? accounts.map((a) => `
        <div class="export-account-row">
          <div><strong>${esc(a.bind_email || a.email || a.phone || "-")}</strong><small>${esc(a.batch_id || a.stage || "")}</small></div>
          <span class="badge ${gptBadgeClass(a.status)}">${esc(gptStatusLabel(a.status) || a.status || "-")}</span>
          <span class="badge ${gptBadgeClass(a.result)}">${esc(gptResultLabel(a.result) || a.result || "-")}</span>
        </div>
      `).join("") : `<div class="empty compact-empty">这条导出记录没有找到关联账号，可能账号已被删除。</div>`}
    </div>
  `;
  mountIcons();
  el.querySelector(".export-copy-accounts-btn").onclick = copyGptExportAccounts;
  el.querySelector(".export-detail-download-btn").onclick = () => downloadGptExportBatch(batch.id);
  el.querySelector(".export-detail-delete-btn").onclick = () => deleteGptExportLog(batch.id);
}

function copyGptExportAccounts() {
  const accounts = selectedGptExportDetail?.accounts || [];
  if (!accounts.length) return toast("这个批次没有可复制账号", false);
  const text = accounts.map((a) => a.bind_email || a.email || a.phone || "").filter(Boolean).join("\n");
  if (!text) return toast("这个批次没有可复制账号", false);
  navigator.clipboard.writeText(text).then(
    () => toast(`已复制 ${accounts.length} 个账号`),
    () => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      toast(`已复制 ${accounts.length} 个账号`);
    }
  );
}

async function downloadGptExportBatch(id) {
  if (!id) return;
  const res = await appBlobRequest(`/api/gpt-export/download?id=${encodeURIComponent(id)}`, { credentials: "same-origin" });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try { err = JSON.parse(await res.text()).error || err; } catch {}
    return toast(err, false);
  }
  const blob = res.blob;
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename=([^;]+)/);
  const filename = match ? match[1].replace(/^"|"$/g, "") : `gpt_export_${id}.zip`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function deleteGptExportLog(id) {
  if (!id) return;
  if (!confirm("只删除这条导出记录，不删除 GPT 账号本身。确定继续？")) return;
  const d = await api(`/api/gpt-exports/${encodeURIComponent(id)}/delete`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "删除导出记录失败", false);
  selectedGptExportId = "";
  selectedGptExportDetail = null;
  toast("导出记录已删除");
  loadGptExports();
  loadGptEvents();
}

function appendGptRefreshLog(line, tone = "") {
  const el = $("gpt-refresh-log");
  if (!el) return;
  const timeText = new Date().toLocaleTimeString();
  const prefix = tone === "error" ? "错误" : tone === "success" ? "成功" : tone === "warning" ? "提示" : "信息";
  el.textContent += `[${timeText}] ${prefix} ${line}\n`;
  el.scrollTop = el.scrollHeight;
}

function renderGptRefreshLiveRows(rows = gptRefreshRows) {
  gptRefreshRows = rows;
  const body = $("gpt-refresh-live-body");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="empty">暂无刷新任务。</div></td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${esc(row.email || row.name || row.id || "")}</strong></td>
      <td><span class="badge ${gptBadgeClass(row.status)}">${esc(row.status || "等待")}</span></td>
      <td class="reason-cell">${esc(row.result || row.error || "")}</td>
      <td>${esc(row.updated_at || "")}</td>
    </tr>
  `).join("");
}

function setGptRefreshProgress(done, total, status = "") {
  const pct = total ? Math.round(done / total * 100) : 0;
  $("gpt-refresh-progress-label").textContent = total ? `${done}/${total}` : "未开始";
  $("gpt-refresh-status").textContent = status || (total ? `${pct}%` : "等待选择账号");
  $("gpt-refresh-progress-fill").style.width = `${pct}%`;
}

async function syncGptWorkbenchMailboxes() {
  const emails = selectedGptIds()
    .map((id) => gptAccounts.find((a) => String(a.id) === String(id)))
    .flatMap((a) => a ? [a.email, a.bind_email, a.login_email] : [])
    .filter((email) => email && String(email).includes("@"));
  appendGptRefreshLog(emails.length ? `同步选中账号相关邮箱凭证：${emails.length} 个邮箱` : "同步全部可用 Outlook OAuth 邮箱凭证");
  const d = await api("/api/gpt-workbench/sync-mailboxes", {
    method: "POST",
    body: JSON.stringify({ emails, limit: emails.length ? emails.length : 5000 }),
  });
  if (!d.ok && !d.success) {
    appendGptRefreshLog(d.error || "邮箱凭证同步失败", "error");
    return toast(d.error || "邮箱凭证同步失败", false);
  }
  appendGptRefreshLog(`邮箱凭证同步完成：新增 ${d.imported || 0}，更新 ${d.updated || 0}，本次匹配 ${d.synced || 0}`, "success");
  toast("邮箱凭证已同步到刷新执行器");
}

async function checkGptProxy() {
  const proxyUrl = $("gpt-refresh-proxy").value.trim();
  if (!proxyUrl) return toast("先填写代理地址", false);
  appendGptRefreshLog(`测试代理出口：${proxyUrl}`);
  const d = await api("/api/gpt-workbench/proxy-check", {
    method: "POST",
    body: JSON.stringify({ proxy_url: proxyUrl }),
  });
  if (!d.ok && !d.success) {
    appendGptRefreshLog(d.error || d.error_hint || "代理测试失败", "error");
    return toast(d.error || "代理测试失败", false);
  }
  const ip = d.ip || d.trace?.ip || d.result?.ip || "-";
  const loc = d.loc || d.trace?.loc || d.country || "";
  appendGptRefreshLog(`代理可用：IP ${ip} ${loc}`, "success");
  toast(`代理可用：${ip}`);
}

async function pollGptRefreshJob(accountId, helperJobId, localJobId, rowIndex) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    if (gptRefreshStopRequested) return { stopped: true };
    const d = await api(`/api/gpt-workbench/refresh-status?job_id=${encodeURIComponent(helperJobId)}&account_id=${encodeURIComponent(accountId)}&local_job_id=${encodeURIComponent(localJobId || "")}`);
    const job = d.job || {};
    const logs = Array.isArray(job.logs) ? job.logs : [];
    const lastLog = logs.length ? logs[logs.length - 1] : null;
    if (lastLog) appendGptRefreshLog(`${job.email || accountId}: ${lastLog.message || lastLog.text || JSON.stringify(lastLog)}`);
    gptRefreshRows[rowIndex] = {
      ...gptRefreshRows[rowIndex],
      status: job.status || "running",
      result: job.error || (lastLog?.message || ""),
      updated_at: fmtDate(job.updated_at || new Date().toISOString()),
    };
    renderGptRefreshLiveRows();
    if (["success", "failed", "cancelled"].includes(job.status)) return { ok: job.status === "success", job, data: d };
    await sleep(2500);
  }
  return { ok: false, error: "刷新超时" };
}

async function startNativeGptRefresh() {
  const ids = selectedGptIds();
  if (!ids.length) return toast("先选择 GPT 账号", false);
  const proxyUrl = $("gpt-refresh-proxy").value.trim();
  if (!proxyUrl) return toast("刷新必须填写代理地址", false);
  if (gptRefreshRunning) return toast("刷新任务正在执行", false);
  gptRefreshRunning = true;
  gptRefreshStopRequested = false;
  $("gpt-native-refresh-selected-btn").disabled = true;
  $("gpt-refresh-stop-btn").disabled = false;
  $("gpt-refresh-log").textContent = "";
  const accountMap = new Map(gptAccounts.map((a) => [String(a.id), a]));
  gptRefreshRows = ids.map((id) => {
    const a = accountMap.get(String(id)) || {};
    return { id, email: a.email || a.bind_email || a.login_email || id, status: "queued", result: "" };
  });
  renderGptRefreshLiveRows();
  setGptRefreshProgress(0, ids.length, "同步邮箱凭证");
  await syncGptWorkbenchMailboxes();
  let success = 0;
  let failed = 0;
  try {
    for (let index = 0; index < ids.length; index += 1) {
      if (gptRefreshStopRequested) {
        appendGptRefreshLog("已停止剩余刷新任务", "warning");
        break;
      }
      const id = ids[index];
      setGptRefreshProgress(index, ids.length, `正在启动 ${index + 1}/${ids.length}`);
      gptRefreshRows[index] = { ...gptRefreshRows[index], status: "running", result: "启动中", updated_at: fmtDate(new Date().toISOString()) };
      renderGptRefreshLiveRows();
      const d = await api("/api/gpt-workbench/refresh-start", {
        method: "POST",
        body: JSON.stringify({
          account_id: id,
          proxy_url: proxyUrl,
          cpa_base_url: $("gpt-refresh-cpa-base").value.trim(),
          cpa_management_key: $("gpt-refresh-cpa-key").value.trim(),
          mode: $("gpt-refresh-mode").value || "login",
          manual_email_code: $("gpt-refresh-manual-email-code").value.trim(),
          manual_phone_code: $("gpt-refresh-manual-phone-code").value.trim(),
          phone_api_url: $("gpt-refresh-phone-api").value.trim(),
        }),
      });
      const helperJobId = d.job?.job_id || d.job_id;
      if (!d.ok || !helperJobId) {
        failed += 1;
        gptRefreshRows[index] = { ...gptRefreshRows[index], status: "failed", error: d.error || "启动失败", updated_at: fmtDate(new Date().toISOString()) };
        renderGptRefreshLiveRows();
        appendGptRefreshLog(`${gptRefreshRows[index].email}: ${d.error || "启动失败"}`, "error");
        continue;
      }
      appendGptRefreshLog(`${gptRefreshRows[index].email}: 已启动 OAuth 刷新任务 ${helperJobId}`);
      const outcome = await pollGptRefreshJob(id, helperJobId, d.local_job_id, index);
      if (outcome.ok) {
        success += 1;
        gptRefreshRows[index] = { ...gptRefreshRows[index], status: "success", result: "刷新成功", updated_at: fmtDate(new Date().toISOString()) };
        appendGptRefreshLog(`${gptRefreshRows[index].email}: 刷新成功`, "success");
      } else if (outcome.stopped) {
        gptRefreshRows[index] = { ...gptRefreshRows[index], status: "cancelled", result: "已停止", updated_at: fmtDate(new Date().toISOString()) };
      } else {
        failed += 1;
        gptRefreshRows[index] = { ...gptRefreshRows[index], status: "failed", result: outcome.error || outcome.job?.error || "刷新失败", updated_at: fmtDate(new Date().toISOString()) };
        appendGptRefreshLog(`${gptRefreshRows[index].email}: ${gptRefreshRows[index].result}`, "error");
      }
      renderGptRefreshLiveRows();
      setGptRefreshProgress(index + 1, ids.length, `成功 ${success}，失败 ${failed}`);
    }
    toast(`刷新完成：成功 ${success}，失败 ${failed}`, failed ? false : true);
  } finally {
    gptRefreshRunning = false;
    $("gpt-refresh-stop-btn").disabled = true;
    updateGptSelectionUI();
    loadGptAccounts();
    loadGptRefreshJobs();
    loadGptEvents();
  }
}

async function scanNativeCpa() {
  const baseUrl = $("gpt-cpa-base-url").value.trim();
  const managementKey = $("gpt-cpa-key").value.trim();
  if (!baseUrl || !managementKey) return toast("先填写 CPA 地址和管理密钥", false);
  $("gpt-cpa-scan-btn").disabled = true;
  $("gpt-cpa-scan-btn").textContent = "巡检中";
  $("gpt-cpa-summary").innerHTML = `<span class="badge free">正在扫描...</span>`;
  const d = await api("/api/gpt-workbench/cpa-scan", {
    method: "POST",
    body: JSON.stringify({
      base_url: baseUrl,
      management_key: managementKey,
      max_items: parseInt($("gpt-cpa-limit").value, 10) || 50,
      use_proxy: $("gpt-cpa-use-proxy").checked,
      proxy_url: $("gpt-cpa-proxy").value.trim() || $("gpt-refresh-proxy").value.trim(),
    }),
  });
  $("gpt-cpa-scan-btn").disabled = false;
  $("gpt-cpa-scan-btn").textContent = "开始巡检";
  if (!d.ok && !d.success) {
    $("gpt-cpa-summary").innerHTML = `<span class="badge invalid">${esc(d.error || "巡检失败")}</span>`;
    return toast(d.error || "CPA 巡检失败", false);
  }
  gptCpaRows = d.candidates || d.diagnostics || [];
  selectedCpaRows.clear();
  renderNativeCpaRows(d.summary || {});
  toast(`CPA 巡检完成：${gptCpaRows.length} 个候选`);
}

function renderNativeCpaRows(summary = {}) {
  $("gpt-cpa-summary").innerHTML = [
    ["总数", summary.total ?? gptCpaRows.length, "new"],
    ["候选", summary.candidates ?? gptCpaRows.length, "free"],
    ["需登录", summary.needs_login ?? summary.refreshable ?? 0, "free"],
    ["可用", summary.credential_ok ?? 0, "safe"],
    ["封禁", summary.banned ?? 0, "invalid"],
    ["风控", summary.risk ?? 0, "invalid"],
    ["额度", summary.limited ?? 0, "free"],
  ].map(([label, count, cls]) => `<span class="badge ${cls}">${esc(label)} ${esc(count)}</span>`).join("");
  const body = $("gpt-cpa-body");
  if (!gptCpaRows.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty">没有发现需要处理的 CPA 账号。</div></td></tr>`;
  } else {
    body.innerHTML = gptCpaRows.map((row, index) => `
      <tr>
        <td><input class="gpt-cpa-select" type="checkbox" data-index="${index}" ${selectedCpaRows.has(index) ? "checked" : ""}></td>
        <td class="email-cell"><strong>${esc(row.name || row.id || "-")}</strong><small>${esc(row.auth_index || "")}</small></td>
        <td>${esc(row.email || row.account || "")}</td>
        <td><span class="badge ${gptBadgeClass(row.status)}">${esc(row.status_label || row.status || row.action || "")}</span></td>
        <td class="reason-cell">${esc(row.message || row.raw_message || row.diagnosis || "")}</td>
        <td>${esc(row.action_hint || (row.refreshable ? "建议重新登录刷新" : ""))}</td>
      </tr>
    `).join("");
  }
  qsa(".gpt-cpa-select").forEach((box) => box.onchange = () => {
    const index = Number(box.dataset.index);
    if (box.checked) selectedCpaRows.add(index);
    else selectedCpaRows.delete(index);
    updateNativeCpaSelection();
  });
  updateNativeCpaSelection();
}

function updateNativeCpaSelection() {
  const has = selectedCpaRows.size > 0;
  $("gpt-cpa-delete-btn").disabled = !has;
  $("gpt-cpa-queue-refresh-btn").disabled = !has;
  const all = $("gpt-cpa-select-all");
  if (all) {
    all.checked = gptCpaRows.length > 0 && selectedCpaRows.size === gptCpaRows.length;
    all.indeterminate = selectedCpaRows.size > 0 && selectedCpaRows.size < gptCpaRows.length;
  }
}

async function deleteSelectedNativeCpa() {
  const items = [...selectedCpaRows].map((i) => gptCpaRows[i]).filter(Boolean);
  if (!items.length) return toast("先选择 CPA 结果", false);
  if (!confirm(`确定从 CPA 删除选中的 ${items.length} 个 auth 凭证？`)) return;
  const d = await api("/api/gpt-workbench/cpa-delete", {
    method: "POST",
    body: JSON.stringify({
      base_url: $("gpt-cpa-base-url").value.trim(),
      management_key: $("gpt-cpa-key").value.trim(),
      items,
    }),
  });
  if (!d.ok && !d.success) return toast(d.error || "CPA 删除失败", false);
  toast(`CPA 删除完成：${d.summary?.deleted || 0} 个`);
  scanNativeCpa();
}

async function queueCpaRowsToRefresh() {
  const items = [...selectedCpaRows].map((i) => gptCpaRows[i]).filter(Boolean).filter((row) => row.email);
  if (!items.length) return toast("选中的 CPA 结果没有邮箱，无法加入刷新", false);
  const text = items.map((row) => JSON.stringify({
    email: row.email,
    bind_email: row.email,
    sub2api_id: row.name || row.id || "",
    result: "partial",
    stage: "cpa_scan",
    status: "needs_review",
    fail_reason: row.message || row.status_label || "CPA 巡检需要刷新",
    auth_file: row.auth_file || null,
  })).join("\n");
  const d = await api("/api/gpt-accounts/import", {
    method: "POST",
    body: JSON.stringify({ text, defaults: { batch_id: `CPA巡检-${getTimestampToken()}`, result: "partial" } }),
  });
  if (!d.ok) return toast(d.error || "加入刷新失败", false);
  selectedGptAccountIds.clear();
  (d.ids || []).forEach((id) => selectedGptAccountIds.add(String(id)));
  gptAccountPage = 1;
  await loadGptAccounts();
  setGptNativePanel("refresh");
  toast(`已加入 ${d.ids?.length || 0} 个账号到刷新工作台`);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeBase64UrlJson(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function parseJwtPayload(token) {
  if (typeof token !== "string" || !token.trim()) return {};
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try { return JSON.parse(decodeBase64Url(parts[1])); } catch { return {}; }
}

function normalizeTimestamp(value) {
  if (!value) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 1e11 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function timestampFromUnixSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getOpenAIAuthSection(payload) {
  return isPlainObject(payload?.["https://api.openai.com/auth"]) ? payload["https://api.openai.com/auth"] : {};
}

function getOpenAIProfileSection(payload) {
  return isPlainObject(payload?.["https://api.openai.com/profile"]) ? payload["https://api.openai.com/profile"] : {};
}

function stripUnavailable(value) {
  if (Array.isArray(value)) return value.map(stripUnavailable).filter((item) => item !== undefined);
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, item]) => [key, stripUnavailable(item)]).filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (value === undefined || value === null || value === "") return undefined;
  return value;
}

function buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt) {
  if (!accountId) return "";
  const now = Math.trunc(Date.now() / 1000);
  const expires = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;
  const authInfo = compactObject({
    chatgpt_account_id: accountId,
    chatgpt_plan_type: planType,
    chatgpt_user_id: userId,
    user_id: userId,
  });
  const payload = compactObject({
    iat: now,
    exp: expires,
    email,
    "https://api.openai.com/auth": authInfo,
  });
  return `${encodeBase64UrlJson({ alg: "none", typ: "JWT", cpa_synthetic: true })}.${encodeBase64UrlJson(payload)}.synthetic`;
}

function collectSessionLikeObjects(value, sourceName = "pasted-json") {
  const found = [];
  const visited = new WeakSet();
  function visit(item, path) {
    if (!isPlainObject(item) && !Array.isArray(item)) return;
    if (isPlainObject(item)) {
      if (visited.has(item)) return;
      visited.add(item);
      const token = firstNonEmpty(
        item.accessToken, item.access_token, item.tokens?.accessToken, item.tokens?.access_token,
        item.token?.accessToken, item.token?.access_token, item.credentials?.accessToken, item.credentials?.access_token
      );
      const identity = isPlainObject(item.user) || firstNonEmpty(
        item.email, item.name, item.label, item.meta?.label, item.tokens?.accountId, item.tokens?.account_id,
        item.tokens?.chatgptAccountId, item.tokens?.chatgpt_account_id, item.providerSpecificData?.chatgptAccountId,
        item.providerSpecificData?.chatgpt_account_id, item.id
      );
      if (token && identity) {
        found.push({ value: item, sourceName, path });
        return;
      }
      Object.entries(item).forEach(([key, child]) => {
        if (!["accessToken", "access_token", "sessionToken", "session_token"].includes(key)) visit(child, `${path}.${key}`);
      });
      return;
    }
    item.forEach((child, index) => visit(child, `${path}[${index}]`));
  }
  visit(value, "$");
  return found;
}

function convertChatgptSession(record, options = {}) {
  const accessToken = firstNonEmpty(
    record.accessToken, record.access_token, record.tokens?.accessToken, record.tokens?.access_token,
    record.token?.accessToken, record.token?.access_token, record.credentials?.accessToken, record.credentials?.access_token
  );
  if (!accessToken) throw new Error("缺少 accessToken");
  const sessionToken = firstNonEmpty(record.sessionToken, record.session_token, record.tokens?.sessionToken, record.tokens?.session_token, record.credentials?.session_token);
  const refreshToken = firstNonEmpty(record.refreshToken, record.refresh_token, record.tokens?.refreshToken, record.tokens?.refresh_token, record.credentials?.refresh_token);
  const inputIdToken = firstNonEmpty(record.idToken, record.id_token, record.tokens?.idToken, record.tokens?.id_token, record.credentials?.id_token);
  const payload = parseJwtPayload(accessToken);
  const idPayload = parseJwtPayload(inputIdToken);
  const auth = getOpenAIAuthSection(payload);
  const idAuth = getOpenAIAuthSection(idPayload);
  const profile = getOpenAIProfileSection(payload);
  const expiresAt = firstNonEmpty(timestampFromUnixSeconds(payload?.exp), normalizeTimestamp(record.expires), normalizeTimestamp(record.expiresAt), normalizeTimestamp(record.expired), normalizeTimestamp(record.expires_at));
  const email = firstNonEmpty(record.user?.email, record.email, record.meta?.label, record.label, record.credentials?.email, record.providerSpecificData?.email, profile.email, idPayload.email, payload.email);
  const accountId = firstNonEmpty(
    record.account?.id, record.account_id, record.tokens?.accountId, record.tokens?.account_id,
    record.chatgptAccountId, record.chatgpt_account_id, record.providerSpecificData?.chatgptAccountId,
    record.providerSpecificData?.chatgpt_account_id, record.credentials?.chatgpt_account_id,
    auth.chatgpt_account_id, idAuth.chatgpt_account_id, record.provider === "codex" ? record.id : ""
  );
  const userId = firstNonEmpty(record.user?.id, record.user_id, record.chatgptUserId, record.providerSpecificData?.chatgptUserId, auth.chatgpt_user_id, auth.user_id, idAuth.chatgpt_user_id, idAuth.user_id);
  const planType = firstNonEmpty(record.account?.planType, record.account?.plan_type, record.planType, record.plan_type, record.providerSpecificData?.chatgptPlanType, record.credentials?.plan_type, auth.chatgpt_plan_type, idAuth.chatgpt_plan_type);
  const exportedAt = new Date().toISOString();
  const name = firstNonEmpty(email, options.sourceName, "ChatGPT Account");
  const idToken = firstNonEmpty(inputIdToken, buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt));
  const cpa = compactObject({
    type: "codex",
    account_id: accountId,
    chatgpt_account_id: accountId,
    email,
    name,
    plan_type: planType,
    chatgpt_plan_type: planType,
    id_token: idToken,
    id_token_synthetic: inputIdToken ? undefined : true,
    access_token: accessToken,
    refresh_token: refreshToken || "",
    session_token: sessionToken,
    last_refresh: exportedAt,
    expired: expiresAt,
    disabled: Boolean(record.disabled) || undefined,
  });
  const sub2apiAccount = stripUnavailable({
    name,
    platform: "openai",
    type: "oauth",
    expires_at: epochSecondsFromValue(expiresAt),
    auto_pause_on_expired: true,
    concurrency: 10,
    priority: 1,
    credentials: {
      access_token: accessToken,
      refresh_token: refreshToken || "",
      id_token: idToken,
      session_token: sessionToken,
      chatgpt_account_id: accountId,
      chatgpt_user_id: userId,
      email,
      expires_at: epochSecondsFromValue(expiresAt),
      plan_type: planType,
    },
    extra: {
      email,
      name,
      source: record.provider === "codex" && record.authType === "oauth" ? "9router" : "chatgpt_web_session",
      last_refresh: exportedAt,
    },
  });
  return {
    email,
    name,
    expiresAt,
    cpa,
    sub2apiAccount,
    cockpit: compactObject({ type: "codex", id_token: idToken, access_token: accessToken, refresh_token: refreshToken || "", account_id: accountId, last_refresh: exportedAt, email, expired: expiresAt }),
    nineRouter: stripUnavailable({ accessToken, refreshToken, expiresAt, providerSpecificData: { chatgptAccountId: accountId, chatgptPlanType: planType }, id: accountId, provider: "codex", authType: "oauth", name, email, priority: 9, isActive: !Boolean(record.disabled), createdAt: exportedAt, updatedAt: exportedAt }),
    axonHub: stripUnavailable({ auth_mode: "chatgpt", last_refresh: exportedAt, tokens: { access_token: accessToken, refresh_token: refreshToken || "", id_token: idToken }, axonhub_refresh_token_missing: refreshToken ? undefined : true }),
    codexManager: { tokens: compactObject({ access_token: accessToken, refresh_token: refreshToken || "", id_token: inputIdToken || "", account_id: accountId, chatgpt_account_id: accountId }), meta: compactObject({ label: name, chatgpt_account_id: accountId, note: "Imported from ChatGPT session" }) },
  };
}

function buildSessionOutput(format, converted) {
  if (format === "sub2api") return { exported_at: new Date().toISOString(), proxies: [], accounts: converted.map((item) => item.sub2apiAccount) };
  const key = { cpa: "cpa", cockpit: "cockpit", "9router": "nineRouter", axonhub: "axonHub", codexmanager: "codexManager" }[format] || "cpa";
  const rows = converted.map((item) => item[key]);
  return rows.length === 1 ? rows[0] : rows;
}

function convertGptSessionInput() {
  const text = $("gpt-session-input").value.trim();
  const format = $("gpt-converter-format").value || "sub2api";
  if (!text) {
    gptSessionConverted = [];
    gptSessionSkipped = [];
    gptSessionOutputText = "";
    renderGptSessionConverter();
    return;
  }
  try {
    const parsed = JSON.parse(text);
    const sources = collectSessionLikeObjects(parsed);
    const converted = [];
    const skipped = [];
    sources.forEach((source, index) => {
      try {
        converted.push(convertChatgptSession(source.value, { sourceName: source.sourceName, sourcePath: source.path || `$[${index}]` }));
      } catch (error) {
        skipped.push({ path: source.path, reason: error.message || "无法转换" });
      }
    });
    if (!sources.length) skipped.push({ path: "$", reason: "未找到包含 accessToken 和 user/email 的 session 对象" });
    gptSessionConverted = converted;
    gptSessionSkipped = skipped;
    gptSessionOutputText = converted.length ? JSON.stringify(buildSessionOutput(format, converted), null, 2) : "";
  } catch (error) {
    gptSessionConverted = [];
    gptSessionSkipped = [{ path: "$", reason: error.message || "JSON 解析失败" }];
    gptSessionOutputText = "";
  }
  renderGptSessionConverter();
}

function renderGptSessionConverter() {
  $("gpt-session-output").value = gptSessionOutputText;
  $("gpt-session-count").textContent = String(gptSessionConverted.length);
  $("gpt-session-error-count").textContent = String(gptSessionSkipped.length);
  $("gpt-session-copy-btn").disabled = !gptSessionOutputText;
  $("gpt-session-download-btn").disabled = !gptSessionOutputText;
  $("gpt-session-import-btn").disabled = !gptSessionConverted.length;
  $("gpt-session-status").textContent = gptSessionOutputText ? "转换完成" : (gptSessionSkipped.length ? gptSessionSkipped[0].reason : "等待输入");
  $("gpt-session-preview").innerHTML = gptSessionConverted.length ? gptSessionConverted.map((item) => `
    <div class="compact-item">
      <div><strong>${esc(item.email || item.name || "-")}</strong><small>${esc(item.expiresAt || "")}</small></div>
      <span class="badge safe">可导入</span>
    </div>
  `).join("") : (gptSessionSkipped.length ? gptSessionSkipped.map((item) => `<div class="empty compact-empty">${esc(item.path || "$")}: ${esc(item.reason)}</div>`).join("") : listEmpty("暂无转换结果"));
}

function fillGptSessionSample() {
  $("gpt-session-input").value = JSON.stringify({
    user: { id: "user-example", email: "mark@example.com" },
    expires: "2026-08-06T14:29:36.155Z",
    account: { id: "00000000-0000-4000-9000-000000000000", planType: "plus" },
    accessToken: "paste-real-access-token-here",
    sessionToken: "paste-real-session-token-here",
    authProvider: "openai",
  }, null, 2);
  convertGptSessionInput();
}

function clearGptSessionConverter() {
  $("gpt-session-input").value = "";
  gptSessionConverted = [];
  gptSessionSkipped = [];
  gptSessionOutputText = "";
  renderGptSessionConverter();
}

async function importGptSessionFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  try {
    const records = [];
    const rawTexts = [];
    for (const file of files) {
      const text = await file.text();
      rawTexts.push(text);
      try {
        records.push(JSON.parse(text));
      } catch {
        records.push({ __rawText: text, __fileName: file.name });
      }
    }
    const allParsed = records.every((item) => !item.__rawText);
    $("gpt-session-input").value = allParsed
      ? JSON.stringify(records.length === 1 ? records[0] : records, null, 2)
      : rawTexts.join("\n");
    convertGptSessionInput();
    toast(`已导入 ${files.length} 个文件`);
  } catch (error) {
    toast(error.message || "文件导入失败", false);
  } finally {
    event.target.value = "";
  }
}

async function copyGptSessionOutput() {
  if (!gptSessionOutputText) return;
  try {
    await navigator.clipboard.writeText(gptSessionOutputText);
    toast("已复制转换结果");
  } catch {
    $("gpt-session-output").select();
    document.execCommand("copy");
    toast("已复制转换结果");
  }
}

function downloadGptSessionOutput() {
  if (!gptSessionOutputText) return;
  const format = $("gpt-converter-format").value || "sub2api";
  const name = (gptSessionConverted[0]?.email || format).replace(/[\\/:*?"<>|]+/g, "-");
  downloadJsonFile(`${name}.${format}.${getTimestampToken()}.json`, JSON.parse(gptSessionOutputText));
}

async function importGptSessionConverted() {
  if (!gptSessionConverted.length) return toast("没有可导入账号", false);
  const text = gptSessionConverted.map((item) => JSON.stringify({
    email: item.email,
    bind_email: item.email,
    result: "success",
    stage: "session_converter",
    auth_file: item.cpa,
    access_token: item.cpa.access_token,
    refresh_token: item.cpa.refresh_token,
    id_token: item.cpa.id_token,
    session_token: item.cpa.session_token,
    chatgpt_account_id: item.cpa.chatgpt_account_id,
    chatgpt_plan_type: item.cpa.chatgpt_plan_type,
    expires_at: item.cpa.expired,
  })).join("\n");
  const d = await api("/api/gpt-accounts/import", {
    method: "POST",
    body: JSON.stringify({ text, defaults: { batch_id: `Session转换-${getTimestampToken()}`, result: "success" } }),
  });
  if (!d.ok) return toast(d.error || "导入失败", false);
  toast(`已导入 ${d.created + d.updated} 个账号`);
  loadGptAccounts();
}

function renderGptEvents() {
  const el = $("gpt-events-list");
  if (!el) return;
  if (!gptEvents.length) {
    el.innerHTML = listEmpty(selectedGptExportId ? "该导出批次暂无关联日志" : "暂无日志");
    return;
  }
  el.innerHTML = gptEvents.map((e) => `
    <details class="compact-item event-item">
      <summary>
        <span><strong>${esc(e.event)}</strong><small>${esc(e.bind_email || e.email || e.phone || "")} · ${esc(fmtDate(e.created_at))}</small></span>
        <span class="badge new">#${esc(e.gpt_account_id || "-")}</span>
      </summary>
      <pre class="event-detail">${esc(eventDetailText(e.detail) || "暂无详情")}</pre>
    </details>
  `).join("");
}

function renderGptAccounts() {
  $("gpt-account-count").textContent = `${gptAccountTotal} 个账号`;
  renderGptSummary();
  if (!gptAccounts.length) {
    $("gpt-accounts-body").innerHTML = `<tr><td colspan="15"><div class="empty">还没有 GPT 账号。注册机上报成功后会出现在这里。</div></td></tr>`;
    renderGptPager();
    updateGptSelectionUI();
    return;
  }
  $("gpt-accounts-body").innerHTML = gptAccounts.map((a, i) => {
    const id = String(a.id);
    return `
      <tr>
        <td><input class="gpt-account-select" type="checkbox" data-id="${esc(id)}" ${selectedGptAccountIds.has(id) ? "checked" : ""} aria-label="选择 ${esc(a.email || a.phone)}"></td>
        <td>${(gptAccountPage - 1) * gptPageSize() + i + 1}</td>
        <td class="email-cell"><strong>${esc(a.bind_email || a.email || a.phone || "")}</strong><small>${esc(a.phone || "")}${a.proxy ? " · 代理" : ""}</small></td>
        <td><span class="badge new">${esc(gptSourceLabel(a))}</span></td>
        <td><span class="badge ${gptBadgeClass(a.result)}">${esc(gptResultLabel(a.result))}</span></td>
        <td><span class="badge ${gptBadgeClass(a.status)}">${esc(gptStatusLabel(a.status))}</span></td>
        <td>${gptWenasLabel(a)}</td>
        <td>${gptLivecheckLabel(a)}</td>
        <td>${gptExportLabel(a)}${a.exported_at ? `<small class="muted block-text">${esc(fmtDate(a.exported_at))}</small>` : ""}</td>
        <td>${a.cpa_ready ? '<span class="badge safe">可导出</span>' : `<span class="badge free">${esc(a.cpa_missing_reason || "缺字段")}</span>`}</td>
        <td class="mono">${esc(a.sub2api_id || "")}</td>
        <td>${esc(a.chatgpt_plan_type || "")}</td>
        <td>${esc(a.batch_id || "")}</td>
        <td class="reason-cell">${esc(a.error_category ? `${a.error_category}: ${a.fail_reason || ""}` : (a.fail_reason || ""))}</td>
        <td>${esc(fmtDate(a.updated_at || a.created_at))}</td>
      </tr>
    `;
  }).join("");
  qsa(".gpt-account-select").forEach((box) => box.onchange = () => {
    const id = String(box.dataset.id || "");
    if (box.checked) selectedGptAccountIds.add(id);
    else selectedGptAccountIds.delete(id);
    updateGptSelectionUI();
  });
  renderGptPager();
  updateGptSelectionUI();
}

function renderGptPager() {
  const start = gptAccountTotal ? ((gptAccountPage - 1) * gptPageSize() + 1) : 0;
  const end = Math.min(gptAccountPage * gptPageSize(), gptAccountTotal);
  $("gpt-pager-info").textContent = `${start}-${end} / ${gptAccountTotal}`;
  $("gpt-prev-page-btn").disabled = gptAccountPage <= 1;
  $("gpt-next-page-btn").disabled = end >= gptAccountTotal;
}

function toggleCurrentGptPageSelection() {
  const pageIds = gptAccounts.map((a) => String(a.id));
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedGptAccountIds.has(id));
  pageIds.forEach((id) => {
    if (allSelected) selectedGptAccountIds.delete(id);
    else selectedGptAccountIds.add(id);
  });
  renderGptAccounts();
}

function clearGptSelection() {
  selectedGptAccountIds.clear();
  renderGptAccounts();
}

async function exportSelectedGptAccounts(format) {
  const ids = [...selectedGptAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择 GPT 账号", false);
  const labels = { sub2api: "Sub2API", sub2: "Sub2API", cpa: "CPA", cockpit_tools: "Cockpit Tools" };
  const label = labels[format] || format.toUpperCase();
  if (!confirm(`确定导出选中的 ${ids.length} 个账号为 ${label} 格式？\n\n导出后会标记为已导出，方便对账。`)) return;
  const res = await appBlobRequest("/api/gpt-accounts/export", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, format, mark_exported: true }),
  });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try { err = JSON.parse(await res.text()).error || err; } catch {}
    return toast(err, false);
  }
  const blob = res.blob;
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename=([^;]+)/);
  const filename = match ? match[1].replace(/^"|"$/g, "") : `${format}-${ids.length}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("导出完成，已标记为已导出");
  selectedGptAccountIds.clear();
  loadGptAccounts();
}

async function archiveSelectedGptAccounts() {
  const ids = [...selectedGptAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择 GPT 账号", false);
  if (!confirm(`确定归档选中的 ${ids.length} 个账号？`)) return;
  const d = await api("/api/gpt-accounts/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status: "archived" }),
  });
  if (!d.ok) return toast(d.error || "归档失败", false);
  selectedGptAccountIds.clear();
  toast(`已归档 ${d.updated || ids.length} 个账号`);
  loadGptAccounts();
}

async function deleteSelectedGptAccounts() {
  const ids = [...selectedGptAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择 GPT 账号", false);
  if (!confirm(`确定永久删除选中的 ${ids.length} 个 GPT 账号？\n\n会同时删除它们的刷新队列、巡检队列、事件日志和手机号绑定；不会删除邮箱资产池，也不会删除导出批次记录。`)) return;
  const d = await api("/api/gpt-accounts/delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!d.ok) return toast(d.error || "删除失败", false);
  selectedGptAccountIds.clear();
  toast(`已删除 ${d.deleted || ids.length} 个 GPT 账号`);
  loadGptAccounts();
  loadGptRefreshJobs();
  loadGptInspectionJobs();
  loadGptEvents();
}

function codeHealthBadge(a) {
  const health = a.code_health || "unknown";
  const labels = {
    healthy: "收码正常",
    suspect: `观察中${a.code_poll_count ? ` ${a.code_poll_count}` : ""}`,
    no_code: "不收码",
    blocked: "已拦截",
    unhealthy: "异常",
    unknown: "未验证",
  };
  return `<span class="badge code-${esc(health)}">${esc(labels[health] || health)}</span>`;
}

function renderPager() {
  const start = accountTotal ? ((accountPage - 1) * pageSize() + 1) : 0;
  const end = Math.min(accountPage * pageSize(), accountTotal);
  $("pager-info").textContent = `${start}-${end} / ${accountTotal}`;
  $("prev-page-btn").disabled = accountPage <= 1;
  $("next-page-btn").disabled = end >= accountTotal;
}

async function deleteAccount(id) {
  if (!confirm("确定移除这个邮箱账号？")) return;
  const d = await api(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!d.ok) return toast(d.error || "删除失败", false);
  toast("已移除");
  selectedAccountIds.delete(String(id));
  loadAccounts();
}

async function deleteSelectedAccounts() {
  const ids = [...selectedAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择要删除的账号", false);
  if (!confirm(`确定删除选中的 ${ids.length} 个邮箱账号？\n\n这会从当前账号池直接删除，不会自动归档。`)) return;
  const d = await api("/api/accounts/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!d.ok) return toast(d.error || "批量删除失败", false);
  selectedAccountIds.clear();
  toast(`已删除 ${d.deleted ?? d.matched ?? ids.length} 个账号`);
  loadAccounts();
  loadCategories();
  loadStats();
}

async function restoreSelectedAccountsSafe() {
  const ids = [...selectedAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择要恢复的账号", false);
  if (!confirm(`确定把选中的 ${ids.length} 个邮箱恢复为 safe？\n\n这会清除已用/预留状态，并重置旧的收码健康结果。只建议用于历史误判账号。`)) return;
  const d = await api("/api/accounts/bulk-restore-safe", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!d.ok) return toast(d.error || "恢复失败", false);
  selectedAccountIds.clear();
  toast(`已恢复 ${d.restored ?? d.matched ?? ids.length} 个账号`);
  loadAccounts();
  loadCategories();
  loadStats();
}

async function restoreSelectedAccountsUsed() {
  const ids = [...selectedAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择要恢复为已用的账号", false);
  if (!confirm(`确定把选中的 ${ids.length} 个邮箱恢复为已用？\n\n这会把它们移出待确认/未用池，进入已用筛选，并清除预留状态。`)) return;
  const d = await api("/api/accounts/bulk-restore-used", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!d.ok) return toast(d.error || "恢复已用失败", false);
  selectedAccountIds.clear();
  toast(`已恢复 ${d.restored ?? d.matched ?? ids.length} 个账号为已用`);
  loadAccounts();
  loadCategories();
  loadStats();
}

async function testSelectedAccounts() {
  const ids = [...selectedAccountIds].filter(Boolean);
  if (!ids.length) return toast("先选择要测试的账号", false);
  let success = 0;
  let failed = 0;
  for (const id of ids) {
    const acc = accounts.find((a) => String(a.id) === String(id));
    if (!acc) { failed++; continue; }
    const d = await api("/api/accounts/test", {
      method: "POST",
      body: JSON.stringify({ email: acc.email, folder: "inbox" }),
    });
    if (d.ok && d.readable) {
      success++;
      toast(`${acc.email}: 连接正常，可读 ${d.message_count || 0} 条邮件`);
    } else {
      failed++;
      toast(`${acc.email}: ${d.error || d.status || "连接失败"}`, false);
    }
  }
  toast(`测试完成：正常 ${success}，失败 ${failed}`, failed ? false : true);
  loadAccounts();
}

async function deleteCurrentCategory() {
  const filterVal = $("status-filter") ? $("status-filter").value : "";
  if (!filterVal) return toast("请先选择一个分类（不能选择\"全部\"）", false);
  let category = filterVal;
  if (filterVal.startsWith("cat:")) category = filterVal.slice(4);
  else if (filterVal === "used") category = "used";
  else if (filterVal.startsWith("status:")) category = filterVal.slice(7);
  else if (filterVal === "takeable" || filterVal === "unused") return toast("\"可取号\"和\"未用\"不是实际分类，请选择一个具体分类", false);
  if (!confirm(`确定删除分类 "${category}" 下的所有邮箱账号？\n\n此操作不可撤销，会永久删除该分类的所有数据。`)) return;
  const d = await api("/api/accounts/delete-category", {
    method: "POST",
    body: JSON.stringify({ category }),
  });
  if (!d.ok) return toast(d.error || "删除分类失败", false);
  selectedAccountIds.clear();
  toast(`已删除分类 "${category}" 下 ${d.deleted} 个账号`);
  loadAccounts();
  loadCategories();
  loadStats();
}

async function openMailboxMessages(email) {
  selectedEmail = String(email || "").trim().toLowerCase();
  $("viewer-search").value = selectedEmail;
  setTab("messages");
  await loadViewerMailboxes();
  loadMessages();
}

async function loadViewerMailboxes() {
  const search = encodeURIComponent($("viewer-search").value || "");
  const d = await api(`/api/mailboxes?search=${search}&page=1&limit=300&include_used=1&include_reserved=1&include_unhealthy=1`);
  if (d.ok) renderMailboxPane(d.mailboxes || []);
}

function renderMailboxPane(items) {
  const list = $("viewer-mailbox-list");
  if (!items.length) {
    list.innerHTML = `<div class="empty">没有找到邮箱</div>`;
    return;
  }
  if (selectedEmail && !items.some((a) => a.email === selectedEmail)) {
    const searched = ($("viewer-search").value || "").trim().toLowerCase();
    if (searched !== selectedEmail) selectedEmail = "";
  }
  if (!selectedEmail) selectedEmail = items[0].email;
  const groups = {};
  items.forEach((a) => {
    const cat = a.category || a.status || "未分类";
    (groups[cat] = groups[cat] || []).push(a);
  });
  const cats = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b));
  list.innerHTML = cats.map((cat) => `
    <details class="mailbox-group" ${mailboxGroupOpen.hasOwnProperty(cat) ? (mailboxGroupOpen[cat] ? "open" : "") : "open"} data-cat="${esc(cat)}">
      <summary><span>${esc(cat)}</span><span>${groups[cat].length}</span></summary>
      <div class="mailbox-group-body">
        ${groups[cat].map((a) => `
          <button class="mailbox-item ${a.email === selectedEmail ? "active" : ""}" data-email="${esc(a.email)}">
            <strong>${esc(a.email)}</strong>
            <span>${esc(a.category || a.status)} · ${a.used ? "已用" : a.reserved ? "已预留" : "可用"} · ${esc(fmtDate(a.last_scan_at).split(" ")[0])}</span>
          </button>
        `).join("")}
      </div>
    </details>
  `).join("");
  qsa(".mailbox-group").forEach((g) => g.ontoggle = () => mailboxGroupOpen[g.dataset.cat] = g.open);
  qsa(".mailbox-item").forEach((btn) => btn.onclick = () => {
    selectedEmail = btn.dataset.email;
    renderMailboxPane(items);
    loadMessages();
  });
  $("viewer-current").textContent = selectedEmail || "邮件";
}

async function loadMessages() {
  if (!selectedEmail) return;
  $("messages-list").innerHTML = `<div class="empty">正在读取缓存邮件...</div>`;
  const folder = $("viewer-folder").value;
  const limit = parseInt($("viewer-limit").value, 10) || 20;
  const d = await api(`/api/messages?email=${encodeURIComponent(selectedEmail)}&folder=${encodeURIComponent(folder)}&limit=${limit}`);
  if (!d.ok) {
    $("messages-list").innerHTML = `<div class="empty">${esc(d.error || "读取失败")}</div>`;
    return;
  }
  const refreshNote = d.refresh_error ? `刷新失败：${esc(d.refresh_error)}` : (d.refreshed ? "已刷新最新邮件" : "读取缓存邮件");
  $("viewer-current").textContent = selectedEmail || "邮件";
  renderMessages(d.messages || []);
  const first = $("messages-list").firstElementChild;
  if (first) first.insertAdjacentHTML("beforebegin", `<div class="message-status muted">${refreshNote}</div>`);
}

function renderMessages(messages) {
  if (!messages.length) {
    $("messages-list").innerHTML = `<div class="empty">没有缓存邮件。先扫描邮箱，或切换文件夹。</div>`;
    return;
  }
  $("messages-list").innerHTML = messages.map((m) => `
    <article class="message-item">
      <div class="message-meta"><strong>${esc(m.subject || "(无主题)")}</strong><span>${esc(fmtDate(m.received_at))}</span></div>
      <div class="muted">${esc(m.folder || "")} · ${esc(m.from_name || "")} &lt;${esc(m.from_addr || "")}&gt;</div>
      <p>${highlightCode(esc(m.body_preview || m.body_text || ""))}</p>
    </article>
  `).join("");
}

function highlightCode(text) {
  return text.replace(/(?<!\d)(\d{4,8})(?!\d)/g, `<span class="badge free">$1</span>`);
}

async function loadRules() {
  const d = await api("/api/mail-rules");
  if (!d.ok) return;
  const rules = d.rules || {};
  $("rule-base").value = (rules.base_keywords || []).join(", ");
  $("rule-fallback").value = rules.fallback_category || "free";
  $("rule-no-match").value = rules.no_match_category || "safe";
  $("rule-json").value = JSON.stringify(rules.rules || [], null, 2);
  renderRuleRows(rules.rules || []);
  testRule();
}

function renderRuleRows(rules) {
  $("rule-rows").innerHTML = "";
  (rules.length ? rules : [{ category: "套餐", keywords: ["plus", "subscription", "billing", "套餐", "订阅"] }])
    .forEach((r) => addRuleRow(r.category, (r.keywords || []).join(", ")));
}

function addRuleRow(category = "", keywords = "") {
  const row = document.createElement("div");
  row.className = "rule-row";
  row.innerHTML = `
    <input class="rule-category" placeholder="分类名称" value="${esc(category)}">
    <input class="rule-keywords" placeholder="关键词，用逗号分隔" value="${esc(keywords)}">
    <button class="button ghost remove-rule-btn">删除</button>
  `;
  row.querySelector(".remove-rule-btn").onclick = () => { row.remove(); syncRuleJson(); };
  qsa("input", row).forEach((input) => input.oninput = syncRuleJson);
  $("rule-rows").appendChild(row);
}

function collectRules() {
  return qsa(".rule-row").map((row) => ({
    category: row.querySelector(".rule-category").value.trim(),
    keywords: row.querySelector(".rule-keywords").value.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean),
  })).filter((r) => r.category && r.keywords.length);
}

function syncRuleJson() {
  $("rule-json").value = JSON.stringify(collectRules(), null, 2);
}

async function saveRules() {
  const rules = collectRules();
  const d = await api("/api/mail-rules", {
    method: "POST",
    body: JSON.stringify({
      base_keywords: $("rule-base").value,
      rules,
      fallback_category: $("rule-fallback").value,
      no_match_category: $("rule-no-match").value,
    }),
  });
  if (!d.ok) return toast(d.error || "保存失败", false);
  toast("规则已保存");
  syncRuleJson();
  loadCategories();
}

function testRule() {
  const text = `${$("rule-test-subject").value}\n${$("rule-test-body").value}`.toLowerCase();
  const base = $("rule-base").value.split(/[,，\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  let category = $("rule-no-match").value || "safe";
  let reason = "未命中基础关键词";
  if (!base.length || base.some((k) => text.includes(k))) {
    category = $("rule-fallback").value || "free";
    reason = "命中基础关键词，使用兜底分类";
    for (const r of collectRules()) {
      if (r.keywords.some((k) => text.includes(k.toLowerCase()))) {
        category = r.category;
        reason = `命中规则：${r.category}`;
        break;
      }
    }
  }
  $("rule-test-result").innerHTML = `<strong>结果：${esc(category)}</strong><br><span>${esc(reason)}</span>`;
}

// 保存刚创建的完整key, 页面刷新后丢失
var fullKeyCache = {};

async function loadApiKeys() {
  const d = await api("/api/api-keys");
  if (!d.ok) return;
  const keys = d.api_keys || [];
  $("api-keys-body").innerHTML = keys.length ? keys.map((k) => `
    <tr>
      <td>${esc(k.name)}</td><td class="mono">${esc(k.prefix)}...</td><td><span class="badge ${k.disabled ? "invalid" : "safe"}">${k.disabled ? "已禁用" : "可用"}</span></td>
      <td>${esc(fmtDate(k.created_at))}</td><td>${esc(fmtDate(k.last_used_at))}</td>
      <td>
        <div class="row-actions">
          ${k.disabled
            ? `<button class="button secondary enable-key-btn" data-id="${k.id}">启用</button>`
            : `<button class="button ghost disable-key-btn" data-id="${k.id}">禁用</button>`
          }
          ${fullKeyCache[k.id]
            ? `<button class="button ghost copy-full-key-btn" data-id="${k.id}" title="复制完整 Key">复制</button>`
            : `<button class="button ghost copy-key-prefix-btn" data-prefix="${esc(k.prefix)}..." title="完整 Key 仅创建时可见，此处复制前缀">复制前缀</button>`
          }
          <button class="button danger delete-key-btn" data-id="${k.id}">删除</button>
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="6"><div class="empty">还没有 API Key</div></td></tr>`;
  qsa(".enable-key-btn").forEach((btn) => btn.onclick = () => enableApiKey(btn.dataset.id));
  qsa(".disable-key-btn").forEach((btn) => btn.onclick = () => disableApiKey(btn.dataset.id));
  qsa(".copy-full-key-btn").forEach((btn) => btn.onclick = () => { copyFullApiKey(fullKeyCache[btn.dataset.id]); });
  qsa(".copy-key-prefix-btn").forEach((btn) => btn.onclick = () => copyKeyPrefix(btn.dataset.prefix));
  qsa(".delete-key-btn").forEach((btn) => btn.onclick = () => deleteApiKey(btn.dataset.id));
}

async function createApiKey() {
  const d = await api("/api/api-keys", { method: "POST", body: JSON.stringify({ name: $("api-key-name").value }) });
  if (!d.ok) return toast(d.error || "生成失败", false);
  const key = d.api_key.key;
  const keyId = d.api_key.id;
  fullKeyCache[keyId] = key;
  $("new-api-key").classList.remove("hidden");
  $("new-api-key").innerHTML = `<strong>新 API Key 只显示一次</strong><br><span class="mono">${esc(key)}</span> <button class="button ghost copy-new-key-btn" onclick="copyFullApiKey('${key}')">复制完整 Key</button>`;
  $("api-curl-example").classList.remove("hidden");
  $("api-curl-example").textContent = `注册机配置:
{
  "email_provider": "mailmanage",
  "mailmanage": {
    "base_url": "${location.origin}",
    "api_key": "${key}",
    "category": "safe",
    "keyword": "gpt"
  }
}

领取邮箱:
curl -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d "{\\"category\\":\\"safe\\",\\"consume\\":true}" "${location.origin}/api/mailboxes/reserve"

查询验证码:
curl -H "Authorization: Bearer ${key}" "${location.origin}/api/mail/code?email=your@email.com&keyword=gpt&limit=10"`;
  loadApiKeys();
}

async function enableApiKey(id) {
  const d = await api(`/api/api-keys/${id}/enable`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "启用失败", false);
  toast("API Key 已启用");
  loadApiKeys();
}

async function disableApiKey(id) {
  if (!confirm("确定禁用这个 API Key？")) return;
  const d = await api(`/api/api-keys/${id}/disable`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "禁用失败", false);
  loadApiKeys();
}

async function deleteApiKey(id) {
  if (!confirm("确定删除这个 API Key？\n\n删除后页面不再显示，使用这个 Key 的注册机也会立刻无法调用接口。")) return;
  const d = await api(`/api/api-keys/${id}/delete`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "删除失败", false);
  toast("API Key 已删除");
  loadApiKeys();
}

function copyToClipboard(text) {
  // navigator.clipboard requires secure context (HTTPS/localhost)
  // fallback: textarea + execCommand for HTTP
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  var ok = false;
  try { ok = document.execCommand("copy"); } catch (_) {}
  document.body.removeChild(ta);
  return ok;
}

function copyKeyPrefix(prefix) {
  if (copyToClipboard(prefix)) toast("前缀已复制到剪贴板");
  else toast("复制失败", false);
}

function copyFullApiKey(key) {
  if (copyToClipboard(key)) toast("完整 Key 已复制到剪贴板");
  else toast("复制失败", false);
}

async function loadStats() {
  const d = await api("/api/stats");
  if (!d.ok) return;
  codeHealth = d.code_health || {};
  if (d.categories) categories = d.categories || [];
  if (d.used_breakdown) usedBreakdown = d.used_breakdown || [];
  if (typeof d.total !== "undefined") {
    mailboxTotals = {
      total: parseInt(d.total, 10) || 0,
      used: parseInt(d.used_count, 10) || 0,
      available: parseInt(d.available_count, 10) || 0,
      takeable: parseInt(d.takeable_count, 10) || 0,
    };
  }
  renderStats();
  $("error-list").innerHTML = (d.errors || []).length ? d.errors.map((e) => `
    <div class="stack-item"><div><strong>${esc((e.reason || "unknown").slice(0, 120))}</strong><span>错误原因</span></div><span class="badge error">${e.count}</span></div>
  `).join("") : `<div class="empty">暂无错误聚合</div>`;
  $("recent-list").innerHTML = (d.recent || []).map((r) => `
    <article class="recent-card">
      <strong>${esc(maskEmail(r.email))}</strong>
      <span class="badge ${colorClass(r.category)}">${esc(r.category)}</span>
      <p class="muted">${esc(oneLine(r.reason || ""))}</p>
    </article>
  `).join("") || `<div class="empty">暂无资产</div>`;
  $("api-log-list").innerHTML = (d.api_logs || []).map((l) => `
    <div class="stack-item"><div><strong>${esc(l.action)} · ${esc(maskEmail(l.target || ""))}</strong><span>${esc(l.detail || "")} · ${esc(fmtDate(l.created_at))}</span></div><span>${l.ok ? "OK" : "MISS"}</span></div>
  `).join("") || `<div class="empty">暂无调用日志</div>`;
}

function pollScan() {
  clearTimeout(scanTimer);
  api("/api/scan/status").then((d) => {
    if (!d.ok) return;
    const s = d.state || {};
    const pct = s.total ? Math.round((s.done || 0) / s.total * 100) : 0;
    const text = s.total ? `${s.done}/${s.total}${s.running ? " 扫描中" : " 完成"}` : "未开始";
    $("scan-progress-label").textContent = text;
    $("scan-progress-pct").textContent = `${pct}%`;
    $("scan-progress-fill").style.width = `${pct}%`;
    $("overview-log").textContent = s.log || "";
    $("stop-btn").disabled = !s.running;
    $("scan-btn").disabled = !!s.running;
    $("scan-visible-btn").disabled = !!s.running;
    $("scan-filtered-btn").disabled = !!s.running;
    $("scan-takeable-btn").disabled = !!s.running;
    $("scan-unused-btn").disabled = !!s.running;
    $("scan-used-btn").disabled = !!s.running;
    $("overview-scan-used-btn").disabled = !!s.running;
    $("overview-scan-unused-btn").disabled = !!s.running;
    if (s.running) scanTimer = setTimeout(pollScan, 1200);
    else {
      loadStats();
      loadAccounts();
    }
  });
}

async function startScan(ids = []) {
  const d = await api("/api/scan/start", {
    method: "POST",
    body: JSON.stringify({ ids, concurrency: parseInt($("concurrency").value, 10) || 3, limit: parseInt($("limit").value, 10) || 50 }),
  });
  if (!d.ok) return toast(d.error || "启动失败", false);
  toast("扫描已启动");
  pollScan();
}

async function startFilteredScan(filter = null, options = {}) {
  const f = filter || currentFilterObject();
  const d = await api("/api/scan/filter", {
    method: "POST",
    body: JSON.stringify({ ...f, ...options, concurrency: parseInt($("concurrency").value, 10) || 3, limit: parseInt($("limit").value, 10) || 50 }),
  });
  if (!d.ok) return toast(d.error || "启动失败", false);
  toast("扫描已启动");
  pollScan();
}

async function importAccounts() {
  const d = await api("/api/accounts/import", {
    method: "POST",
    body: JSON.stringify({
      text: $("import-text").value,
      auto_scan: $("import-auto-scan").checked,
      concurrency: parseInt($("import-scan-concurrency").value, 10) || 3,
      limit: parseInt($("import-scan-limit").value, 10) || 20,
    }),
  });
  if (!d.ok) return toast(d.error || "导入失败", false);
  const scanText = d.auto_scan_started ? `，已自动扫描 ${d.auto_scan_count} 个新账号` : d.auto_scan_skipped ? `，${d.auto_scan_skipped}` : "";
  $("import-result").textContent = `解析 ${d.parsed}，新增 ${d.added}，更新 ${d.updated}${scanText}`;
  toast(d.auto_scan_started ? "导入完成，已启动自动扫描" : "导入完成");
  if (d.auto_scan_started) pollScan();
  loadAccounts();
  loadCategories();
}

async function loadInvites() {
  const d = await api("/api/invites");
  if (!d.ok) return;
  invites = d.invites || [];
  renderInvites();
}

function invitePageSize() {
  return parseInt($("invite-page-size")?.value, 10) || 50;
}

function inviteStatus(inv) {
  const expired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
  return inv.disabled ? "已禁用" : expired ? "已过期" : inv.used_count >= inv.max_uses ? "已用完" : "可用";
}

function filteredInvites() {
  const search = ($("invite-search")?.value || "").trim().toLowerCase();
  if (!search) return invites;
  return invites.filter((inv) => {
    const text = [
      inv.code,
      `${inv.used_count}/${inv.max_uses}`,
      inviteStatus(inv),
      fmtDate(inv.expires_at),
      fmtDate(inv.created_at),
    ].join(" ").toLowerCase();
    return text.includes(search);
  });
}

function renderInvites() {
  const rows = filteredInvites();
  inviteTotal = rows.length;
  const size = invitePageSize();
  const pages = Math.max(1, Math.ceil(inviteTotal / size));
  invitePage = Math.min(Math.max(1, invitePage), pages);
  const start = (invitePage - 1) * size;
  const pageRows = rows.slice(start, start + size);
  $("invites-body").innerHTML = pageRows.map((inv) => {
    const expired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
    const status = inv.disabled ? "已禁用" : expired ? "已过期" : inv.used_count >= inv.max_uses ? "已用完" : "可用";
    return `<tr><td class="mono">${esc(inv.code)}</td><td>${inv.used_count}/${inv.max_uses}</td><td>${esc(fmtDate(inv.expires_at))}</td><td>${status}</td><td>${esc(fmtDate(inv.created_at))}</td><td><div class="row-actions"><button class="button ghost disable-invite-btn" data-id="${inv.id}">禁用</button><button class="button danger delete-invite-btn" data-id="${inv.id}">删除</button></div></td></tr>`;
  }).join("") || `<tr><td colspan="6"><div class="empty">${invites.length ? "没有匹配的邀请码" : "还没有邀请码"}</div></td></tr>`;
  const from = inviteTotal ? start + 1 : 0;
  const to = Math.min(start + pageRows.length, inviteTotal);
  $("invite-page-info").textContent = `${from}-${to} / ${inviteTotal}`;
  $("invite-summary").textContent = `共 ${invites.length} 个邀请码，当前匹配 ${inviteTotal} 个`;
  $("invite-prev").disabled = invitePage <= 1;
  $("invite-next").disabled = invitePage >= pages;
  qsa(".disable-invite-btn").forEach((btn) => btn.onclick = () => disableInvite(btn.dataset.id));
  qsa(".delete-invite-btn").forEach((btn) => btn.onclick = () => deleteInvite(btn.dataset.id));
}

async function createInvite() {
  const d = await api("/api/invites", { method: "POST", body: JSON.stringify({ max_uses: parseInt($("invite-uses").value, 10) || 1, ttl_hours: parseInt($("invite-hours").value, 10) || 24 }) });
  if (!d.ok) return toast(d.error || "生成失败", false);
  toast(`邀请码：${d.invite.code}`);
  invitePage = 1;
  loadInvites();
}

async function disableInvite(id) {
  const d = await api(`/api/invites/${id}/disable`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "禁用失败", false);
  loadInvites();
}

async function deleteInvite(id) {
  if (!confirm("删除这个邀请码？已注册用户不会受影响。")) return;
  const d = await api(`/api/invites/${id}/delete`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "删除失败", false);
  toast("邀请码已删除");
  loadInvites();
}

async function loadUsers() {
  const d = await api("/api/admin/users");
  if (!d.ok) return;
  adminUsers = d.users || [];
  renderUsers();
}

function adminUserPageSize() {
  return parseInt($("admin-user-page-size")?.value, 10) || 20;
}

function filteredAdminUsers() {
  const jumpSearch = ($("admin-user-jump-search")?.value || "").trim();
  const tableSearch = ($("admin-user-search")?.value || "").trim();
  const search = (jumpSearch || tableSearch).toLowerCase();
  if (!search) return adminUsers;
  return adminUsers.filter((u) => String(u.username || "").toLowerCase().includes(search));
}

function syncAdminUserSearch(value) {
  if ($("admin-user-jump-search")) $("admin-user-jump-search").value = value;
  if ($("admin-user-search")) $("admin-user-search").value = value;
  adminUserPage = 1;
  renderUsers();
}

function renderUsers() {
  const rows = filteredAdminUsers();
  adminUserTotal = rows.length;
  const size = adminUserPageSize();
  const pages = Math.max(1, Math.ceil(adminUserTotal / size));
  adminUserPage = Math.min(Math.max(1, adminUserPage), pages);
  const start = (adminUserPage - 1) * size;
  const pageRows = rows.slice(start, start + size);
  $("users-body").innerHTML = pageRows.map((u) => `
    <tr>
      <td>${esc(u.id)}</td>
      <td><strong>${esc(u.username)}</strong></td>
      <td>
        <select class="user-role-select" data-id="${esc(u.id)}">
          <option value="user" ${u.role === "user" ? "selected" : ""}>普通用户</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>管理员</option>
        </select>
      </td>
      <td><span class="badge ${u.disabled ? "invalid" : "safe"}">${u.disabled ? "已禁用" : "可用"}</span></td>
      <td>${esc(u.account_count || 0)}</td>
      <td>${esc(u.api_key_count || 0)}</td>
      <td>${esc(fmtDate(u.last_login_at))}</td>
      <td>${esc(fmtDate(u.created_at))}</td>
      <td>
        <div class="row-actions">
          <button class="button ghost user-password-btn" data-id="${esc(u.id)}">重置密码</button>
          <button class="button ${u.disabled ? "secondary" : "danger"} user-disable-btn" data-id="${esc(u.id)}" data-disabled="${u.disabled ? "0" : "1"}">${u.disabled ? "启用" : "禁用"}</button>
          <button class="button danger user-delete-btn" data-id="${esc(u.id)}">删除</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="9"><div class="empty">${adminUsers.length ? "没有匹配的用户名" : "还没有用户"}</div></td></tr>`;
  const from = adminUserTotal ? start + 1 : 0;
  const to = Math.min(start + pageRows.length, adminUserTotal);
  $("admin-user-page-info").textContent = `${from}-${to} / ${adminUserTotal}`;
  $("admin-user-prev").disabled = adminUserPage <= 1;
  $("admin-user-next").disabled = adminUserPage >= pages;
  qsa(".user-role-select").forEach((sel) => sel.onchange = () => updateUserRole(sel.dataset.id, sel.value));
  qsa(".user-password-btn").forEach((btn) => btn.onclick = () => resetUserPassword(btn.dataset.id));
  qsa(".user-disable-btn").forEach((btn) => btn.onclick = () => setUserDisabled(btn.dataset.id, btn.dataset.disabled === "1"));
  qsa(".user-delete-btn").forEach((btn) => btn.onclick = () => deleteUser(btn.dataset.id));
}

async function createUser() {
  const username = $("admin-new-username").value.trim();
  const password = $("admin-new-password").value;
  const role = $("admin-new-role").value;
  const d = await api("/api/admin/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
  if (!d.ok) return toast(d.error || "创建失败", false);
  $("admin-new-username").value = "";
  $("admin-new-password").value = "";
  $("admin-new-role").value = "user";
  toast("账户已创建");
  adminUserPage = 1;
  loadUsers();
}

async function updateUserRole(id, role) {
  const d = await api(`/api/admin/users/${id}/role`, { method: "POST", body: JSON.stringify({ role }) });
  if (!d.ok) {
    toast(d.error || "角色更新失败", false);
    return loadUsers();
  }
  toast("角色已更新");
  loadUsers();
}

async function resetUserPassword(id) {
  const password = prompt("输入新密码，至少 8 位");
  if (!password) return;
  const d = await api(`/api/admin/users/${id}/password`, { method: "POST", body: JSON.stringify({ password }) });
  if (!d.ok) return toast(d.error || "重置失败", false);
  toast("密码已重置");
}

async function setUserDisabled(id, disabled) {
  if (!confirm(disabled ? "确定禁用这个账户？该账户会被强制退出，API Key 也会禁用。" : "确定启用这个账户？")) return;
  const d = await api(`/api/admin/users/${id}/disable`, { method: "POST", body: JSON.stringify({ disabled }) });
  if (!d.ok) return toast(d.error || "操作失败", false);
  toast(disabled ? "账户已禁用" : "账户已启用");
  loadUsers();
}

async function deleteUser(id) {
  if (!confirm("确定删除这个账户？该用户的邮箱、消息、API Key 和规则也会删除。")) return;
  const d = await api(`/api/admin/users/${id}/delete`, { method: "POST", body: "{}" });
  if (!d.ok) return toast(d.error || "删除失败", false);
  toast("账户已删除");
  loadUsers();
}

function showRegister() {
  $("login-panel").classList.add("hidden");
  $("register-panel").classList.remove("hidden");
  $("login-error").textContent = "";
}

function showLoginPanel() {
  $("register-panel").classList.add("hidden");
  $("login-panel").classList.remove("hidden");
  $("register-error").textContent = "";
}

async function registerAccount() {
  $("register-error").textContent = "";
  const d = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({
      username: $("register-username").value.trim(),
      password: $("register-password").value,
      invite_code: $("register-invite").value.trim(),
    }),
  });
  if (!d.ok) {
    $("register-error").textContent = d.error || "注册失败";
    return;
  }
  $("login-username").value = $("register-username").value.trim();
  $("login-password").value = $("register-password").value;
  $("register-username").value = "";
  $("register-password").value = "";
  $("register-invite").value = "";
  showLoginPanel();
  toast("注册成功，可以登录了");
}

function openDrawer() { $("import-drawer").classList.remove("hidden"); }
function closeDrawer() { $("import-drawer").classList.add("hidden"); }

function bindEvents() {
  $("login-btn").onclick = async () => {
    const d = await api("/api/login", { method: "POST", body: JSON.stringify({ username: $("login-username").value, password: $("login-password").value }) });
    if (!d.ok) { $("login-error").textContent = d.error || "登录失败"; return; }
    showApp();
  };
  ["login-username", "login-password"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") $("login-btn").click(); }));
  $("show-register-btn").onclick = showRegister;
  $("show-login-btn").onclick = showLoginPanel;
  $("register-btn").onclick = registerAccount;
  ["register-username", "register-password", "register-invite"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") $("register-btn").click(); }));
  $("logout-btn").onclick = () => api("/api/logout", { method: "POST", body: "{}" }).then(showLogin);
  qsa(".nav-item").forEach((btn) => btn.onclick = () => setTab(btn.dataset.tab));
  qsa("[data-goto]").forEach((btn) => btn.onclick = () => setTab(btn.dataset.goto));
  $("refresh-current-btn").onclick = () => { loadCategories(); loadAccounts(); loadGptAccounts(); loadGptWorkbench(); loadStats(); loadViewerMailboxes(); loadApiKeys(); };
  qsa(".gpt-native-tab").forEach((btn) => btn.onclick = () => setGptNativePanel(btn.dataset.gptPanel));

  $("status-filter").onchange = () => { accountPage = 1; loadAccounts(); };
  $("page-size").onchange = () => { accountPage = 1; loadAccounts(); };
  $("account-search").oninput = debounce(() => { accountPage = 1; loadAccounts(); }, 250);
  $("prev-page-btn").onclick = () => { if (accountPage > 1) { accountPage--; loadAccounts(); } };
  $("next-page-btn").onclick = () => { if (accountPage * pageSize() < accountTotal) { accountPage++; loadAccounts(); } };
  $("export-btn").onclick = () => {
    const q = currentFilterQuery();
    window.open(`/api/export${q ? "?" + q : ""}`, "_blank");
  };
  $("delete-selected-btn").onclick = deleteSelectedAccounts;
  $("restore-selected-btn").onclick = restoreSelectedAccountsSafe;
  $("restore-used-selected-btn").onclick = restoreSelectedAccountsUsed;
  $("test-selected-btn").onclick = testSelectedAccounts;
  $("delete-category-btn").onclick = deleteCurrentCategory;
  $("select-page-link").onclick = toggleCurrentPageSelection;
  $("clear-selection-btn").onclick = clearAccountSelection;
  $("select-page-accounts").onchange = () => {
    toggleCurrentPageSelection();
  };
  $("gpt-status-filter").onchange = () => { gptAccountPage = 1; loadGptAccounts(); };
  $("gpt-result-filter").onchange = () => { gptAccountPage = 1; loadGptAccounts(); };
  $("gpt-source-filter").onchange = () => { gptAccountPage = 1; loadGptAccounts(); };
  $("gpt-export-filter").onchange = () => { gptAccountPage = 1; loadGptAccounts(); };
  $("gpt-page-size").onchange = () => { gptAccountPage = 1; loadGptAccounts(); };
  $("gpt-search").oninput = debounce(() => { gptAccountPage = 1; loadGptAccounts(); }, 250);
  $("gpt-prev-page-btn").onclick = () => { if (gptAccountPage > 1) { gptAccountPage--; loadGptAccounts(); } };
  $("gpt-next-page-btn").onclick = () => { if (gptAccountPage * gptPageSize() < gptAccountTotal) { gptAccountPage++; loadGptAccounts(); } };
  $("select-page-gpt-accounts").onchange = toggleCurrentGptPageSelection;
  $("gpt-select-page-link").onclick = toggleCurrentGptPageSelection;
  $("gpt-clear-selection-btn").onclick = clearGptSelection;
  $("gpt-export-sub2-btn").onclick = () => exportSelectedGptAccounts("sub2api");
  $("gpt-export-cpa-btn").onclick = () => exportSelectedGptAccounts("cpa");
  $("gpt-export-cockpit-btn").onclick = () => exportSelectedGptAccounts("cockpit_tools");
  $("gpt-refresh-queue-btn").onclick = queueGptRefresh;
  $("gpt-inspect-queue-btn").onclick = queueGptInspection;
  $("gpt-wenas-config-btn").onclick = toggleWenasPanel;
  $("gpt-wenas-close-btn").onclick = () => $("gpt-wenas-panel").classList.add("hidden");
  $("gpt-wenas-save-btn").onclick = saveWenasConfig;
  $("gpt-wenas-test-btn").onclick = testWenasConfig;
  $("gpt-wenas-sync-btn").onclick = syncSelectedGptToWenas;
  $("gpt-wenas-check-btn").onclick = createWenasCheckTasks;
  $("gpt-wenas-result-btn").onclick = submitWenasCheckResultForSelected;
  $("gpt-archive-btn").onclick = archiveSelectedGptAccounts;
  $("gpt-delete-btn").onclick = deleteSelectedGptAccounts;
  $("refresh-gpt-accounts-btn").onclick = () => { loadGptAccounts(); loadGptWorkbench(); };
  $("gpt-import-toggle-btn").onclick = () => $("gpt-import-panel").classList.toggle("hidden");
  $("gpt-import-close-btn").onclick = () => $("gpt-import-panel").classList.add("hidden");
  $("gpt-import-file-btn").onclick = () => $("gpt-import-file-input").click();
  $("gpt-import-file-input").onchange = loadGptImportFiles;
  $("gpt-import-submit-btn").onclick = importGptAccounts;
  $("gpt-import-sample-btn").onclick = fillGptImportSample;
  $("gpt-import-clear-btn").onclick = clearGptImportText;
  $("refresh-gpt-refresh-jobs-btn").onclick = loadGptRefreshJobs;
  $("refresh-gpt-inspection-jobs-btn").onclick = loadGptInspectionJobs;
  $("refresh-gpt-exports-btn").onclick = loadGptExports;
  $("refresh-gpt-events-btn").onclick = loadGptEvents;
  $("gpt-rule-save-btn").onclick = saveGptRule;
  $("phone-save-btn").onclick = savePhoneCode;
  $("gpt-sync-mailbox-btn").onclick = syncGptWorkbenchMailboxes;
  $("gpt-proxy-check-btn").onclick = checkGptProxy;
  $("gpt-native-refresh-selected-btn").onclick = startNativeGptRefresh;
  $("gpt-refresh-stop-btn").onclick = () => {
    gptRefreshStopRequested = true;
    appendGptRefreshLog("收到停止请求，当前账号结束后停止后续任务。", "warning");
  };
  $("gpt-cpa-scan-btn").onclick = scanNativeCpa;
  $("gpt-cpa-delete-btn").onclick = deleteSelectedNativeCpa;
  $("gpt-cpa-queue-refresh-btn").onclick = queueCpaRowsToRefresh;
  $("gpt-cpa-select-all").onchange = () => {
    if ($("gpt-cpa-select-all").checked) gptCpaRows.forEach((_row, index) => selectedCpaRows.add(index));
    else selectedCpaRows.clear();
    renderNativeCpaRows();
  };
  $("gpt-session-input").oninput = debounce(convertGptSessionInput, 250);
  $("gpt-converter-format").onchange = convertGptSessionInput;
  $("gpt-session-file-btn").onclick = () => $("gpt-session-file-input").click();
  $("gpt-session-file-input").onchange = importGptSessionFiles;
  $("gpt-session-sample-btn").onclick = fillGptSessionSample;
  $("gpt-session-clear-btn").onclick = clearGptSessionConverter;
  $("gpt-session-copy-btn").onclick = copyGptSessionOutput;
  $("gpt-session-download-btn").onclick = downloadGptSessionOutput;
  $("gpt-session-import-btn").onclick = importGptSessionConverted;
  $("scan-btn").onclick = () => {
    if (confirm("高级全量扫描会扫描所有账号，可能较慢。确定继续？")) startScan([]);
  };
  $("overview-scan-used-btn").onclick = () => startFilteredScan({ used: true, force: true }, { include_used: true });
  $("overview-scan-unused-btn").onclick = () => startFilteredScan({ scope: "unused" });
  $("scan-takeable-btn").onclick = () => startFilteredScan({ scope: "takeable" });
  $("scan-unused-btn").onclick = () => {
    if (confirm("复检未用只扫描正常未用邮箱，包含可用和未扫描，不包含待确认、错误、失效、不收码和已用邮箱。确定开始？")) {
      startFilteredScan({ scope: "unused" });
    }
  };
  $("scan-used-btn").onclick = () => {
    if (confirm("复检已用会重新检查所有已用邮箱：有 GPT/OpenAI/Codex 6位验证码的保留/归类为已用；没有验证码证据的转入待确认；扫描错误的归类为错误或失效。确定开始？")) {
      startFilteredScan({ used: true, force: true }, { include_used: true });
    }
  };
  $("scan-visible-btn").onclick = () => startScan(accounts.map((a) => a.id));
  $("scan-filtered-btn").onclick = startFilteredScan;
  $("stop-btn").onclick = () => api("/api/scan/stop", { method: "POST", body: "{}" }).then(pollScan);

  $("import-open-btn").onclick = openDrawer;
  qsa("[data-close-drawer]").forEach((el) => el.onclick = closeDrawer);
  $("fill-sample-btn").onclick = () => $("import-text").value = "user@hotmail.com----password----client_id----refresh_token----tag";
  $("clear-import-btn").onclick = () => { $("import-text").value = ""; $("import-result").textContent = ""; };
  $("import-btn").onclick = importAccounts;
  $("file-input").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => $("import-text").value = ev.target.result;
    reader.readAsText.call(reader, file);
  };

  $("viewer-search").oninput = debounce(loadViewerMailboxes, 250);
  $("viewer-folder").onchange = loadMessages;
  $("load-messages-btn").onclick = loadMessages;
  $("add-rule-btn").onclick = () => addRuleRow("", "");
  $("save-rules-btn").onclick = saveRules;
  $("test-rule-btn").onclick = testRule;
  ["rule-base", "rule-fallback", "rule-no-match", "rule-test-subject", "rule-test-body"].forEach((id) => $(id).oninput = () => { syncRuleJson(); testRule(); });
  $("create-api-key-btn").onclick = createApiKey;
  $("refresh-api-key-btn").onclick = loadApiKeys;
  $("create-invite-btn").onclick = createInvite;
  $("refresh-invite-btn").onclick = loadInvites;
  $("invite-search").oninput = debounce(() => { invitePage = 1; renderInvites(); }, 200);
  $("invite-page-size").onchange = () => { invitePage = 1; renderInvites(); };
  $("invite-prev").onclick = () => { if (invitePage > 1) { invitePage--; renderInvites(); } };
  $("invite-next").onclick = () => { if (invitePage * invitePageSize() < inviteTotal) { invitePage++; renderInvites(); } };
  $("refresh-users-btn").onclick = loadUsers;
  $("admin-create-user-btn").onclick = createUser;
  $("admin-user-jump-search").oninput = debounce(() => syncAdminUserSearch($("admin-user-jump-search").value), 200);
  $("admin-user-search").oninput = debounce(() => syncAdminUserSearch($("admin-user-search").value), 200);
  $("admin-user-page-size").onchange = () => { adminUserPage = 1; renderUsers(); };
  $("admin-user-prev").onclick = () => { if (adminUserPage > 1) { adminUserPage--; renderUsers(); } };
  $("admin-user-next").onclick = () => { if (adminUserPage * adminUserPageSize() < adminUserTotal) { adminUserPage++; renderUsers(); } };
  $("registration-enabled").onchange = async () => {
    const enabled = $("registration-enabled").checked;
    const d = await api("/api/settings/registration", { method: "POST", body: JSON.stringify({ enabled }) });
    if (!d.ok) toast(d.error || "设置失败", false);
  };
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function boot() {
  mountIcons();
  bindEvents();
  bindGptWorkbenchConfigPersistence();
  api("/api/me", { silentAuth: true }).then((d) => d.ok ? showApp() : showLogin());
}

boot();
