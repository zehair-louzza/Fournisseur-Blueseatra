import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Le client n'est cree que si la configuration est presente : cela permet a
// l'application de rendre un message clair plutot que de planter au montage
// quand les variables de build manquent.
export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [tenantId, setTenantId] = useState(
    () => localStorage.getItem("tenant_id") || null
  );

  useEffect(() => {
    if (!supabase) {
      setChargement(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setChargement(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s) {
        setTenantId(null);
        localStorage.removeItem("tenant_id");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const choisirTenant = (id) => {
    setTenantId(id);
    if (id) localStorage.setItem("tenant_id", id);
    else localStorage.removeItem("tenant_id");
  };

  const deconnexion = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        chargement,
        tenantId,
        choisirTenant,
        deconnexion,
        configure: Boolean(supabase),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit etre utilise dans AuthProvider");
  return ctx;
}
