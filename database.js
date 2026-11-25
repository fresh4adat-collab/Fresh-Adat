(() => {
  const { supabaseUrl = '', supabasePublishableKey = '' } = window.freshAdatConfig || {};
  const enabled = Boolean(supabaseUrl || supabasePublishableKey);
  let clientPromise;

  function client() {
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(supabaseUrl)
          || !supabasePublishableKey.startsWith('sb_publishable_')) {
          throw new Error('The Supabase project URL or publishable key is missing or invalid.');
        }
        if (!window.supabase) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = resolve;
            script.onerror = () => { script.remove(); reject(new Error('Could not load sign-in.')); };
            document.head.append(script);
          });
        }
        return window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
          auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
        });
      })().catch(error => {
        clientPromise = undefined;
        throw error;
      });
    }
    return clientPromise;
  }

  async function getUser() {
    const api = await client();
    const { data, error } = await api.auth.getSession();
    if (error) throw error;
    return data.session?.user ?? null;
  }

  async function requireUser(userId) {
    if (!userId || (await getUser())?.id !== userId) throw new Error('Sign in again to continue.');
    return client();
  }

  async function read(result) {
    const { data, error } = await result;
    if (error) throw error;
    return data;
  }

  window.freshAdatDatabase = {
    enabled,
    getUser,
    async signIn() {
      if (!['http:', 'https:'].includes(location.protocol)) {
        throw new Error('Open the hosted Fresh Adat website to sign in.');
      }
      const api = await client();
      return read(api.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      }));
    },
    async startMobileSession(contactPhone) {
      const startSession = async () => {
        const existingUser = await getUser();
        if (existingUser) return existingUser;

        const api = await client();
        // The browser session owns the account. A typed number is contact data.
        const { user, session } = await read(api.auth.signInAnonymously({
          options: { data: { contact_phone: contactPhone } }
        }));
        if (!user || !session) throw new Error('Could not start the shopping session.');
        return user;
      };

      return navigator.locks
        ? navigator.locks.request('fresh-adat-mobile-session', startSession)
        : startSession();
    },
    async checkOffer(userId, offerKey) {
      const api = await requireUser(userId);
      return read(api.rpc('check_store_offer', { p_offer_key: offerKey }));
    },
    async signOut() {
      const api = await client();
      await read(api.auth.signOut({ scope: 'local' }));
    },
    async loadProfile(userId) {
      const api = await requireUser(userId);
      const row = await read(api.from('customer_profiles').select('details').eq('user_id', userId).maybeSingle());
      return row?.details ?? null;
    },
    async saveProfile(userId, details) {
      const api = await requireUser(userId);
      await read(api.from('customer_profiles').upsert({ user_id: userId, details }));
    },
    async saveOrder(userId, order) {
      const api = await requireUser(userId);
      if (order.items.some(item => item.offer_key)) {
        await read(api.rpc('submit_store_order', { p_order: order }));
      } else {
        await read(api.from('store_orders').upsert({ ...order, user_id: userId }, { onConflict: 'id', ignoreDuplicates: true }));
      }
    },
    async listOrders(userId) {
      const api = await requireUser(userId);
      return read(api.from('store_orders')
        .select('id,created_at,status,total,offer_keys')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(25));
    },
    async endedOfferKeys() {
      const api = await client();
      const offers = await read(api.from('store_offer_status').select('offer_key').eq('status', 'ended'));
      return new Set(offers.map(offer => offer.offer_key));
    }
  };
})();
