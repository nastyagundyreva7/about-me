/* RUD COIN database transport. No Supabase Auth and no supabase-js. */
(() => {
  const URL = 'https://crpmabmarisoptxtszds.supabase.co';
  const KEY = 'sb_publishable_kE-zs8xcQfX3ojxbjzepzQ_PbZEWMM6';

  const headers = () => ({
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  });

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { ...headers(), ...(options.headers || {}) }
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
      if (!response.ok) {
        const error = new Error(data?.message || data?.msg || data?.hint || data?.details || data?.error || `Ошибка сервера (${response.status})`);
        error.status = response.status;
        error.code = data?.code;
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }

  async function rudRpc(fn, args = {}) {
    return request(`/rest/v1/rpc/${encodeURIComponent(fn)}`, {
      method: 'POST',
      body: JSON.stringify(args)
    });
  }
  window.rudRpc = rudRpc;

  function queryBuilder(table, mode = 'select', payload = null) {
    const state = { table, mode, payload, columns: '*', filters: [], order: null, limit: null, single: false };
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
              data = await request(`/rest/v1/${encodeURIComponent(state.table)}`, { method: 'POST', body: JSON.stringify(state.payload) });
            } else {
              const params = new URLSearchParams({ select: state.columns });
              state.filters.forEach(([key, value]) => params.set(key, `eq.${String(value)}`));
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

  /* Compatibility object for the unchanged parts of the site. It never calls
     Supabase Auth; its auth methods only read the RUD COIN custom session. */
  const client = {
    from(table) {
      return {
        select(columns = '*') { return queryBuilder(table, 'select').select(columns); },
        insert(payload) { return queryBuilder(table, 'insert', payload); }
      };
    },
    async rpc(fn, args = {}) {
      try { return { data: await rudRpc(fn, args), error: null }; }
      catch (error) { return { data: null, error }; }
    },
    auth: {
      async getUser() {
        const token = localStorage.getItem('rudcoins_custom_session_v1');
        if (!token) return { data: { user: null }, error: null };
        try {
          const result = await rudRpc('rud_restore', { p_token: token });
          const p = result?.profile;
          return { data: { user: p ? { id: p.id, email: p.rudn_email || '', user_metadata: p } : null }, error: null };
        } catch (error) { return { data: { user: null }, error }; }
      },
      async signOut() {
        const token = localStorage.getItem('rudcoins_custom_session_v1');
        if (token) { try { await rudRpc('rud_logout', { p_token: token }); } catch (_) {} }
        localStorage.removeItem('rudcoins_custom_session_v1');
        return { error: null };
      },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };
  window.supabase = { createClient: () => client };
})();
