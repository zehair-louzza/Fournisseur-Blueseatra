import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/lib/theme";
import { EstimateProvider } from "@/lib/estimateStore";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Catalogue from "@/pages/Catalogue";
import Estimateur from "@/pages/Estimateur";
import Fournisseurs from "@/pages/Fournisseurs";
import Comparateur from "@/pages/Comparateur";
import Alertes from "@/pages/Alertes";
import Parametres from "@/pages/Parametres";

function App() {
  return (
    <ThemeProvider>
      <EstimateProvider>
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
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </EstimateProvider>
    </ThemeProvider>
  );
}

export default App;
