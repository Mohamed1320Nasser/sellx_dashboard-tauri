import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
  timestamp: Date;
  read: boolean;
}

interface UIStore {
  sidebarCollapsed: boolean;
  /** The POS folds the menu while selling; this is not saved, so the user's own choice is kept */
  posFold: boolean;
  /** The user's choice before the POS folded the menu */
  savedSidebarCollapsed: boolean;
  theme: "light" | "dark";
  language: "ar" | "en";
  notifications: Notification[];

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setPosFold: (fold: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
  setLanguage: (language: "ar" | "en") => void;
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp" | "read">
  ) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      posFold: false,
      savedSidebarCollapsed: false,
      theme: "light",
      language: "ar",
      notifications: [],

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },

      setPosFold: (fold) => {
        const state = get();
        if (fold === state.posFold) return;
        if (fold) set({ posFold: true, savedSidebarCollapsed: state.sidebarCollapsed, sidebarCollapsed: true });
        else set({ posFold: false, sidebarCollapsed: state.savedSidebarCollapsed });
      },

      setTheme: (theme) => {
        set({ theme });
        document.documentElement.classList.toggle("dark", theme === "dark");
      },

      setLanguage: (language) => {
        set({ language });
        document.documentElement.setAttribute(
          "dir",
          language === "ar" ? "rtl" : "ltr"
        );
        document.documentElement.setAttribute("lang", language);
      },

      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: Math.random().toString(36).substring(7),
          timestamp: new Date(),
          read: false,
        };
        set((state) => ({
          notifications: [newNotification, ...state.notifications],
        }));
      },

      markNotificationRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      clearNotifications: () => {
        set({ notifications: [] });
      },
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({
        // while the POS has the menu folded, save the user's own choice, not the fold
        sidebarCollapsed: state.posFold ? state.savedSidebarCollapsed : state.sidebarCollapsed,
        theme: state.theme,
        language: state.language,
      }),
    }
  )
);
