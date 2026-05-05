(function () {
  "use strict";

  const AG = window.AltaGula;
  const ADMIN_PASS = "3342";
  const state = {
    products: [],
    editingId: null
  };
  const elements = {};

  function $(selector) {
    return document.querySelector(selector);
  }

  function init() {
    Object.assign(elements, {
      loginOverlay: $("#loginOverlay"),
      loginForm: $("#loginForm"),
      adminPassword: $("#adminPassword"),
      logoutButton: $("#logoutButton"),
      themeToggle: $("#themeToggle"),
      syncForm: $("#syncForm"),
      sheetUrl: $("#sheetUrl"),
      syncStatus: $("#syncStatus"),
      lastSync: $("#lastSync"),
      productForm: $("#productForm"),
      formTitle: $("#formTitle"),
      productId: $("#productId"),
      name: $("#name"),
      price: $("#price"),
      category: $("#category"),
      stock: $("#stock"),
      imageUrl: $("#imageUrl"),
      description: $("#description"),
      visible: $("#visible"),
      imagePreview: $("#imagePreview"),
      cancelEdit: $("#cancelEdit"),
      productList: $("#productList"),
      toast: $("#adminToast"),
      totalProducts: $("#totalProducts"),
      visibleProducts: $("#visibleProducts"),
      hiddenProducts: $("#hiddenProducts"),
      totalStock: $("#totalStock")
    });

    state.products = AG.getProducts();
    elements.sheetUrl.value = localStorage.getItem(AG.SHEET_URL_KEY) || "";
    populateCategories();
    renderAll();
    bindEvents();
    checkSession();
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.logoutButton.addEventListener("click", logout);
    elements.themeToggle.addEventListener("click", AG.toggleTheme);
    elements.syncForm.addEventListener("submit", handleSync);
    elements.productForm.addEventListener("submit", handleSaveProduct);
    elements.cancelEdit.addEventListener("click", resetForm);
    elements.imageUrl.addEventListener("input", renderImagePreview);

    window.addEventListener("altaGula:productsChanged", (event) => {
      state.products = event.detail;
      renderAll();
    });
  }

  function checkSession() {
    const loggedIn = sessionStorage.getItem(AG.ADMIN_SESSION_KEY) === "true";
    elements.loginOverlay.classList.toggle("hidden", loggedIn);
    if (!loggedIn) elements.adminPassword.focus();
  }

  function handleLogin(event) {
    event.preventDefault();
    if (elements.adminPassword.value !== ADMIN_PASS) {
      showToast("Clave incorrecta. Probá con la clave configurada.");
      return;
    }
    sessionStorage.setItem(AG.ADMIN_SESSION_KEY, "true");
    elements.loginOverlay.classList.add("hidden");
    elements.adminPassword.value = "";
  }

  function logout() {
    sessionStorage.removeItem(AG.ADMIN_SESSION_KEY);
    checkSession();
  }

  function populateCategories() {
    elements.category.innerHTML = AG.categories.map((category) => `<option value="${AG.escapeHtml(category)}">${AG.escapeHtml(category)}</option>`).join("");
  }

  function renderAll() {
    renderStats();
    renderProducts();
    renderLastSync();
    renderImagePreview();
  }

  function renderStats() {
    elements.totalProducts.textContent = state.products.length;
    elements.visibleProducts.textContent = state.products.filter((product) => product.visible).length;
    elements.hiddenProducts.textContent = state.products.filter((product) => !product.visible).length;
    elements.totalStock.textContent = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  }

  function renderLastSync() {
    const value = localStorage.getItem(AG.LAST_SYNC_KEY);
    elements.lastSync.textContent = value ? new Date(value).toLocaleString("es-AR") : "Sin sincronizaciones todavía";
  }

  function renderImagePreview() {
    const value = elements.imageUrl.value.trim();
    elements.imagePreview.innerHTML = value
      ? `<img src="${AG.escapeHtml(value)}" alt="Vista previa" onerror="this.parentElement.textContent='No se pudo cargar la imagen.';">`
      : "La vista previa de imagen aparece acá.";
  }

  function renderProducts() {
    if (!state.products.length) {
      elements.productList.innerHTML = `<div class="empty-state">Todavía no hay productos cargados.</div>`;
      return;
    }

    elements.productList.innerHTML = state.products.map((product) => `
      <article class="admin-product">
        <div class="admin-thumb">
          ${product.imageUrl ? `<img src="${AG.escapeHtml(product.imageUrl)}" alt="" loading="lazy">` : AG.escapeHtml(product.category.slice(0, 1))}
        </div>
        <div>
          <h3>${AG.escapeHtml(product.name)} ${product.visible ? "" : "<span class='status error'>Oculto</span>"}</h3>
          <p>${AG.escapeHtml(product.category)} · ${AG.formatPrice(product.price)} · Stock ${product.stock}</p>
          <p>${AG.escapeHtml(product.description || "Sin descripción")}</p>
        </div>
        <div class="admin-product-actions">
          <button class="btn btn-secondary" type="button" data-edit="${AG.escapeHtml(product.id)}">Editar</button>
          <button class="btn btn-ghost" type="button" data-toggle="${AG.escapeHtml(product.id)}">${product.visible ? "Ocultar" : "Mostrar"}</button>
          <button class="btn btn-danger" type="button" data-delete="${AG.escapeHtml(product.id)}">Eliminar</button>
        </div>
      </article>
    `).join("");

    elements.productList.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => editProduct(button.dataset.edit));
    });
    elements.productList.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", () => toggleProduct(button.dataset.toggle));
    });
    elements.productList.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => removeProduct(button.dataset.delete));
    });
  }

  async function handleSync(event) {
    event.preventDefault();
    setSyncStatus("syncing", "Sincronizando");
    try {
      state.products = await AG.syncFromSheet(elements.sheetUrl.value);
      setSyncStatus("success", "Sincronizado");
      showToast("Productos importados desde Google Sheets.");
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "Error de sincronización");
      showToast(error.message || "No se pudo sincronizar la hoja.");
    }
    renderAll();
  }

  function setSyncStatus(type, message) {
    elements.syncStatus.className = `status ${type}`;
    elements.syncStatus.textContent = message;
  }

  function handleSaveProduct(event) {
    event.preventDefault();
    if (!elements.productForm.checkValidity()) {
      elements.productForm.reportValidity();
      return;
    }

    const product = {
      id: elements.productId.value || undefined,
      name: elements.name.value,
      price: elements.price.value,
      category: elements.category.value,
      stock: elements.stock.value,
      imageUrl: elements.imageUrl.value,
      description: elements.description.value,
      visible: elements.visible.checked,
      updatedAt: new Date().toISOString()
    };

    state.products = AG.upsertProduct(product);
    showToast(elements.productId.value ? "Producto actualizado." : "Producto agregado.");
    resetForm();
  }

  function editProduct(id) {
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    state.editingId = id;
    elements.formTitle.textContent = "Editar producto";
    elements.productId.value = product.id;
    elements.name.value = product.name;
    elements.price.value = product.price;
    elements.category.value = product.category;
    elements.stock.value = product.stock;
    elements.imageUrl.value = product.imageUrl;
    elements.description.value = product.description;
    elements.visible.checked = product.visible;
    elements.cancelEdit.hidden = false;
    renderImagePreview();
    elements.name.focus();
  }

  function resetForm() {
    state.editingId = null;
    elements.productForm.reset();
    elements.productId.value = "";
    elements.visible.checked = true;
    elements.formTitle.textContent = "Agregar producto";
    elements.cancelEdit.hidden = true;
    renderImagePreview();
  }

  function toggleProduct(id) {
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    product.visible = !product.visible;
    product.updatedAt = new Date().toISOString();
    state.products = AG.saveProducts(state.products);
    showToast(product.visible ? "Producto visible en la tienda." : "Producto oculto de la tienda.");
  }

  function removeProduct(id) {
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    state.products = AG.deleteProduct(id);
    showToast("Producto eliminado.");
    if (elements.productId.value === id) resetForm();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 2800);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
