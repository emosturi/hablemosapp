/**
 * Chat de soporte (asesor ↔ platform owners). Requiere sesión y tablas support_chat_* + función support-chat-notify.
 */
(function (global) {
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtTime(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (_e) {
      return "";
    }
  }

  global.prevyInitSupportChat = function (supabase, uid, isOwner, accessToken) {
    if (!supabase || !uid || !accessToken) return;

    var state = {
      threadId: null,
      threads: [],
      selectedThreadId: null,
      channel: null,
      ownerChannel: null,
      open: false,
      unread: 0,
      loading: false,
    };

    var root = document.createElement("div");
    root.id = "prevySupportChatRoot";

    var bubbleWrap = document.createElement("div");
    bubbleWrap.className = "prevy-chat-pointer";
    bubbleWrap.style.cssText = "position:relative;pointer-events:auto;";

    var badge = document.createElement("span");
    badge.className = "prevy-chat-badge";
    badge.setAttribute("data-show", "0");

    var bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = "prevy-chat-bubble";
    bubble.setAttribute("aria-label", "Abrir chat de soporte");
    bubble.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    var panel = document.createElement("div");
    panel.className = "prevy-chat-wrap prevy-chat-pointer";
    panel.setAttribute("data-open", "0");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat de soporte");

    var header = document.createElement("div");
    header.className = "prevy-chat-header";
    var titleEl = document.createElement("h2");
    titleEl.textContent = isOwner ? "Chats de soporte" : "Soporte Prevy";
    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "prevy-chat-close";
    btnClose.setAttribute("aria-label", "Cerrar chat");
    btnClose.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    header.appendChild(titleEl);
    header.appendChild(btnClose);

    var ownerLayout = null;
    var threadListEl = null;
    var mainCol = document.createElement("div");
    mainCol.className = "prevy-chat-main";

    if (isOwner) {
      ownerLayout = document.createElement("div");
      ownerLayout.className = "prevy-chat-owner-layout";
      threadListEl = document.createElement("div");
      threadListEl.className = "prevy-chat-thread-list";
      ownerLayout.appendChild(threadListEl);
      ownerLayout.appendChild(mainCol);
    }

    var messagesEl = document.createElement("div");
    messagesEl.className = "prevy-chat-messages";

    var hint = document.createElement("div");
    hint.className = "prevy-chat-hint";
    hint.textContent = isOwner
      ? "Selecciona un asesor para ver el historial. Las notificaciones push avisan de mensajes nuevos."
      : "Escribe al equipo Prevy. Te responderemos aquí; activa notificaciones para avisos en el teléfono.";

    var compose = document.createElement("div");
    compose.className = "prevy-chat-compose";
    var ta = document.createElement("textarea");
    ta.rows = 2;
    ta.placeholder = "Escribe un mensaje…";
    ta.setAttribute("aria-label", "Mensaje");
    var btnSend = document.createElement("button");
    btnSend.type = "button";
    btnSend.className = "prevy-chat-send";
    btnSend.textContent = "Enviar";
    compose.appendChild(ta);
    compose.appendChild(btnSend);

    mainCol.appendChild(messagesEl);
    mainCol.appendChild(hint);
    mainCol.appendChild(compose);

    if (isOwner) {
      panel.appendChild(header);
      panel.appendChild(ownerLayout);
    } else {
      panel.appendChild(header);
      panel.appendChild(mainCol);
    }

    bubbleWrap.appendChild(badge);
    bubbleWrap.appendChild(bubble);
    root.appendChild(panel);
    root.appendChild(bubbleWrap);
    document.body.appendChild(root);

    function setOpen(v) {
      state.open = !!v;
      panel.setAttribute("data-open", state.open ? "1" : "0");
      bubble.setAttribute("aria-expanded", state.open ? "true" : "false");
      if (state.open) {
        state.unread = 0;
        badge.setAttribute("data-show", "0");
        ta.focus();
      }
    }

    function bumpUnread() {
      if (state.open) return;
      state.unread += 1;
      badge.textContent = state.unread > 9 ? "9+" : String(state.unread);
      badge.setAttribute("data-show", "1");
    }

    function renderMessageRow(m, mine) {
      var div = document.createElement("div");
      div.className = "prevy-chat-msg " + (mine ? "prevy-chat-msg--me" : "prevy-chat-msg--them");
      if (m.id) div.setAttribute("data-msg-id", m.id);
      div.innerHTML = esc(m.body) + '<div class="prevy-chat-msg-meta">' + esc(fmtTime(m.created_at)) + "</div>";
      return div;
    }

    function appendMessageIfNew(m, mine) {
      if (m && m.id && messagesEl.querySelector('[data-msg-id="' + m.id + '"]')) return;
      messagesEl.appendChild(renderMessageRow(m, mine));
      scrollMessagesBottom();
    }

    function clearMessages() {
      messagesEl.innerHTML = "";
    }

    function scrollMessagesBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function notifyPush(messageId) {
      try {
        await fetch(global.location.origin + "/.netlify/functions/support-chat-notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken,
          },
          body: JSON.stringify({ message_id: messageId }),
        });
      } catch (_e) {}
    }

    async function ensureAdvisorThread() {
      var sel = await supabase.from("support_chat_threads").select("id").eq("advisor_user_id", uid).maybeSingle();
      if (sel.error) throw sel.error;
      if (sel.data && sel.data.id) return sel.data.id;
      var ures = await supabase.auth.getUser();
      var email = (ures.data && ures.data.user && ures.data.user.email) || "";
      var ins = await supabase
        .from("support_chat_threads")
        .insert({ advisor_user_id: uid, advisor_email: email })
        .select("id")
        .single();
      if (ins.error) {
        var again = await supabase.from("support_chat_threads").select("id").eq("advisor_user_id", uid).maybeSingle();
        if (again.data && again.data.id) return again.data.id;
        throw ins.error;
      }
      return ins.data.id;
    }

    async function loadMessages(tid) {
      clearMessages();
      messagesEl.innerHTML = '<div class="prevy-chat-loading">Cargando…</div>';
      var res = await supabase
        .from("support_chat_messages")
        .select("id, sender_user_id, body, created_at")
        .eq("thread_id", tid)
        .order("created_at", { ascending: true })
        .limit(200);
      clearMessages();
      if (res.error) {
        messagesEl.innerHTML = '<div class="prevy-chat-loading">No se pudieron cargar los mensajes.</div>';
        return;
      }
      (res.data || []).forEach(function (m) {
        appendMessageIfNew(m, m.sender_user_id === uid);
      });
    }

    function renderOwnerThreadList() {
      if (!threadListEl) return;
      threadListEl.innerHTML = "";
      state.threads.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "prevy-chat-thread-btn";
        b.setAttribute("data-active", t.id === state.selectedThreadId ? "1" : "0");
        var label = t.advisor_email || t.advisor_user_id || "Asesor";
        b.textContent = label.length > 40 ? label.slice(0, 37) + "…" : label;
        b.title = label;
        b.addEventListener("click", function () {
          state.selectedThreadId = t.id;
          state.threadId = t.id;
          renderOwnerThreadList();
          loadMessages(t.id);
        });
        threadListEl.appendChild(b);
      });
    }

    async function loadOwnerThreads() {
      var res = await supabase
        .from("support_chat_threads")
        .select("id, advisor_user_id, advisor_email, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (res.error) return;
      state.threads = res.data || [];
      renderOwnerThreadList();
      if (!state.selectedThreadId && state.threads.length) {
        state.selectedThreadId = state.threads[0].id;
        state.threadId = state.selectedThreadId;
        await loadMessages(state.threadId);
      }
    }

    function subscribeAdvisor() {
      if (!state.threadId || state.channel) return;
      state.channel = supabase
        .channel("prevy-sc-thread-" + state.threadId)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "support_chat_messages",
            filter: "thread_id=eq." + state.threadId,
          },
          function (payload) {
            var row = payload.new;
            if (!row) return;
            if (row.sender_user_id !== uid) bumpUnread();
            appendMessageIfNew(row, row.sender_user_id === uid);
          }
        )
        .subscribe();
    }

    function subscribeOwner() {
      if (state.ownerChannel) return;
      state.ownerChannel = supabase
        .channel("prevy-sc-owner-all")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "support_chat_messages" },
          function (payload) {
            var row = payload.new;
            if (!row) return;
            if (row.sender_user_id === uid) {
              if (row.thread_id === state.selectedThreadId) appendMessageIfNew(row, true);
              loadOwnerThreads();
              return;
            }
            bumpUnread();
            loadOwnerThreads();
            if (row.thread_id === state.selectedThreadId) appendMessageIfNew(row, false);
          }
        )
        .subscribe();
    }

    async function bootstrap() {
      try {
        if (isOwner) {
          await loadOwnerThreads();
          subscribeOwner();
        } else {
          state.threadId = await ensureAdvisorThread();
          subscribeAdvisor();
          await loadMessages(state.threadId);
        }
      } catch (e) {
        hint.textContent = "No se pudo iniciar el chat. Comprueba la migración SQL y tu conexión.";
      }
    }

    async function send() {
      var text = (ta.value || "").trim();
      if (!text || state.loading) return;
      var tid = state.threadId;
      if (isOwner && !state.selectedThreadId) {
        hint.textContent = "Selecciona primero un asesor en la lista.";
        return;
      }
      if (isOwner) tid = state.selectedThreadId;
      if (!tid) return;

      state.loading = true;
      btnSend.disabled = true;
      var ins = await supabase
        .from("support_chat_messages")
        .insert({ thread_id: tid, sender_user_id: uid, body: text })
        .select("id, sender_user_id, body, created_at")
        .single();
      state.loading = false;
      btnSend.disabled = false;

      if (ins.error) {
        hint.textContent = ins.error.message || "No se pudo enviar.";
        return;
      }
      hint.textContent = isOwner
        ? "Selecciona un asesor para ver el historial. Las notificaciones push avisan de mensajes nuevos."
        : "Escribe al equipo Prevy. Te responderemos aquí; activa notificaciones para avisos en el teléfono.";
      ta.value = "";
      if (ins.data) {
        appendMessageIfNew(ins.data, true);
        notifyPush(ins.data.id);
      }
      if (isOwner) loadOwnerThreads();
    }

    bubble.addEventListener("click", function () {
      setOpen(!state.open);
    });
    btnClose.addEventListener("click", function () {
      setOpen(false);
    });
    btnSend.addEventListener("click", send);
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    function checkHash() {
      if ((global.location.hash || "").replace(/^#/, "") === "prevy-support-chat") {
        setOpen(true);
      }
    }
    global.addEventListener("hashchange", checkHash);
    checkHash();

    bootstrap();
  };
})(window);
