/**
 * IndexedDB: caché de clientes y cola de sincronización offline.
 */
(function (global) {
  var DB_NAME = "prevy-offline-v1";
  var DB_VERSION = 1;

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB no disponible"));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error || new Error("No se pudo abrir IndexedDB"));
      };
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains("clients")) {
          var cs = db.createObjectStore("clients", { keyPath: "id" });
          cs.createIndex("user_id", "user_id", { unique: false });
          cs.createIndex("rut", "rut", { unique: false });
          cs.createIndex("pendingSync", "pendingSync", { unique: false });
        }
        if (!db.objectStoreNames.contains("pending")) {
          db.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
    return dbPromise;
  }

  function tx(storeNames, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeNames, mode);
    });
  }

  function promisifyRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("Error IndexedDB"));
      };
    });
  }

  global.prevyOfflineStore = {
    putClient: function (row) {
      if (!row || !row.id) return Promise.reject(new Error("Cliente sin id"));
      row._offlineUpdatedAt = new Date().toISOString();
      return tx(["clients"], "readwrite").then(function (t) {
        return promisifyRequest(t.objectStore("clients").put(row));
      });
    },

    getClient: function (id) {
      if (!id) return Promise.resolve(null);
      return tx(["clients"], "readonly").then(function (t) {
        return promisifyRequest(t.objectStore("clients").get(id));
      });
    },

    getClientsByUser: function (userId) {
      if (!userId) return Promise.resolve([]);
      return tx(["clients"], "readonly").then(function (t) {
        var idx = t.objectStore("clients").index("user_id");
        return promisifyRequest(idx.getAll(userId));
      });
    },

    deleteClient: function (id) {
      return tx(["clients"], "readwrite").then(function (t) {
        return promisifyRequest(t.objectStore("clients").delete(id));
      });
    },

    putClientsBulk: function (rows, userId) {
      rows = rows || [];
      return tx(["clients"], "readwrite").then(function (t) {
        var store = t.objectStore("clients");
        var now = new Date().toISOString();
        rows.forEach(function (row) {
          if (!row || !row.id) return;
          var copy = Object.assign({}, row);
          copy.user_id = userId;
          copy.pendingSync = !!copy.pendingSync;
          copy.localOnly = !!copy.localOnly;
          copy._offlineCachedAt = now;
          store.put(copy);
        });
        return new Promise(function (resolve, reject) {
          t.oncomplete = function () {
            resolve();
          };
          t.onerror = function () {
            reject(t.error);
          };
        });
      });
    },

    addPending: function (op) {
      op = op || {};
      op.createdAt = op.createdAt || new Date().toISOString();
      return tx(["pending"], "readwrite").then(function (t) {
        return promisifyRequest(t.objectStore("pending").add(op));
      });
    },

    getAllPending: function () {
      return tx(["pending"], "readonly").then(function (t) {
        return promisifyRequest(t.objectStore("pending").getAll());
      });
    },

    removePending: function (id) {
      return tx(["pending"], "readwrite").then(function (t) {
        return promisifyRequest(t.objectStore("pending").delete(id));
      });
    },

    countPending: function () {
      return tx(["pending"], "readonly").then(function (t) {
        return promisifyRequest(t.objectStore("pending").count());
      });
    },

    setMeta: function (key, value) {
      return tx(["meta"], "readwrite").then(function (t) {
        return promisifyRequest(t.objectStore("meta").put({ key: key, value: value }));
      });
    },

    getMeta: function (key) {
      return tx(["meta"], "readonly").then(function (t) {
        return promisifyRequest(t.objectStore("meta").get(key)).then(function (r) {
          return r ? r.value : null;
        });
      });
    },
  };
})(window);
