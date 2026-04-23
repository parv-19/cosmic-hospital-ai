// THEMED: premium SaaS login screen.
import React, { useState } from "react";
import { Bot, Lock, Mail, Moon, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 transition-colors duration-200 dark:bg-slate-950">
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
              <Sparkles size={14} />
              Hospital AI Receptionist SaaS
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-slate-950 dark:text-white">
              Patient calls, appointments, and AI operations in one console.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-500 dark:text-slate-300">
              Manage doctors, call logs, prompts, provider settings, and receptionist behaviour without touching the live telephony pipeline.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                ["Live-safe", "UI changes stay away from backend call flow"],
                ["Config first", "Existing runtime settings surfaced cleanly"],
                ["Role aware", "Admin, doctor, and read-only views"],
                ["Dark ready", "Persistent light and dark mode"],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900">
                  <ShieldCheck className="mb-3 h-5 w-5 text-sky-500" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500 shadow-card-md">
              <Bot size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">AI Receptionist</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Secure hospital management portal</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-card-lg dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Sign in</h3>
            <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Enter your panel credentials to continue.</p>

            <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@hospital.com"
                    className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 py-2.5 font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-sky-600 disabled:opacity-60"
              >
                {loading && (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">AI Receptionist Platform · Secure Access</p>
        </section>
      </div>
    </div>
  );
}
