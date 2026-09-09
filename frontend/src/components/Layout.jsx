import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Calculator,
  Truck,
  AlertTriangle,
  Settings2,
  Moon,
  Sun,
  ShoppingCart,
  Layers3,
  Scale,
} from "lucide-react";
import { useEstimate } from "@/lib/estimateStore";
import { useTheme } from "@/lib/theme";

const NAV = [
  { to: "/", label: "Tableau de bord", Icon: LayoutDashboard, end: true },
  { to: "/catalogue", label: "Catalogue", Icon: Package },
  { to: "/estimateur", label: "Estimateur de projet", Icon: Calculator },
  { to: "/comparateur", label: "Comparateur prix", Icon: Scale },
  { to: "/fournisseurs", label: "Fournisseurs", Icon: Truck },
  { to: "/alertes", label: "Alertes qualité", Icon: AlertTriangle },
  { to: "/parametres", label: "Paramètres", Icon: Settings2 },
];

export const Layout = ({ children }) => {
  const { items } = useEstimate();
  const { dark, toggle } = useTheme();
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/70 bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border/60">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers3 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-foreground">BlueSeaTra</p>
            <p className="text-[11px] text-muted-foreground">Achats TCE · 2026</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={`nav-${to === "/" ? "dashboard" : to.slice(1)}`}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border/60">
          <NavLink
            to="/estimateur"
            data-testid="sidebar-basket"
            className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/50 px-3 py-2.5 text-sm hover:border-accent/60 transition-colors"
          >
            <span className="flex items-center gap-2 text-foreground">
              <ShoppingCart className="h-4 w-4 text-accent" />
              Panier
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
              {items.length}
            </span>
          </NavLink>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Layers3 className="h-4 w-4" />
            </div>
            <span className="font-display font-bold">BlueSeaTra</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-xs text-muted-foreground">
              ANELEC Groupe · Catalogue prix fournisseurs réels
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              data-testid="theme-toggle"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Basculer le thème"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-border/70 bg-card/95 backdrop-blur-md py-1.5 lg:hidden">
          {NAV.slice(0, 5).map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${
                  isActive ? "text-accent" : "text-muted-foreground"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label.split(" ")[0]}
            </NavLink>
          ))}
        </nav>

        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
};
