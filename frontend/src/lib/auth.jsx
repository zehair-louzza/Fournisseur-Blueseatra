import { createContext, useContext, useEffect, useState } from "react";

// Les comptes vivent dans le SaaS Blueseatra : la connexion utilise les mêmes
// identifiants que sur la plateforme. Cette application ne gère ni compte ni
// mot de passe.
//
// Le navigateur ne s'adresse qu'à l'API fournisseur, qui relaie la connexion
// vers le SaaS. Appeler le SaaS directement depuis le navigateur échouerait :
// ce domaine ne fait pas partie de ses origines autorisées.
const API = `${(process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "")}/api`;

const CLE_JETON = "blueseatra_token";
const CLE_TENANT = "tenant_id";

export const jetonStocke = () => localStorage.getItem(CLE_JETON);

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [jeton, setJeton] = useState(() => localStorage.getItem(CLE_JETON));
  const [chargement, setChargement] = useState(true);

  const deconnexion = () => {
    localStorage.removeItem(CLE_JETON);
    localStorage.removeItem(CLE_TENANT);
    setJeton(null);
  };

  useEffect(() => {
    // Un jeton peut avoir expiré depuis la dernière visite : on le confronte
    // au serveur avant de monter l'application, plutôt que de laisser chaque
    // écran échouer séparément.
    const verifier = async () => {
      const stocke = localStorage.getItem(CLE_JETON);
      if (!stocke) {
        setChargement(false);
        return;
      }
      try {
        const r = await fetch(`${API}/me`, {
          headers: { Authorization: `Bearer ${stocke}` },
        });
        if (r.status === 401) deconnexion();
      } catch {
        // Serveur injoignable : on garde la session. L'utilisateur verra
        // l'erreur au premier appel plutôt que d'être déconnecté à tort.
      }
      setChargement(false);
    };
    verifier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connexion = async (email, motDePasse) => {
    let r;
    try {
      r = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: motDePasse }),
      });
    } catch {
      throw new Error(
        "Serveur injoignable. Il peut être en veille : réessayez dans une minute."
      );
    }

    if (!r.ok) {
      let message = "Connexion impossible pour le moment.";
      try {
        const d = await r.json();
        if (d?.detail) message = d.detail;
      } catch {
        /* réponse sans corps exploitable : on garde le message générique */
      }
      throw new Error(message);
    }

    const data = await r.json();
    localStorage.setItem(CLE_JETON, data.token);
    if (data.tenant?.id) localStorage.setItem(CLE_TENANT, data.tenant.id);
    setJeton(data.token);
    return data;
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
