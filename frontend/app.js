const API = "http://localhost:8000/api/v1";
const app = document.getElementById("app");
let products = [];
let materialLibraries = [];
let categories = [];
let brandsCache = [];
let selectedProductId = null;
let editingAttributeId = null;
let editingBrandId = null;
let editingMaterialId = null;
let editingUserId = null;
let editingRoleId = null;
let materialPreviewItems = [];
let materialGovernanceFile = null;
let aiMaterialPreview = null;
let workflowReferenceImages = [];
const STOP_PURCHASE_REASONS = ["供应商停产", "质量风险停采", "战略替代物料", "采购目录清理"];
const STOP_USE_REASONS = ["长期无库存且无业务需求", "安全合规风险", "技术标准淘汰", "资产归档完成"];

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
      "X-User-Role": "super_admin",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
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
  app.innerHTML = `
    <h2>Material Management</h2>
    <div class="grid material-grid">
      <section class="panel">
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
      </section>
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
  bindProductSelect(() => {});
  document.getElementById("saveMaterial").addEventListener("click", saveMaterial);
  document.getElementById("resetMaterial").addEventListener("click", resetMaterialForm);
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
              <button class="secondary" data-edit-material="${material.id}">Edit</button>
              ${transitionButtons(material)}
              <button class="danger" data-delete-material="${material.id}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function transitionButtons(material) {
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
  app.innerHTML = `
    <h2>Attribute Management</h2>
    <div class="grid">
      <section class="panel">
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
      </section>
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
  bindProductSelect(renderAttributes);
  document.getElementById("saveAttr").addEventListener("click", createAttribute);
  document.getElementById("resetAttr").addEventListener("click", resetAttributeForm);
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
              <button class="secondary" data-edit-attr="${item.id}">Edit</button>
              <button class="danger" data-delete-attr="${item.id}">Delete</button>
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

async function renderSystemConfig() {
  const config = await request("/system/config");
  app.innerHTML = `
    <h2>System Configuration</h2>
    <section class="panel narrow-panel">
      <label>Approval mode
        <select id="approvalMode">
          <option value="multi_node" ${config.approval_mode === "multi_node" ? "selected" : ""}>multi-node workflow</option>
          <option value="simple" ${config.approval_mode === "simple" ? "selected" : ""}>simple approval</option>
        </select>
      </label>
      <button id="saveApprovalMode">Save configuration</button>
      <div id="configStatus" class="status muted">Current mode: ${esc(config.approval_mode)}. Last update: ${esc(config.updated_at)}</div>
    </section>
  `;
  document.getElementById("saveApprovalMode").addEventListener("click", async () => {
    const saved = await request("/system/config", {
      method: "PUT",
      body: JSON.stringify({ approval_mode: document.getElementById("approvalMode").value })
    });
    document.getElementById("configStatus").textContent = `Saved approval mode: ${saved.approval_mode}`;
  });
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
  const groups = ["directory", "button", "api"];
  return groups.map((type) => `
    <section class="panel permission-group">
      <h3>${type === "directory" ? "Directory/Menu" : type === "button" ? "Button/Action" : "API-level"} permissions</h3>
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
  app.innerHTML = `
    <h2>New Material Category Application</h2>
    <div class="grid">
      <section class="panel">
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
  workflowReferenceImages = [];
  app.innerHTML = `
    <h2>New Material Code Application</h2>
    <div class="grid material-grid">
      <section class="panel">
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
  const selectedId = new URLSearchParams(window.location.search).get("material_id") || "";
  const materials = await request("/materials");
  app.innerHTML = `
    <h2>Stop Purchase Application</h2>
    <div class="grid material-grid">
      <section class="panel">
        <label>Target normal material
          <select id="stopPurchaseMaterial">${stopMaterialOptions(materials, "normal", selectedId)}</select>
        </label>
        ${reasonSelect("stopPurchaseReason", STOP_PURCHASE_REASONS, "Stop-purchase reason")}
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
  const selectedId = new URLSearchParams(window.location.search).get("material_id") || "";
  const materials = await request("/materials");
  app.innerHTML = `
    <h2>Stop Use Application</h2>
    <div class="grid material-grid">
      <section class="panel">
        <label>Target stop_purchase material
          <select id="stopUseMaterial">${stopMaterialOptions(materials, "stop_purchase", selectedId)}</select>
        </label>
        ${reasonSelect("stopUseReason", STOP_USE_REASONS, "Stop-use reason")}
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

async function route() {
  try {
    const path = window.location.pathname;
    if (path.match(/\/(?:system\/)?roles\/\d+\/permissions/)) return renderRolePermissions();
    if (path.includes("/system/users") || path === "/users") return renderUsers();
    if (path.includes("/system/roles") || path === "/roles") return renderRoles();
    if (path.includes("/system/config")) return renderSystemConfig();
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
    return renderAttributes();
  } catch (error) {
    app.innerHTML = `<div class="panel"><h2>Unable to load page</h2><pre>${esc(error.message)}</pre></div>`;
  }
}

window.addEventListener("popstate", route);
route();
