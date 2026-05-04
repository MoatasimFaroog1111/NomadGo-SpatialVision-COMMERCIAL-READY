import {
  useGetFinancialSummary,
  useGetPipelineStats,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Upload, BarChart3 } from "lucide-react";

const PIE_COLORS = [
  "hsl(199 89% 48%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
];

function fmt(n: number) {
  return n.toLocaleString("en-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Reports() {
  const { data: summary, isLoading: loadingSummary } = useGetFinancialSummary();
  const { data: stats, isLoading: loadingStats } = useGetPipelineStats();

  const isEmpty =
    !loadingSummary && !loadingStats && summary?.totalInvoices === 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Reports & Analytics
        </h1>
        <p className="text-muted-foreground mt-2">
          Financial summaries and pipeline performance metrics.
        </p>
      </div>

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="font-medium">No data to report yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Reports will populate automatically once documents are processed
                and posted to Odoo.
              </p>
            </div>
            <Link href="/upload">
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" /> Upload a Document
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Processed Volume</CardDescription>
                <CardTitle className="text-4xl font-bold font-mono">
                  {loadingSummary ? (
                    <Skeleton className="h-10 w-36 mt-1" />
                  ) : (
                    <>SAR {fmt(summary?.totalAmount ?? 0)}</>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  VAT collected: SAR {fmt(summary?.totalTax ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pipeline Success Rate</CardDescription>
                <CardTitle className="text-4xl font-bold text-emerald-500">
                  {loadingStats ? (
                    <Skeleton className="h-10 w-24 mt-1" />
                  ) : (
                    `${(stats?.successRate ?? 0).toFixed(1)}%`
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {stats?.failedDocuments ?? 0} failed ·{" "}
                  {stats?.duplicatesDetected ?? 0} duplicates blocked
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg Processing Time</CardDescription>
                <CardTitle className="text-4xl font-bold text-primary">
                  {loadingStats ? (
                    <Skeleton className="h-10 w-24 mt-1" />
                  ) : stats?.averageProcessingTimeMs != null ? (
                    `${(stats.averageProcessingTimeMs / 1000).toFixed(1)}s`
                  ) : (
                    <span className="text-muted-foreground/40 text-3xl">—</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {stats?.totalProcessed ?? 0} documents processed
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Documents by Status */}
            <Card>
              <CardHeader>
                <CardTitle>Documents by Status</CardTitle>
                <CardDescription>
                  Distribution across pipeline stages
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {loadingSummary ? (
                  <Skeleton className="w-full h-full" />
                ) : summary?.byStatus && summary.byStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.byStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="count"
                        nameKey="status"
                        label={({ status, count }) => `${status} (${count})`}
                        labelLine={false}
                      >
                        {summary.byStatus.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial Volume by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Volume by Document Type</CardTitle>
                <CardDescription>
                  Total SAR amount per document type
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {loadingSummary ? (
                  <Skeleton className="w-full h-full" />
                ) : summary?.byType && summary.byType.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.byType}>
                      <XAxis
                        dataKey="type"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        formatter={(v: number) => [`SAR ${fmt(v)}`, "Amount"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="amount"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Suppliers */}
            {summary?.topSuppliers && summary.topSuppliers.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Top Suppliers by Volume</CardTitle>
                  <CardDescription>SAR spend by vendor</CardDescription>
                </CardHeader>
                <CardContent className="h-[280px]">
                  {loadingSummary ? (
                    <Skeleton className="w-full h-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.topSuppliers} layout="vertical">
                        <XAxis
                          type="number"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                        />
                        <YAxis
                          dataKey="supplier"
                          type="category"
                          width={160}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <RechartsTooltip
                          cursor={{ fill: "hsl(var(--muted))" }}
                          formatter={(v: number) => [`SAR ${fmt(v)}`, "Total"]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            color: "hsl(var(--foreground))",
                            fontSize: 12,
                          }}
                        />
                        <Bar
                          dataKey="totalAmount"
                          fill="hsl(var(--primary))"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stage Breakdown */}
            {stats?.stageBreakdown &&
              stats.stageBreakdown.some((s) => s.avgDurationMs != null) && (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Avg Processing Time by Stage</CardTitle>
                    <CardDescription>
                      Real measured pipeline performance (ms)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-[280px]">
                    {loadingStats ? (
                      <Skeleton className="w-full h-full" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={stats.stageBreakdown.filter(
                            (s) => s.avgDurationMs != null,
                          )}
                          layout="vertical"
                        >
                          <XAxis
                            type="number"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `${v}ms`}
                          />
                          <YAxis
                            dataKey="stage"
                            type="category"
                            width={100}
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                          />
                          <RechartsTooltip
                            cursor={{ fill: "hsl(var(--muted))" }}
                            formatter={(v: number) => [`${v}ms`, "Avg time"]}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              borderColor: "hsl(var(--border))",
                              color: "hsl(var(--foreground))",
                              fontSize: 12,
                            }}
                          />
                          <Bar
                            dataKey="avgDurationMs"
                            fill="hsl(var(--primary))"
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              )}
          </div>
        </>
      )}
    </div>
  );
}
