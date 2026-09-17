import "@/App.css";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import Connexion from "@/pages/Connexion";
import { EstimateProvider } from "@/lib/estimateStore";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Catalogue from "@/pages/Catalogue";
import Estimateur from "@/pages/Estimateur";
import Fournisseurs from "@/pages/Fournisseurs";
import Comparateur from "@/pages/Comparateur";
import Alertes from "@/pages/Alertes";
import Parametres from "@/pages/Parametres";

function Application() {
  const { session, chargement } = useAuth();

  if (chargement) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  // Sans session, aucune page applicative n'est montee : aucune requete de
  // catalogue ne part avant que l'utilisateur soit identifie.
  if (!session) return <Connexion />;

  // HashRouter et non BrowserRouter : l'hebergement statique renvoie une 404
  // sur toute sous-page ouverte directement ou rafraichie, tant qu'une regle
  // de reecriture (/* -> /index.html) n'est pas posee cote hebergeur. Le
  // routage par ancre ne depend d'aucune configuration serveur.
  return (
    <HashRouter>
      <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/catalogue" element={<Catalogue />} />
              <Route path="/estimateur" element={<Estimateur />} />
              <Route path="/estimateur/:id" element={<Estimateur />} />
              <Route path="/fournisseurs" element={<Fournisseurs />} />
              <Route path="/comparateur" element={<Comparateur />} />
              <Route path="/alertes" element={<Alertes />} />
              <Route path="/parametres" element={<Parametres />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <EstimateProvider>
          <Application />
          <Toaster position="top-right" richColors closeButton />
        </EstimateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
