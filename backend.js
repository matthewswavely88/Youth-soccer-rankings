// Shared-data backend for the downloadable app.
// The app talks to one small interface — db.doc("collection/id").set()/.delete() and
// db.collection(name).onSnapshot() — so it runs unchanged inside a Claude artifact
// (which provides that interface itself) or here, backed by Supabase.
(function () {
  const cfg = window.YSR_CONFIG || {};

  // A random ID per install, used to tell the scorekeeper apart from people confirming a score.
  let device = "anon";
  try {
    device = localStorage.getItem("ysr-device");
    if (!device) {
      device = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem("ysr-device", device);
    }
  } catch {}
  window.YSR_DEVICE = device;

  // Licensed feed (optional). Resolves to the parsed JSON or null.
  window.YSR_FEED = cfg.feedUrl
    ? fetch(cfg.feedUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    : Promise.resolve(null);

  if (window.claude && window.claude.use) return;        // running as a Claude artifact
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;  // on-device only

  let clientP = null;
  const client = () => clientP || (clientP = new Promise((resolve, reject) => {
    const make = () => resolve(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } }));
    if (window.supabase && window.supabase.createClient) return make();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    s.onload = make;
    s.onerror = () => { clientP = null; reject(Object.assign(new Error("offline"), { code: "unavailable" })); };
    document.head.appendChild(s);
  }));

  const split = (path) => { const i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; };
  const fail = (error) => Object.assign(new Error(error.message || "write failed"),
    { code: error.code === "42501" ? "invalid_argument" : error.code === "54000" ? "quota_exceeded" : "unavailable" });

  const doc = (path) => {
    const [collection, id] = split(path);
    return {
      async set(data) {
        const sb = await client();
        // Teams and fixtures are add-only: if someone else added the same one first, keep theirs.
        const addOnly = collection === "teams" || collection === "fixtures";
        const { error } = await sb.from("docs").upsert({ collection, id, data, device, updated_at: new Date().toISOString() }, { ignoreDuplicates: addOnly });
        if (error) throw fail(error);
      },
      async delete() {
        const sb = await client();
        const { error } = await sb.from("docs").delete().match({ collection, id });
        if (error) throw fail(error);
      },
    };
  };

  const collection = (name) => ({
    onSnapshot(onNext, onError) {
      const rows = new Map();
      let channel = null, stopped = false;
      const emit = () => onNext({ docs: [...rows].map(([id, data]) => ({ id, exists: true, data: () => data })) });
      const load = async (sb) => {
        const { data, error } = await sb.from("docs").select("id,data").eq("collection", name).limit(10000);
        if (error) throw error;
        rows.clear(); data.forEach((r) => rows.set(r.id, r.data)); emit();
      };
      (async () => {
        try {
          const sb = await client();
          await load(sb);
          if (stopped) return;
          // Unfiltered so deletes arrive too (filters don't apply to DELETE events); we filter here.
          channel = sb.channel("docs-" + name)
            .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
              const row = p.eventType === "DELETE" ? p.old : p.new;
              if (!row || row.collection !== name) return;
              if (p.eventType === "DELETE") rows.delete(row.id); else rows.set(row.id, row.data);
              emit();
            })
            .subscribe();
          // Catch up after the phone wakes or the connection drops.
          document.addEventListener("visibilitychange", () => { if (!document.hidden && !stopped) load(sb).catch(() => {}); });
        } catch (e) { if (onError) onError(e); }
      })();
      return () => { stopped = true; if (channel) channel.unsubscribe(); };
    },
  });

  const db = { doc, collection };
  const user = { can: async () => true };
  window.claude = { use: async (what) => (what === "db" ? db : what === "user" ? user : null) };
})();
