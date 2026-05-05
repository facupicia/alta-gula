(function () {
  "use strict";

  const PRODUCT_KEY = "altaGula.products";
  const CART_KEY = "altaGula.cart";
  const SHEET_URL_KEY = "altaGula.sheetUrl";
  const LAST_SYNC_KEY = "altaGula.lastSync";
  const THEME_KEY = "altaGula.theme";
  const ADMIN_SESSION_KEY = "altaGula.adminSession";

  const categories = ["Golosinas", "Chocolates", "Bebidas", "Snacks"];
  const whatsappNumber = "5493464000000";

  const defaultProducts = [
    {
      id: "gomitas-frutales",
      name: "Gomitas frutales",
      description: "Mix colorido de gomitas dulces por 100 g.",
      price: 850,
      category: "Golosinas",
      stock: 24,
      imageUrl: "",
      visible: true,
      updatedAt: new Date().toISOString()
    },
    {
      id: "chocolate-relleno",
      name: "Chocolate relleno",
      description: "Tableta cremosa con relleno dulce.",
      price: 1250,
      category: "Chocolates",
      stock: 16,
      imageUrl: "",
      visible: true,
      updatedAt: new Date().toISOString()
    },
    {
      id: "gaseosa-lata",
      name: "Gaseosa lata",
      description: "Bebida fría en lata de 354 ml.",
      price: 980,
      category: "Bebidas",
      stock: 32,
      imageUrl: "",
      visible: true,
      updatedAt: new Date().toISOString()
    },
    {
      id: "papas-clasicas",
      name: "Papas clásicas",
      description: "Snack crocante para acompañar cualquier pedido.",
      price: 1100,
      category: "Snacks",
      stock: 0,
      imageUrl: "",
      visible: true,
      updatedAt: new Date().toISOString()
    }
  ];

  function safeJsonParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn("No se pudo leer localStorage", error);
      return fallback;
    }
  }

  function slugify(value) {
    return String(value || "producto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "producto";
  }

  function uid(base) {
    return `${slugify(base)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const clean = String(value || "")
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const number = Number.parseFloat(clean);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeVisible(value) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "si").trim().toLowerCase();
    return !["no", "false", "0", "oculto", "hidden"].includes(normalized);
  }

  function normalizeCategory(value) {
    const match = categories.find((category) => category.toLowerCase() === String(value || "").trim().toLowerCase());
    return match || categories[0];
  }

  function normalizeProduct(raw, index) {
    const name = String(raw.name || raw.nombre || raw["Nombre del producto"] || raw["Nombre"] || "").trim();
    const now = new Date().toISOString();

    return {
      id: String(raw.id || raw.ID || slugify(name) || `producto-${index + 1}`),
      name: name || `Producto ${index + 1}`,
      description: String(raw.description || raw.descripcion || raw["Descripción"] || raw["Descripcion"] || "").trim(),
      price: Math.max(0, toNumber(raw.price || raw.precio || raw["Precio"])),
      category: normalizeCategory(raw.category || raw.categoria || raw["Categoría"] || raw["Categoria"]),
      stock: Math.max(0, Math.round(toNumber(raw.stock || raw["Stock"]))),
      imageUrl: String(raw.imageUrl || raw.imagen || raw["URL de imagen"] || raw["Imagen"] || "").trim(),
      visible: normalizeVisible(raw.visible ?? raw.Visible ?? raw["Visible"]),
      updatedAt: raw.updatedAt || raw["Actualizado"] || now
    };
  }

  function getProducts() {
    const products = safeJsonParse(localStorage.getItem(PRODUCT_KEY), null);
    if (Array.isArray(products) && products.length) {
      return products.map(normalizeProduct);
    }
    saveProducts(defaultProducts);
    return defaultProducts;
  }

  function saveProducts(products) {
    const normalized = products.map(normalizeProduct);
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("altaGula:productsChanged", { detail: normalized }));
    return normalized;
  }

  function upsertProduct(product) {
    const products = getProducts();
    const normalized = normalizeProduct({ ...product, id: product.id || uid(product.name), updatedAt: new Date().toISOString() }, products.length);
    const index = products.findIndex((item) => item.id === normalized.id);
    if (index >= 0) products[index] = normalized;
    else products.unshift(normalized);
    return saveProducts(products);
  }

  function deleteProduct(id) {
    return saveProducts(getProducts().filter((product) => product.id !== id));
  }

  function visibleProducts() {
    return getProducts().filter((product) => product.visible);
  }

  function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(current);
        current = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(current);
        if (row.some((cell) => cell.trim() !== "")) rows.push(row);
        row = [];
        current = "";
      } else {
        current += char;
      }
    }

    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    if (!rows.length) return [];

    const headers = rows.shift().map((header) => header.trim());
    return rows.map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (cells[index] || "").trim();
      });
      return record;
    });
  }

  function sheetUrlToCsv(url) {
    const value = String(url || "").trim();
    if (!value) throw new Error("Configurá la URL publicada de Google Sheets.");
    if (value.includes("/pubhtml")) {
      const csvUrl = value.replace("/pubhtml", "/pub").replace(/([?&])output=[^&]+/, "$1output=csv");
      return csvUrl.includes("output=csv") ? csvUrl : `${csvUrl}${csvUrl.includes("?") ? "&" : "?"}output=csv`;
    }
    if (value.includes("/pub?") && !value.includes("output=csv")) {
      return `${value}${value.includes("?") ? "&" : "?"}output=csv`;
    }
    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && value.includes("/edit")) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
    }
    return value;
  }

  async function syncFromSheet(url) {
    const requestUrl = sheetUrlToCsv(url);
    const response = await fetch(requestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}`);

    const text = await response.text();
    const trimmed = text.trim();
    let rows;
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed);
      rows = Array.isArray(json) ? json : (json.products || json.data || []);
    } else {
      rows = parseCsv(text);
    }

    if (!Array.isArray(rows) || !rows.length) {
      throw new Error("La hoja no tiene productos para importar.");
    }

    const products = rows.map(normalizeProduct).filter((product) => product.name);
    if (!products.length) throw new Error("No se encontraron filas válidas.");

    localStorage.setItem(SHEET_URL_KEY, url);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return saveProducts(products);
  }

  function getCart() {
    return safeJsonParse(localStorage.getItem(CART_KEY), []);
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("altaGula:cartChanged", { detail: cart }));
    return cart;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return String(value ?? "").replace(/[&<>"']/g, (char) => map[char]);
  }

  function applyTheme(theme) {
    const selected = theme || localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.dataset.theme = selected;
    localStorage.setItem(THEME_KEY, selected);
    return selected;
  }

  function toggleTheme() {
    return applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  }

  window.AltaGula = {
    PRODUCT_KEY,
    CART_KEY,
    SHEET_URL_KEY,
    LAST_SYNC_KEY,
    THEME_KEY,
    ADMIN_SESSION_KEY,
    categories,
    whatsappNumber,
    defaultProducts,
    uid,
    slugify,
    normalizeProduct,
    getProducts,
    saveProducts,
    upsertProduct,
    deleteProduct,
    visibleProducts,
    parseCsv,
    syncFromSheet,
    sheetUrlToCsv,
    getCart,
    saveCart,
    formatPrice,
    escapeHtml,
    applyTheme,
    toggleTheme
  };

  applyTheme();
})();
