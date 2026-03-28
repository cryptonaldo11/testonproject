> **BrainSync Context Pumper** 🧠
> Dynamically loaded for active file: `artifacts/hr-app/src/pages/Alerts.tsx` (Domain: **Frontend (React/UI)**)

### 📐 Frontend (React/UI) Conventions & Fixes
- **[what-changed] Replaced auth AuthContext**: -       enabled: !!token,
+       queryKey: ["auth", "me"],
-       retry: false,
+       enabled: !!token,
-     }
+       retry: false,
-   });
+     }
- 
+   });
-   useEffect(() => {
+ 
-     if (isError) {
+   useEffect(() => {
-       handleLogout();
+     if (isError) {
-     }
+       handleLogout();
-   }, [isError]);
+     }
- 
+   }, [isError]);
-   const handleLogin = (newToken: string) => {
+ 
-     localStorage.setItem("auth_token", newToken);
+   const handleLogin = (newToken: string) => {
-     setToken(newToken);
+     localStorage.setItem("auth_token", newToken);
-     refetch();
+     setToken(newToken);
-   };
+     refetch();
- 
+   };
-   const handleLogout = () => {
+ 
-     localStorage.removeItem("auth_token");
+   const handleLogout = () => {
-     setToken(null);
+     localStorage.removeItem("auth_token");
-     if (location !== "/login") {
+     setToken(null);
-       setLocation("/login");
+     if (location !== "/login") {
-     }
+       setLocation("/login");
-   };
+     }
- 
+   };
-   const hasRole = (roles: string[]) => {
+ 
-     if (!user) return false;
+   const hasRole = (roles: string[]) => {
-     return roles.includes(user.role);
+     if (!user) return false;
-   };
+     return roles.includes(user.role);
- 
+   };
-   // If we have a token but haven't loaded user yet, show loading
+ 
-   const isAuthLoading = !!token && isLoading;
+   // If we have a token but haven't loaded user yet, show loading
- 
+   const isAuthLoading = !!token && isLoading;
-   if (isAuthLoading) {
+ 
-     return (
+   if (isAuthLoading) {
-       <div className="min-h-screen flex items-center justify-center bg-background">
+     return (
-         <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
+       <div className="min-h-screen flex items-center justify-center bg-background">
-       </div>
+         <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [AuthContextType, AuthContext, originalFetch, fetch, AuthProvider]
