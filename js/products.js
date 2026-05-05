(function () {
  "use strict";

  const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtysB1M_oNpuXveauerVx3N7ujqdVXBAkkc4uw4cTXmCsNl6_flTMNLERs3PSE_EibVjNbpuYPVIX1/pub?output=csv";

  const categories = ["Golosinas", "Chocolates", "Bebidas", "Snacks", "Combos"];
  const whatsappNumber = "5493464000000";
  let cart = [];

  function slugify(value) {
    return String(value || "producto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "producto";
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
    return !["no", "false", "0", "oculto", "hidden", "inactivo"].includes(normalized);
  }

  function normalizeCategory(value) {
    const match = categories.find((category) => category.toLowerCase() === String(value || "").trim().toLowerCase());
    return match || categories[0];
  }

  function normalizeProduct(raw, index) {
    const name = String(raw.name || raw.nombre || raw["Nombre del elemento"] || raw["Nombre del producto"] || raw["Nombre"] || "").trim();
    const stockValue = raw.stock ?? raw.Stock;
    const status = String(raw.status || raw.estado || raw.Estado || "").trim();
    const normalizedStatus = status.toLowerCase();
    const stockIsManaged = typeof raw.stockManaged === "boolean" ? raw.stockManaged : String(stockValue ?? "").trim() !== "";
    const stock = stockIsManaged
      ? Math.max(0, Math.round(toNumber(stockValue)))
      : (normalizedStatus.includes("sin stock") || normalizedStatus.includes("agotado") ? 0 : 999);
    const now = new Date().toISOString();

    return {
      id: String(raw.id || raw.ID || raw["ID de artículo"] || raw["ID de articulo"] || slugify(name) || `producto-${index + 1}`),
      name: name || `Producto ${index + 1}`,
      description: String(raw.description || raw.descripcion || raw["Descripción"] || raw["Descripcion"] || "").trim(),
      price: Math.max(0, toNumber(raw.price || raw.precio || raw["Precio"])),
      category: normalizeCategory(raw.category || raw.categoria || raw["Tipo"] || raw["Categoría"] || raw["Categoria"]),
      stock,
      stockManaged: stockIsManaged,
      imageUrl: String(raw.imageUrl || raw.imagen || raw["Fotos del producto"] || raw["URL de imagen"] || raw["Imagen"] || "").trim(),
      visible: normalizeVisible(raw.visible ?? raw.Visible ?? raw["Visible"] ?? status),
      updatedAt: raw.updatedAt || raw["Actualizado"] || now
    };
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
    const value = String(url || DEFAULT_SHEET_URL).trim();
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
      return DEFAULT_SHEET_URL;
    }
    return value;
  }

  async function syncFromSheet(url = DEFAULT_SHEET_URL) {
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

    return products;
  }

  function getCart() {
    return cart;
  }

  function saveCart(nextCart) {
    cart = nextCart;
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

  function applyTheme() {
    document.documentElement.dataset.theme = "dark";
    return "dark";
  }

  window.AltaGula = {
    DEFAULT_SHEET_URL,
    categories,
    whatsappNumber,
    slugify,
    normalizeProduct,
    parseCsv,
    syncFromSheet,
    sheetUrlToCsv,
    getCart,
    saveCart,
    formatPrice,
    escapeHtml,
    applyTheme
  };

  applyTheme();
})();
