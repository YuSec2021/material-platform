const API = window.MATERIAL_API_BASE || (window.location.port === "5173" ? "http://localhost:8000/api/v1" : "/api/v1");
const app = document.getElementById("app");
let products = [];
let materialLibraries = [];
let categories = [];
let brandsCache = [];
let selectedProductId = null;
let editingAttributeId = null;
let editingBrandId = null;
let editingMaterialId = null;
let editingMaterialLibraryId = null;
let editingUserId = null;
let editingRoleId = null;
let editingProviderId = null;
let materialPreviewItems = [];
let materialGovernanceFile = null;
let aiMaterialPreview = null;
let workflowReferenceImages = [];
let currentUser = null;
let systemConfigCache = null;
const AI_CAPABILITIES = ["material_add", "material_match", "category_match", "material_analysis", "attr_recommend", "material_governance"];
const NAV_ITEMS = [
  { href: "/materials", label: "Material Management", permission: "directory.material_archives" },
  { href: "/materials/ai-add", label: "AI Material Add", permission: "directory.material_archives" },
  { href: "/materials/governance", label: "Material AI Governance", permission: "directory.material_archives" },
  { href: "/material-libraries", label: "Material Libraries", permission: "directory.material_library" },
  { href: "/workflows/new-category", label: "New Category Workflow", permission: "directory.workflow" },
  { href: "/workflows/new-material-code", label: "New Material Code", permission: "directory.workflow" },
  { href: "/workflows/stop-purchase", label: "Stop Purchase", permission: "directory.workflow" },
  { href: "/workflows/stop-use", label: "Stop Use", permission: "directory.workflow" },
  { href: "/workflows/tasks", label: "Workflow Tasks", permission: "directory.workflow" },
  { href: "/workflows/applications", label: "My Applications", permission: "directory.workflow" },
  { href: "/system/users", label: "Users", permission: "directory.system_admin" },
  { href: "/system/roles", label: "Roles", permission: "directory.system_admin" },
  { href: "/system/config", label: "System Config", permission: "directory.system_admin" },
  { href: "/audit-logs", label: "Audit Logs", permission: "directory.system_admin" },
  { href: "/categories", label: "Categories", permission: "directory.category_management" },
  { href: "/ai/providers", label: "AI Providers", permission: "directory.system_admin" },
  { href: "/debug/trace", label: "AI Trace Debug", permission: "directory.system_admin" },
  { href: "/standard/product-names", label: "Product Names", permission: "directory.product_name_management" },
  { href: "/standard/attributes", label: "Attributes", permission: "directory.attribute_management" },
  { href: "/standard/attributes/ai-governance", label: "AI Governance", permission: "directory.attribute_management" },
  { href: "/standard/attribute-recommend", label: "Attribute Recommend", permission: "directory.attribute_management" },
  { href: "/standard/attributes/changes", label: "Changes", permission: "directory.attribute_management" },
  { href: "/standard/brands", label: "Brands", permission: "directory.brand_management" }
];
const ROUTE_PERMISSIONS = [
  { test: (path) => path.includes("/material-libraries"), permission: "directory.material_library" },
  { test: (path) => path.includes("/materials"), permission: "directory.material_archives" },
  { test: (path) => path.includes("/standard/attributes"), permission: "directory.attribute_management" },
  { test: (path) => path.includes("/workflows"), permission: "directory.workflow" },
  { test: (path) => path.includes("/system"), permission: "directory.system_admin" },
  { test: (path) => path.includes("/audit-logs"), permission: "directory.system_admin" },
  { test: (path) => path.includes("/ai/providers") || path.includes("/debug/trace"), permission: "directory.system_admin" },
  { test: (path) => path.includes("/categories"), permission: "directory.category_management" },
  { test: (path) => path.includes("/standard/product-names"), permission: "directory.product_name_management" },
  { test: (path) => path.includes("/standard/brands"), permission: "directory.brand_management" }
];

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
}[char]));

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function requestBlob(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.blob();
}

async function loadSystemConfig(force = false) {
  if (systemConfigCache && !force) return systemConfigCache;
  systemConfigCache = await request("/system/config");
  applySystemIdentity(systemConfigCache);
  return systemConfigCache;
}

function applySystemIdentity(config) {
  const h1 = document.querySelector(".topbar h1");
  const eyebrow = document.querySelector(".topbar .eyebrow");
  if (h1) {
    const icon = config.icon?.data_url ? `<img class="system-icon" src="${esc(config.icon.data_url)}" alt="${esc(config.system_name)} icon" />` : "";
    h1.innerHTML = `${icon}<span>${esc(config.system_name || "AI Material Management Platform")}</span>`;
  }
  if (eyebrow) eyebrow.textContent = "Material Management";
  document.title = config.system_name || "AI Material Management Platform";
}

function storedSession() {
  try {
    return JSON.parse(localStorage.getItem("material_session") || "{}");
  } catch {
    return {};
  }
}

function authHeaders() {
  const session = storedSession();
  if (session.user_id) return { "X-User-Id": String(session.user_id) };
  if (session.username) return { "X-Username": session.username };
  return { "X-User-Role": "super_admin" };
}

function can(permissionKey) {
  return Boolean(currentUser?.is_super_admin || currentUser?.permissions?.includes(permissionKey));
}

function accessDenied(permissionKey) {
  app.innerHTML = `
    <section class="panel access-denied">
      <h2>Access denied</h2>
      <p class="muted">Current user ${esc(currentUser?.username || "unknown")} lacks ${esc(permissionKey)}.</p>
    </section>
  `;
}

async function loadCurrentUser() {
  currentUser = await request("/auth/me");
  try {
    await loadSystemConfig(true);
  } catch {
    systemConfigCache = null;
  }
  renderNavigation();
  renderSessionBar();
}

function renderNavigation() {
  const nav = document.querySelector("nav");
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS
    .filter((item) => can(item.permission))
    .map((item) => `<a href="${item.href}">${esc(item.label)}</a>`)
    .join("");
}

function renderSessionBar() {
  let bar = document.getElementById("sessionBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "sessionBar";
    bar.className = "session-bar";
    document.querySelector(".topbar").appendChild(bar);
  }
  bar.innerHTML = `
    <span class="pill">${esc(currentUser?.username || "super_admin")}</span>
    <input id="sessionUsername" placeholder="Username" />
    <button id="switchSession" class="secondary">Switch User</button>
    <button id="adminSession" class="secondary">Use Admin</button>
  `;
  document.getElementById("switchSession").addEventListener("click", switchSession);
  document.getElementById("adminSession").addEventListener("click", useAdminSession);
}

async function switchSession() {
  const username = document.getElementById("sessionUsername").value.trim();
  if (!username) return;
  const user = await request("/auth/login", { method: "POST", body: JSON.stringify({ username }) });
  localStorage.setItem("material_session", JSON.stringify({ user_id: user.id, username: user.username }));
  await loadCurrentUser();
  route();
}

async function useAdminSession() {
  localStorage.setItem("material_session", JSON.stringify({ username: "super_admin" }));
  await loadCurrentUser();
  route();
}

async function loadProducts() {
  products = await request("/product-names");
  selectedProductId = selectedProductId || products[0]?.id;
}

async function loadMaterialContext() {
  await loadProducts();
  const [libraries, categoryRows, brandRows] = await Promise.all([
    request("/material-libraries"),
    request("/categories"),
    request("/brands")
  ]);
  materialLibraries = libraries;
  categories = categoryRows;
  brandsCache = brandRows;
}

function productSelect() {
  return `<label>Product name
    <select id="productSelect">
      ${products.map((p) => `<option value="${p.id}" ${p.id === selectedProductId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
  </label>`;
}

function bindProductSelect(onChange) {
  const select = document.getElementById("productSelect");
  if (select) {
    select.addEventListener("change", () => {
      selectedProductId = Number(select.value);
      onChange();
    });
  }
}

function materialLibrarySelect(selectedId = materialLibraries[0]?.id) {
  return `<label>Material library
    <select id="materialLibrarySelect">
      ${materialLibraries.map((library) => `<option value="${library.id}" ${library.id === selectedId ? "selected" : ""}>${esc(library.name)}</option>`).join("")}
    </select>
  </label>`;
}

function categorySelect(selectedId = categories[0]?.id) {
  return `<label>Category
    <select id="categorySelect">
      ${categories.map((category) => `<option value="${category.id}" ${category.id === selectedId ? "selected" : ""}>${esc(category.name)}</option>`).join("")}
    </select>
  </label>`;
}

function brandSelect(selectedId = "") {
  return `<label>Brand
    <select id="materialBrand">
      <option value="">No brand</option>
      ${brandsCache.map((brand) => `<option value="${brand.id}" ${String(brand.id) === String(selectedId) ? "selected" : ""}>${esc(brand.name)}</option>`).join("")}
    </select>
  </label>`;
}

async function renderMaterialLibraries() {
  const search = document.getElementById("librarySearch")?.value || "";
  const libraries = await request("/material-libraries");
  const filtered = libraries.filter((library) => {
    const text = `${library.name} ${library.code} ${library.description}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });
  const canCreate = can("button.material_library.create");
  app.innerHTML = `
    <h2>Material Library Management</h2>
    <div class="grid material-grid">
      ${canCreate ? `<section class="panel">
        <h3 id="libraryFormTitle">Create material library</h3>
        <label>Name<input id="libraryName" placeholder="Sprint 9 Scope A" /></label>
        <label>Description<textarea id="libraryDescription" placeholder="Library purpose and scope"></textarea></label>
        <label><span><input id="libraryEnabled" type="checkbox" checked /> Enabled</span></label>
        <button id="saveLibrary">Create Material Library</button>
        <button id="resetLibraryForm" class="secondary">Reset</button>
        <div id="libraryStatus" class="status muted"></div>
      </section>` : `<section class="panel"><h3>Library actions</h3><div class="empty">Create permission is not granted.</div><div id="libraryStatus" class="status muted"></div></section>`}
      <section>
        <div class="toolbar">
          <input id="librarySearch" value="${esc(search)}" placeholder="Search material libraries" />
          <button id="searchLibraries" class="secondary">Search</button>
          <button id="clearLibraries" class="secondary">Clear</button>
          ${can("button.material_library.import") ? `<button class="secondary" disabled>Import</button>` : ""}
          ${can("button.material_library.export") ? `<button class="secondary" disabled>Export</button>` : ""}
          ${can("button.material_library.approval") ? `<button class="secondary" disabled>Approval</button>` : ""}
        </div>
        <div class="panel">${materialLibraryTable(filtered)}</div>
      </section>
    </div>
  `;
  if (canCreate) {
    document.getElementById("saveLibrary").addEventListener("click", saveMaterialLibrary);
    document.getElementById("resetLibraryForm").addEventListener("click", resetMaterialLibraryForm);
  }
  document.getElementById("searchLibraries").addEventListener("click", renderMaterialLibraries);
  document.getElementById("clearLibraries").addEventListener("click", () => {
    document.getElementById("librarySearch").value = "";
    renderMaterialLibraries();
  });
  document.querySelectorAll("[data-edit-library]").forEach((button) => button.addEventListener("click", () => editMaterialLibrary(button.dataset.editLibrary)));
  document.querySelectorAll("[data-delete-library]").forEach((button) => button.addEventListener("click", () => deleteMaterialLibrary(button.dataset.deleteLibrary)));
  window.currentMaterialLibraries = libraries;
}

function materialLibraryTable(libraries) {
  if (!libraries.length) return `<div class="empty">No material libraries found</div>`;
  return `
    <table>
      <thead><tr><th>Library</th><th>Code</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${libraries.map((library) => `
          <tr>
            <td>${esc(library.name)}<div class="muted">ID ${library.id}</div></td>
            <td>${esc(library.code)}</td>
            <td>${esc(library.description)}</td>
            <td>${library.enabled ? "enabled" : "disabled"}</td>
            <td class="actions">
              ${can("button.material_library.edit") ? `<button class="secondary" data-edit-library="${library.id}">Edit</button>` : ""}
              ${can("button.material_library.delete") ? `<button class="danger" data-delete-library="${library.id}">Delete</button>` : ""}
              ${!can("button.material_library.edit") && !can("button.material_library.delete") ? `<span class="muted">Read only</span>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function saveMaterialLibrary() {
  const status = document.getElementById("libraryStatus");
  const payload = {
    name: document.getElementById("libraryName").value.trim(),
    description: document.getElementById("libraryDescription").value.trim(),
    enabled: document.getElementById("libraryEnabled").checked
  };
  try {
    if (editingMaterialLibraryId) {
      await request(`/material-libraries/${editingMaterialLibraryId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await request("/material-libraries", { method: "POST", body: JSON.stringify(payload) });
    }
    editingMaterialLibraryId = null;
    status.textContent = "Material library saved";
    renderMaterialLibraries();
  } catch (error) {
    status.textContent = error.message;
  }
}

function editMaterialLibrary(id) {
  const library = (window.currentMaterialLibraries || []).find((item) => String(item.id) === String(id));
  if (!library) return;
  editingMaterialLibraryId = library.id;
  document.getElementById("libraryFormTitle").textContent = `Edit ${library.name}`;
  document.getElementById("saveLibrary").textContent = "Update Material Library";
  document.getElementById("libraryName").value = library.name;
  document.getElementById("libraryDescription").value = library.description;
  document.getElementById("libraryEnabled").checked = library.enabled;
}

function resetMaterialLibraryForm() {
  editingMaterialLibraryId = null;
  document.getElementById("libraryFormTitle").textContent = "Create material library";
  document.getElementById("saveLibrary").textContent = "Create Material Library";
  document.getElementById("libraryName").value = "";
  document.getElementById("libraryDescription").value = "";
  document.getElementById("libraryEnabled").checked = true;
}

async function deleteMaterialLibrary(id) {
  if (!window.confirm("Delete this material library?")) return;
  await request(`/material-libraries/${id}`, { method: "DELETE" });
  renderMaterialLibraries();
}

