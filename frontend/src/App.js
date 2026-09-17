import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

  return (
    <BrowserRouter>
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
    </BrowserRouter>
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
