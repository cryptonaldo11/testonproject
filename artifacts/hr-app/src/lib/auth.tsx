import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetMe, UserResponse } from "@workspace/api-client-react";

export const ADMIN_ONLY_ROLES = ["admin"] as const;
export const ADMIN_HR_ROLES = ["admin", "hr"] as const;
export const MANAGER_ROLES = ["manager"] as const;
export const OPERATIONAL_ROLES = ["admin", "hr", "manager"] as const;
export const SELF_SERVICE_ROLES = ["worker", "driver"] as const;

export type AppPermission =
  | "operational:read:all"
  | "operational:read:team"
  | "reports:read:all"
  | "reports:read:team"
  | "users:read"
  | "users:write"
  | "leaves:review"
  | "alerts:resolve"
  | "alerts:assign"
  | "exceptions:review"
  | "productivity:manage"
  | "face:manage";

type AppRole = "admin" | "hr" | "manager" | "worker" | "driver";

const ALL_PERMISSIONS: readonly AppPermission[] = [
  "operational:read:all",
  "operational:read:team",
  "reports:read:all",
  "reports:read:team",
  "users:read",
  "users:write",
  "leaves:review",
  "alerts:resolve",
  "alerts:assign",
  "exceptions:review",
  "productivity:manage",
  "face:manage",
];

const ROLE_PERMISSIONS: Record<AppRole, readonly AppPermission[]> = {
  admin: ALL_PERMISSIONS,
  hr: [
    "operational:read:all",
    "reports:read:all",
    "users:read",
    "leaves:review",
    "alerts:resolve",
    "alerts:assign",
    "exceptions:review",
    "productivity:manage",
    "face:manage",
  ],
  manager: [
    "operational:read:team",
    "reports:read:team",
    "users:read",
    "alerts:assign",
    "exceptions:review",
  ],
  worker: [],
  driver: [],
};

interface AuthContextType {
  user: UserResponse | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  hasRole: (roles: readonly string[]) => boolean;
  hasPermission: (permission: AppPermission) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Intercept global fetch to attach the token
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    init = init || {};
    init.headers = {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return originalFetch(input, init);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth_token"));
  const [location, setLocation] = useLocation();

  const { data: user, isLoading, isError, refetch } = useGetMe({
    query: {
      queryKey: ["auth", "me"],
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (isError) {
      handleLogout();
    }
  }, [isError]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    refetch();
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    if (location !== "/login") {
      setLocation("/login");
    }
  };

  const hasRole = (roles: readonly string[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const hasPermission = (permission: AppPermission) => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role as AppRole].includes(permission);
  };

  // If we have a token but haven't loaded user yet, show loading
  const isAuthLoading = !!token && isLoading;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login: handleLogin, logout: handleLogout, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
