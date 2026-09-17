import { createContext, useContext, useEffect, useState } from "react";

// Les comptes vivent dans le SaaS Blueseatra : la connexion s'y fait
// directement, avec les mêmes identifiants que sur la plateforme. Cette
// application ne gère ni compte ni mot de passe.
export const SAAS_API_URL = (process.env.REACT_APP_SAAS_API_URL || "").replace(/\/$/, "");

const CLE_JETON = "blueseatra_token";
const CLE_TENANT = "tenant_id";

export const jetonStocke = () => localStorage.getItem(CLE_JETON);

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [jeton, setJeton] = useState(() => localStorage.getItem(CLE_JETON));
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    // Un jeton peut avoir expiré depuis la dernière visite : on le confronte
    // au SaaS avant de monter l'application, plutôt que de laisser chaque
    // écran échouer séparément.
    const verifier = async () => {
      if (!jeton || !SAAS_API_URL) {
        setChargement(false);
        return;
      }
      try {
        const r = await fetch(`${SAAS_API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${jeton}` },
        });
        if (!r.ok) deconnexion();
      } catch {
        // SaaS injoignable : on garde la session, l'utilisateur verra
        // l'erreur au premier appel plutôt que d'être déconnecté à tort.
      }
      setChargement(false);
    };
    verifier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connexion = async (email, motDePasse) => {
    if (!SAAS_API_URL) {
      throw new Error(
        "Configuration absente : REACT_APP_SAAS_API_URL doit être définie au moment du build."
      );
    }
    const r = await fetch(`${SAAS_API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password: motDePasse }),
    });
    if (r.status === 401) throw new Error("Identifiants incorrects.");
    if (r.status === 403) throw new Error("Ce compte n'est rattaché à aucune société.");
    if (!r.ok) throw new Error("Connexion impossible pour le moment.");

    const data = await r.json();
    localStorage.setItem(CLE_JETON, data.token);
    if (data.tenant?.id) localStorage.setItem(CLE_TENANT, data.tenant.id);
    setJeton(data.token);
    return data;
  };

  const deconnexion = () => {
    localStorage.removeItem(CLE_JETON);
    localStorage.removeItem(CLE_TENANT);
    setJeton(null);
  };

  const choisirTenant = (id) => {
    if (id) localStorage.setItem(CLE_TENANT, id);
    else localStorage.removeItem(CLE_TENANT);
  };

  return (
    <AuthContext.Provider
      value={{
        jeton,
        session: jeton,
        chargement,
        connexion,
        deconnexion,
        choisirTenant,
        configure: Boolean(SAAS_API_URL),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
