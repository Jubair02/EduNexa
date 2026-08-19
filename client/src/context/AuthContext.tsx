import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authService } from "@/services/auth.service";
import type { LoginPayload, RegisterPayload, User } from "@/types";
import { clearToken, getToken, setToken } from "@/utils/token";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
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
    }),
    [user, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
