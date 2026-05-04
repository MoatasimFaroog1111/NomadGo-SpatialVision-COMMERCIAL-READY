import {
  useGetDashboardOverview,
  useGetRecentActivity,
  useGetConfidenceBreakdown,
} from "@workspace/api-client-react";
import type { ActivityItem } from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Activity as ActivityIcon,
  Upload,
  ArrowRight,
  Zap,
  Brain,
  Shield,
  TrendingUp,
  ChevronRight,
  Cpu,
  Database,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ── AI Metric Card ──────────────────────────────────────────────────
function MetricCard({
  title,
  titleAr,
  value,
  icon: Icon,
  colorClass,
  glowClass,
  unit = "",
}: {
  title: string;
  titleAr: string;
  value: number | string;
  icon: React.ElementType;
  colorClass: string;
  glowClass: string;
  unit?: string;
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-5 relative overflow-hidden group",
        colorClass,
      )}
    >
      {/* corner glow */}
      <div
        className={cn(
          "absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity",
          glowClass,
        )}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              glowClass + "/20",
              "border border-white/10",
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5",
                colorClass
                  .replace("metric-card-", "text-")
                  .replace("cyan", "cyan-400")
                  .replace("violet", "violet-400")
                  .replace("green", "emerald-400")
                  .replace("amber", "amber-400")
                  .replace("red", "red-400"),
              )}
            />
          </div>
          <div
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: "currentColor" }}
          />
        </div>
        <div>
          <p className="text-3xl font-bold text-white tracking-tight leading-none">
            {value}
            {unit}
          </p>
          <p className="text-xs text-white/50 mt-1.5 font-medium">{title}</p>
          <p className="text-[10px] text-white/25 mt-0.5">{titleAr}</p>
        </div>
      </div>
    </div>
  );
}

// ── AI Badge ────────────────────────────────────────────────────────
function AiBadge({
  label,
  active = true,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border",
        active
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          : "bg-white/5 text-white/30 border-white/10",
      )}
    >
      <span
        className={cn(
          "w-1 h-1 rounded-full",
          active ? "bg-emerald-400 animate-pulse" : "bg-white/20",
        )}
      />
      {label}
    </span>
  );
}

