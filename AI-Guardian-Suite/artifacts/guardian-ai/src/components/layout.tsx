import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  ArrowRightLeft,
  History,
  BarChart3,
  Upload,
  Brain,
  MessageSquareText,
  Settings,
  Cpu,
  Zap,
  Server,
  Bot,
  MessageCircle,
  Activity,
  ChevronRight,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import gitcLogo from "@/assets/gitc-logo.png";
import { getApiUrl } from "@/lib/api";

const navGroups = [
  {
    label: "النظام",
    items: [
      { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
      {
        href: "/autonomous",
        label: "Autonomous OS",
        icon: Bot,
        badge: "AI",
        badgeColor: "blue",
      },
      {
        href: "/channels",
        label: "قنوات التواصل",
        icon: MessageCircle,
        badge: "NEW",
        badgeColor: "violet",
      },
    ],
  },
  {
    label: "المعالجة",
    items: [
      { href: "/documents", label: "قائمة المستندات", icon: FileText },
      { href: "/upload", label: "رفع مستند", icon: Upload },
      { href: "/approvals", label: "الموافقات", icon: CheckSquare },
      { href: "/transactions", label: "المعاملات", icon: ArrowRightLeft },
    ],
  },
  {
    label: "التحليل",
    items: [
      { href: "/audit", label: "سجل المراجعة", icon: History },
      { href: "/chat", label: "محادثة AI", icon: MessageSquareText },
      { href: "/reports", label: "التقارير", icon: BarChart3 },
    ],
  },
  {
    label: "الذكاء الاصطناعي",
    items: [
      { href: "/memory", label: "ذاكرة AI", icon: Brain },
      {
        href: "/predict",
        label: "التنبؤ المحاسبي",
        icon: Activity,
        badge: "ML",
        badgeColor: "green",
      },
      { href: "/settings", label: "إعدادات AI", icon: Settings },
    ],
  },
];

const PROVIDER_ICONS = {
  openai: { Icon: Zap, label: "OpenAI GPT", color: "text-blue-400" },
  anthropic: { Icon: Cpu, label: "Claude AI", color: "text-violet-400" },
  custom: { Icon: Server, label: "Custom LLM", color: "text-sky-400" },
} as const;

function LlmBadge() {
  const { data } = useQuery({
    queryKey: ["llmSettings"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("settings/llm"));
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        activeProvider: string;
        customName: string | null;
      }>;
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const provider = (data?.activeProvider ?? "openai") as keyof typeof PROVIDER_ICONS;
  const meta = PROVIDER_ICONS[provider] ?? PROVIDER_ICONS.openai;
  const { Icon } = meta;

  return (
    <Link href="/settings">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 hover:border-blue-400/40 transition-all cursor-pointer group">
        <Icon className={cn("w-3 h-3", meta.color)} />
        <span className={cn("text-[10px] font-medium", meta.color)}>
          {provider === "custom" ? (data?.customName ?? "Custom") : meta.label}
        </span>
      </div>
    </Link>
  );
}

function OdooStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ["odooStatus"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("odoo/status"));
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        connected: boolean;
        company: string;
        uid: number;
      }>;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-[10px] text-yellow-400">Connecting...</span>
      </div>
    );
  }

  if (data?.connected) {
    return (
      <div className="flex items-center gap-1.5" title={`${data.company} · UID ${data.uid}`}>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative pulse-dot" />
        <span className="text-[10px] text-emerald-400 font-medium">Odoo Live</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      <span className="text-[10px] text-red-400">Odoo Offline</span>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[100dvh] w-full" style={{ background: "linear-gradient(135deg, #0A1628 0%, #0D1E35 50%, #0A1628 100%)" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className="w-[240px] hidden md:flex flex-col shrink-0 relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(10,22,40,0.98) 0%, rgba(8,18,34,1) 100%)",
          borderRight: "1px solid rgba(33,150,243,0.12)",
          boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Background glow orbs */}
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(33,150,243,0.06)" }} />
        <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(139,92,246,0.04)" }} />

        {/* Logo */}
        <div
          className="h-16 flex items-center px-4 gap-3 shrink-0 relative"
          style={{ borderBottom: "1px solid rgba(33,150,243,0.1)" }}
        >
          <div className="relative">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(33,150,243,0.2) 0%, rgba(139,92,246,0.15) 100%)",
                border: "1px solid rgba(33,150,243,0.3)",
                boxShadow: "0 0 12px rgba(33,150,243,0.2)",
              }}
            >
              <img src={gitcLogo} alt="GITC" className="w-7 h-7 object-contain" />
            </div>
            <div
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{
                background: "#4ade80",
                border: "2px solid #0A1628",
                boxShadow: "0 0 6px rgba(74,222,128,0.6)",
              }}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm tracking-tight leading-tight" style={{ color: "#E8F0FE" }}>
              GuardianAI
            </span>
            <span className="text-[9px] tracking-widest uppercase font-medium" style={{ color: "rgba(33,150,243,0.7)" }}>
              GITC International
            </span>
          </div>
          <Shield className="w-4 h-4 ml-auto shrink-0" style={{ color: "rgba(33,150,243,0.4)" }} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {navGroups.map((group) => {
            const hasActive = group.items.some((item) =>
              item.href === "/" ? location === "/" : location.startsWith(item.href),
            );
            return (
              <div key={group.label}>
                <div className="px-3 mb-1.5 flex items-center gap-2">
                  <span className="text-[9px] font-bold tracking-widest uppercase select-none" style={{ color: "rgba(144,202,249,0.3)" }}>
                    {group.label}
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{
                      background: hasActive
                        ? "linear-gradient(90deg, rgba(33,150,243,0.4) 0%, transparent 100%)"
                        : "rgba(255,255,255,0.05)",
                    }}
                  />
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? location === "/"
                        : location.startsWith(item.href);
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group relative"
                          style={
                            isActive
                              ? {
                                  background: "linear-gradient(90deg, rgba(33,150,243,0.18) 0%, rgba(33,150,243,0.06) 100%)",
                                  borderLeft: "2px solid #2196F3",
                                  color: "#90CAF9",
                                  boxShadow: "inset 0 0 20px rgba(33,150,243,0.05)",
                                }
                              : { color: "rgba(144,202,249,0.45)" }
                          }
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLElement).style.background = "rgba(33,150,243,0.06)";
                              (e.currentTarget as HTMLElement).style.color = "rgba(232,240,254,0.85)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLElement).style.background = "";
                              (e.currentTarget as HTMLElement).style.color = "rgba(144,202,249,0.45)";
                            }
                          }}
                        >
                          <item.icon
                            className="w-4 h-4 shrink-0 transition-colors"
                            style={{ color: isActive ? "#2196F3" : "rgba(144,202,249,0.35)" }}
                          />
                          <span className="truncate flex-1 text-[13px]">{item.label}</span>
                          {(item as { badge?: string }).badge ? (
                            <span
                              className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                              style={
                                (item as { badgeColor?: string }).badgeColor === "blue"
                                  ? { background: "rgba(33,150,243,0.15)", color: "#90CAF9", border: "1px solid rgba(33,150,243,0.3)" }
                                  : { background: "rgba(139,92,246,0.15)", color: "#C4B5FD", border: "1px solid rgba(139,92,246,0.3)" }
                              }
                            >
                              {(item as { badge?: string }).badge}
                            </span>
                          ) : null}
                          {isActive ? (
                            <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "rgba(33,150,243,0.6)" }} />
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="shrink-0 p-3 space-y-3 relative"
          style={{ borderTop: "1px solid rgba(33,150,243,0.1)" }}
        >
          <div className="flex items-center justify-between px-1">
            <OdooStatus />
            <LlmBadge />
          </div>
          <div
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg"
            style={{
              background: "rgba(33,150,243,0.05)",
              border: "1px solid rgba(33,150,243,0.12)",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(33,150,243,0.3) 0%, rgba(139,92,246,0.25) 100%)",
                border: "1px solid rgba(33,150,243,0.3)",
                color: "#90CAF9",
              }}
            >
              MN
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold leading-tight" style={{ color: "rgba(232,240,254,0.8)" }}>
                Motasim Noor
              </span>
              <span className="text-[10px] leading-tight" style={{ color: "rgba(144,202,249,0.35)" }}>
                CFO / System Admin
              </span>
            </div>
            <Activity className="w-3 h-3 shrink-0 ml-auto" style={{ color: "#4ade80" }} />
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 page-enter">{children}</div>
        </div>
      </main>
    </div>
  );
}
