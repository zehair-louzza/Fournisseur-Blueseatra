import { useState } from "react";
import { Loader2, LogIn, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const soumettre = async (e) => {
    e.preventDefault();
    if (!supabase) {
      setErreur(
        "Configuration d'authentification absente. Les variables REACT_APP_SUPABASE_URL et REACT_APP_SUPABASE_ANON_KEY doivent être définies au moment du build."
      );
      return;
    }
    setEnCours(true);
    setErreur(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });
    if (error) {
      setErreur(
        error.message === "Invalid login credentials"
          ? "Identifiants incorrects."
          : error.message
      );
    }
    setEnCours(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Catalogue fournisseurs
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous avec votre compte Blueseatra. Vous ne voyez que le
            catalogue de votre société.
          </p>
        </div>

        <form onSubmit={soumettre} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium mb-1.5 block">
              Adresse e-mail
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-email"
            />
          </div>

          <div>
            <label htmlFor="mdp" className="text-sm font-medium mb-1.5 block">
              Mot de passe
            </label>
            <Input
              id="mdp"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              data-testid="input-motdepasse"
            />
          </div>

          {erreur && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{erreur}</span>
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={enCours} data-testid="btn-connexion">
            {enCours ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Connexion…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" /> Se connecter
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
