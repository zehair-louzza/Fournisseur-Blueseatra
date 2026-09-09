import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const api = {
  filters: () => client.get("/filters").then((r) => r.data),
  catalogue: (params) => client.get("/catalogue", { params }).then((r) => r.data),
  article: (code) => client.get(`/catalogue/${code}`).then((r) => r.data),
  overview: () => client.get("/stats/overview").then((r) => r.data),
  byLot: () => client.get("/stats/by-lot").then((r) => r.data),
  bySupplier: () => client.get("/stats/by-supplier").then((r) => r.data),
  comparateur: () => client.get("/comparateur").then((r) => r.data),
  importCatalogue: (formData) =>
    client.post("/catalogue/import", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  alerts: () => client.get("/alerts").then((r) => r.data),
  parametres: () => client.get("/parametres").then((r) => r.data),
  listProjects: () => client.get("/projects").then((r) => r.data),
  getProject: (id) => client.get(`/projects/${id}`).then((r) => r.data),
  createProject: (body) => client.post("/projects", body).then((r) => r.data),
  updateProject: (id, body) => client.put(`/projects/${id}`, body).then((r) => r.data),
  deleteProject: (id) => client.delete(`/projects/${id}`).then((r) => r.data),
};
