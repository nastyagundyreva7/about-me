/* RUD COIN lightweight database client.
   There is no Supabase Auth dependency here. Authentication is the RUD COIN
   session stored in localStorage and validated by Postgres RPC. */
(() => {
  const URL = 'https://crpmabmarisoptxtszds.supabase.co';
  const KEY = 'sb_publishable_kE-z8sxcQfX3ojxbjzepzQ_PbZEWMM6';
  const TOKEN_KEY = 'rudcoins_custom_session_v1';

  const headers = () => ({
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  });

  const request = async (path, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { ...headers(), ...(options.headers || {}) }
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
      if (!res.ok) {
        const error = new Error(data?.message || data?.msg || data?.hint || data?.details || data?.error || `HTTP ${res.status}`);
        error.code = data?.code;
        error.status = res.status;
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  };

  async function rpcRaw(fn, args = {}) {
    return request(`/rest/v1/rpc/${encodeURIComponent(fn)}`, {
      method: 'POST', body: JSON.stringify(args)
    });
  }

  function queryBuilder(table, mode = 'select', payload = null) {
    const state = { table, mode, payload, filters: [], order: null, limit: null, single: false };
    const builder = {
      select(columns = '*') { state.columns = columns; return builder; },
      eq(key, value) { state.filters.push([key, value]); return builder; },
      order(column, opts = {}) { state.order = { column, ascending: opts.ascending !== false }; return builder; },
      limit(n) { state.limit = Number(n); return builder; },
      maybeSingle() { state.single = true; return builder; },
      then(resolve, reject) {
        (async () => {
          try {
            let data;
            if (state.mode === 'insert') {
              data = await request(`/rest/v1/${encodeURIComponent(state.table)}`, {
                method: 'POST', body: JSON.stringify(state.payload)
              });
            } else {
              const params = new URLSearchParams({ select: state.columns || '*' });
              state.filters.forEach(([k, v]) => params.set(k, `eq.${String(v)}`));
              if (state.order) params.set('order', `${state.order.column}.${state.order.ascending ? 'asc' : 'desc'}`);
              if (state.limit != null) params.set('limit', String(state.limit));
              data = await request(`/rest/v1/${encodeURIComponent(state.table)}?${params}`);
            }
            if (state.single) data = Array.isArray(data) ? (data[0] || null) : data;
            resolve({ data, error: null });
          } catch (error) { resolve({ data: null, error }); }
        })();
      }
    };
    return builder;
  }

  const client = {
    from(table) {
      return {
        select(columns = '*') { return queryBuilder(table, 'select').select(columns); },
        insert(payload) { return queryBuilder(table, 'insert', payload); }
      };
    },
    async rpc(fn, args = {}) {
      try { return { data: await rpcRaw(fn, args), error: null }; }
      catch (error) { return { data: null, error }; }
    },
    auth: {
      // Compatibility shim for the old app.js. It restores the RUD COIN
      // session instead of contacting Supabase Auth.
      async getUser() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return { data: { user: null }, error: null };
        try {
          const result = await rpcRaw('rud_restore', { p_token: token });
          const p = result?.profile;
          if (!p) {
            localStorage.removeItem(TOKEN_KEY);
            return { data: { user: null }, error: null };
          }
          return { data: { user: { id: p.id, email: p.rudn_email || '', user_metadata: p } }, error: null };
        } catch (error) {
          return { data: { user: null }, error };
        }
      },
      async setSession() { return { data: { session: null }, error: null }; },
      async signOut() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) { try { await rpcRaw('rud_logout', { p_token: token }); } catch (_) {} }
        localStorage.removeItem(TOKEN_KEY);
        return { error: null };
      },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };

  window.supabase = { createClient: () => client };
})();
