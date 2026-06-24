/**
 * Sincronización offline: caché de clientes, cola de guardado, replay a Supabase.
 */
(function (global) {
  var handlers = { pensionMerge: null };
  var syncing = false;

  function isOnline() {
    return global.navigator ? global.navigator.onLine !== false : true;
  }

  function newLocalId() {
    if (global.crypto && global.crypto.randomUUID) return "local_" + global.crypto.randomUUID();
    return "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  global.prevyOfflineRegisterHandlers = function (h) {
    handlers = Object.assign(handlers, h || {});
  };

  global.prevyOfflineIsOnline = isOnline;

  global.prevyOfflineGetClient = function (id) {
    if (!global.prevyOfflineStore) return Promise.resolve(null);
    return global.prevyOfflineStore.getClient(id);
  };

  global.prevyOfflineGetClientsForList = function (userId) {
    if (!global.prevyOfflineStore) return Promise.resolve([]);
    return global.prevyOfflineStore.getClientsByUser(userId);
  };

  global.prevyOfflineRefreshCache = function (supabase, userId) {
    if (!isOnline() || !supabase || !userId || !global.prevyOfflineStore) {
      return Promise.resolve({ ok: false, reason: "skip" });
    }
    return supabase
      .from("clientes")
      .select("*")
      .eq("user_id", userId)
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        return global.prevyOfflineStore.putClientsBulk(rows, userId).then(function () {
          return global.prevyOfflineStore.setMeta("lastCacheAt_" + userId, new Date().toISOString()).then(function () {
            return { ok: true, count: rows.length };
          });
        });
      });
  };

  function mergePensionRow(existing, incoming, formData) {
    if (typeof handlers.pensionMerge === "function") {
      return handlers.pensionMerge(existing, incoming, formData || {});
    }
    if (!existing) return Object.assign({}, incoming);
    return Object.assign({}, existing, incoming);
  }

  global.prevyOfflineSavePension = function (opts) {
    opts = opts || {};
    var store = global.prevyOfflineStore;
    if (!store) return Promise.reject(new Error("Almacén offline no disponible"));
    var userId = opts.userId;
    var clientId = opts.clientId || null;
    var incoming = opts.incomingRow;
    var formData = opts.formData || {};
    if (!userId || !incoming || !incoming.rut) {
      return Promise.reject(new Error("Faltan datos para guardar offline (RUT obligatorio)."));
    }

    return Promise.resolve()
      .then(function () {
        if (clientId) return store.getClient(clientId);
        return store.getClientsByUser(userId).then(function (list) {
          var rut = incoming.rut;
          for (var i = 0; i < list.length; i++) {
            if (list[i].rut === rut) return list[i];
          }
          return null;
        });
      })
      .then(function (existing) {
        var id = (existing && existing.id) || clientId || newLocalId();
        var merged = mergePensionRow(existing, incoming, formData);
        merged.id = id;
        merged.user_id = userId;
        merged.pendingSync = true;
        merged.localOnly = !!(existing && existing.localOnly) || String(id).indexOf("local_") === 0;
        return store.putClient(merged).then(function () {
          return store.addPending({
            op: "pension_upsert",
            userId: userId,
            clientId: id,
            incomingRow: incoming,
            formData: formData,
          });
        }).then(function () {
          global.dispatchEvent(new CustomEvent("prevy-offline-changed"));
          return { ok: true, clientId: id, localOnly: merged.localOnly };
        });
      });
  };

  global.prevyOfflineSaveEditar = function (opts) {
    opts = opts || {};
    var store = global.prevyOfflineStore;
    if (!store) return Promise.reject(new Error("Almacén offline no disponible"));
    var userId = opts.userId;
    var clientId = opts.clientId;
    var patch = opts.row;
    if (!userId || !clientId || !patch) {
      return Promise.reject(new Error("Faltan datos para guardar offline."));
    }
    return store.getClient(clientId).then(function (existing) {
      if (!existing) {
        return Promise.reject(new Error("Cliente no encontrado en este dispositivo. Ábrelo con conexión al menos una vez."));
      }
      var merged = Object.assign({}, existing, patch);
      merged.id = clientId;
      merged.user_id = userId;
      merged.pendingSync = true;
      return store.putClient(merged).then(function () {
        return store.addPending({
          op: "editar_update",
          userId: userId,
          clientId: clientId,
          row: patch,
        });
      }).then(function () {
        global.dispatchEvent(new CustomEvent("prevy-offline-changed"));
        return { ok: true, clientId: clientId };
      });
    });
  };

  function syncOnePensionUpsert(supabase, item) {
    var incoming = item.incomingRow;
    var formData = item.formData || {};
    var uid = item.userId;
    return supabase.auth.getSession().then(function (sess) {
      var session = sess && sess.data && sess.data.session;
      if (!session) throw new Error("Sesión expirada. Inicia sesión para sincronizar.");
      return supabase
        .from("clientes")
        .select("*")
        .eq("user_id", uid)
        .eq("rut", incoming.rut)
        .maybeSingle()
        .then(function (fetchRes) {
          if (fetchRes.error) throw fetchRes.error;
          var merged = mergePensionRow(fetchRes.data, incoming, formData);
          merged.user_id = uid;
          if (fetchRes.data && fetchRes.data.id) merged.id = fetchRes.data.id;
          else if (item.clientId && String(item.clientId).indexOf("local_") !== 0) {
            merged.id = item.clientId;
          } else {
            delete merged.id;
          }
          return supabase.from("clientes").upsert(merged, { onConflict: "user_id,rut" }).select().single();
        })
        .then(function (upRes) {
          if (upRes.error) throw upRes.error;
          var serverRow = upRes.data;
          var oldLocalId = item.clientId;
          var store = global.prevyOfflineStore;
          var chain = Promise.resolve();
          if (oldLocalId && serverRow && oldLocalId !== serverRow.id) {
            chain = store.deleteClient(oldLocalId);
          }
          if (serverRow) {
            serverRow.pendingSync = false;
            serverRow.localOnly = false;
            chain = chain.then(function () {
              return store.putClient(serverRow);
            });
          }
          return chain.then(function () {
            return store.removePending(item.id);
          });
        });
    });
  }

  function syncOneEditarUpdate(supabase, item) {
    return supabase
      .from("clientes")
      .update(item.row)
      .eq("id", item.clientId)
      .select()
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        var store = global.prevyOfflineStore;
        if (res.data) {
          res.data.pendingSync = false;
          res.data.localOnly = false;
          return store.putClient(res.data);
        }
        return null;
      })
      .then(function () {
        return global.prevyOfflineStore.removePending(item.id);
      });
  }

  global.prevyOfflineSyncPending = function (supabase, userId) {
    if (!isOnline() || !supabase || !userId || !global.prevyOfflineStore) {
      return Promise.resolve({ ok: false, reason: "offline", synced: 0 });
    }
    if (syncing) return Promise.resolve({ ok: false, reason: "busy", synced: 0 });
    syncing = true;
    return global.prevyOfflineStore
      .getAllPending()
      .then(function (items) {
        items = (items || []).filter(function (it) {
          return it.userId === userId;
        });
        var synced = 0;
        var errors = [];
        function next(i) {
          if (i >= items.length) {
            syncing = false;
            global.dispatchEvent(new CustomEvent("prevy-offline-changed"));
            return { ok: errors.length === 0, synced: synced, errors: errors };
          }
          var it = items[i];
          var p;
          if (it.op === "pension_upsert") p = syncOnePensionUpsert(supabase, it);
          else if (it.op === "editar_update") p = syncOneEditarUpdate(supabase, it);
          else p = global.prevyOfflineStore.removePending(it.id);
          return p
            .then(function () {
              synced += 1;
              return next(i + 1);
            })
            .catch(function (err) {
              errors.push({ id: it.id, message: err && err.message ? err.message : String(err) });
              return next(i + 1);
            });
        }
        return next(0);
      })
      .catch(function (err) {
        syncing = false;
        throw err;
      });
  };

  global.prevyOfflineInit = function (supabase, userId) {
    if (!supabase || !userId) return;
    function onOnline() {
      global.prevyOfflineRefreshCache(supabase, userId).catch(function () {});
      global.prevyOfflineSyncPending(supabase, userId).catch(function () {});
    }
    if (isOnline()) onOnline();
    global.addEventListener("online", onOnline);
  };
})(window);
