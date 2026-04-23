Here's your exact prompt:

---

**PROMPT:**

I have a React + Vite + Tailwind CSS admin dashboard for an AI Hospital Receptionist SaaS. I need you to apply a **complete professional UI theme overhaul** across the entire app — every page, every component — so it looks like a premium purchased Tailwind/Material UI theme (think Tremor, Metronic, or Tailwind UI Application UI kit).

**Stack:** React, Vite, Tailwind CSS, no component library installed yet

**Core requirement:** Install and configure `shadcn/ui` as the component foundation. Use it for all cards, tables, badges, buttons, dropdowns, dialogs, and inputs going forward.

---

**DESIGN SYSTEM TO ESTABLISH:**

Create `src/theme/tokens.ts` with these exact values:

```
Primary:     #0EA5E9  (sky-500)
Primary dark: #0284C7
Sidebar bg light: #FFFFFF
Sidebar bg dark:  #0F172A
Content bg light: #F8FAFC
Content bg dark:  #0F172A
Card bg light:    #FFFFFF
Card bg dark:     #1E293B
Border light:     #E2E8F0
Border dark:      #334155
Text primary:     #0F172A / #F8FAFC
Text muted:       #64748B / #94A3B8
Success:   #10B981
Warning:   #F59E0B
Danger:    #EF4444
```

---

**DARK MODE:**

- Use Tailwind `darkMode: 'class'` strategy
- Add a `ThemeProvider` context in `src/context/ThemeContext.tsx` that toggles `dark` class on `<html>`
- Persist preference to `localStorage` key `theme`
- Add a dark/light toggle button in the top header bar — sun icon for light, moon icon for dark, smooth transition
- Every single component must support both modes using Tailwind `dark:` variants

---

**GLOBAL LAYOUT (`AppShell.tsx`):**

- Sidebar: 260px wide, `bg-white dark:bg-slate-900`, logo at top, nav items with active teal left-border + bg highlight
- Top header: `h-16`, search bar (UI only), notification bell with badge, dark mode toggle, user avatar dropdown
- Content area: `bg-slate-50 dark:bg-slate-900`, `p-6`, smooth page transitions with `transition-all duration-200`
- Sidebar collapse button for mobile — hide sidebar below `md` breakpoint, hamburger menu

---

**COMPONENT STANDARDS (apply everywhere):**

- Cards: `bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6`
- Stat cards: colored top-border accent (4px), large bold number, muted label, trend indicator arrow
- Tables: `divide-y divide-slate-100 dark:divide-slate-700`, hover row `hover:bg-slate-50 dark:hover:bg-slate-700/50`
- Badges: rounded-full, semantic colors, `text-xs font-medium px-2.5 py-0.5`
- Buttons: primary = teal filled, secondary = outlined, ghost = text only, all with hover/focus/disabled states
- Inputs: `border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-sky-500`
- All transitions: `transition-colors duration-200`

---

**PAGES TO RESTYLE (keep all existing logic/API calls intact):**

1. **DashboardPage** — premium stat cards with gradients, doctor performance table with progress bars and avatars, slot visibility with capacity indicators
2. **AnalyticsPage** — chart cards with proper headers, date range selector, metric comparison badges
3. **CallLogsPage** — searchable filterable table, status badges, expandable transcript row
4. **DirectoryPage** — doctor cards in grid layout, specialization color tags, availability dot indicator
5. **SettingsPage** — grouped settings with section dividers, toggle switches, save confirmation toast
6. **AIConfigPage** — provider selector cards with health status indicators, model dropdowns
7. **PromptsPage** — textarea with character count, language tabs, preview panel
8. **BehaviourPage** — toggle rows with descriptions, grouped by category

---

**TYPOGRAPHY SYSTEM:**

- Page titles: `text-2xl font-bold text-slate-900 dark:text-white`
- Section labels: `text-xs font-semibold uppercase tracking-wider text-slate-400`
- Metric numbers: `text-3xl font-bold`
- Body: `text-sm text-slate-600 dark:text-slate-300`
- Captions: `text-xs text-slate-400`

---

**SIDEBAR NAVIGATION:**

Each nav item: icon + label + optional badge count
Active state: `bg-sky-50 dark:bg-sky-900/20 text-sky-600 border-l-2 border-sky-500`
Inactive: `text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800`
Bottom section: user info card with avatar, name, role, logout button

---

**DELIVER:**

- `src/context/ThemeContext.tsx`
- `src/theme/tokens.ts`
- Updated `AppShell.tsx`
- Updated `App.tsx` (wrap with ThemeProvider)
- All 8 page components restyled
- `tailwind.config.js` updated with `darkMode: 'class'` and custom color tokens

**CONSTRAINTS:**
- No new npm packages except `shadcn/ui` and `lucide-react` (for icons) if not already installed
- Do NOT change any API calls, data fetching, auth logic, or routing
- Every new class must work in both light and dark mode
- Add `// THEMED:` comment on files you modify so I can track changes

---

This prompt will give you a full theme system — light/dark toggle, consistent tokens across every page, professional enough to demo to any hospital client.