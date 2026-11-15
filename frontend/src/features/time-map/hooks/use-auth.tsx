import { createContext, ReactNode, useContext } from "react";

interface AuthContextType {
  isLoggedIn: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({ isLoggedIn: false, isSuperAdmin: false });

export function useAuth() {
  return useContext(AuthContext);
}

/** The admin dashboard verifies the session before rendering the time map. */
export function AuthProvider({ children, isAdmin }: { children: ReactNode; isAdmin: boolean }) {
  return <AuthContext.Provider value={{ isLoggedIn: isAdmin, isSuperAdmin: isAdmin }}>{children}</AuthContext.Provider>;
}
