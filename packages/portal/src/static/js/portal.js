/**
 * LemonLDAP::NG Portal JavaScript
 * Translation and UI utilities
 */

(function () {
  "use strict";

  // Translation storage
  let translationFields = {};
  let currentLanguage = "en";

  // Available languages (will be set from server)
  const availableLanguages = window.availableLanguages || ["en", "fr"];

  /**
   * Translate a single string
   * @param {string} str - Key to translate
   * @returns {string} Translated string or original if not found
   */
  function translate(str) {
    return translationFields[str] || str;
  }

  /**
   * Load language file and translate the page
   * @param {string} lang - Language code (e.g., 'en', 'fr')
   * @returns {Promise}
   */
  function translatePage(lang) {
    if (lang) {
      currentLanguage = lang;
    } else {
      lang = currentLanguage;
    }

    const staticPrefix = window.staticPrefix || "/static/";

    return fetch(`${staticPrefix}languages/${lang}.json`)
      .then((response) => {
        if (!response.ok) {
          console.warn(
            `Language file ${lang}.json not found, falling back to en`,
          );
          if (lang !== "en") {
            return fetch(`${staticPrefix}languages/en.json`);
          }
          throw new Error("Language file not found");
        }
        return response;
      })
      .then((response) => response.json())
      .then((data) => {
        translationFields = data;

        // Apply translation overrides if provided
        if (window.datas && window.datas.trOver) {
          if (window.datas.trOver.all) {
            Object.assign(translationFields, window.datas.trOver.all);
          }
          if (window.datas.trOver[lang]) {
            Object.assign(translationFields, window.datas.trOver[lang]);
          }
        }

        // Translate all elements with trspan attribute
        document.querySelectorAll("[trspan]").forEach((el) => {
          const args = el.getAttribute("trspan").split(",");
          let txt = translate(args.shift());
          args.forEach((v) => {
            txt = txt.replace(/%[sd]/, v);
          });
          el.innerHTML = txt;
        });

        // Translate all elements with trmsg attribute (portal error messages)
        document.querySelectorAll("[trmsg]").forEach((el) => {
          const msgNum = el.getAttribute("trmsg");
          const msg = translate(`PE${msgNum}`);
          el.innerHTML = msg;
          // Hide element if message contains _hide_
          if (msg.includes("_hide_")) {
            const parent = el.parentElement;
            if (parent) parent.style.display = "none";
          }
        });

        // Translate all elements with trplaceholder attribute
        document.querySelectorAll("[trplaceholder]").forEach((el) => {
          const tmp = translate(el.getAttribute("trplaceholder"));
          el.setAttribute("placeholder", tmp);
          el.setAttribute("aria-label", tmp);
        });

        // Translate all elements with trattribute attribute
        document.querySelectorAll("[trattribute]").forEach((el) => {
          const trattributes = el
            .getAttribute("trattribute")
            .trim()
            .split(/\s+/);
          trattributes.forEach((trattr) => {
            const [attribute, value] = trattr.split(":");
            if (attribute && value) {
              el.setAttribute(attribute, translate(value));
            }
          });
        });

        // Convert localtime timestamps
        document.querySelectorAll("[localtime]").forEach((el) => {
          const timestamp = parseInt(el.getAttribute("localtime"), 10);
          const d = new Date(timestamp * 1000);
          el.textContent = d.toLocaleString();
        });
      })
      .catch((err) => {
        console.error("Translation error:", err);
      });
  }

  /**
   * Set a cookie
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {number} exdays - Expiration in days
   */
  function setCookie(name, value, exdays) {
    const samesite = (window.datas && window.datas.sameSite) || "Lax";
    const secure = window.datas && window.datas.cookieSecure;
    let cookiestring = `${name}=${value}; path=/; SameSite=${samesite}`;

    if (exdays) {
      const d = new Date();
      d.setTime(d.getTime() + exdays * 86400000);
      cookiestring += `; expires=${d.toUTCString()}`;
    }

    if (secure) {
      cookiestring += "; Secure";
    }

    document.cookie = cookiestring;
  }

  /**
   * Get URL query parameter
   * @param {string} name - Parameter name
   * @returns {string|null}
   */
  function getQueryParam(name) {
    const match = RegExp("[?&]" + name + "=([^&]*)").exec(
      window.location.search,
    );
    return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
  }

  /**
   * Build language selector icons
   */
  function buildLanguageSelector() {
    const langDiv = document.getElementById("languages");
    if (!langDiv) return;

    const staticPrefix = window.staticPrefix || "/static/";
    let html = "";

    availableLanguages.forEach((lang) => {
      html += `<img class="langicon" src="${staticPrefix}common/${lang}.png" title="${lang}" alt="[${lang}]" style="cursor:pointer;margin:2px;"> `;
    });

    langDiv.innerHTML = html;

    // Add click handlers
    langDiv.querySelectorAll(".langicon").forEach((img) => {
      img.addEventListener("click", function () {
        const lang = this.getAttribute("title");
        setCookie("llnglanguage", lang, 3650);
        translatePage(lang);
      });
    });
  }

  /**
   * Get initialization data from script tags
   * @returns {object}
   */
  function getValues() {
    const values = {};
    document
      .querySelectorAll('script[type="application/init"]')
      .forEach((script) => {
        try {
          const tmp = JSON.parse(script.textContent);
          Object.assign(values, tmp);
        } catch (e) {
          console.error("Parsing error", e);
        }
      });
    return values;
  }

  /**
   * Initialize portal
   */
  function init() {
    // Get initialization data
    window.datas = getValues();

    // Determine language
    let lang = getQueryParam("llnglanguage");
    const setCookieLang = getQueryParam("setCookieLang");

    if (!lang && window.datas && window.datas.language) {
      lang = window.datas.language;
    }

    if (!lang) {
      lang = "en";
    }

    // Check if language is available
    if (!availableLanguages.includes(lang)) {
      lang = "en";
    }

    // Set cookie if requested
    if (setCookieLang && lang) {
      setCookie("llnglanguage", lang, 3650);
    }

    // Set static prefix
    window.staticPrefix = window.staticPrefix || "/static/";

    // Build language selector
    buildLanguageSelector();

    // Translate page
    translatePage(lang);

    // Set timezone in forms
    const tzInput = document.querySelector("input[name=timezone]");
    if (tzInput) {
      tzInput.value = -(new Date().getTimezoneOffset() / 60);
    }

    // Fade in messages
    document.querySelectorAll("div.message").forEach((el) => {
      el.style.opacity = "0";
      el.style.display = "block";
      let opacity = 0;
      const fadeIn = setInterval(() => {
        opacity += 0.1;
        el.style.opacity = opacity;
        if (opacity >= 1) clearInterval(fadeIn);
      }, 50);
    });

    // Trigger custom event
    document.dispatchEvent(new CustomEvent("portalLoaded"));
  }

  // Export functions
  window.translate = translate;
  window.translatePage = translatePage;
  window.setCookie = setCookie;
  window.getQueryParam = getQueryParam;

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
