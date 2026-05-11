const API = "http://localhost:8000/api/v1";
const app = document.getElementById("app");
let products = [];
let selectedProductId = null;
let editingAttributeId = null;
let editingBrandId = null;

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

async function route() {
  try {
    const path = window.location.pathname;
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
