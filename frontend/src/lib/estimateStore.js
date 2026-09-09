import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const EstimateCtx = createContext(null);
const KEY = "bst_estimate_basket";

export const EstimateProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((art) => {
    setItems((prev) => {
      if (prev.find((i) => i.code === art.code)) {
        toast.info(`« ${art.article} » est déjà dans le panier`);
        return prev;
      }
      toast.success(`« ${art.article} » ajouté au panier d'estimation`);
      return [
        ...prev,
        {
          code: art.code,
          article: art.article,
          lot: art.lot,
          unite: art.unite,
          fournisseur: art.fournisseur_retenu,
          prix_achat_ht: art.prix_achat_ht || 0,
          marge_pct: 25,
          quantite: 1,
          tva_pct: art.tva_pct || 20,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((code) => {
    setItems((prev) => prev.filter((i) => i.code !== code));
  }, []);

  const addOffer = useCallback((art, offer) => {
    const key = `${art.code}@${offer.fournisseur}`;
    setItems((prev) => {
      if (prev.find((i) => i.code === key)) {
        toast.info(`« ${art.article} — ${offer.fournisseur} » est déjà dans le panier`);
        return prev;
      }
      toast.success(`« ${art.article} » (${offer.fournisseur}) ajouté au panier`);
      return [
        ...prev,
        {
          code: key,
          article: `${art.article} · ${offer.fournisseur}`,
          lot: art.lot,
          unite: art.unite,
          fournisseur: offer.fournisseur,
          prix_achat_ht: offer.prix_ht || 0,
          marge_pct: 25,
          quantite: 1,
          tva_pct: art.tva_pct || 20,
        },
      ];
    });
  }, []);

  const updateItem = useCallback((code, patch) => {
    setItems((prev) => prev.map((i) => (i.code === code ? { ...i, ...patch } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return (
    <EstimateCtx.Provider value={{ items, addItem, addOffer, removeItem, updateItem, clear, setItems }}>
      {children}
    </EstimateCtx.Provider>
  );
};

export const useEstimate = () => useContext(EstimateCtx);