function parseAttributes(text) {
  return text.split(/\n|;/).reduce((result, line) => {
    const trimmed = line.trim();
    if (!trimmed) return result;
    const separator = trimmed.includes("=") ? "=" : trimmed.includes("：") ? "：" : ":";
    const [key, ...rest] = trimmed.split(separator);
    if (key && rest.length) result[key.trim()] = rest.join(separator).trim();
    return result;
  }, {});
}

function attributesText(attributes) {
  return Object.entries(attributes || {}).map(([key, value]) => `${key}: ${value}`).join("\n");
}

function statusBadge(status) {
  const labels = {
    normal: "normal",
    stop_purchase: "stop_purchase",
    stop_use: "stop_use"
  };
  return `<span class="status-badge status-${esc(status)}">${labels[status] || esc(status)}</span>`;
}

function visibleAttributes(attributes = {}) {
  return Object.entries(attributes).filter(([key]) => !String(key).startsWith("_"));
}

function materialLifecycleHistory(material) {
  const history = material.lifecycle_history || material.attributes?._lifecycle_history || [];
  if (!history.length) return `<div class="empty">No lifecycle history yet</div>`;
  return `
    <table>
      <thead><tr><th>Time</th><th>Transition</th><th>Source</th><th>Reason</th><th>Application</th></tr></thead>
      <tbody>
        ${history.map((event) => `
          <tr>
            <td>${esc(event.created_at || "")}</td>
            <td>${esc(event.from_status)} -> ${esc(event.to_status)}</td>
            <td>${esc(event.source || "")}</td>
            <td>${esc(event.reason || "")}</td>
            <td>${esc(event.application_no || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderMaterials() {
  await loadMaterialContext();
  const search = document.getElementById("materialSearch")?.value || "";
  const status = document.getElementById("materialStatusFilter")?.value || "";
  const query = new URLSearchParams({ search, status });
  const materials = await request(`/materials?${query}`);
  const canCreate = can("button.material_archives.create");
  app.innerHTML = `
    <h2>Material Management</h2>
    <div class="grid material-grid">
      ${canCreate ? `<section class="panel">
        <h3 id="materialFormTitle">Create material</h3>
        ${productSelect()}
        ${materialLibrarySelect()}
        ${categorySelect()}
        ${brandSelect()}
        <label>Name<input id="materialName" placeholder="Sprint 4 A4 彩色打印机整机" /></label>
        <label>Unit<input id="materialUnit" placeholder="台" /></label>
        <label>Description<textarea id="materialDescription" placeholder="采购规格、用途或补充说明"></textarea></label>
        <label>Attributes<textarea id="materialAttributes" placeholder="打印速度: 30页/分钟&#10;颜色模式: 彩色"></textarea></label>
        <label><span><input id="materialEnabled" type="checkbox" checked /> Enabled</span></label>
        <button id="saveMaterial">Create Material</button>
        <button id="resetMaterial" class="secondary">Reset</button>
        <div id="materialStatus" class="status muted"></div>
      </section>` : `<section class="panel"><h3>Material actions</h3><div class="empty">Create permission is not granted.</div><div id="materialStatus" class="status muted"></div></section>`}
      <section>
        <div class="toolbar">
          <input id="materialSearch" value="${esc(search)}" placeholder="Search materials" />
          <select id="materialStatusFilter" aria-label="Material status filter">
            <option value="" ${status === "" ? "selected" : ""}>All statuses</option>
            <option value="normal" ${status === "normal" ? "selected" : ""}>normal</option>
            <option value="stop_purchase" ${status === "stop_purchase" ? "selected" : ""}>stop_purchase</option>
            <option value="stop_use" ${status === "stop_use" ? "selected" : ""}>stop_use</option>
          </select>
          <button id="searchMaterial" class="secondary">Search</button>
          <button id="clearMaterialSearch" class="secondary">Clear</button>
        </div>
        <div class="panel">
          ${materialTable(materials)}
          <div id="materialDetail" class="card detail-card"></div>
        </div>
      </section>
    </div>
  `;
  if (canCreate) {
    bindProductSelect(() => {});
    document.getElementById("saveMaterial").addEventListener("click", saveMaterial);
    document.getElementById("resetMaterial").addEventListener("click", resetMaterialForm);
  }
  document.getElementById("searchMaterial").addEventListener("click", renderMaterials);
  document.getElementById("materialStatusFilter").addEventListener("change", renderMaterials);
  document.getElementById("clearMaterialSearch").addEventListener("click", () => {
    document.getElementById("materialSearch").value = "";
    document.getElementById("materialStatusFilter").value = "";
    renderMaterials();
  });
  document.querySelectorAll("[data-detail-material]").forEach((button) => button.addEventListener("click", () => showMaterialDetail(button.dataset.detailMaterial)));
  document.querySelectorAll("[data-edit-material]").forEach((button) => button.addEventListener("click", () => editMaterial(button.dataset.editMaterial)));
  document.querySelectorAll("[data-delete-material]").forEach((button) => button.addEventListener("click", () => deleteMaterial(button.dataset.deleteMaterial)));
  document.querySelectorAll("[data-apply-stop-purchase]").forEach((button) => button.addEventListener("click", () => {
    window.location.href = `/workflows/stop-purchase?material_id=${button.dataset.applyStopPurchase}`;
  }));
  document.querySelectorAll("[data-apply-stop-use]").forEach((button) => button.addEventListener("click", () => {
    window.location.href = `/workflows/stop-use?material_id=${button.dataset.applyStopUse}`;
  }));
  document.querySelectorAll("[data-manual-stop-purchase]").forEach((button) => button.addEventListener("click", () => manualStopPurchase(button.dataset.manualStopPurchase)));
  window.currentMaterials = materials;
}

function materialTable(materials) {
  if (!materials.length) return `<div class="empty">No materials found</div>`;
  return `
    <table>
      <thead><tr><th>Material</th><th>Code</th><th>Binding</th><th>Brand</th><th>Status</th><th>Attributes</th><th>Actions</th></tr></thead>
      <tbody>
        ${materials.map((material) => `
          <tr>
            <td>${esc(material.name)}<div class="muted">${esc(material.description)}</div></td>
            <td>${esc(material.code)}</td>
            <td>${esc(material.material_library)}<div class="muted">${esc(material.category)} / ${esc(material.product_name)}</div></td>
            <td>${esc(material.brand || "No brand")}</td>
            <td>${statusBadge(material.status)}</td>
            <td>${visibleAttributes(material.attributes || {}).map(([key, value]) => `<span class="pill">${esc(key)}: ${esc(value)}</span>`).join("")}</td>
            <td class="actions">
              <button class="secondary" data-detail-material="${material.id}">Detail</button>
              ${can("button.material_archives.edit") ? `<button class="secondary" data-edit-material="${material.id}">Edit</button>` : ""}
              ${transitionButtons(material)}
              ${can("button.material_archives.delete") ? `<button class="danger" data-delete-material="${material.id}">Delete</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function transitionButtons(material) {
  if (!can("button.material_archives.approval")) return "";
  if (material.status === "normal") {
    return `
      <button class="secondary" data-apply-stop-purchase="${material.id}">Stop Purchase Apply</button>
      <button class="secondary" data-manual-stop-purchase="${material.id}">Admin Stop Purchase</button>
      <button class="secondary" disabled title="stop_use requires stop_purchase first">Stop Use</button>
    `;
  }
  if (material.status === "stop_purchase") {
    return `<button class="secondary" data-apply-stop-use="${material.id}">Stop Use Apply</button><button class="secondary" disabled title="Status is non-reversible">Return Normal</button>`;
  }
  return `<button class="secondary" disabled title="stop_use is final and non-reversible">Final</button><button class="secondary" disabled title="Status is non-reversible">Return Normal</button>`;
}

async function saveMaterial() {
  const payload = {
    product_name_id: Number(document.getElementById("productSelect").value),
    material_library_id: Number(document.getElementById("materialLibrarySelect").value),
    category_id: Number(document.getElementById("categorySelect").value),
    brand_id: document.getElementById("materialBrand").value ? Number(document.getElementById("materialBrand").value) : null,
    name: document.getElementById("materialName").value.trim(),
    unit: document.getElementById("materialUnit").value.trim(),
    description: document.getElementById("materialDescription").value,
    attributes: parseAttributes(document.getElementById("materialAttributes").value),
    enabled: document.getElementById("materialEnabled").checked
  };
  if (editingMaterialId) {
    await request(`/materials/${editingMaterialId}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await request("/materials", { method: "POST", body: JSON.stringify(payload) });
  }
  editingMaterialId = null;
  document.getElementById("materialStatus").textContent = "Material saved";
  renderMaterials();
}

function editMaterial(id) {
  const material = (window.currentMaterials || []).find((item) => String(item.id) === String(id));
  if (!material) return;
  editingMaterialId = material.id;
  document.getElementById("materialFormTitle").textContent = `Edit ${material.name}`;
  document.getElementById("saveMaterial").textContent = "Update Material";
  document.getElementById("productSelect").value = material.product_name_id;
  document.getElementById("materialLibrarySelect").value = material.material_library_id;
  document.getElementById("categorySelect").value = material.category_id;
  document.getElementById("materialBrand").value = material.brand_id || "";
  document.getElementById("materialName").value = material.name;
  document.getElementById("materialUnit").value = material.unit;
  document.getElementById("materialDescription").value = material.description;
  document.getElementById("materialAttributes").value = attributesText(material.attributes);
  document.getElementById("materialEnabled").checked = material.enabled;
  showMaterialDetail(id);
}

function resetMaterialForm() {
  editingMaterialId = null;
  document.getElementById("materialFormTitle").textContent = "Create material";
  document.getElementById("saveMaterial").textContent = "Create Material";
  ["materialName", "materialUnit", "materialDescription", "materialAttributes"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("materialBrand").value = "";
  document.getElementById("materialEnabled").checked = true;
}

async function showMaterialDetail(id) {
  let material = (window.currentMaterials || []).find((item) => String(item.id) === String(id));
  material = await request(`/materials/${id}`).catch(() => material);
  if (!material) return;
  const applications = await request(`/workflows/applications?material_id=${id}`).catch(() => []);
  document.getElementById("materialDetail").innerHTML = `
    <h3>Material detail: ${esc(material.name)}</h3>
    <p><strong>Code:</strong> ${esc(material.code)} ${statusBadge(material.status)}</p>
    <p><strong>Binding:</strong> ${esc(material.material_library)} / ${esc(material.category)} / ${esc(material.product_name)}</p>
    <p><strong>Description:</strong> ${esc(material.description)}</p>
    <div class="toolbar">${transitionButtons(material)}</div>
    <h3>Lifecycle history</h3>
    ${materialLifecycleHistory(material)}
    <h3>Linked stop applications</h3>
    ${applications.length ? workflowTable(applications, false) : `<div class="empty">No linked stop applications</div>`}
    <pre>${esc(JSON.stringify(Object.fromEntries(visibleAttributes(material.attributes || {})), null, 2))}</pre>
  `;
  document.querySelectorAll("#materialDetail [data-apply-stop-purchase]").forEach((button) => button.addEventListener("click", () => {
    window.location.href = `/workflows/stop-purchase?material_id=${button.dataset.applyStopPurchase}`;
  }));
  document.querySelectorAll("#materialDetail [data-apply-stop-use]").forEach((button) => button.addEventListener("click", () => {
    window.location.href = `/workflows/stop-use?material_id=${button.dataset.applyStopUse}`;
  }));
  document.querySelectorAll("#materialDetail [data-manual-stop-purchase]").forEach((button) => button.addEventListener("click", () => manualStopPurchase(button.dataset.manualStopPurchase)));
  bindWorkflowActions("materialDetail", () => showMaterialDetail(id));
}

async function manualStopPurchase(id) {
  const reason = window.prompt("Exemption reason for admin manual stop purchase") || "";
  if (!reason.trim()) {
    document.getElementById("materialStatus").textContent = "Exemption reason is required";
    return;
  }
  try {
    await request(`/materials/${id}/stop-purchase`, { method: "PATCH", body: JSON.stringify({ reason, actor: "super_admin" }) });
    document.getElementById("materialStatus").textContent = "Material moved to stop_purchase by admin manual override";
    renderMaterials();
  } catch (error) {
    document.getElementById("materialStatus").textContent = error.message;
  }
}

async function deleteMaterial(id) {
  await request(`/materials/${id}`, { method: "DELETE" });
  renderMaterials();
}

async function renderMaterialGovernance() {
  await loadMaterialContext();
  app.innerHTML = `
    <h2>Material AI Governance</h2>
    <div class="grid">
      <section class="panel">
        ${productSelect()}
        ${materialLibrarySelect()}
        ${categorySelect()}
        <label>CSV rows
          <textarea id="materialGovernanceRows">name,unit,brand,description,打印速度,颜色模式
Sprint 4 导入彩色打印机,台,治理品牌,AI治理有效行,30页/分钟,彩色
,台,治理品牌,缺少名称的无效行,20页/分钟,黑白</textarea>
        </label>
        <label>Upload Excel or CSV<input id="materialGovernanceFile" type="file" accept=".csv,.xlsx" /></label>
        <button id="previewMaterialGovernance">Run AI material governance preview</button>
        <button id="importMaterialGovernance" class="secondary" disabled>Confirm selected materials</button>
        <div id="materialGovernanceStatus" class="status muted"></div>
      </section>
      <section class="panel" id="materialGovernancePreview"><div class="empty">Preview will appear here</div></section>
    </div>
  `;
  bindProductSelect(() => {});
  materialPreviewItems = [];
  materialGovernanceFile = null;
  document.getElementById("materialGovernanceFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) {
      materialGovernanceFile = null;
      return;
    }
    materialGovernanceFile = { file_name: file.name, file_content: await fileDataUrl(file) };
    if (file.name.toLowerCase().endsWith(".csv")) {
      document.getElementById("materialGovernanceRows").value = await file.text();
    }
  });
  document.getElementById("previewMaterialGovernance").addEventListener("click", previewMaterialGovernance);
  document.getElementById("importMaterialGovernance").addEventListener("click", importMaterialGovernance);
}

function fileDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function previewMaterialGovernance() {
  const payload = {
    product_name_id: Number(document.getElementById("productSelect").value),
    material_library_id: Number(document.getElementById("materialLibrarySelect").value),
    category_id: Number(document.getElementById("categorySelect").value),
    rows: document.getElementById("materialGovernanceRows").value,
    ...(materialGovernanceFile || {})
  };
  const result = await request("/materials/governance/preview", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  materialPreviewItems = result.items;
  document.getElementById("materialGovernancePreview").innerHTML = materialGovernanceTable(result);
  document.getElementById("importMaterialGovernance").disabled = !materialPreviewItems.some((item) => item.selectable);
  document.querySelectorAll("[data-preview-index]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      materialPreviewItems[Number(checkbox.dataset.previewIndex)].selected = checkbox.checked;
    });
  });
}

