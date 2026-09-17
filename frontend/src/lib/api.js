import axios from "axios";
import { supabase } from "@/lib/auth";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

// Chaque appel porte le jeton Supabase de l'utilisateur : c'est lui qui
// determine, cote serveur, quel catalogue est lu ou modifie. Le jeton est
// relu a chaque requete car il est renouvele automatiquement en arriere-plan.
client.interceptors.request.use(async (config) => {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  const tenant = localStorage.getItem("tenant_id");
  if (tenant) config.headers["X-Tenant-Id"] = tenant;
  return config;
});

export const api = {
  me: () => client.get("/me").then((r) => r.data),
  filters: () => client.get("/filters").then((r) => r.data),
  catalogue: (params) => client.get("/catalogue", { params }).then((r) => r.data),
  article: (code) => client.get(`/catalogue/${code}`).then((r) => r.data),
  overview: () => client.get("/stats/overview").then((r) => r.data),
  byLot: () => client.get("/stats/by-lot").then((r) => r.data),
  bySupplier: () => client.get("/stats/by-supplier").then((r) => r.data),
  decision: () => client.get("/stats/decision").then((r) => r.data),
  comparateur: () => client.get("/comparateur").then((r) => r.data),
  importCatalogue: (formData) =>
    client.post("/catalogue/import", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  importSupplierCatalogue: (fournisseur, formData) =>
    client
      .post(`/fournisseurs/${encodeURIComponent(fournisseur)}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  bestPrices: (codes) => client.post("/best-prices", { codes }).then((r) => r.data),
  alerts: () => client.get("/alerts").then((r) => r.data),
  parametres: () => client.get("/parametres").then((r) => r.data),
  listProjects: () => client.get("/projects").then((r) => r.data),
  getProject: (id) => client.get(`/projects/${id}`).then((r) => r.data),
  createProject: (body) => client.post("/projects", body).then((r) => r.data),
  updateProject: (id, body) => client.put(`/projects/${id}`, body).then((r) => r.data),
  deleteProject: (id) => client.delete(`/projects/${id}`).then((r) => r.data),
};
