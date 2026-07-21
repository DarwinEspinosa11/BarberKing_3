/**
 * i18n.js — Sistema de traducción frontend para BarberKing.
 *
 * Uso:
 *   - Añadir data-i18n="clave" a elementos HTML para traducir su textContent.
 *   - Añadir data-i18n-html="clave" para traducir innerHTML (cuando hay <strong>, <br>, etc.).
 *   - Añadir data-i18n-placeholder="clave" para traducir el placeholder de inputs.
 *   - El idioma se guarda en localStorage("bk_lang") y persiste entre sesiones.
 *
 * Para contenido dinámico (generado por JS después de la carga):
 *   - Los nuevos nodos se traducen automáticamente vía MutationObserver.
 *   - O llamar window.i18n.apply() manualmente tras inyectar HTML.
 *   - window.i18n.t("clave") devuelve la traducción de una clave.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "bk_lang";
  const DEFAULT_LANG = "es";
  const SUPPORTED_LANGS = ["es", "gl"];

  let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  if (!SUPPORTED_LANGS.includes(currentLang)) currentLang = DEFAULT_LANG;

  let translations = {};
  let loaded = false;
  let pendingNodes = []; // Nodos insertados antes de que el JSON cargue

  /**
   * Carga el archivo JSON de traducciones para el idioma dado.
   */
  async function loadTranslations(lang) {
    try {
      const res = await fetch(`/static/i18n/${lang}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      translations = await res.json();
      loaded = true;
    } catch (err) {
      console.error(`[i18n] Error cargando ${lang}.json:`, err);
      if (lang !== DEFAULT_LANG) {
        await loadTranslations(DEFAULT_LANG);
      }
    }
  }

  /**
   * Traduce un solo elemento según sus atributos data-i18n.
   */
  function translateSingleElement(el) {
    if (!el.hasAttribute) return;
    if (el.hasAttribute("data-i18n")) {
      const key = el.getAttribute("data-i18n");
      if (translations[key] !== undefined) el.textContent = translations[key];
    }
    if (el.hasAttribute("data-i18n-html")) {
      const key = el.getAttribute("data-i18n-html");
      if (translations[key] !== undefined) el.innerHTML = translations[key];
    }
    if (el.hasAttribute("data-i18n-placeholder")) {
      const key = el.getAttribute("data-i18n-placeholder");
      if (translations[key] !== undefined) el.setAttribute("placeholder", translations[key]);
    }
  }

  /**
   * Aplica las traducciones a todos los elementos con atributos data-i18n
   * dentro de un scope (por defecto: todo el documento).
   */
  function applyTranslations(root) {
    if (!loaded) return;
    const scope = root || document;

    scope.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (translations[key] !== undefined) el.textContent = translations[key];
    });

    scope.querySelectorAll("[data-i18n-html]").forEach(el => {
      const key = el.getAttribute("data-i18n-html");
      if (translations[key] !== undefined) el.innerHTML = translations[key];
    });

    scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (translations[key] !== undefined) el.setAttribute("placeholder", translations[key]);
    });

    // Actualizar lang del <html>
    document.documentElement.lang = currentLang;

    // Actualizar estado visual de botones de idioma
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.classList.toggle("lang-btn--active", btn.dataset.lang === currentLang);
      btn.setAttribute("aria-pressed", btn.dataset.lang === currentLang ? "true" : "false");
    });
  }

  /**
   * Traduce un nodo recién añadido al DOM (el propio + sus hijos).
   */
  function translateNode(node) {
    if (!loaded) {
      // Si aún no cargó el JSON, guardar para luego
      pendingNodes.push(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    translateSingleElement(node);
    // Traducir hijos que tengan data-i18n
    if (node.querySelectorAll) {
      node.querySelectorAll("[data-i18n], [data-i18n-html], [data-i18n-placeholder]").forEach(translateSingleElement);
    }
  }

  /**
   * Procesa los nodos pendientes que se insertaron antes de que cargara el JSON.
   */
  function processPendingNodes() {
    pendingNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        translateSingleElement(node);
        if (node.querySelectorAll) {
          node.querySelectorAll("[data-i18n], [data-i18n-html], [data-i18n-placeholder]").forEach(translateSingleElement);
        }
      }
    });
    pendingNodes = [];
  }

  /**
   * MutationObserver: detecta nodos nuevos con data-i18n y los traduce.
   */
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            translateNode(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Cambia el idioma, guarda en localStorage y re-aplica traducciones.
   */
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    await loadTranslations(lang);
    applyTranslations();
  }

  /**
   * Inicializa el sistema i18n.
   */
  async function init() {
    // Iniciar el observer ANTES de cargar el JSON para capturar nodos dinámicos
    startObserver();

    // Cargar traducciones
    await loadTranslations(currentLang);

    // Aplicar a todo el documento (cubre lo que ya estaba en el HTML)
    applyTranslations();

    // Procesar nodos que se insertaron durante el fetch
    processPendingNodes();

    // Escuchar clics en botones de idioma
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".lang-btn");
      if (btn && btn.dataset.lang) {
        setLanguage(btn.dataset.lang);
      }
    });
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exponer API global
  window.i18n = {
    setLanguage,
    apply: applyTranslations,
    translate: translateNode,
    getCurrentLang: () => currentLang,
    t: (key) => (loaded && translations[key] !== undefined) ? translations[key] : key
  };
})();
