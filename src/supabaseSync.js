import { createClient } from "@supabase/supabase-js";

const CRED_KEY = "sentinel_supabase_creds";

// Read stored credentials
export function getSupabaseCredentials() {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return null;
    const { url, key } = JSON.parse(raw);
    if (url && key) return { url, key };
  } catch {}
  return null;
}

// Save credentials
export function saveSupabaseCredentials(url, key) {
  localStorage.setItem(CRED_KEY, JSON.stringify({ url, key }));
}

// Clear credentials (disconnect)
export function clearSupabaseCredentials() {
  localStorage.removeItem(CRED_KEY);
}

// Create a Supabase client from stored creds
let _client = null;
export function getSupabaseClient() {
  if (_client) return _client;
  const creds = getSupabaseCredentials();
  if (!creds) return null;
  _client = createClient(creds.url, creds.key);
  return _client;
}

export function resetSupabaseClient() {
  _client = null;
}

// Test connection + ensure table exists
export async function testSupabaseConnection(url, key) {
  const client = createClient(url, key);
  // Try to select from kv_store — if it doesn't exist, we'll get an error
  const { error } = await client.from("kv_store").select("key").limit(1);
  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01" || error.message.includes("relation")) {
      return { ok: false, error: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Create a window.storage-compatible adapter backed by Supabase
// Falls back to localStorage when offline
export function createSupabaseStorage(client) {
  const localPrefix = "ws_"; // same prefix as the localStorage polyfill

  return {
    async get(key) {
      try {
        const { data, error } = await client
          .from("kv_store")
          .select("value")
          .eq("key", key)
          .single();
        if (error) throw error;
        // Also cache locally for offline access
        localStorage.setItem(localPrefix + key, data.value);
        return { key, value: data.value };
      } catch (e) {
        // Offline fallback: try localStorage cache
        const cached = localStorage.getItem(localPrefix + key);
        if (cached != null) {
          console.warn("[Supabase] Offline — using cached data for:", key);
          return { key, value: cached };
        }
        throw e;
      }
    },

    async set(key, value) {
      // Always write to localStorage cache first (instant)
      localStorage.setItem(localPrefix + key, value);
      try {
        const { error } = await client
          .from("kv_store")
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) throw error;
      } catch (e) {
        console.warn("[Supabase] Save failed (offline?) — cached locally:", key, e.message);
        // Queue for retry
        _addToPendingSync(key);
      }
      return { key, value };
    },

    async delete(key) {
      localStorage.removeItem(localPrefix + key);
      try {
        await client.from("kv_store").delete().eq("key", key);
      } catch (e) {
        console.warn("[Supabase] Delete failed (offline?):", key, e.message);
      }
      return { key, deleted: true };
    },

    async list(prefix) {
      try {
        let query = client.from("kv_store").select("key");
        if (prefix) query = query.like("key", `${prefix}%`);
        const { data, error } = await query;
        if (error) throw error;
        return { keys: data.map(r => r.key) };
      } catch (e) {
        // Offline fallback
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith(localPrefix + (prefix || ""))) keys.push(k.slice(localPrefix.length));
        }
        return { keys };
      }
    }
  };
}

// Pending sync queue for offline writes
const PENDING_KEY = "sentinel_supabase_pending";

function _addToPendingSync(key) {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    if (!pending.includes(key)) {
      pending.push(key);
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    }
  } catch {}
}

// Flush any pending offline writes to Supabase
export async function flushPendingSync() {
  const client = getSupabaseClient();
  if (!client) return;
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch { return; }
  if (pending.length === 0) return;

  const localPrefix = "ws_";
  const stillPending = [];
  for (const key of pending) {
    const value = localStorage.getItem(localPrefix + key);
    if (value == null) continue; // was deleted, skip
    try {
      const { error } = await client
        .from("kv_store")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      console.log("[Supabase] Synced pending:", key);
    } catch {
      stillPending.push(key);
    }
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(stillPending));
}

// Upload all current localStorage data to Supabase (initial migration)
export async function migrateLocalToSupabase(client) {
  const localPrefix = "ws_";
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(localPrefix)) keys.push(k.slice(localPrefix.length));
  }

  let migrated = 0;
  for (const key of keys) {
    const value = localStorage.getItem(localPrefix + key);
    if (value == null) continue;
    const { error } = await client
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (!error) migrated++;
    else console.error("[Supabase] Migration failed for key:", key, error.message);
  }
  return { migrated, total: keys.length };
}

// Initialize: if Supabase is configured, replace window.storage
export function initSupabaseStorage() {
  const client = getSupabaseClient();
  if (!client) return false;
  window.storage = createSupabaseStorage(client);
  // Try to flush any pending offline writes
  flushPendingSync().catch(() => {});
  return true;
}