// ── Pipeline Agent ──────────────────────────────────────────────────
function AgentDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
          active
            ? "border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_12px_rgba(0,225,255,0.3)]"
            : "border-white/10 bg-white/5",
        )}
      >
        <Cpu
          className={cn(
            "w-3.5 h-3.5",
            active ? "text-cyan-400" : "text-white/20",
          )}
        />
      </div>
      <span
        className={cn(
          "text-[9px] text-center leading-tight font-medium",
          active ? "text-cyan-400/80" : "text-white/20",
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────
export default function Dashboard() {
  const { data: overview, isLoading: loadingOverview } =
    useGetDashboardOverview();
  const { data: recentActivity, isLoading: loadingActivity } =
    useGetRecentActivity({ limit: 8 });
  const { data: confidence, isLoading: loadingConfidence } =
    useGetConfidenceBreakdown();

  const isEmpty =
    !loadingOverview &&
    overview &&
    overview.documentsToday === 0 &&
    overview.autoPostedToday === 0 &&
    overview.pendingApprovals === 0 &&
    overview.totalPostedThisMonth === 0;

  const confidenceScore = confidence
    ? Math.round(confidence.averageScore * 100)
    : null;

  const healthColor =
    overview?.pipelineHealth === "healthy"
      ? "text-emerald-400"
      : overview?.pipelineHealth === "degraded"
        ? "text-amber-400"
        : "text-red-400";

  const agents = [
    "Dedup",
    "Extract",
    "Match",
    "Classify",
    "CPA",
    "Validate",
    "Post",
    "Audit",
    "Memory",
    "Gate",
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden">
        {/* Neural grid bg */}
        <div className="absolute inset-0 neural-grid opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/8 via-transparent to-violet-500/8" />
        {/* Glow orbs */}
        <div className="absolute top-0 left-1/4 w-64 h-32 bg-cyan-500/10 blur-3xl rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-48 h-24 bg-violet-500/10 blur-3xl rounded-full" />

        <div className="relative z-10 px-8 py-8 border border-white/[0.06] rounded-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <AiBadge label="SYSTEM LIVE" active={true} />
                <AiBadge
                  label="ODOO CONNECTED"
                  active={overview !== undefined}
                />
                <AiBadge label="10-AGENT PIPELINE" active={true} />
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
                <span className="gradient-text">GuardianAI</span>
              </h1>
              <p className="text-sm text-white/40 mt-2 max-w-xl leading-relaxed">
                النظام المحاسبي الذكي لـ GITC INTERNATIONAL HOLDING CO. · تحليل
                مستندات بالوقت الفعلي · ZATCA + IFRS
              </p>
            </div>

            {/* Confidence Orb */}
            {confidenceScore !== null ? (
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r="38"
                      fill="none"
                      stroke="rgba(0,225,255,0.1)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="38"
                      fill="none"
                      stroke="url(#confGrad)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 38}`}
                      strokeDashoffset={`${2 * Math.PI * 38 * (1 - confidenceScore / 100)}`}
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient
                        id="confGrad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        <stop offset="0%" stopColor="#00e1ff" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold gradient-text-cyan">
                      {confidenceScore}%
                    </span>
                    <span className="text-[9px] text-white/40 leading-tight text-center">
                      AI
                      <br />
                      Confidence
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Agent Pipeline Viz */}
          <div className="mt-6 pt-6 border-t border-white/[0.05]">
            <div className="flex items-center gap-1.5 mb-3">
              <Brain className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] text-white/40 font-bold tracking-widest uppercase">
                10-Agent Deep Pipeline
              </span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {agents.map((agent, i) => (
                <div key={agent} className="flex items-center gap-1 shrink-0">
                  <AgentDot label={agent} active={true} />
                  {i < agents.length - 1 ? (
                    <div className="w-4 h-px bg-gradient-to-r from-cyan-500/30 to-cyan-500/10 shrink-0" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────── */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card rounded-2xl h-32 shimmer" />
          ))}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Documents Today"
            titleAr="مستندات اليوم"
            value={overview.documentsToday}
            icon={FileText}
            colorClass="metric-card-cyan"
            glowClass="bg-cyan-400"
          />
          <MetricCard
            title="Auto-Posted to Odoo"
            titleAr="ترحيل تلقائي"
            value={overview.autoPostedToday}
            icon={CheckCircle2}
            colorClass="metric-card-green"
            glowClass="bg-emerald-400"
          />
          <MetricCard
            title="Pending Approvals"
            titleAr="بانتظار الموافقة"
            value={overview.pendingApprovals}
            icon={Clock}
            colorClass={
              overview.pendingApprovals > 5
                ? "metric-card-amber"
                : "metric-card-violet"
            }
            glowClass={
              overview.pendingApprovals > 5 ? "bg-amber-400" : "bg-violet-400"
            }
          />
          <MetricCard
            title="Exceptions / Failed"
            titleAr="أخطاء / فشل"
            value={overview.failedToday}
            icon={AlertTriangle}
            colorClass={
              overview.failedToday > 0 ? "metric-card-red" : "metric-card-green"
            }
            glowClass={
              overview.failedToday > 0 ? "bg-red-400" : "bg-emerald-400"
            }
          />
        </div>
      ) : null}

      {/* ── Monthly Stats Strip ─────────────────────────────────── */}
      {overview && !isEmpty ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-white/40 font-medium">
                Posted This Month
              </p>
              <p className="text-xl font-bold text-white">
                SAR{" "}
                {(overview.totalPostedThisMonth ?? 0).toLocaleString("en-SA", {
                  minimumFractionDigits: 0,
                })}
              </p>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-white/40 font-medium">
                Duplicates Blocked
              </p>
              <p className="text-xl font-bold text-white">
                {overview.duplicatesBlocked}
              </p>
            </div>
          </div>
          <div
            className={cn("glass-card rounded-xl p-4 flex items-center gap-4")}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0",
                overview.pipelineHealth === "healthy"
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : overview.pipelineHealth === "degraded"
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-red-500/10 border-red-500/20",
              )}
            >
              <Zap className={cn("w-5 h-5", healthColor)} />
            </div>
            <div>
              <p className="text-xs text-white/40 font-medium">
                Pipeline Health
              </p>
              <p className={cn("text-xl font-bold capitalize", healthColor)}>
                {overview.pipelineHealth}
              </p>
            </div>
            {overview.pendingApprovals > 0 ? (
              <Link href="/approvals" className="ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-white/10 hover:border-cyan-500/30"
                >
                  Review {overview.pendingApprovals}{" "}
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Onboarding CTA ──────────────────────────────────────── */}
      {isEmpty ? (
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/8 to-violet-500/8" />
          <div className="absolute inset-0 neural-grid opacity-30" />
          <div className="relative z-10 border border-cyan-500/20 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center shrink-0 border border-cyan-500/20 float-slow">
              <Upload className="w-8 h-8 text-cyan-400" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-bold text-white mb-2">
                النظام جاهز لأول مستند
              </h3>
              <p className="text-white/50 text-sm leading-relaxed max-w-xl">
                GuardianAI متصل بأودو وجاهز لمعالجة الفواتير والإيصالات. ارفع
                ملف PDF أو صورة لتشغيل خط أنابيب 10 وكلاء ذكاء اصطناعي — استخراج
                · تصنيف · تحليل CPA · ترحيل تلقائي.
              </p>
            </div>
            <Link href="/upload">
              <Button className="btn-glow bg-gradient-to-r from-cyan-500 to-cyan-600 text-black font-bold shrink-0 px-6">
                رفع أول مستند <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Activity + Confidence ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">النشاط الأخير</h3>
            </div>
            <span className="text-[10px] text-white/30 font-mono">
              LIVE FEED
            </span>
          </div>
          <div className="p-4">
            {loadingActivity ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-white/[0.03] shimmer"
                  />
                ))}
              </div>
            ) : recentActivity?.activities &&
              recentActivity.activities.length > 0 ? (
              <div className="space-y-1.5 ai-table">
                {recentActivity.activities.map((activity: ActivityItem) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group"
                  >
                    <div
                      className={cn(
                        "mt-0.5 w-2 h-2 rounded-full shrink-0 mt-1.5",
                        activity.severity === "error"
                          ? "bg-red-400"
                          : activity.severity === "warning"
                            ? "bg-amber-400"
                            : "bg-cyan-400",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/75 leading-snug font-medium truncate">
                        {activity.message}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/30 font-mono">
                          {new Date(activity.timestamp).toLocaleString(
                            "en-SA",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                        {activity.documentId ? (
                          <Link href={`/documents/${activity.documentId}`}>
                            <span className="text-[10px] text-cyan-400/70 hover:text-cyan-400 font-mono transition-colors">
                              DOC #{activity.documentId}
                            </span>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-cyan-400/40 transition-colors shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Database className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-sm font-medium text-white/30">
                  لا يوجد نشاط بعد
                </p>
                <p className="text-xs text-white/20 mt-1">
                  ستظهر أحداث الأنابيب هنا بعد رفع المستندات
                </p>
              </div>
            )}
          </div>
        </div>

        {/* AI Confidence Panel */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.05] flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">
              دقة الذكاء الاصطناعي
            </h3>
          </div>
          <div className="p-6">
            {loadingConfidence ? (
              <div className="space-y-4">
                <div className="w-28 h-28 mx-auto rounded-full bg-white/5 shimmer" />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 rounded bg-white/5 shimmer" />
                  ))}
                </div>
              </div>
            ) : confidence &&
              confidence.high + confidence.medium + confidence.low > 0 ? (
              <div className="space-y-6">
                {/* Big score */}
                <div className="text-center">
                  <div className="text-5xl font-extrabold gradient-text-cyan">
                    {(confidence.averageScore * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-white/35 mt-1">
                    متوسط درجة الثقة
                  </div>
                </div>

                {/* Bars */}
                <div className="space-y-3">
                  {[
                    {
                      label: "عالية (≥85%)",
                      value: confidence.high,
                      color: "bg-emerald-400",
                      textColor: "text-emerald-400",
                    },
                    {
                      label: "متوسطة (60–84%)",
                      value: confidence.medium,
                      color: "bg-amber-400",
                      textColor: "text-amber-400",
                    },
                    {
                      label: "منخفضة (<60%)",
                      value: confidence.low,
                      color: "bg-red-400",
                      textColor: "text-red-400",
                    },
                  ].map(({ label, value, color, textColor }) => {
                    const total =
                      confidence.high + confidence.medium + confidence.low;
                    const pct =
                      total > 0 ? Math.round((value / total) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-white/40">{label}</span>
                          <span
                            className={cn(
                              "text-xs font-bold font-mono",
                              textColor,
                            )}
                          >
                            {value}
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-1000",
                              color,
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
                  <span className="text-[10px] text-white/30">
                    Auto-post threshold
                  </span>
                  <span className="text-[10px] font-bold text-cyan-400 font-mono">
                    ≥ 85%
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-sm text-white/30">
                  لم تتم معالجة أي مستند بعد
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-white/[0.05]" />
          <span className="text-[10px] text-white/25 font-bold tracking-widest uppercase px-3">
            إجراءات سريعة
          </span>
          <div className="h-px flex-1 bg-white/[0.05]" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              href: "/upload",
              icon: Upload,
              label: "رفع مستند",
              color: "text-cyan-400",
              bg: "bg-cyan-500/10 border-cyan-500/20",
            },
            {
              href: "/chat",
              icon: Brain,
              label: "محادثة AI",
              color: "text-violet-400",
              bg: "bg-violet-500/10 border-violet-500/20",
            },
            {
              href: "/approvals",
              icon: CheckCircle2,
              label: "الموافقات",
              color: "text-emerald-400",
              bg: "bg-emerald-500/10 border-emerald-500/20",
            },
            {
              href: "/reports",
              icon: BarChart2,
              label: "التقارير",
              color: "text-amber-400",
              bg: "bg-amber-500/10 border-amber-500/20",
            },
          ].map(({ href, icon: Icon, label, color, bg }) => (
            <Link key={href} href={href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200",
                  "hover:scale-[1.02] hover:shadow-lg bg-white/[0.02] hover:bg-white/[0.04]",
                  bg,
                )}
              >
                <Icon className={cn("w-4 h-4", color)} />
                <span className="text-sm font-medium text-white/70">
                  {label}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-white/20 ml-auto" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
