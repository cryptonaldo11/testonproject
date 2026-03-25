import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Button } from "@/components/ui/core";
import { Leaf, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token);
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || "Invalid credentials");
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-background">
      {/* Background Image Area */}
      <div className="hidden lg:block lg:w-1/2 relative bg-primary">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-primary mix-blend-multiply z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`} 
          alt="Corporate Building" 
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 z-20 flex flex-col justify-center p-16 text-white">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Leaf className="w-16 h-16 mb-8 text-emerald-300" />
            <h1 className="text-5xl font-display font-bold mb-6 leading-tight">
              Cultivating Excellence <br/>in Every Landscape.
            </h1>
            <p className="text-xl text-emerald-50 max-w-md font-medium">
              Enterprise Human Resource Management for Teston Landscape & Contractor.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Login Form Area */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        {/* Decorative blobs */}
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-secondary/50 rounded-full blur-3xl" />
        
        <Card className="w-full max-w-md border-0 shadow-2xl bg-white/80 backdrop-blur-xl z-10 relative overflow-visible">
          <CardHeader className="space-y-3 pb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg shadow-primary/20 flex items-center justify-center text-white font-display font-bold text-2xl mb-2 lg:hidden">
              T
            </div>
            <CardTitle className="text-3xl">Welcome back</CardTitle>
            <p className="text-muted-foreground">Sign in to your Teston HR account</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-destructive/10 text-destructive flex items-center gap-3 text-sm font-medium border border-destructive/20">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </motion.div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@teston.com.sg" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a href="#" className="text-xs font-semibold text-primary hover:underline">Forgot password?</a>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-12 text-base mt-4" 
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Authenticating..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
