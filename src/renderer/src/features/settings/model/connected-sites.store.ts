import { CONNECTED_SITES_SETTINGS_KEY } from "../config/settings.constants";
import { create } from "zustand";
import { getSetting, setSetting } from "@/shared/api";

export interface ConnectedSite {
  origin: string;
  connectedAt: string;
}

interface ConnectedSitesStore {
  connectedSites: ConnectedSite[];
  isExtensionLinked: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addConnectedSite: (origin: string) => void;
  removeConnectedSite: (origin: string) => void;
  setExtensionLinked: (linked: boolean) => void;
}

/**
 * Persists the connected sites list to electron-store, swallowing write errors so
 * a storage failure never breaks the in-memory preference flow.
 * @param sites - The array of connected sites to persist.
 * @returns Nothing.
 */
function persistSites(sites: ConnectedSite[]): void {
  void setSetting(CONNECTED_SITES_SETTINGS_KEY, sites).catch((err) => {
    console.error("Failed to persist connected sites", err);
  });
}

/**
 * Global store managing the whitelist of dApp origins that the user has
 * explicitly approved. Approved origins are allowed to make read-only
 * JSON-RPC requests without triggering the approval modal.
 */
export const useConnectedSitesStore = create<ConnectedSitesStore>(
  (set, get) => ({
    connectedSites: [],
    isExtensionLinked: false,
    hydrated: false,
    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const stored = await getSetting<any[] | null>(
          CONNECTED_SITES_SETTINGS_KEY,
        );
        const isLinked = await getSetting<boolean>("isExtensionLinked");

        const sites: ConnectedSite[] = (stored ?? []).map((item) => {
          if (typeof item === "string") {
            return { origin: item, connectedAt: new Date().toISOString() };
          }
          return item;
        });

        set({
          connectedSites: sites,
          isExtensionLinked: isLinked ?? false,
          hydrated: true,
        });
      } catch (err) {
        console.error("Failed to hydrate connected sites store", err);
        set({ hydrated: true });
      }
    },
    addConnectedSite: (origin: string) => {
      set((state) => {
        if (state.connectedSites.some((s) => s.origin === origin)) return state;
        const sites = [
          ...state.connectedSites,
          { origin, connectedAt: new Date().toISOString() },
        ];
        persistSites(sites);
        return { connectedSites: sites };
      });
    },
    removeConnectedSite: (origin: string) => {
      set((state) => {
        const sites = state.connectedSites.filter(
          (site) => site.origin !== origin,
        );
        persistSites(sites);
        return { connectedSites: sites };
      });
    },
    setExtensionLinked: (linked: boolean) => {
      window.api.settings.set("isExtensionLinked", linked);
      set({ isExtensionLinked: linked });
    },
  }),
);
