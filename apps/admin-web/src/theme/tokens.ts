// THEMED: shared design tokens for the AI Hospital Receptionist SaaS theme.
export const themeTokens = {
  primary: "#0EA5E9",
  primaryDark: "#0284C7",
  sidebarBgLight: "#FFFFFF",
  sidebarBgDark: "#0F172A",
  contentBgLight: "#F8FAFC",
  contentBgDark: "#0F172A",
  cardBgLight: "#FFFFFF",
  cardBgDark: "#1E293B",
  borderLight: "#E2E8F0",
  borderDark: "#334155",
  textPrimaryLight: "#0F172A",
  textPrimaryDark: "#F8FAFC",
  textMutedLight: "#64748B",
  textMutedDark: "#94A3B8",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
} as const;

export type ThemeTokenName = keyof typeof themeTokens;
