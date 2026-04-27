/**
 * Banner de consentimiento: términos, cookies y tratamiento de datos (Chile).
 * - Con sesión Supabase, el estado en asesor_legal_consent manda: si no hay fila o la versión
 *   no coincide, se limpia localStorage y se vuelve a mostrar el banner (revocar en BD = re-prompt).
 * - Al aceptar: localStorage + upsert en Supabase (único lugar que recrea fila sin fila previa).
 * Al cambiar el texto legal, incrementar LEGAL_CONSENT_VERSION.
 */
(function () {
  var LEGAL_CONSENT_VERSION = "2026-04-24";
  var STORAGE_KEY = "prevy_legal_consent";
  var CONSENT_TABLE = "asesor_legal_consent";

  window.PREVY_LEGAL_CONSENT_VERSION = LEGAL_CONSENT_VERSION;

  function termsHref() {
    try {
      return new URL("terminos-condiciones.html", window.location.href).href;
    } catch (_e) {
      return "/terminos-condiciones.html";
    }
  }

  function getStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      return o;
    } catch (_e) {
      return null;
    }
  }

  function needsBanner() {
    var s = getStored();
    if (!s || !s.version) return true;
    return String(s.version) !== LEGAL_CONSENT_VERSION;
  }

  function getSupabaseClient() {
    var url = window.SUPABASE_URL;
    var key = window.SUPABASE_ANON_KEY;
    if (!url || !key || String(url).indexOf("TU_PROYECTO") !== -1) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    if (typeof window.createPrevySupabaseClient !== "function") return null;
    return window.createPrevySupabaseClient(url, key);
  }

  /**
   * Con sesión: alinea localStorage con asesor_legal_consent. Sin fila o versión distinta → borra local.
   * Con fila vigente y local vacío/desactualizado → rellena local desde el servidor.
   */
  function reconcileLegalConsent(done) {
    done = typeof done === "function" ? done : function () {};
    var client = getSupabaseClient();
    if (!client) {
      done();
      return;
    }
    client.auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      if (!sess || !sess.user) {
        done();
        return;
      }
      client
        .from(CONSENT_TABLE)
        .select("terms_version, accepted_at")
        .eq("user_id", sess.user.id)
        .maybeSingle()
        .then(function (res) {
          if (res && res.error) {
            done();
            return;
          }
          var row = res && res.data;
          var serverOk = row && String(row.terms_version) === LEGAL_CONSENT_VERSION;

          if (!serverOk) {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch (_e) {}
            done();
            return;
          }

          var local = getStored();
          var localOk = local && String(local.version) === LEGAL_CONSENT_VERSION;
          if (!localOk) {
            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                  version: LEGAL_CONSENT_VERSION,
                  acceptedAt: (row.accepted_at && String(row.accepted_at)) || new Date().toISOString(),
                })
              );
            } catch (_e) {}
          }
          done();
        })
        .catch(function () {
          done();
        });
    });
  }

  /** Solo tras clic en Aceptar (local ya guardado con versión vigente). */
  function pushLegalConsentToServer(done) {
    done = typeof done === "function" ? done : function () {};
    var stored = getStored();
    if (!stored || String(stored.version) !== LEGAL_CONSENT_VERSION) {
      done();
      return;
    }
    var client = getSupabaseClient();
    if (!client) {
      done();
      return;
    }
    client.auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      if (!sess || !sess.user) {
        done();
        return;
      }
      var acceptedAt = stored.acceptedAt || new Date().toISOString();
      client
        .from(CONSENT_TABLE)
        .upsert(
          {
            user_id: sess.user.id,
            terms_version: LEGAL_CONSENT_VERSION,
            accepted_at: acceptedAt,
          },
          { onConflict: "user_id" }
        )
        .then(function (res) {
          if (res && res.error) {
            try {
              console.warn("[prevy legal-consent]", res.error.message || res.error);
            } catch (_e) {}
          }
          done();
        })
        .catch(function () {
          done();
        });
    });
  }

  /** Tras login: alinear con BD antes de seguir (no recrea fila borrada desde localStorage). */
  window.prevySyncLegalConsentToServer = reconcileLegalConsent;

  function scheduleReconcileAndMaybeBanner() {
    function afterReconcile() {
      if (needsBanner()) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", showBanner);
        } else {
          showBanner();
        }
      } else {
        removeBanner();
      }
    }
    function run() {
      reconcileLegalConsent(afterReconcile);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function once() {
        document.removeEventListener("DOMContentLoaded", once);
        setTimeout(run, 0);
      });
    } else {
      setTimeout(run, 0);
    }
  }
  scheduleReconcileAndMaybeBanner();

  function removeBanner() {
    var el = document.getElementById("prevy-legal-consent-banner");
    if (el) el.remove();
    document.documentElement.classList.remove("prevy-legal-consent-open");
  }

  function accept() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: LEGAL_CONSENT_VERSION,
          acceptedAt: new Date().toISOString(),
        })
      );
    } catch (_e) {}
    removeBanner();
    pushLegalConsentToServer(function () {});
  }

  function injectStyles() {
    if (document.getElementById("prevy-legal-consent-styles")) return;
    var st = document.createElement("style");
    st.id = "prevy-legal-consent-styles";
    st.textContent =
      "#prevy-legal-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:10050;" +
      "padding:14px 16px calc(14px + env(safe-area-inset-bottom,0));" +
      "background:var(--card,#fff);color:var(--text,#0f2a2e);" +
      "border-top:1px solid var(--border,#c0dde1);box-shadow:0 -8px 32px rgba(0,0,0,.12);" +
      "font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.45;}" +
      "html[data-theme='dark'] #prevy-legal-consent-banner{background:var(--card,#1c2629);border-top-color:var(--border,#2f4248);}" +
      "#prevy-legal-consent-banner .prevy-legal-inner{max-width:920px;margin:0 auto;display:flex;" +
      "flex-wrap:wrap;align-items:flex-end;gap:12px 16px;justify-content:space-between;}" +
      "#prevy-legal-consent-banner .prevy-legal-text{flex:1 1 280px;margin:0;}" +
      "#prevy-legal-consent-banner .prevy-legal-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}" +
      "#prevy-legal-consent-banner a{color:var(--primary-mid,#019391);font-weight:600;text-decoration:underline;}" +
      "#prevy-legal-consent-banner a:hover{opacity:.9;}" +
      "#prevy-legal-consent-banner button.prevy-legal-accept{" +
      "padding:10px 18px;border:none;border-radius:12px;font-weight:600;font-size:14px;cursor:pointer;" +
      "font-family:inherit;background:var(--primary,#00606c);color:#fff;}" +
      "#prevy-legal-consent-banner button.prevy-legal-accept:hover{filter:brightness(1.05);}" +
      "html.prevy-legal-consent-open body{padding-bottom:calc(8rem + env(safe-area-inset-bottom,0));}";
    document.head.appendChild(st);
  }

  function showBanner() {
    if (!needsBanner()) return;
    if (document.getElementById("prevy-legal-consent-banner")) return;

    injectStyles();

    var wrap = document.createElement("div");
    wrap.id = "prevy-legal-consent-banner";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "false");
    wrap.setAttribute("aria-labelledby", "prevy-legal-consent-title");

    var inner = document.createElement("div");
    inner.className = "prevy-legal-inner";

    var p = document.createElement("p");
    p.className = "prevy-legal-text";
    p.id = "prevy-legal-consent-title";
    p.innerHTML =
      "Usamos cookies y datos técnicos necesarios para el funcionamiento del sitio. " +
      "Al continuar, confirmas que leíste y aceptas los " +
      '<a href="' +
      termsHref() +
      '" target="_blank" rel="noopener noreferrer">Términos y Condiciones</a>' +
      ", incluido el tratamiento de tus datos de contacto y, cuando lo autorices, de geolocalización " +
      "para ponerte en contacto con potenciales clientes a través de <strong>buscoasesor.cl</strong> " +
      "y mejorar la experiencia, conforme a la normativa chilena vigente en materia de datos personales.";

    var actions = document.createElement("div");
    actions.className = "prevy-legal-actions";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prevy-legal-accept";
    btn.textContent = "Acepto términos, cookies y tratamiento indicado";
    btn.addEventListener("click", accept);

    actions.appendChild(btn);
    inner.appendChild(p);
    inner.appendChild(actions);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    document.documentElement.classList.add("prevy-legal-consent-open");
  }
})();
