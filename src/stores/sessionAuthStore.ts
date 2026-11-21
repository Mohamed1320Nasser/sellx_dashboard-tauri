import { create } from "zustand";
import { sessionAuthService } from "../services/sessionAuthService";
import { usePermissionStore } from "./permissionStore";
import { localStore, storeError } from "../offline/localStore";
import { setOfflineSession, useOfflineStore } from "../offline/runtime";

/** this PC can sign people in without internet (registered for offline selling) */
const offlineDevice = () => (localStore && useOfflineStore.getState().status === "ready" ? useOfflineStore.getState().device : null);

// Helper function to map user role to company role
// Now we use the companyRole directly from the backend instead of mapping
const mapUserRoleToCompanyRole = (
  userRole: string,
  companyRole?: string
): string => {
  // If companyRole is provided, use it directly
  if (companyRole) {
    return companyRole;
  }

  // Fallback to mapping global user role (for backward compatibility)
  switch (userRole.toLowerCase()) {
    case "admin":
    case "system":
      return "ADMIN";
    case "user":
      return "MANAGER"; // Default to MANAGER for regular users
    case "tester":
      return "CASHIER"; // Testers get CASHIER role
    default:
      return "CASHIER"; // Default fallback
  }
};

// Session-based Auth Store (inspired by eduloom flow)
interface SessionAuthStore {
  // State
  user: any | null;
  company: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;

  // Actions
  login: (credentials: {
    emailOrUsername: string;
    password: string;
    isAdmin?: boolean;
    rememberMe?: boolean;
  }) => Promise<boolean>;
  /** why the last login failed (shown on the login page), and whether it was an offline sign-in */
  loginError: string | null;
  offlineLogin: boolean;
  logout: () => void;
  checkAuth: () => boolean;
  initialize: () => boolean;
  getCurrentUser: () => any;
  getToken: () => string | null;
}

export const useSessionAuthStore = create<SessionAuthStore>((set, get) => ({
  // Initial State
  user: null,
  company: null,
  isAuthenticated: false,
  isLoading: false,
  token: null,
  loginError: null,
  offlineLogin: false,

  // Login Action (like eduloom's handleLogin)
  login: async (credentials: {
    emailOrUsername: string;
    password: string;
    isAdmin?: boolean;
    rememberMe?: boolean;
  }) => {
    set({ isLoading: true, loginError: null, offlineLogin: false });

    try {
      const response = await sessionAuthService.submitLogin(
        credentials.emailOrUsername,
        credentials.password,
        credentials.rememberMe || false
      );

      if (response.success && response.data) {
        const { token, user } = response.data;

        // Map user role to company role for navigation
        const mappedUser = {
          ...user,
          role: mapUserRoleToCompanyRole(user.role, user.companyRole),
        };

        // Create company object with backward compatibility (companyId and company.name)
        const companyData = user.company
          ? {
              ...user.company,
              companyId: user.company.id, // For backward compatibility
              company: user.company, // For backward compatibility (company?.company?.name)
            }
          : null;

        set({
          user: mappedUser,
          company: companyData,
          isAuthenticated: true,
          token,
          isLoading: false,
        });
        setOfflineSession(false);

        // A PC registered for offline selling remembers a salted hash (never the password) so this
        // person can sign in here when the internet is down
        const device = offlineDevice();
        if (device && user.company?.id === device.companyId) {
          const names = [credentials.emailOrUsername, user.username, user.email].filter((n, i, a): n is string => !!n && a.indexOf(n) === i);
          for (const n of names) {
            localStore!.saveLogin(n, credentials.password, { ...user, password: undefined }).catch(e => console.warn("[offline] could not remember sign-in:", storeError(e)));
          }
        }
        return true;
      } else if (response.network && offlineDevice()) {
        // No server: sign in from what this PC remembers
        try {
          const saved = await localStore!.checkLogin(credentials.emailOrUsername, credentials.password);
          const user = saved.profile;
          if (user?.company?.id !== offlineDevice()!.companyId) throw new Error("هذا المستخدم ليس من المحل المسجل عليه هذا الجهاز");
          sessionAuthService.startOfflineSession(user);
          setOfflineSession(true);
          set({
            user: { ...user, role: mapUserRoleToCompanyRole(user.role, user.companyRole) },
            company: { ...user.company, companyId: user.company.id, company: user.company },
            isAuthenticated: true,
            token: "offline-session",
            isLoading: false,
            offlineLogin: true,
          });
          return true;
        } catch (e) {
          set({ isLoading: false, loginError: `لا يوجد اتصال بالسيرفر. ${storeError(e)}` });
          return false;
        }
      } else {
        set({ isLoading: false, loginError: response.network ? "لا يوجد اتصال بالسيرفر. تحقق من الإنترنت" : response.msg || null });
        return false;
      }
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  // Logout Action (like eduloom's handleLogout)
  logout: () => {
    sessionAuthService.logout();
    setOfflineSession(false);
    // Clear permissions when logging out
    usePermissionStore.getState().clearPermissions();
    set({
      user: null,
      company: null,
      isAuthenticated: false,
      token: null,
    });
  },

  // Check Authentication (like eduloom's checkIfAuthorized)
  checkAuth: () => {
    const isAuth = sessionAuthService.checkIfAuthorized();

    if (isAuth) {
      const user = sessionAuthService.getCurrentUser();
      const token = sessionAuthService.getToken();

      // Validate that we have all required data
      if (!user || !token) {
        set({
          user: null,
          company: null,
          isAuthenticated: false,
          token: null,
        });
        return false;
      }

      // Map user role to company role for navigation
      const mappedUser = {
        ...user,
        role: mapUserRoleToCompanyRole(user.role, user.companyRole),
      };

      // Get company from sessionStorage (saved during login)
      const rawCompany = sessionAuthService.getCompany() || user?.company;

      // Create company object with backward compatibility
      const companyData = rawCompany
        ? {
            ...rawCompany,
            companyId: rawCompany.id, // For backward compatibility
            company: rawCompany, // For backward compatibility (company?.company?.name)
          }
        : null;

      set({
        user: mappedUser,
        company: companyData,
        isAuthenticated: true,
        token,
      });
    } else {
      set({
        user: null,
        company: null,
        isAuthenticated: false,
        token: null,
      });
    }

    return isAuth;
  },

  // Initialize (check existing session)
  initialize: () => {
    set({ isLoading: true });

    // Use improved local validation
    const isAuth = get().checkAuth();

    if (!isAuth) {
      set({
        user: null,
        company: null,
        isAuthenticated: false,
        token: null,
        isLoading: false,
      });
    }

    set({ isLoading: false });
    return isAuth;
  },

  // Get Current User
  getCurrentUser: () => {
    return get().user;
  },

  // Get Token
  getToken: () => {
    return sessionAuthService.getToken();
  },
}));
