import { useEffect, useState } from "react";
import { LogOut, Building2, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CompteUtilisateur() {
  const { deconnexion, choisirTenant } = useAuth();
  const [moi, setMoi] = useState(null);

  useEffect(() => {
    api.me().then(setMoi).catch(() => setMoi(null));
  }, []);

  if (!moi) return null;

  const societeActive =
    moi.societes.find((s) => s.tenant_id === moi.tenant_id)?.nom ?? "Société";

  const changerDeSociete = (id) => {
    choisirTenant(id);
    // Rechargement volontaire : toutes les vues en cache portent les données
    // de la société précédente et doivent être reconstruites.
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          data-testid="menu-compte"
        >
          <Building2 className="h-3.5 w-3.5" />
          <span className="max-w-[10rem] truncate">{societeActive}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-muted-foreground">Connecté en tant que</p>
          <p className="truncate text-sm font-medium">{moi.email}</p>
        </DropdownMenuLabel>

        {moi.societes.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Changer de société
            </DropdownMenuLabel>
            {moi.societes.map((s) => (
              <DropdownMenuItem
                key={s.tenant_id}
                onClick={() => changerDeSociete(s.tenant_id)}
                className={s.tenant_id === moi.tenant_id ? "font-medium" : ""}
              >
                {s.nom}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={deconnexion} data-testid="btn-deconnexion">
          <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
