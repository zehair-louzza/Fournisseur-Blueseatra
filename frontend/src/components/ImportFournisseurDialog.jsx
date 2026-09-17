import { useRef, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// Fournisseurs déjà pris en charge par la collecte automatique
// (skill collecte-tarifs-fournisseurs-btp) — l'utilisateur peut aussi taper un
// nom libre pour un fournisseur non encore automatisé.
const FOURNISSEURS_CONNUS = [
  "Rexel", "Prolians", "Point.P", "La Plateforme", "SFIC", "YESSS Électrique", "Au Forum du Bâtiment",
];

export default function ImportFournisseurDialog({ fournisseurParDefaut, trigger, onImported }) {
  const [ouvert, setOuvert] = useState(false);
  const [fournisseur, setFournisseur] = useState(fournisseurParDefaut || "");
  const [fichier, setFichier] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const inputRef = useRef(null);

  const reinitialiser = () => {
    setFichier(null);
    setResultat(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const importer = async () => {
    if (!fournisseur.trim()) {
      toast.error("Indiquez le nom du fournisseur.");
      return;
    }
    if (!fichier) {
      toast.error("Choisissez un fichier CSV.");
      return;
    }
    setEnCours(true);
    setResultat(null);
    try {
      const formData = new FormData();
      formData.append("file", fichier);
      const data = await api.importSupplierCatalogue(fournisseur.trim(), formData);
      setResultat({ ok: true, data });
      const parts = [];
      if (data.offres_rattachees)
        parts.push(`${data.offres_rattachees} offres rattachées`);
      if (data.articles_crees) parts.push(`${data.articles_crees} articles créés`);
      toast.success(
        `${fournisseur} : ${parts.join(", ") || "aucune ligne exploitable"}.`
      );
      onImported?.(data);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Import impossible : fichier illisible.";
      setResultat({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(v) => {
        setOuvert(v);
        if (!v) reinitialiser();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2" data-testid="btn-import-fournisseur">
            <UploadCloud className="h-4 w-4" />
            Importer un catalogue fournisseur
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer un catalogue fournisseur</DialogTitle>
          <DialogDescription>
            Le fichier CSV vient de votre collecte de tarifs (Rexel, Prolians, Point.P, La
            Plateforme, SFIC…) ou de tout export fournisseur équivalent. Chaque ligne
            rejoint le catalogue de votre société : rattachée comme offre à l&apos;article
            correspondant s&apos;il existe déjà, créée comme nouvel article sinon. Seuls les
            prix présents dans le fichier sont enregistrés — marge et prix de vente restent
            vides.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Fournisseur</label>
            <Input
              list="fournisseurs-connus"
              placeholder="Ex. Rexel"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              data-testid="input-fournisseur-import"
            />
            <datalist id="fournisseurs-connus">
              {FOURNISSEURS_CONNUS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Fichier CSV</label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0
                         file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium
                         hover:file:bg-secondary/80"
              data-testid="input-file-import"
            />
          </div>

          {resultat?.ok && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-1">
              <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Import terminé
              </p>
              <p>Lignes lues : {resultat.data.lignes_lues}</p>
              <p>Offres rattachées à un article existant : {resultat.data.offres_rattachees}</p>
              <p>Articles mis à jour : {resultat.data.articles_mis_a_jour}</p>
              <p>Nouveaux articles créés : {resultat.data.articles_crees ?? 0}</p>
              {resultat.data.lignes_sans_prix > 0 && (
                <p className="text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {resultat.data.lignes_sans_prix} lignes sans prix dans le fichier :
                  laissées vides, aucun prix n'est estimé.
                </p>
              )}
            </div>
          )}
          {resultat && !resultat.ok && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              {resultat.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOuvert(false)}>
            Fermer
          </Button>
          <Button onClick={importer} disabled={enCours} data-testid="btn-confirmer-import">
            {enCours ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours…
              </>
            ) : (
              "Importer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
