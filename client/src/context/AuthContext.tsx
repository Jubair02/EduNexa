import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SESSION_EXPIRED_EVENT } from "@/services/api";
import { authService } from "@/services/auth.service";
import type {
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
  User,
} from "@/types";
import { clearToken, getToken, setToken } from "@/utils/token";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  /**
   * Saves the signed-in user's own profile. It lives here rather than in the
   * page because the context owns `user` — the navbar and user menu read the
   * name from it, so they update the moment this resolves.
   */
  updateProfile: (payload: UpdateProfilePayload) => Promise<User>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore the session on first load: if a token is stored, ask the API who
  // we are. An invalid or expired token is simply discarded.
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      if (!getToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const currentUser = await authService.me();
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        clearToken();
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // The API layer clears the token and fires this when a request comes back
  // 401, so a session that expires while the app is open drops to the login
  // screen instead of silently failing every request.
  useEffect(() => {
    const handleExpiry = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<User> => {
    const { user: loggedInUser, token } = await authService.login(payload);
    setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<User> => {
    const { user: registeredUser, token } = await authService.register(payload);
    setToken(token);
    setUser(registeredUser);
    return registeredUser;
  }, []);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<User> => {
      const updated = await authService.updateProfile(payload);
      setUser(updated);
      return updated;
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Stateless JWT: clearing the local token is what actually logs out.
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, isLoading, login, register, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