function materialGovernanceTable(result) {
  return `
    <div class="toolbar"><span class="pill">capability: ${esc(result.capability)}</span><span class="muted">${result.count} rows analyzed</span></div>
    <table>
      <thead><tr><th>Select</th><th>Row</th><th>Material</th><th>Binding</th><th>Attributes</th><th>Validation</th><th>Confidence</th></tr></thead>
      <tbody>
        ${result.items.map((item, index) => `
          <tr>
            <td><input type="checkbox" data-preview-index="${index}" ${item.selectable ? "checked" : "disabled"} /></td>
            <td>${item.source_row}</td>
            <td>${esc(item.name || "(missing name)")}<div class="muted">${esc(item.code)}</div></td>
            <td>${esc(item.material_library)}<div class="muted">${esc(item.category)} / ${esc(item.product_name)}</div></td>
            <td>${Object.entries(item.attributes || {}).map(([key, value]) => `<span class="pill">${esc(key)}: ${esc(value)}</span>`).join("")}</td>
            <td>${item.validation_status === "valid" ? `<span class="valid">valid</span>` : `<span class="invalid">${esc(item.errors.join("; "))}</span>`}</td>
            <td>${item.confidence}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function importMaterialGovernance() {
  const selected = materialPreviewItems.filter((item) => item.selectable && item.selected !== false);
  const imported = await request("/materials/governance/import", {
    method: "POST",
    body: JSON.stringify({
      product_name_id: Number(document.getElementById("productSelect").value),
      material_library_id: Number(document.getElementById("materialLibrarySelect").value),
      category_id: Number(document.getElementById("categorySelect").value),
      items: selected
    })
  });
  document.getElementById("materialGovernanceStatus").textContent = `${imported.length} imported material${imported.length === 1 ? "" : "s"}`;
}

async function renderProductNames() {
  await loadProducts();
  app.innerHTML = `
    <h2>Product Names</h2>
    <div class="panel">
      <table>
        <thead><tr><th>Name</th><th>Unit</th><th>Category Binding</th></tr></thead>
        <tbody>
          ${products.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td>${esc(p.category)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAttributes() {
  await loadProducts();
  const search = document.getElementById("attributeSearch")?.value || "";
  const query = new URLSearchParams({ product_name_id: selectedProductId || "", search });
  const attributes = await request(`/attributes?${query}`);
  const canCreate = can("button.attribute_management.create");
  app.innerHTML = `
    <h2>Attribute Management</h2>
    <div class="grid">
      ${canCreate ? `<section class="panel">
        <h3 id="attributeFormTitle">Create attribute</h3>
        ${productSelect()}
        <label>Name<input id="attrName" placeholder="打印速度" /></label>
        <label>Type
          <select id="attrType">
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="enum">enum</option>
            <option value="date">date</option>
          </select>
        </label>
        <label>Unit<input id="attrUnit" placeholder="页/分钟" /></label>
        <label>Default value<input id="attrDefault" placeholder="彩色" /></label>
        <label>Options<input id="attrOptions" placeholder="黑白, 彩色" /></label>
        <label>Description<textarea id="attrDescription"></textarea></label>
        <label><span><input id="attrRequired" type="checkbox" /> Required</span></label>
        <button id="saveAttr">Create Attribute</button>
        <button id="resetAttr" class="secondary">Reset</button>
        <div id="attrStatus" class="status muted"></div>
      </section>` : `<section class="panel"><h3>Attribute actions</h3><div class="empty">Create permission is not granted.</div><div id="attrStatus" class="status muted"></div></section>`}
      <section>
        <div class="toolbar">
          <input id="attributeSearch" value="${esc(search)}" placeholder="Search attributes" />
          <button id="searchAttr" class="secondary">Search</button>
          <button id="clearSearch" class="secondary">Clear</button>
        </div>
        <div class="panel">
          ${attributeTable(attributes)}
          <div id="attributeDetail" class="card"></div>
        </div>
      </section>
    </div>
  `;
  if (canCreate) {
    bindProductSelect(renderAttributes);
    document.getElementById("saveAttr").addEventListener("click", createAttribute);
    document.getElementById("resetAttr").addEventListener("click", resetAttributeForm);
  }
  document.getElementById("searchAttr").addEventListener("click", renderAttributes);
  document.getElementById("clearSearch").addEventListener("click", () => {
    document.getElementById("attributeSearch").value = "";
    renderAttributes();
  });
  document.querySelectorAll("[data-edit-attr]").forEach((button) => button.addEventListener("click", () => editAttribute(button.dataset.editAttr)));
  document.querySelectorAll("[data-detail-attr]").forEach((button) => button.addEventListener("click", () => showAttributeDetail(button.dataset.detailAttr)));
  document.querySelectorAll("[data-delete-attr]").forEach((button) => button.addEventListener("click", () => deleteAttribute(button.dataset.deleteAttr)));
  window.currentAttributes = attributes;
}

function attributeTable(attributes) {
  if (!attributes.length) {
    return `<div class="empty">No attributes found</div>`;
  }
  return `
    <table>
      <thead><tr><th>Name</th><th>Code</th><th>Binding</th><th>Type</th><th>Required</th><th>Default</th><th>Options</th><th>Source</th><th>Version</th><th>Actions</th></tr></thead>
      <tbody>
        ${attributes.map((item) => `
          <tr>
            <td>${esc(item.name)}<div class="muted">${esc(item.description)}</div></td>
            <td>${esc(item.code)}</td>
            <td>${esc(item.product_name)}</td>
            <td>${esc(item.data_type)} ${item.unit ? `<span class="pill">${esc(item.unit)}</span>` : ""}</td>
            <td>${item.required ? "enabled" : "disabled"}</td>
            <td>${esc(item.default_value)}</td>
            <td>${item.options.map((option) => `<span class="pill">${esc(option)}</span>`).join("")}</td>
            <td>${esc(item.source)}</td>
            <td>v${item.version}</td>
            <td>
              <button class="secondary" data-detail-attr="${item.id}">Detail</button>
              ${can("button.attribute_management.edit") ? `<button class="secondary" data-edit-attr="${item.id}">Edit</button>` : ""}
              ${can("button.attribute_management.delete") ? `<button class="danger" data-delete-attr="${item.id}">Delete</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function createAttribute() {
  const payload = {
    product_name_id: selectedProductId,
    name: document.getElementById("attrName").value,
    data_type: document.getElementById("attrType").value,
    unit: document.getElementById("attrUnit").value,
    default_value: document.getElementById("attrDefault").value,
    options: document.getElementById("attrOptions").value,
    description: document.getElementById("attrDescription").value,
    required: document.getElementById("attrRequired").checked
  };
  if (editingAttributeId) {
    await request(`/attributes/${editingAttributeId}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await request("/attributes", { method: "POST", body: JSON.stringify(payload) });
  }
  editingAttributeId = null;
  document.getElementById("attrStatus").textContent = "Attribute saved";
  renderAttributes();
}

function editAttribute(id) {
  const item = (window.currentAttributes || []).find((attribute) => String(attribute.id) === String(id));
  if (!item) return;
  editingAttributeId = item.id;
  document.getElementById("attributeFormTitle").textContent = `Edit ${item.name}`;
  document.getElementById("saveAttr").textContent = "Update Attribute";
  document.getElementById("attrName").value = item.name;
  document.getElementById("attrType").value = item.data_type;
  document.getElementById("attrUnit").value = item.unit;
  document.getElementById("attrDefault").value = item.default_value;
  document.getElementById("attrOptions").value = item.options.join(", ");
  document.getElementById("attrDescription").value = item.description;
  document.getElementById("attrRequired").checked = item.required;
  showAttributeDetail(id);
}

function resetAttributeForm() {
  editingAttributeId = null;
  document.getElementById("attributeFormTitle").textContent = "Create attribute";
  document.getElementById("saveAttr").textContent = "Create Attribute";
  ["attrName", "attrUnit", "attrDefault", "attrOptions", "attrDescription"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("attrType").value = "text";
  document.getElementById("attrRequired").checked = false;
}

async function showAttributeDetail(id) {
  const item = (window.currentAttributes || []).find((attribute) => String(attribute.id) === String(id));
  if (!item) return;
  const changes = await request(`/attributes/${id}/changes`);
  document.getElementById("attributeDetail").innerHTML = `
    <h3>Attribute detail: ${esc(item.name)}</h3>
    <p><strong>Current version:</strong> v${item.version}</p>
    <p><strong>Recommendation or import source:</strong> ${esc(item.source)}</p>
    <p><strong>Product-name binding:</strong> ${esc(item.product_name)}</p>
    <table>
      <thead><tr><th>Version</th><th>Operator</th><th>Timestamp</th><th>Changed fields</th><th>Before values</th><th>After values</th></tr></thead>
      <tbody>${changes.map((change) => `
        <tr><td>v${change.version}</td><td>${esc(change.operator)}</td><td>${esc(change.created_at)}</td><td>${change.changed_fields.map((field) => `<span class="pill">${esc(field)}</span>`).join("")}</td><td><pre>${esc(JSON.stringify(change.before_values, null, 2))}</pre></td><td><pre>${esc(JSON.stringify(change.after_values, null, 2))}</pre></td></tr>
      `).join("")}</tbody>
    </table>
  `;
}

async function deleteAttribute(id) {
  await request(`/attributes/${id}`, { method: "DELETE" });
  renderAttributes();
}

async function renderGovernance() {
  await loadProducts();
  app.innerHTML = `
    <h2>Attribute AI Governance</h2>
    <div class="grid">
      <section class="panel">
        ${productSelect()}
        <label>Pasted rows
          <textarea id="governanceRows">速度/每分钟页数/数值
打印颜色/黑白彩色/枚举
纸张尺寸/A4 A5/枚举</textarea>
        </label>
        <label>Upload rows<input id="governanceFile" type="file" accept=".txt,.csv" /></label>
        <button id="previewGovernance">Run AI governance analysis</button>
        <button id="importGovernance" class="secondary" disabled>Confirm preview import</button>
        <div id="governanceStatus" class="status muted"></div>
      </section>
      <section class="panel" id="governancePreview"><div class="empty">Preview will appear here</div></section>
    </div>
  `;
  bindProductSelect(renderGovernance);
  let previewItems = [];
  document.getElementById("governanceFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file) document.getElementById("governanceRows").value = await file.text();
  });
  document.getElementById("previewGovernance").addEventListener("click", async () => {
    const result = await request("/attributes/governance/preview", {
      method: "POST",
      body: JSON.stringify({ product_name_id: selectedProductId, rows: document.getElementById("governanceRows").value })
    });
    previewItems = result.items;
    document.getElementById("governancePreview").innerHTML = governanceTable(previewItems);
    document.getElementById("importGovernance").disabled = false;
  });
  document.getElementById("importGovernance").addEventListener("click", async () => {
    await request("/attributes/governance/import", {
      method: "POST",
      body: JSON.stringify({ product_name_id: selectedProductId, items: previewItems })
    });
    document.getElementById("governanceStatus").textContent = "Preview imported";
  });
}

function governanceTable(items) {
  return `
    <table>
      <thead><tr><th>Source row</th><th>Standardized name</th><th>Code</th><th>Type</th><th>Options</th><th>Confidence</th></tr></thead>
      <tbody>
        ${items.map((item) => `
          <tr><td>${item.source_row}</td><td>${esc(item.name)}</td><td>${esc(item.code)}</td><td>${esc(item.data_type)}</td><td>${item.options.map((o) => `<span class="pill">${esc(o)}</span>`).join("")}</td><td>${item.confidence}</td></tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderRecommend() {
  await loadProducts();
  app.innerHTML = `
    <h2>AI Attribute Recommendation</h2>
    <div class="grid">
      <section class="panel">
        ${productSelect()}
        <button id="runRecommend">Run attribute recommendation</button>
        <div id="recommendStatus" class="status muted"></div>
      </section>
      <section id="recommendResults" class="panel"><div class="empty">Recommendations will appear here</div></section>
    </div>
  `;
  bindProductSelect(renderRecommend);
  document.getElementById("runRecommend").addEventListener("click", async () => {
    const result = await request("/ai/attribute-recommend", {
      method: "POST",
      body: JSON.stringify({ product_name_id: selectedProductId })
    });
    document.getElementById("recommendResults").innerHTML = recommendationTable(result);
    document.querySelectorAll("[data-accept-rec]").forEach((button) => {
      button.addEventListener("click", () => acceptRecommendation(JSON.parse(button.dataset.acceptRec)));
    });
  });
}

function recommendationTable(result) {
  return `
    <div class="toolbar"><span class="pill">capability: ${esc(result.capability)}</span></div>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Default</th><th>Confidence</th><th>Source</th><th>Action</th></tr></thead>
      <tbody>
        ${result.recommendations.map((item) => `
          <tr>
            <td>${esc(item.name)}</td><td>${esc(item.data_type)}</td><td>${esc(item.default_value)}</td><td>${item.confidence}</td><td>${esc(item.source)}</td>
            <td><button data-accept-rec="${esc(JSON.stringify(item))}">Accept</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function acceptRecommendation(item) {
  await request("/attributes", {
    method: "POST",
    body: JSON.stringify({ ...item, product_name_id: selectedProductId, source: item.source })
  });
  document.getElementById("recommendStatus").textContent = `${item.name} accepted`;
}

async function renderChanges() {
  const changes = await request("/attributes/changes");
  app.innerHTML = `
    <h2>Attribute Change Logs</h2>
    <div class="panel">
      <table>
        <thead><tr><th>Attribute</th><th>Code</th><th>Version</th><th>Operator</th><th>Timestamp</th><th>Changed fields</th><th>Before values</th><th>After values</th></tr></thead>
        <tbody>
          ${changes.map((change) => `
            <tr>
              <td>${esc(change.attribute_name)}</td><td>${esc(change.attribute_code)}</td><td>v${change.version}</td><td>${esc(change.operator)}</td><td>${esc(change.created_at)}</td>
              <td>${change.changed_fields.map((field) => `<span class="pill">${esc(field)}</span>`).join("")}</td>
              <td><pre>${esc(JSON.stringify(change.before_values, null, 2))}</pre></td>
              <td><pre>${esc(JSON.stringify(change.after_values, null, 2))}</pre></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderBrands() {
  const search = document.getElementById("brandSearch")?.value || "";
  const brands = await request(`/brands?${new URLSearchParams({ search })}`);
  app.innerHTML = `
    <h2>Brand Management</h2>
    <div class="grid">
      <section class="panel">
        <h3 id="brandFormTitle">Create brand</h3>
        <label>Name<input id="brandName" placeholder="Sprint 3 联想" /></label>
        <label>Description<input id="brandDescription" placeholder="办公设备品牌" /></label>
        <label>Logo upload<input id="brandLogo" type="file" accept="image/*" /></label>
        <label><span><input id="brandEnabled" type="checkbox" checked /> Enabled</span></label>
        <button id="saveBrand">Create Brand</button>
        <button id="resetBrand" class="secondary">Reset</button>
        <div id="brandStatus" class="status muted"></div>
      </section>
      <section>
        <div class="toolbar">
          <input id="brandSearch" value="${esc(search)}" placeholder="Search brands" />
          <button id="searchBrand" class="secondary">Search</button>
          <button id="clearBrandSearch" class="secondary">Clear</button>
        </div>
        <div class="panel">${brandTable(brands)}</div>
      </section>
    </div>
  `;
  document.getElementById("saveBrand").addEventListener("click", createBrand);
  document.getElementById("resetBrand").addEventListener("click", resetBrandForm);
  document.getElementById("searchBrand").addEventListener("click", renderBrands);
  document.getElementById("clearBrandSearch").addEventListener("click", () => {
    document.getElementById("brandSearch").value = "";
    renderBrands();
  });
  document.querySelectorAll("[data-edit-brand]").forEach((button) => button.addEventListener("click", () => editBrand(button.dataset.editBrand)));
  document.querySelectorAll("[data-delete-brand]").forEach((button) => button.addEventListener("click", () => deleteBrand(button.dataset.deleteBrand)));
  window.currentBrands = brands;
}

function brandTable(brands) {
  if (!brands.length) return `<div class="empty">No brands found</div>`;
  return `
    <table>
      <thead><tr><th>Logo</th><th>Name</th><th>Code</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${brands.map((brand) => `
          <tr>
            <td>${brand.logo.data_url ? `<img class="thumb" src="${esc(brand.logo.data_url)}" alt="${esc(brand.name)} logo thumbnail" />` : "No logo"}</td>
            <td>${esc(brand.name)}</td><td>${esc(brand.code)}</td><td>${esc(brand.description)}</td><td>${brand.enabled ? "enabled" : "disabled"}</td>
            <td><button class="secondary" data-edit-brand="${brand.id}">Edit</button> <button class="danger" data-delete-brand="${brand.id}">Delete</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function logoPayload(input) {
  const file = input.files[0];
  if (!file) return { filename: "", content_type: "", data_url: "" };
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, content_type: file.type, data_url: reader.result });
    reader.readAsDataURL(file);
  });
}

async function createBrand() {
  const logo = await logoPayload(document.getElementById("brandLogo"));
  const payload = {
    name: document.getElementById("brandName").value,
    description: document.getElementById("brandDescription").value,
    enabled: document.getElementById("brandEnabled").checked
  };
  if (logo.data_url || !editingBrandId) {
    payload.logo = logo;
  }
  if (editingBrandId) {
    await request(`/brands/${editingBrandId}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await request("/brands", { method: "POST", body: JSON.stringify(payload) });
  }
  editingBrandId = null;
  document.getElementById("brandStatus").textContent = "Brand saved";
  renderBrands();
}

function editBrand(id) {
  const brand = (window.currentBrands || []).find((item) => String(item.id) === String(id));
  if (!brand) return;
  editingBrandId = brand.id;
  document.getElementById("brandFormTitle").textContent = `Edit ${brand.name}`;
  document.getElementById("saveBrand").textContent = "Update Brand";
  document.getElementById("brandName").value = brand.name;
  document.getElementById("brandDescription").value = brand.description;
  document.getElementById("brandEnabled").checked = brand.enabled;
  document.getElementById("brandStatus").textContent = `Editing immutable code ${brand.code}`;
}

function resetBrandForm() {
  editingBrandId = null;
  document.getElementById("brandFormTitle").textContent = "Create brand";
  document.getElementById("saveBrand").textContent = "Create Brand";
  document.getElementById("brandName").value = "";
  document.getElementById("brandDescription").value = "";
  document.getElementById("brandLogo").value = "";
  document.getElementById("brandEnabled").checked = true;
}

async function deleteBrand(id) {
  await request(`/brands/${id}`, { method: "DELETE" });
  renderBrands();
}

function workflowStatusBadge(status) {
  return `<span class="status-badge status-workflow-${esc(status)}">${esc(status)}</span>`;
}

function approvalRoutePreview(config) {
  const simple = config?.approval_mode === "simple";
  return `<div class="approval-preview">${simple ? "Approval route preview: single approval step (approver)" : "Approval route preview: department approval -> asset management approval"}</div>`;
}

function workflowHistory(history) {
  if (!history?.length) return `<div class="empty">No approval history</div>`;
  return `
    <table>
      <thead><tr><th>Time</th><th>Actor</th><th>Node</th><th>Action</th><th>Status</th><th>Comment</th></tr></thead>
      <tbody>
        ${history.map((event) => `
          <tr>
            <td>${esc(event.created_at)}</td>
            <td>${esc(event.actor)}</td>
            <td>${esc(event.node)}</td>
            <td>${esc(event.action)}</td>
            <td>${esc(event.from_status)} -> ${esc(event.to_status)}</td>
            <td>${esc(event.comment)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function workflowDetail(application) {
  const data = application.data || {};
  return `
    <section class="panel">
      <div class="toolbar">
        <h3>${esc(application.application_no)}</h3>
        ${workflowStatusBadge(application.status)}
        <span class="pill">current node: ${esc(application.current_node)}</span>
      </div>
      <p><strong>Applicant:</strong> ${esc(application.applicant)}</p>
      <p><strong>Business reason:</strong> ${esc(application.business_reason)}</p>
      ${application.rejection_reason ? `<p><strong>Rejection reason:</strong> ${esc(application.rejection_reason)}</p>` : ""}
      <div class="workflow-evidence">
        ${data.reference_mall_link ? `<a href="${esc(data.reference_mall_link)}" target="_blank" rel="noreferrer">${esc(data.reference_mall_link)}</a>` : ""}
        ${(data.reference_images || []).map((image) => `<img class="thumb large-thumb" src="${esc(image.data_url)}" alt="${esc(image.filename || "reference image")}" />`).join("")}
      </div>
      <pre>${esc(JSON.stringify(data, null, 2))}</pre>
      <h3>Approval history</h3>
      ${workflowHistory(application.approval_history)}
    </section>
  `;
}

function reasonEditor(type, reasons) {
  return `
    <section class="panel">
      <h3>${type === "stop_purchase" ? "Stop purchase reasons" : "Stop use reasons"}</h3>
      <div id="${type}Reasons" class="reason-list">
        ${reasons.map((reason, index) => `
          <div class="reason-row" data-reason-row="${type}">
            <input data-reason-name="${type}" value="${esc(reason.name || reason)}" />
            <label class="inline-check"><span><input data-reason-enabled="${type}" type="checkbox" ${reason.enabled === false ? "" : "checked"} /> enabled</span></label>
            <button class="secondary" data-remove-reason="${type}" data-index="${index}">Remove</button>
          </div>
        `).join("")}
      </div>
      <div class="toolbar compact-toolbar">
        <input id="${type}NewReason" placeholder="Add reason option" />
        <button class="secondary" data-add-reason="${type}">Add</button>
      </div>
    </section>
  `;
}

function collectReasons(type) {
  const names = Array.from(document.querySelectorAll(`[data-reason-name="${type}"]`));
  const enabled = Array.from(document.querySelectorAll(`[data-reason-enabled="${type}"]`));
  return names
    .map((input, index) => ({ name: input.value.trim(), enabled: enabled[index]?.checked ?? true }))
    .filter((item) => item.name);
}

function bindReasonEditors(config) {
  document.querySelectorAll("[data-add-reason]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.addReason;
      const input = document.getElementById(`${type}NewReason`);
      const value = input.value.trim();
      if (!value) return;
      const list = document.getElementById(`${type}Reasons`);
      list.insertAdjacentHTML("beforeend", `
        <div class="reason-row" data-reason-row="${type}">
          <input data-reason-name="${type}" value="${esc(value)}" />
          <label class="inline-check"><span><input data-reason-enabled="${type}" type="checkbox" checked /> enabled</span></label>
          <button class="secondary" data-remove-reason="${type}">Remove</button>
        </div>
      `);
      input.value = "";
      bindRemoveReasonButtons();
    });
  });
  bindRemoveReasonButtons();
}

function bindRemoveReasonButtons() {
  document.querySelectorAll("[data-remove-reason]").forEach((button) => {
    button.onclick = () => button.closest(".reason-row")?.remove();
  });
}

async function renderSystemConfig() {
  const config = await loadSystemConfig(true);
  app.innerHTML = `
    <h2>System Configuration</h2>
    <div class="grid material-grid">
      <section class="panel">
        <h3>System identity</h3>
        <label>System name<input id="systemName" value="${esc(config.system_name)}" /></label>
        <label>System icon<input id="systemIconFile" type="file" accept="image/*" /></label>
        <input id="systemIconData" value="${esc(config.icon?.data_url || "")}" placeholder="Icon data URL or image URL" />
        <div class="thumb-row">${config.icon?.data_url ? `<img class="system-icon large-system-icon" src="${esc(config.icon.data_url)}" alt="Current system icon" />` : ""}</div>
        <h3>Approval behavior</h3>
        <label>Approval mode
          <select id="approvalMode">
            <option value="multi_node" ${config.approval_mode === "multi_node" ? "selected" : ""}>multi-node workflow</option>
            <option value="simple" ${config.approval_mode === "simple" ? "selected" : ""}>simple approval</option>
          </select>
        </label>
        <button id="saveSystemConfig">Save configuration</button>
        <div id="configStatus" class="status muted">Current mode: ${esc(config.approval_mode)}. Last update: ${esc(config.updated_at)}</div>
      </section>
      <div>
        ${reasonEditor("stop_purchase", config.stop_purchase_reasons || [])}
        ${reasonEditor("stop_use", config.stop_use_reasons || [])}
      </div>
    </div>
  `;
  bindReasonEditors(config);
  document.getElementById("systemIconFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById("systemIconData").value = await fileDataUrl(file);
  });
  document.getElementById("saveSystemConfig").addEventListener("click", async () => {
    const iconData = document.getElementById("systemIconData").value.trim();
    const saved = await request("/system/config", {
      method: "PUT",
      body: JSON.stringify({
        system_name: document.getElementById("systemName").value.trim(),
        icon: {
          filename: document.getElementById("systemIconFile").files[0]?.name || config.icon?.filename || "system-icon",
          content_type: document.getElementById("systemIconFile").files[0]?.type || config.icon?.content_type || "image/png",
          data_url: iconData
        },
        stop_purchase_reasons: collectReasons("stop_purchase"),
        stop_use_reasons: collectReasons("stop_use"),
        approval_mode: document.getElementById("approvalMode").value
      })
    });
    systemConfigCache = saved;
    applySystemIdentity(saved);
    document.getElementById("configStatus").textContent = `Saved ${saved.system_name}; approval mode: ${saved.approval_mode}`;
  });
}

function auditFiltersFromDom() {
  return {
    user: document.getElementById("auditUser")?.value.trim() || "",
    resource: document.getElementById("auditResource")?.value.trim() || "",
    action: document.getElementById("auditAction")?.value.trim() || "",
    source: document.getElementById("auditSource")?.value.trim() || "",
    start_time: document.getElementById("auditStart")?.value || "",
    end_time: document.getElementById("auditEnd")?.value || ""
  };
}

function auditQueryString(filters, page = 1) {
  const params = new URLSearchParams({ page: String(page), page_size: "10" });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function auditExportQueryString(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function auditValueSummary(value) {
  const text = JSON.stringify(value || {}, null, 0);
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function auditTable(result) {
  return `
    <section class="panel">
      <div class="toolbar">
        <span class="pill">total ${esc(result.total)}</span>
        <span class="pill">page ${esc(result.page)} / ${esc(result.pages)}</span>
      </div>
      <table>
        <thead><tr><th>Timestamp</th><th>User</th><th>Resource</th><th>Action</th><th>Source</th><th>Before</th><th>After</th><th>Detail</th></tr></thead>
        <tbody>
          ${result.items.map((item) => `
            <tr>
              <td>${esc(item.timestamp)}</td>
              <td>${esc(item.user)}</td>
              <td>${esc(item.resource)}</td>
              <td>${esc(item.action)}</td>
              <td>${esc(item.source)}</td>
              <td><code>${esc(auditValueSummary(item.before_value))}</code></td>
              <td><code>${esc(auditValueSummary(item.after_value))}</code></td>
              <td><button class="secondary" data-audit-detail="${item.id}">Diff</button></td>
            </tr>
          `).join("") || `<tr><td colspan="8"><div class="empty">No audit logs found</div></td></tr>`}
        </tbody>
      </table>
      <div class="toolbar">
        <button id="auditPrev" class="secondary" ${result.page <= 1 ? "disabled" : ""}>Previous</button>
        <button id="auditNext" class="secondary" ${result.page >= result.pages ? "disabled" : ""}>Next</button>
      </div>
    </section>
  `;
}

async function renderAuditLogs(page = 1) {
  const filters = auditFiltersFromDom();
  const result = await request(`/audit-logs?${auditQueryString(filters, page)}`);
  app.innerHTML = `
    <h2>Operational Audit Log</h2>
    <section class="panel">
      <div class="filter-grid">
        <label>User<input id="auditUser" value="${esc(filters.user)}" placeholder="super_admin" /></label>
        <label>Resource<input id="auditResource" value="${esc(filters.resource)}" placeholder="system_config" /></label>
        <label>Action<input id="auditAction" value="${esc(filters.action)}" placeholder="update" /></label>
        <label>Source
          <select id="auditSource">
            <option value="">Any</option>
            <option value="human" ${filters.source === "human" ? "selected" : ""}>human</option>
            <option value="AI" ${filters.source === "AI" ? "selected" : ""}>AI</option>
            <option value="system" ${filters.source === "system" ? "selected" : ""}>system</option>
          </select>
        </label>
        <label>Start<input id="auditStart" type="datetime-local" value="${esc(filters.start_time)}" /></label>
        <label>End<input id="auditEnd" type="datetime-local" value="${esc(filters.end_time)}" /></label>
      </div>
      <div class="toolbar">
        <button id="applyAuditFilters">Apply filters</button>
        <button id="clearAuditFilters" class="secondary">Clear</button>
        <button id="exportAuditLogs" class="secondary">Export Excel</button>
      </div>
      <div id="auditStatus" class="status muted"></div>
    </section>
    <div id="auditTable">${auditTable(result)}</div>
    <section id="auditDetail" class="panel detail-card"></section>
  `;
  document.getElementById("applyAuditFilters").addEventListener("click", () => renderAuditLogs(1));
  document.getElementById("clearAuditFilters").addEventListener("click", () => {
    ["auditUser", "auditResource", "auditAction", "auditSource", "auditStart", "auditEnd"].forEach((id) => {
      const item = document.getElementById(id);
      if (item) item.value = "";
    });
    renderAuditLogs(1);
  });
  document.getElementById("auditPrev").addEventListener("click", () => renderAuditLogs(result.page - 1));
  document.getElementById("auditNext").addEventListener("click", () => renderAuditLogs(result.page + 1));
  document.querySelectorAll("[data-audit-detail]").forEach((button) => {
    button.addEventListener("click", () => renderAuditDetail(button.dataset.auditDetail));
  });
  document.getElementById("exportAuditLogs").addEventListener("click", exportAuditLogs);
}

function diffRows(beforeValue, afterValue) {
  const keys = Array.from(new Set([...Object.keys(beforeValue || {}), ...Object.keys(afterValue || {})])).sort();
  return keys.map((key) => {
    const beforeText = JSON.stringify(beforeValue?.[key] ?? "", null, 2);
    const afterText = JSON.stringify(afterValue?.[key] ?? "", null, 2);
    const changed = beforeText !== afterText;
    return `
      <tr class="${changed ? "diff-changed" : ""}">
        <td>${esc(key)}</td>
        <td><pre>${esc(beforeText)}</pre></td>
        <td><pre>${esc(afterText)}</pre></td>
      </tr>
    `;
  }).join("");
}

async function renderAuditDetail(logId) {
  const item = await request(`/audit-logs/${logId}`);
  document.getElementById("auditDetail").innerHTML = `
    <h3>Audit diff #${esc(item.id)}</h3>
    <div class="toolbar">
      <span class="pill">${esc(item.resource)}</span>
      <span class="pill">${esc(item.action)}</span>
      <span class="pill">${esc(item.user)}</span>
      <span class="pill">${esc(item.source)}</span>
    </div>
    <table>
      <thead><tr><th>Field</th><th>Before value</th><th>After value</th></tr></thead>
      <tbody>${diffRows(item.before_value, item.after_value)}</tbody>
    </table>
  `;
}

async function exportAuditLogs() {
  const status = document.getElementById("auditStatus");
  try {
    const filters = auditFiltersFromDom();
    const query = auditExportQueryString(filters);
    const blob = await requestBlob(`/audit-logs/export${query ? `?${query}` : ""}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-logs-${Date.now()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    status.textContent = "Excel export downloaded";
  } catch (error) {
    status.textContent = error.message;
  }
}

function roleNames(user) {
  return (user.roles || []).length
    ? user.roles.map((role) => `<span class="pill">${esc(role.name)}</span>`).join("")
    : `<span class="muted">No roles</span>`;
}

function userControls(user) {
  if (user.account_ownership !== "local") {
    return `<button class="secondary" data-detail-user="${user.id}">Detail</button><button class="secondary" disabled title="HCM-owned users are read-only">Edit</button><button class="secondary" disabled title="HCM-owned users cannot be reset locally">Reset Password</button><button class="danger" disabled title="HCM-owned users cannot be deleted locally">Delete</button>`;
  }
  return `<button class="secondary" data-detail-user="${user.id}">Detail</button><button class="secondary" data-edit-user="${user.id}">Edit</button><button class="secondary" data-reset-user="${user.id}">Reset Password</button><button class="danger" data-delete-user="${user.id}">Delete</button>`;
}

function ownershipBadge(owner) {
  return `<span class="status-badge ${owner === "HCM" ? "status-workflow-pending_approval" : "status-normal"}">${esc(owner)}</span>`;
}

function userTable(users) {
  if (!users.length) return `<div class="empty">No users found</div>`;
  return `
    <table>
      <thead><tr><th>User</th><th>Ownership</th><th>Organization</th><th>Contact</th><th>Status</th><th>Roles</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map((user) => `
          <tr>
            <td>${esc(user.username)}<div class="muted">ID ${esc(user.id)} / ${esc(user.display_name)} ${user.hcm_id ? `/ ${esc(user.hcm_id)}` : ""}</div></td>
            <td>${ownershipBadge(user.account_ownership || user.account_owner)}</td>
            <td>${esc(user.unit)}<div class="muted">${esc(user.department)} / ${esc(user.team)}</div></td>
            <td>${esc(user.email)}</td>
            <td>${esc(user.status)}</td>
            <td>${roleNames(user)}</td>
            <td class="actions">${userControls(user)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderUsers() {
  const current = {
    search: document.getElementById("userSearch")?.value || "",
    unit: document.getElementById("userUnitFilter")?.value || "",
    department: document.getElementById("userDepartmentFilter")?.value || "",
    team: document.getElementById("userTeamFilter")?.value || ""
  };
  const users = await request(`/users?${new URLSearchParams(current)}`);
  const allUsers = await request("/users");
  const units = [...new Set(allUsers.map((user) => user.unit).filter(Boolean))];
  const departments = [...new Set(allUsers.map((user) => user.department).filter(Boolean))];
  const teams = [...new Set(allUsers.map((user) => user.team).filter(Boolean))];
  app.innerHTML = `
    <h2>User Management</h2>
    <div class="grid material-grid">
      <section class="panel">
        <h3 id="userFormTitle">Add local user</h3>
        <label>Username<input id="userUsername" placeholder="s8_local_user" /></label>
        <label>Display name<input id="userDisplayName" placeholder="Sprint 8 Local User" /></label>
        <label>Unit<input id="userUnit" placeholder="测试单位A" /></label>
        <label>Department<input id="userDepartment" placeholder="测试部门A" /></label>
        <label>Team<input id="userTeam" placeholder="测试班组A" /></label>
        <label>Email<input id="userEmail" placeholder="local.user@example.com" /></label>
        <label>Status
          <select id="userStatus"><option value="active">active</option><option value="disabled">disabled</option></select>
        </label>
        <button id="saveUser">Create Local User</button>
        <button id="resetUserForm" class="secondary">Reset</button>
        <div id="userStatusMessage" class="status muted"></div>
      </section>
      <section>
        <div class="toolbar">
          <input id="userSearch" value="${esc(current.search)}" placeholder="Search users" />
          <select id="userUnitFilter" aria-label="Unit filter"><option value="">All units</option>${units.map((value) => `<option value="${esc(value)}" ${current.unit === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>
          <select id="userDepartmentFilter" aria-label="Department filter"><option value="">All departments</option>${departments.map((value) => `<option value="${esc(value)}" ${current.department === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>
          <select id="userTeamFilter" aria-label="Team filter"><option value="">All teams</option>${teams.map((value) => `<option value="${esc(value)}" ${current.team === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>
          <button id="searchUsers" class="secondary">Search</button>
          <button id="clearUsers" class="secondary">Clear</button>
        </div>
        <div class="panel">
          ${userTable(users)}
          <div id="userDetail" class="card detail-card"></div>
        </div>
      </section>
    </div>
  `;
  document.getElementById("saveUser").addEventListener("click", saveUser);
  document.getElementById("resetUserForm").addEventListener("click", resetUserForm);
  document.getElementById("searchUsers").addEventListener("click", renderUsers);
  ["userUnitFilter", "userDepartmentFilter", "userTeamFilter"].forEach((id) => document.getElementById(id).addEventListener("change", renderUsers));
  document.getElementById("clearUsers").addEventListener("click", () => {
    ["userSearch", "userUnitFilter", "userDepartmentFilter", "userTeamFilter"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    renderUsers();
  });
  document.querySelectorAll("[data-detail-user]").forEach((button) => button.addEventListener("click", () => showUserDetail(button.dataset.detailUser)));
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", () => editUser(button.dataset.editUser)));
  document.querySelectorAll("[data-reset-user]").forEach((button) => button.addEventListener("click", () => resetPassword(button.dataset.resetUser)));
  document.querySelectorAll("[data-delete-user]").forEach((button) => button.addEventListener("click", () => deleteUser(button.dataset.deleteUser)));
  window.currentUsers = users;
}

function userPayload() {
  return {
    username: document.getElementById("userUsername").value.trim(),
    display_name: document.getElementById("userDisplayName").value.trim(),
    unit: document.getElementById("userUnit").value.trim(),
    department: document.getElementById("userDepartment").value.trim(),
    team: document.getElementById("userTeam").value.trim(),
    email: document.getElementById("userEmail").value.trim(),
    status: document.getElementById("userStatus").value
  };
}

async function saveUser() {
  const status = document.getElementById("userStatusMessage");
  try {
    const payload = userPayload();
    if (editingUserId) {
      delete payload.username;
      await request(`/users/${editingUserId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await request("/users", { method: "POST", body: JSON.stringify(payload) });
    }
    editingUserId = null;
    status.textContent = "Local user saved";
    renderUsers();
  } catch (error) {
    status.textContent = error.message;
  }
}

function editUser(id) {
  const user = (window.currentUsers || []).find((item) => String(item.id) === String(id));
  if (!user || user.account_ownership !== "local") return;
  editingUserId = user.id;
  document.getElementById("userFormTitle").textContent = `Edit local user ${user.username}`;
  document.getElementById("saveUser").textContent = "Update Local User";
  document.getElementById("userUsername").value = user.username;
  document.getElementById("userUsername").disabled = true;
  document.getElementById("userDisplayName").value = user.display_name;
  document.getElementById("userUnit").value = user.unit;
  document.getElementById("userDepartment").value = user.department;
  document.getElementById("userTeam").value = user.team;
  document.getElementById("userEmail").value = user.email;
  document.getElementById("userStatus").value = user.status;
  showUserDetail(id);
}

function resetUserForm() {
  editingUserId = null;
  document.getElementById("userFormTitle").textContent = "Add local user";
  document.getElementById("saveUser").textContent = "Create Local User";
  ["userUsername", "userDisplayName", "userUnit", "userDepartment", "userTeam", "userEmail"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("userUsername").disabled = false;
  document.getElementById("userStatus").value = "active";
}

async function showUserDetail(id) {
  const user = await request(`/users/${id}`);
  document.getElementById("userDetail").innerHTML = `
    <h3>User detail: ${esc(user.username)}</h3>
    <p><strong>Display name:</strong> ${esc(user.display_name)} ${ownershipBadge(user.account_ownership)}</p>
    <p><strong>Organization:</strong> ${esc(user.unit)} / ${esc(user.department)} / ${esc(user.team)}</p>
    <p><strong>HCM ID:</strong> ${esc(user.hcm_id || "not HCM synced")}</p>
    <p><strong>Local action policy:</strong> ${user.account_ownership === "HCM" ? "HCM-managed users are read-only and cannot be locally edited, reset, or deleted." : "Local user supports edit, password reset, and delete."}</p>
    <p><strong>Roles:</strong> ${roleNames(user)}</p>
    <pre>${esc(JSON.stringify(user, null, 2))}</pre>
  `;
}

async function resetPassword(id) {
  const status = document.getElementById("userStatusMessage");
  try {
    const result = await request(`/users/${id}/password-reset`, { method: "POST", body: "{}" });
    status.textContent = `${result.message}: ${result.temporary_password}`;
  } catch (error) {
    status.textContent = error.message;
  }
}

async function deleteUser(id) {
  if (!window.confirm("Delete this local user?")) return;
  await request(`/users/${id}`, { method: "DELETE" });
  renderUsers();
}

function roleTable(roles) {
  if (!roles.length) return `<div class="empty">No roles found</div>`;
  return `
    <table>
      <thead><tr><th>Role</th><th>Description</th><th>Status</th><th>Users</th><th>Permissions</th><th>Actions</th></tr></thead>
      <tbody>
        ${roles.map((role) => `
          <tr>
            <td>${esc(role.name)}<div class="muted">${esc(role.code)} / ID ${role.id}</div></td>
            <td>${esc(role.description)}</td>
            <td>${role.enabled ? `<span class="status-badge status-normal">enabled</span>` : `<span class="status-badge status-stop_use">disabled</span>`}</td>
            <td>${role.user_count} bound<div class="muted">${(role.users || []).map((user) => esc(user.username)).join(", ")}</div></td>
            <td>${(role.permissions || []).slice(0, 3).map((permission) => `<span class="pill">${esc(permission.permission_type)}: ${esc(permission.label)}</span>`).join("")}</td>
            <td class="actions">
              <button class="secondary" data-edit-role="${role.id}">Edit</button>
              <button class="secondary" data-bind-role="${role.id}">Bind Users</button>
              <button class="secondary" data-permissions-role="${role.id}">Permissions</button>
              <button class="secondary" data-toggle-role="${role.id}" data-enabled="${role.enabled}">${role.enabled ? "Disable" : "Enable"}</button>
              <button class="danger" data-delete-role="${role.id}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderRoles() {
  const search = document.getElementById("roleSearch")?.value || "";
  const roles = await request(`/roles?${new URLSearchParams({ search })}`);
  app.innerHTML = `
    <h2>Role Management</h2>
    <div class="grid material-grid">
      <section class="panel">
        <h3 id="roleFormTitle">Create role</h3>
        <label>Name<input id="roleName" placeholder="Sprint 8 Role" /></label>
        <label>Code<input id="roleCode" placeholder="S8_ROLE" /></label>
        <label>Description<textarea id="roleDescription" placeholder="Role scope and responsibility"></textarea></label>
        <label><span><input id="roleEnabled" type="checkbox" checked /> Enabled</span></label>
        <button id="saveRole">Create Role</button>
        <button id="resetRoleForm" class="secondary">Reset</button>
        <div id="roleStatus" class="status muted"></div>
      </section>
      <section>
        <div class="toolbar">
          <input id="roleSearch" value="${esc(search)}" placeholder="Search roles" />
          <button id="searchRoles" class="secondary">Search</button>
          <button id="clearRoles" class="secondary">Clear</button>
        </div>
        <div class="panel">
          ${roleTable(roles)}
          <div id="roleDetail" class="card detail-card"></div>
        </div>
      </section>
    </div>
  `;
  document.getElementById("saveRole").addEventListener("click", saveRole);
  document.getElementById("resetRoleForm").addEventListener("click", resetRoleForm);
  document.getElementById("searchRoles").addEventListener("click", renderRoles);
  document.getElementById("clearRoles").addEventListener("click", () => {
    document.getElementById("roleSearch").value = "";
    renderRoles();
  });
  document.querySelectorAll("[data-edit-role]").forEach((button) => button.addEventListener("click", () => editRole(button.dataset.editRole)));
  document.querySelectorAll("[data-bind-role]").forEach((button) => button.addEventListener("click", () => renderRoleBinding(button.dataset.bindRole)));
  document.querySelectorAll("[data-permissions-role]").forEach((button) => button.addEventListener("click", () => {
    window.history.pushState(null, "", `/system/roles/${button.dataset.permissionsRole}/permissions`);
    route();
  }));
  document.querySelectorAll("[data-toggle-role]").forEach((button) => button.addEventListener("click", () => toggleRole(button.dataset.toggleRole, button.dataset.enabled === "true")));
  document.querySelectorAll("[data-delete-role]").forEach((button) => button.addEventListener("click", () => deleteRole(button.dataset.deleteRole)));
  window.currentRoles = roles;
}

async function saveRole() {
  const status = document.getElementById("roleStatus");
  const payload = {
    name: document.getElementById("roleName").value.trim(),
    code: document.getElementById("roleCode").value.trim(),
    description: document.getElementById("roleDescription").value.trim(),
    enabled: document.getElementById("roleEnabled").checked
  };
  try {
    if (editingRoleId) {
      await request(`/roles/${editingRoleId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await request("/roles", { method: "POST", body: JSON.stringify(payload) });
    }
    editingRoleId = null;
    status.textContent = "Role saved";
    renderRoles();
  } catch (error) {
    status.textContent = error.message;
  }
}

function editRole(id) {
  const role = (window.currentRoles || []).find((item) => String(item.id) === String(id));
  if (!role) return;
  editingRoleId = role.id;
  document.getElementById("roleFormTitle").textContent = `Edit role ${role.name}`;
  document.getElementById("saveRole").textContent = "Update Role";
  document.getElementById("roleName").value = role.name;
  document.getElementById("roleCode").value = role.code;
  document.getElementById("roleDescription").value = role.description;
  document.getElementById("roleEnabled").checked = role.enabled;
}

function resetRoleForm() {
  editingRoleId = null;
  document.getElementById("roleFormTitle").textContent = "Create role";
  document.getElementById("saveRole").textContent = "Create Role";
  ["roleName", "roleCode", "roleDescription"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("roleEnabled").checked = true;
}

async function toggleRole(id, enabled) {
  await request(`/roles/${id}/${enabled ? "disable" : "enable"}`, { method: "PATCH", body: "{}" });
  renderRoles();
}

async function deleteRole(id) {
  if (!window.confirm("Delete this role?")) return;
  await request(`/roles/${id}`, { method: "DELETE" });
  renderRoles();
}

async function renderRoleBinding(roleId) {
  const [role, users] = await Promise.all([request(`/roles/${roleId}`), request("/users")]);
  const selected = new Set((role.users || []).map((user) => String(user.id)));
  document.getElementById("roleDetail").innerHTML = `
    <h3>Role-user binding: ${esc(role.name)}</h3>
    <div class="toolbar">
      <span class="pill">${esc(role.enabled ? "enabled" : "disabled")}</span>
      <span class="muted">Disabled roles cannot be bound through the API.</span>
    </div>
    <div class="binding-list">
      ${users.map((user) => `
        <label><span><input type="checkbox" value="${user.id}" class="role-user-checkbox" ${selected.has(String(user.id)) ? "checked" : ""} ${role.enabled ? "" : "disabled"} /> ${esc(user.username)} / ${esc(user.display_name)} / ${esc(user.account_ownership)}</span></label>
      `).join("")}
    </div>
    <button id="saveRoleUsers" ${role.enabled ? "" : "disabled"}>Save User Binding</button>
    <div id="roleBindingStatus" class="status muted"></div>
  `;
  document.getElementById("saveRoleUsers")?.addEventListener("click", async () => {
    const user_ids = Array.from(document.querySelectorAll(".role-user-checkbox:checked")).map((item) => Number(item.value));
    const updated = await request(`/roles/${roleId}/users`, { method: "PUT", body: JSON.stringify({ user_ids }) });
    document.getElementById("roleBindingStatus").textContent = `${updated.user_count} users bound`;
    renderRoles();
  });
}

function permissionGroups(catalog, selectedKeys) {
  const groups = ["directory", "button", "api", "scope"];
  return groups.map((type) => `
    <section class="panel permission-group">
      <h3>${type === "directory" ? "Directory/Menu" : type === "button" ? "Button/Action" : type === "api" ? "API-level" : "Material Library Scope"} permissions</h3>
      ${catalog.filter((item) => item.permission_type === type).map((item) => `
        <label><span><input type="checkbox" class="permission-checkbox" value="${esc(item.permission_key)}" ${selectedKeys.has(item.permission_key) ? "checked" : ""} /> ${esc(item.label)} <span class="muted">${esc(item.module)} / ${esc(item.permission_key)}</span></span></label>
      `).join("")}
    </section>
  `).join("");
}

async function renderRolePermissions() {
  const match = window.location.pathname.match(/\/roles\/(\d+)\/permissions/);
  const roleId = match ? match[1] : "";
  if (!roleId) return renderRoles();
  const detail = await request(`/roles/${roleId}/permissions`);
  const selectedKeys = new Set((detail.permissions || []).map((item) => item.permission_key));
  app.innerHTML = `
    <h2>Permission Configuration: ${esc(detail.role_name)}</h2>
    <div class="toolbar">
      <button class="secondary" id="backToRoles">Back to Roles</button>
      <button id="savePermissions">Save Permissions</button>
      <div id="permissionStatus" class="status muted"></div>
    </div>
    <div class="permission-grid">${permissionGroups(detail.catalog, selectedKeys)}</div>
  `;
  document.getElementById("backToRoles").addEventListener("click", () => {
    window.history.pushState(null, "", "/system/roles");
    route();
  });
  document.getElementById("savePermissions").addEventListener("click", async () => {
    const permission_keys = Array.from(document.querySelectorAll(".permission-checkbox:checked")).map((item) => item.value);
    const saved = await request(`/roles/${roleId}/permissions`, { method: "PUT", body: JSON.stringify({ permission_keys }) });
    document.getElementById("permissionStatus").textContent = `${saved.permissions.length} permissions saved`;
  });
}

async function renderCategories() {
  await loadMaterialContext();
  const search = document.getElementById("categorySearch")?.value || "";
  const filtered = categories.filter((category) => {
    const text = `${category.name} ${category.code} ${category.description}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });
  app.innerHTML = `
    <h2>Category Management</h2>
    <div class="toolbar">
      <input id="categorySearch" value="${esc(search)}" placeholder="Search categories" />
      <button id="searchCategory" class="secondary">Search</button>
      <button id="clearCategorySearch" class="secondary">Clear</button>
    </div>
    <section class="panel">
      <table>
        <thead><tr><th>Category</th><th>Code</th><th>Description</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.map((category) => `
            <tr>
              <td>${esc(category.name)}</td>
              <td>${esc(category.code)}</td>
              <td>${esc(category.description)}</td>
              <td>${category.enabled ? "enabled" : "disabled"}</td>
            </tr>
          `).join("") || `<tr><td colspan="4"><div class="empty">No categories found</div></td></tr>`}
        </tbody>
      </table>
    </section>
  `;
  document.getElementById("searchCategory").addEventListener("click", renderCategories);
  document.getElementById("clearCategorySearch").addEventListener("click", () => {
    document.getElementById("categorySearch").value = "";
    renderCategories();
  });
}

async function renderNewCategoryWorkflow() {
  await loadMaterialContext();
  const config = await loadSystemConfig();
  app.innerHTML = `
    <h2>New Material Category Application</h2>
    <div class="grid">
      <section class="panel">
        ${approvalRoutePreview(config)}
        ${materialLibrarySelect()}
        <label>Parent category
          <select id="parentCategorySelect">
            <option value="">No parent category</option>
            ${categories.map((category) => `<option value="${category.id}">${esc(category.name)}</option>`).join("")}
          </select>
        </label>
        <label>Proposed category name<input id="categoryWorkflowName" placeholder="测试新增类目" /></label>
        <label>Proposed category code<input id="categoryWorkflowCode" placeholder="Optional, otherwise auto-generated" /></label>
        <label>Description<textarea id="categoryWorkflowDescription" placeholder="Category scope and usage"></textarea></label>
        <label>Business reason<textarea id="categoryWorkflowReason" placeholder="Why this category is needed"></textarea></label>
        <button id="submitCategoryWorkflow">Submit category application</button>
        <div id="categoryWorkflowStatus" class="status muted"></div>
      </section>
      <section id="categoryWorkflowDetail"><div class="empty">Submitted workflow status will appear here</div></section>
    </div>
  `;
  document.getElementById("submitCategoryWorkflow").addEventListener("click", submitCategoryWorkflow);
}

async function submitCategoryWorkflow() {
  const payload = {
    type: "new_category",
    applicant: "material_manager",
    material_library_id: Number(document.getElementById("materialLibrarySelect").value),
    parent_category_id: document.getElementById("parentCategorySelect").value ? Number(document.getElementById("parentCategorySelect").value) : null,
    proposed_category_name: document.getElementById("categoryWorkflowName").value.trim(),
    proposed_category_code: document.getElementById("categoryWorkflowCode").value.trim(),
    description: document.getElementById("categoryWorkflowDescription").value,
    business_reason: document.getElementById("categoryWorkflowReason").value.trim()
  };
  try {
    const application = await request("/workflows/applications", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("categoryWorkflowStatus").textContent = `Submitted ${application.application_no}`;
    document.getElementById("categoryWorkflowDetail").innerHTML = workflowDetail(application);
  } catch (error) {
    document.getElementById("categoryWorkflowStatus").textContent = error.message;
  }
}

function imageInputHint() {
  return workflowReferenceImages.length
    ? `${workflowReferenceImages.length} reference images ready`
    : "Three required reference images must be uploaded before submission";
}

async function renderNewMaterialCodeWorkflow() {
  await loadMaterialContext();
  const config = await loadSystemConfig();
  workflowReferenceImages = [];
  app.innerHTML = `
    <h2>New Material Code Application</h2>
    <div class="grid material-grid">
      <section class="panel">
        ${approvalRoutePreview(config)}
        ${productSelect()}
        ${materialLibrarySelect()}
        ${categorySelect()}
        ${brandSelect()}
        <label>Material name<input id="codeWorkflowName" placeholder="测试编码物料" /></label>
        <label>Unit<input id="codeWorkflowUnit" placeholder="台" /></label>
        <label>Attributes<textarea id="codeWorkflowAttributes" placeholder="型号: TEST-100&#10;规格: 标准"></textarea></label>
        <label>Reference mall link<input id="codeWorkflowLink" value="https://example.com/material-code-test" /></label>
        <label>Reference images<input id="codeWorkflowImages" type="file" accept="image/*" multiple /></label>
        <label>Business reason<textarea id="codeWorkflowReason" placeholder="Why this material code is needed"></textarea></label>
        <button id="submitCodeWorkflow">Submit material code application</button>
        <div id="codeWorkflowStatus" class="status muted">${imageInputHint()}</div>
        <div id="codeImagePreview" class="thumb-row"></div>
      </section>
      <section id="codeWorkflowDetail"><div class="empty">Submitted workflow status will appear here</div></section>
    </div>
  `;
  bindProductSelect(() => {});
  document.getElementById("codeWorkflowImages").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    workflowReferenceImages = await Promise.all(files.map(async (file) => ({
      filename: file.name,
      content_type: file.type || "image/png",
      data_url: await fileDataUrl(file)
    })));
    document.getElementById("codeWorkflowStatus").textContent = imageInputHint();
    document.getElementById("codeImagePreview").innerHTML = workflowReferenceImages.map((image) => `<img class="thumb large-thumb" src="${esc(image.data_url)}" alt="${esc(image.filename)}" />`).join("");
  });
  document.getElementById("submitCodeWorkflow").addEventListener("click", submitMaterialCodeWorkflow);
}

async function submitMaterialCodeWorkflow() {
  const status = document.getElementById("codeWorkflowStatus");
  if (workflowReferenceImages.length < 3) {
    status.textContent = "Three required reference images must be uploaded before submission";
    return;
  }
  const payload = {
    type: "new_material_code",
    applicant: "material_manager",
    material_library_id: Number(document.getElementById("materialLibrarySelect").value),
    category_id: Number(document.getElementById("categorySelect").value),
    product_name_id: Number(document.getElementById("productSelect").value),
    brand_id: document.getElementById("materialBrand").value ? Number(document.getElementById("materialBrand").value) : null,
    material_name: document.getElementById("codeWorkflowName").value.trim(),
    unit: document.getElementById("codeWorkflowUnit").value.trim(),
    attributes: parseAttributes(document.getElementById("codeWorkflowAttributes").value),
    reference_mall_link: document.getElementById("codeWorkflowLink").value.trim(),
    reference_images: workflowReferenceImages,
    business_reason: document.getElementById("codeWorkflowReason").value.trim()
  };
  try {
    const application = await request("/workflows/applications", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = `Submitted ${application.application_no}`;
    document.getElementById("codeWorkflowDetail").innerHTML = workflowDetail(application);
  } catch (error) {
    status.textContent = error.message;
  }
}

function enabledReasonNames(reasons) {
  return (reasons || []).filter((reason) => reason.enabled !== false).map((reason) => reason.name || reason).filter(Boolean);
}

function reasonSelect(id, reasons, label) {
  return `<label>${label}
    <select id="${id}" required>
      ${reasons.map((reason) => `<option value="${esc(reason)}">${esc(reason)}</option>`).join("")}
    </select>
  </label>`;
}

function stopMaterialOptions(materials, eligibleStatus, selectedId) {
  return materials.map((material) => {
    const eligible = material.status === eligibleStatus;
    const selected = String(material.id) === String(selectedId);
    const label = `${material.name} / ${material.code} / ${material.status}`;
    return `<option value="${material.id}" ${selected && eligible ? "selected" : ""} ${eligible ? "" : "disabled"}>${esc(label)}</option>`;
  }).join("");
}

async function renderStopPurchaseWorkflow() {
  await loadMaterialContext();
  const config = await loadSystemConfig();
  const selectedId = new URLSearchParams(window.location.search).get("material_id") || "";
  const materials = await request("/materials");
  const reasons = enabledReasonNames(config.stop_purchase_reasons);
  app.innerHTML = `
    <h2>Stop Purchase Application</h2>
    <div class="grid material-grid">
      <section class="panel">
        <label>Target normal material
          <select id="stopPurchaseMaterial">${stopMaterialOptions(materials, "normal", selectedId)}</select>
        </label>
        ${reasonSelect("stopPurchaseReason", reasons, "Stop-purchase reason")}
        <label>Business justification<textarea id="stopPurchaseBusinessReason" placeholder="Describe the evidence and business impact"></textarea></label>
        <button id="submitStopPurchaseWorkflow">Submit stop purchase application</button>
        <div id="stopPurchaseWorkflowStatus" class="status muted"></div>
      </section>
      <section id="stopPurchaseWorkflowDetail"><div class="empty">Submitted workflow status will appear here</div></section>
    </div>
  `;
  document.getElementById("submitStopPurchaseWorkflow").addEventListener("click", submitStopPurchaseWorkflow);
}

async function submitStopPurchaseWorkflow() {
  const status = document.getElementById("stopPurchaseWorkflowStatus");
  const reason = document.getElementById("stopPurchaseReason").value;
  const payload = {
    type: "stop_purchase",
    applicant: "material_manager",
    material_id: Number(document.getElementById("stopPurchaseMaterial").value),
    reason_code: reason,
    reason,
    business_reason: document.getElementById("stopPurchaseBusinessReason").value.trim()
  };
  try {
    const application = await request("/workflows/applications", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = `Submitted ${application.application_no}`;
    document.getElementById("stopPurchaseWorkflowDetail").innerHTML = workflowDetail(application);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function renderStopUseWorkflow() {
  await loadMaterialContext();
  const config = await loadSystemConfig();
  const selectedId = new URLSearchParams(window.location.search).get("material_id") || "";
  const materials = await request("/materials");
  const reasons = enabledReasonNames(config.stop_use_reasons);
  app.innerHTML = `
    <h2>Stop Use Application</h2>
    <div class="grid material-grid">
      <section class="panel">
        <label>Target stop_purchase material
          <select id="stopUseMaterial">${stopMaterialOptions(materials, "stop_purchase", selectedId)}</select>
        </label>
        ${reasonSelect("stopUseReason", reasons, "Stop-use reason")}
        <label>Business justification<textarea id="stopUseBusinessReason" placeholder="Stop use requires prior stop_purchase and cannot be reverted"></textarea></label>
        <label><span><input id="stopUseAcknowledge" type="checkbox" /> I acknowledge stop_use is terminal and non-reversible</span></label>
        <button id="submitStopUseWorkflow">Submit stop use application</button>
        <div id="stopUseWorkflowStatus" class="status muted">Normal materials are disabled because stop use requires prior stop_purchase.</div>
      </section>
      <section id="stopUseWorkflowDetail"><div class="empty">Submitted workflow status will appear here</div></section>
    </div>
  `;
  document.getElementById("submitStopUseWorkflow").addEventListener("click", submitStopUseWorkflow);
}

async function submitStopUseWorkflow() {
  const status = document.getElementById("stopUseWorkflowStatus");
  if (!document.getElementById("stopUseAcknowledge").checked) {
    status.textContent = "Acknowledge that stop_use is terminal before submitting";
    return;
  }
  const reason = document.getElementById("stopUseReason").value;
  const payload = {
    type: "stop_use",
    applicant: "material_manager",
    material_id: Number(document.getElementById("stopUseMaterial").value),
    reason_code: reason,
    reason,
    acknowledge_terminal: true,
    business_reason: document.getElementById("stopUseBusinessReason").value.trim()
  };
  try {
    const application = await request("/workflows/applications", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = `Submitted ${application.application_no}`;
    document.getElementById("stopUseWorkflowDetail").innerHTML = workflowDetail(application);
  } catch (error) {
    status.textContent = error.message;
  }
}

function workflowTable(applications, taskMode = false) {
  if (!applications.length) return `<div class="empty">No workflow applications found</div>`;
  return `
    <table>
      <thead><tr><th>Application</th><th>Type</th><th>Status</th><th>Current node</th><th>Material / reason</th><th>Actions</th></tr></thead>
      <tbody>
        ${applications.map((application) => {
          const data = application.data || {};
          const title = data.proposed_category_name || data.material_name || application.application_no;
          const submitted = data.material_name
            ? `${data.material_name} / ${data.reason || data.category_path_preview || ""}`
            : data.reference_mall_link
              ? "reference mall link"
              : data.category_path_preview || "";
          return `
            <tr>
              <td>${esc(application.application_no)}<div class="muted">${esc(title)}</div></td>
              <td>${esc(application.type)}</td>
              <td>${workflowStatusBadge(application.status)}${application.rejection_reason ? `<div class="invalid">${esc(application.rejection_reason)}</div>` : ""}</td>
              <td>${esc(application.current_node)}</td>
              <td>${data.reference_mall_link ? `<a href="${esc(data.reference_mall_link)}" target="_blank" rel="noreferrer">${esc(submitted)}</a>` : esc(submitted)}</td>
              <td class="actions">
                <button class="secondary" data-workflow-detail="${application.id}">Detail</button>
                ${taskMode ? `<button data-workflow-approve="${application.id}" data-node="${esc(application.current_node)}">Approve</button><button class="danger" data-workflow-reject="${application.id}" data-node="${esc(application.current_node)}">Reject</button>` : ""}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

async function renderWorkflowTasks() {
  const applications = await request("/workflows/tasks");
  app.innerHTML = `
    <h2>Approver Task List</h2>
    <section class="panel">
      <label>Approval or rejection reason<input id="workflowActionComment" placeholder="Required for rejection; optional for approval" /></label>
      <div id="workflowTaskStatus" class="status muted"></div>
      ${workflowTable(applications, true)}
    </section>
    <section id="workflowTaskDetail"></section>
  `;
  bindWorkflowActions("workflowTaskDetail", renderWorkflowTasks);
}

async function renderWorkflowApplications() {
  const applications = await request("/workflows/applications?applicant=material_manager");
  app.innerHTML = `
    <h2>Applicant Application List</h2>
    <section class="panel">${workflowTable(applications, false)}</section>
    <section id="workflowApplicationDetail"></section>
  `;
  bindWorkflowActions("workflowApplicationDetail", renderWorkflowApplications);
}

function bindWorkflowActions(detailId, refresh) {
  document.querySelectorAll("[data-workflow-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      const application = await request(`/workflows/applications/${button.dataset.workflowDetail}`);
      document.getElementById(detailId).innerHTML = workflowDetail(application);
    });
  });
  document.querySelectorAll("[data-workflow-approve]").forEach((button) => {
    button.addEventListener("click", async () => {
      const comment = document.getElementById("workflowActionComment")?.value || "";
      await request(`/workflows/applications/${button.dataset.workflowApprove}/approve`, {
        method: "POST",
        body: JSON.stringify({ actor: button.dataset.node, node: button.dataset.node, comment })
      });
      refresh();
    });
  });
  document.querySelectorAll("[data-workflow-reject]").forEach((button) => {
    button.addEventListener("click", async () => {
      const comment = document.getElementById("workflowActionComment")?.value || "";
      const status = document.getElementById("workflowTaskStatus");
      if (!comment.trim()) {
        if (status) status.textContent = "A rejection reason is required";
        return;
      }
      await request(`/workflows/applications/${button.dataset.workflowReject}/reject`, {
        method: "POST",
        body: JSON.stringify({ actor: button.dataset.node, node: button.dataset.node, comment })
      });
      refresh();
    });
  });
}

function capabilityOptions(selected = []) {
  const selectedSet = new Set(selected);
  return AI_CAPABILITIES.map((capability) => `
    <label><span><input type="checkbox" class="providerCapability" value="${esc(capability)}" ${selectedSet.has(capability) ? "checked" : ""} /> ${esc(capability)}</span></label>
  `).join("");
}

function providerOptionList(providers, selectedId = "", includeBlank = true) {
  const rows = providers.filter((provider) => provider.enabled);
  return `${includeBlank ? `<option value="">No fallback</option>` : ""}${rows.map((provider) => `
    <option value="${provider.id}" ${String(provider.id) === String(selectedId || "") ? "selected" : ""}>${esc(provider.display_name)} / ${esc(provider.model_name)}</option>
  `).join("")}`;
}

async function renderAIProviders() {
  const [providers, mappings] = await Promise.all([
    request("/ai/providers"),
    request("/ai/capability-mappings")
  ]);
  const editing = providers.find((provider) => String(provider.id) === String(editingProviderId));
  app.innerHTML = `
    <h2>LLM Gateway Model Management</h2>
    <div class="grid material-grid">
      <section class="panel">
        <h3>${editing ? "Edit model configuration" : "Create model configuration"}</h3>
        <label>Display name<input id="providerDisplayName" value="${esc(editing?.display_name || "")}" placeholder="Sprint 10 Primary" /></label>
        <label>Provider
          <select id="providerType">
            ${["mock", "DashScope", "Azure OpenAI", "vLLM", "Ollama"].map((name) => `<option value="${esc(name)}" ${editing?.provider === name ? "selected" : ""}>${esc(name)}</option>`).join("")}
          </select>
        </label>
        <label>Base URL<input id="providerBaseUrl" value="${esc(editing?.base_url || "")}" placeholder="http://127.0.0.1:18080" /></label>
        <label>Model name<input id="providerModelName" value="${esc(editing?.model_name || "")}" placeholder="primary-model" /></label>
        <label>API key<input id="providerApiKey" type="password" placeholder="${esc(editing?.api_key_masked || "optional")}" /></label>
        <label>Timeout seconds<input id="providerTimeout" type="number" min="1" max="120" value="${esc(editing?.timeout_seconds || 10)}" /></label>
        <label>Fallback model
          <select id="providerFallback">${providerOptionList(providers.filter((provider) => !editing || provider.id !== editing.id), editing?.fallback_model_id || "")}</select>
        </label>
        <label><span><input id="providerEnabled" type="checkbox" ${editing?.enabled === false ? "" : "checked"} /> Enabled</span></label>
        <div class="binding-list">${capabilityOptions(editing?.capabilities || ["material_add", "material_match"])}</div>
        <div class="toolbar">
          <button id="saveProvider">${editing ? "Save Model" : "Create Model"}</button>
          <button id="testProviderDraft" class="secondary">Test Draft</button>
          <button id="resetProvider" class="secondary">Reset</button>
        </div>
        <div id="providerStatus" class="status muted"></div>
      </section>
      <section>
        <div class="panel">
          <h3>Configured models</h3>
          ${providerTable(providers)}
        </div>
        <div class="panel trace-panel">
          <h3>Capability hot-switch mappings</h3>
          ${mappingEditor(providers, mappings)}
        </div>
        <div class="panel">
          <h3>Gateway invocation test</h3>
          <div class="toolbar">
            <select id="invokeCapability">${AI_CAPABILITIES.map((capability) => `<option value="${esc(capability)}">${esc(capability)}</option>`).join("")}</select>
            <input id="invokePrompt" value="Sprint 10 hot switch test" />
            <button id="invokeGateway">Invoke</button>
          </div>
          <pre id="invokeResult">No invocation yet</pre>
        </div>
      </section>
    </div>
  `;
  document.getElementById("saveProvider").addEventListener("click", saveProvider);
  document.getElementById("testProviderDraft").addEventListener("click", testProviderDraft);
  document.getElementById("resetProvider").addEventListener("click", () => {
    editingProviderId = null;
    renderAIProviders();
  });
  document.querySelectorAll("[data-edit-provider]").forEach((button) => button.addEventListener("click", () => {
    editingProviderId = button.dataset.editProvider;
    renderAIProviders();
  }));
  document.querySelectorAll("[data-disable-provider]").forEach((button) => button.addEventListener("click", () => disableProvider(button.dataset.disableProvider)));
  document.querySelectorAll("[data-test-provider]").forEach((button) => button.addEventListener("click", () => testSavedProvider(button.dataset.testProvider)));
  document.querySelectorAll("[data-save-mapping]").forEach((button) => button.addEventListener("click", () => saveMapping(button.dataset.saveMapping)));
  document.getElementById("invokeGateway").addEventListener("click", invokeGateway);
}

function providerTable(providers) {
  return `
    <table>
      <thead><tr><th>Name</th><th>Provider</th><th>Endpoint</th><th>Capabilities</th><th>Status</th><th>API key</th><th>Actions</th></tr></thead>
      <tbody>
        ${providers.map((provider) => `
          <tr>
            <td>${esc(provider.display_name)}<div class="muted">${esc(provider.model_name)} / ${provider.timeout_seconds}s</div></td>
            <td>${esc(provider.provider)}</td>
            <td>${esc(provider.base_url || "local")}</td>
            <td>${(provider.capabilities || []).map((capability) => `<span class="pill">${esc(capability)}</span>`).join("")}</td>
            <td>${provider.enabled ? `<span class="valid">enabled</span>` : `<span class="invalid">disabled</span>`}<div class="muted">${esc(provider.connection_status)} ${esc(provider.last_test_message || "")}</div></td>
            <td>${esc(provider.api_key_masked || "not set")}</td>
            <td class="actions">
              <button class="secondary" data-edit-provider="${provider.id}">Edit</button>
              <button class="secondary" data-test-provider="${provider.id}">Test</button>
              <button class="danger" data-disable-provider="${provider.id}" ${provider.enabled ? "" : "disabled"}>Disable</button>
            </td>
          </tr>
        `).join("") || `<tr><td colspan="7"><div class="empty">No model configurations found</div></td></tr>`}
      </tbody>
    </table>
  `;
}

function mappingEditor(providers, mappings) {
  const byCapability = new Map((mappings || []).map((mapping) => [mapping.capability, mapping]));
  const enabledProviders = providers.filter((provider) => provider.enabled);
  return `
    <table>
      <thead><tr><th>Capability</th><th>Primary model</th><th>Fallback model</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        ${AI_CAPABILITIES.map((capability) => {
          const mapping = byCapability.get(capability) || {};
          return `
            <tr>
              <td>${esc(capability)}</td>
              <td><select id="mapPrimary-${esc(capability)}">${providerOptionList(enabledProviders, mapping.primary_model_id, false)}</select></td>
              <td><select id="mapFallback-${esc(capability)}">${providerOptionList(enabledProviders, mapping.fallback_model_id, true)}</select></td>
              <td><label><span><input id="mapEnabled-${esc(capability)}" type="checkbox" ${mapping.enabled === false ? "" : "checked"} /> Enabled</span></label></td>
              <td><button data-save-mapping="${esc(capability)}" ${enabledProviders.length ? "" : "disabled"}>Save Mapping</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <div id="mappingStatus" class="status muted"></div>
  `;
}

function providerPayload() {
  return {
    display_name: document.getElementById("providerDisplayName").value.trim(),
    provider: document.getElementById("providerType").value,
    base_url: document.getElementById("providerBaseUrl").value.trim(),
    model_name: document.getElementById("providerModelName").value.trim(),
    api_key: document.getElementById("providerApiKey").value,
    timeout_seconds: Number(document.getElementById("providerTimeout").value || 10),
    fallback_model_id: document.getElementById("providerFallback").value ? Number(document.getElementById("providerFallback").value) : null,
    enabled: document.getElementById("providerEnabled").checked,
    capabilities: Array.from(document.querySelectorAll(".providerCapability:checked")).map((item) => item.value)
  };
}

async function saveProvider() {
  const status = document.getElementById("providerStatus");
  try {
    const payload = providerPayload();
    const path = editingProviderId ? `/ai/providers/${editingProviderId}` : "/ai/providers";
    const saved = await request(path, { method: editingProviderId ? "PUT" : "POST", body: JSON.stringify(payload) });
    status.textContent = `${saved.display_name} saved; connection ${saved.connection_status}: ${saved.last_test_message}`;
    editingProviderId = saved.id;
    renderAIProviders();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function testProviderDraft() {
  const status = document.getElementById("providerStatus");
  try {
    const result = await request("/ai/providers/test", { method: "POST", body: JSON.stringify(providerPayload()) });
    status.textContent = `${result.status}: ${result.message}`;
  } catch (error) {
    status.textContent = error.message;
  }
}

async function testSavedProvider(id) {
  const result = await request(`/ai/providers/${id}/test`, { method: "POST" });
  window.alert(`${result.status}: ${result.message}`);
  renderAIProviders();
}

async function disableProvider(id) {
  await request(`/ai/providers/${id}/disable`, { method: "PATCH" });
  if (String(editingProviderId) === String(id)) editingProviderId = null;
  renderAIProviders();
}

async function saveMapping(capability) {
  const primary = document.getElementById(`mapPrimary-${capability}`).value;
  const payload = {
    capability,
    primary_model_id: Number(primary),
    fallback_model_id: document.getElementById(`mapFallback-${capability}`).value ? Number(document.getElementById(`mapFallback-${capability}`).value) : null,
    enabled: document.getElementById(`mapEnabled-${capability}`).checked
  };
  const saved = await request(`/ai/capability-mappings/${capability}`, { method: "PUT", body: JSON.stringify(payload) });
  document.getElementById("mappingStatus").textContent = `${saved.capability} now uses ${saved.primary_model_name}${saved.fallback_model_name ? ` with fallback ${saved.fallback_model_name}` : ""}`;
  renderAIProviders();
}

async function invokeGateway() {
  const capability = document.getElementById("invokeCapability").value;
  const prompt = document.getElementById("invokePrompt").value;
  const result = await request(`/ai/capabilities/${capability}/invoke`, {
    method: "POST",
    body: JSON.stringify({ prompt })
  });
  document.getElementById("invokeResult").textContent = JSON.stringify(result, null, 2);
}

async function renderTraceDebug() {
  app.innerHTML = `
    <h2>AI Trace Debug</h2>
    <section class="panel">
      <div class="toolbar">
        <select id="traceStatus">
          <option value="">Any status</option>
          <option value="ok">ok</option>
          <option value="error">error</option>
        </select>
        <input id="traceOperation" placeholder="Operation or capability" />
        <select id="traceCapability">
          <option value="">Any capability</option>
          ${AI_CAPABILITIES.map((capability) => `<option value="${esc(capability)}">${esc(capability)}</option>`).join("")}
        </select>
        <button id="loadTraces">Filter</button>
      </div>
      <div id="traceList"><div class="empty">Loading traces</div></div>
    </section>
    <section id="traceDetail" class="panel detail-card"></section>
  `;
  document.getElementById("loadTraces").addEventListener("click", loadTraces);
  await loadTraces();
}

async function loadTraces() {
  const params = new URLSearchParams();
  const status = document.getElementById("traceStatus")?.value || "";
  const operation = document.getElementById("traceOperation")?.value || "";
  const capability = document.getElementById("traceCapability")?.value || "";
  if (status) params.set("status", status);
  if (operation) params.set("operation", operation);
  if (capability) params.set("capability", capability);
  try {
    const traces = await request(`/debug/trace${params.toString() ? `?${params}` : ""}`);
    document.getElementById("traceList").innerHTML = traceTable(traces);
    document.querySelectorAll("[data-trace-id]").forEach((button) => button.addEventListener("click", () => loadTraceDetail(button.dataset.traceId)));
  } catch (error) {
    document.getElementById("traceList").innerHTML = `<div class="empty">Trace debug unavailable: ${esc(error.message)}</div>`;
  }
}

function traceTable(traces) {
  return `
    <table>
      <thead><tr><th>Trace ID</th><th>Operation</th><th>Capability</th><th>Status</th><th>Duration</th><th>Started</th><th>Action</th></tr></thead>
      <tbody>
        ${traces.map((trace) => `
          <tr>
            <td><code>${esc(trace.trace_id)}</code></td>
            <td>${esc(trace.operation_name)}</td>
            <td>${esc(trace.capability)}</td>
            <td>${trace.status === "error" ? `<span class="invalid">error</span>` : `<span class="valid">${esc(trace.status)}</span>`}</td>
            <td>${esc(trace.duration_ms)} ms / ${esc(trace.span_count)} spans</td>
            <td>${esc(trace.start_time)}</td>
            <td><button class="secondary" data-trace-id="${esc(trace.trace_id)}">Detail</button></td>
          </tr>
        `).join("") || `<tr><td colspan="7"><div class="empty">No traces found</div></td></tr>`}
      </tbody>
    </table>
  `;
}

async function loadTraceDetail(traceId) {
  const detail = await request(`/debug/trace/${traceId}`);
  document.getElementById("traceDetail").innerHTML = `
    <h3>Trace ${esc(detail.trace_id)}</h3>
    <div class="muted">Persisted in ${esc(detail.storage_table)}</div>
    <div class="span-tree">
      ${detail.spans.map((span) => `
        <div class="span-row ${span.parent_span_id ? "span-child" : ""}">
          <strong>${esc(span.operation_name)}</strong>
          <span class="pill">${esc(span.span_type)}</span>
          <span class="${span.status === "error" ? "invalid" : "valid"}">${esc(span.status)}</span>
          <div class="muted">${esc(span.provider)} ${esc(span.model)} ${esc(span.duration_ms)} ms</div>
          ${span.error ? `<div class="invalid">${esc(span.error)}</div>` : ""}
          <pre>${esc(JSON.stringify(span.metadata || {}, null, 2))}</pre>
        </div>
      `).join("")}
    </div>
  `;
}

async function route() {
  try {
    if (!currentUser) await loadCurrentUser();
    const path = window.location.pathname;
    const required = ROUTE_PERMISSIONS.find((item) => item.test(path))?.permission;
    if (required && !can(required)) return accessDenied(required);
    if (path.match(/\/(?:system\/)?roles\/\d+\/permissions/)) return renderRolePermissions();
    if (path.includes("/system/users") || path === "/users") return renderUsers();
    if (path.includes("/system/roles") || path === "/roles") return renderRoles();
    if (path.includes("/ai/providers") || path.includes("/system/models")) return renderAIProviders();
    if (path.includes("/debug/trace")) return renderTraceDebug();
    if (path.includes("/system/config")) return renderSystemConfig();
    if (path.includes("/audit-logs")) return renderAuditLogs();
    if (path.includes("/material-libraries")) return renderMaterialLibraries();
    if (path.includes("/workflows/new-category")) return renderNewCategoryWorkflow();
    if (path.includes("/workflows/new-material-code")) return renderNewMaterialCodeWorkflow();
    if (path.includes("/workflows/stop-purchase")) return renderStopPurchaseWorkflow();
    if (path.includes("/workflows/stop-use")) return renderStopUseWorkflow();
    if (path.includes("/workflows/tasks")) return renderWorkflowTasks();
    if (path.includes("/workflows/applications")) return renderWorkflowApplications();
    if (path.includes("/categories")) return renderCategories();
    if (path.includes("/materials/governance")) return renderMaterialGovernance();
    if (path.includes("/materials")) return renderMaterials();
    if (path.includes("/standard/product-names")) return renderProductNames();
    if (path.includes("/standard/attributes/ai-governance")) return renderGovernance();
    if (path.includes("/standard/attribute-recommend")) return renderRecommend();
    if (path.includes("/standard/attributes/changes")) return renderChanges();
    if (path.includes("/standard/brands")) return renderBrands();
    const firstAllowed = NAV_ITEMS.find((item) => can(item.permission));
    if (firstAllowed) {
      window.history.replaceState(null, "", firstAllowed.href);
      return route();
    }
    return accessDenied("any directory permission");
  } catch (error) {
    app.innerHTML = `<div class="panel"><h2>Unable to load page</h2><pre>${esc(error.message)}</pre></div>`;
  }
}

window.addEventListener("popstate", route);
loadCurrentUser().then(route).catch((error) => {
  app.innerHTML = `<div class="panel"><h2>Unable to load session</h2><pre>${esc(error.message)}</pre></div>`;
});
