import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Brain,
  Zap,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  RefreshCw,
  BookOpen,
  Shield,
  ChevronDown,
  ChevronUp,
  Send,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

interface PredictRequest {
  description: string;
  transaction_type: string;
  amount: number;
  tax_rate: number;
  currency: string;
  has_vat_number: boolean;
}

interface AccountInfo {
  code: string;
  name: string;
  type: string;
  confidence: number;
}

interface PredictResult {
  mode: "single" | "multi";
  confidence: number;
  debit_account?: AccountInfo;
  credit_account?: AccountInfo;
  suggested_description?: string;
  suggested_category?: string;
  top_debit_candidates?: { code: string; name: string; confidence: number }[];
  top_credit_candidates?: { code: string; name: string; confidence: number }[];
  validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  zatca_compliance?: {
    compliant: boolean;
    issues: string[];
    notes: string[];
  };
  rule_applied?: string;
  message?: string;
}

interface ModelInfo {
  best_model: string;
  training_samples: number;
  feature_count: number;
  debit_classes: number;
  credit_classes: number;
  results: Record<string, { avg_f1: number; debit: { accuracy: number }; credit: { accuracy: number } }>;
}

const TRANSACTION_TYPES = [
  { value: "invoice", label: "فاتورة" },
  { value: "receipt", label: "إيصال" },
  { value: "expense", label: "مصروف" },
  { value: "bank_statement", label: "كشف بنكي" },
  { value: "credit_note", label: "إشعار دائن" },
  { value: "other", label: "أخرى" },
];

const CURRENCIES = ["SAR", "USD", "EUR", "AED", "GBP"];

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "text-green-400 bg-green-400/10 border-green-400/30" :
    pct >= 60 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" :
    "text-red-400 bg-red-400/10 border-red-400/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
      <TrendingUp size={10} />
      {pct}%
    </span>
  );
}

function AccountCard({
  label,
  account,
  side,
}: {
  label: string;
  account: AccountInfo;
  side: "debit" | "credit";
}) {
  const borderColor = side === "debit" ? "border-blue-500/40" : "border-purple-500/40";
  const bgColor = side === "debit" ? "bg-blue-500/5" : "bg-purple-500/5";
  const textColor = side === "debit" ? "text-blue-300" : "text-purple-300";
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${textColor}`}>{label}</span>
        <ConfidenceBadge value={account.confidence} />
      </div>
      <div className="font-mono text-lg font-bold text-white">{account.code}</div>
      <div className="text-sm text-slate-300 mt-1">{account.name || account.code}</div>
      {account.type && (
        <div className="text-xs text-slate-500 mt-1">{account.type}</div>
      )}
    </div>
  );
}

export default function PredictPage() {
  const [form, setForm] = useState<PredictRequest>({
    description: "",
    transaction_type: "expense",
    amount: 0,
    tax_rate: 15,
    currency: "SAR",
    has_vat_number: false,
  });
  const [result, setResult] = useState<PredictResult | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [selectedDebit, setSelectedDebit] = useState<string>("");
  const [selectedCredit, setSelectedCredit] = useState<string>("");

  const { data: modelInfo } = useQuery<ModelInfo>({
    queryKey: ["ml-model-info"],
    queryFn: async () => {
      const res = await fetch("/ml/model-info");
      if (!res.ok) throw new Error("Model not ready");
      return res.json();
    },
    retry: false,
  });

  const predictMutation = useMutation({
    mutationFn: async (req: PredictRequest) => {
      const res = await fetch("/ml/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<PredictResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setFeedbackSent(false);
      if (data.debit_account) setSelectedDebit(data.debit_account.code);
      if (data.credit_account) setSelectedCredit(data.credit_account.code);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (correct: boolean) => {
      const body = {
        description: form.description,
        transaction_type: form.transaction_type,
        amount: form.amount,
        correct_debit_code: correct ? (result?.debit_account?.code ?? selectedDebit) : selectedDebit,
        correct_credit_code: correct ? (result?.credit_account?.code ?? selectedCredit) : selectedCredit,
        tax_rate: form.tax_rate,
        currency: form.currency,
      };
      const res = await fetch("/ml/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => setFeedbackSent(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setShowCandidates(false);
    predictMutation.mutate(form);
  };

  const bestModelF1 = modelInfo
    ? Math.max(...Object.values(modelInfo.results).map((r) => r.avg_f1))
    : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Brain className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">التنبؤ المحاسبي الذكي</h1>
          <p className="text-slate-400 text-sm">نموذج ML يتنبأ بالقيود المحاسبية تلقائياً</p>
        </div>
      </div>

      {modelInfo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "أفضل نموذج", value: modelInfo.best_model.toUpperCase(), icon: Brain },
            { label: "دقة النموذج", value: `${(bestModelF1! * 100).toFixed(1)}%`, icon: TrendingUp },
            { label: "عينات التدريب", value: modelInfo.training_samples.toLocaleString(), icon: BookOpen },
            { label: "الميزات", value: modelInfo.feature_count.toLocaleString(), icon: Zap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="glass-card p-3 rounded-xl flex items-center gap-3">
              <Icon className="text-blue-400 shrink-0" size={18} />
              <div>
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-sm font-bold text-white">{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap size={18} className="text-yellow-400" />
          بيانات المعاملة
        </h2>

        <div className="space-y-2">
          <label className="text-sm text-slate-300">وصف المعاملة *</label>
          <input
            type="text"
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="مثال: دفع فاتورة كهرباء، شراء مواد، دفع إيجار..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all"
            dir="auto"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">نوع المعاملة</label>
            <select
              value={form.transaction_type}
              onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-all"
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-slate-800">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">المبلغ</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">معدل الضريبة %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.tax_rate}
              onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">العملة</label>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-all"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-slate-800">{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.has_vat_number}
                onChange={(e) => setForm({ ...form, has_vat_number: e.target.checked })}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-slate-300">يوجد رقم ضريبي للمورد</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={predictMutation.isPending || !form.description}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
        >
          {predictMutation.isPending ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <Brain size={18} />
          )}
          {predictMutation.isPending ? "جاري التحليل..." : "تنبؤ بالقيد المحاسبي"}
        </button>

        {predictMutation.isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-3">
            <XCircle size={16} />
            {(predictMutation.error as Error).message}
          </div>
        )}
      </form>

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircle size={18} className="text-green-400" />
              نتيجة التنبؤ
            </h2>
            <ConfidenceBadge value={result.confidence} />
          </div>

          {result.mode === "single" && result.debit_account && result.credit_account ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AccountCard label="حساب الدين (DR)" account={result.debit_account} side="debit" />
              <AccountCard label="حساب الدائن (CR)" account={result.credit_account} side="credit" />
            </div>
          ) : (
            <div className="glass-card rounded-xl p-4 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-yellow-400 mb-3">
                <AlertTriangle size={16} />
                <span className="text-sm">{result.message}</span>
              </div>
            </div>
          )}

          {result.suggested_description && (
            <div className="glass-card rounded-xl p-4 border border-blue-500/10">
              <div className="text-xs text-slate-400 mb-1">الوصف المقترح</div>
              <div className="text-sm text-slate-200" dir="auto">{result.suggested_description}</div>
              {result.suggested_category && (
                <div className="mt-2">
                  <span className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    {result.suggested_category}
                  </span>
                </div>
              )}
            </div>
          )}

          {result.validation && (
            <div className={`glass-card rounded-xl p-4 border ${result.validation.valid ? "border-green-500/20" : "border-red-500/20"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.validation.valid ? (
                  <CheckCircle size={16} className="text-green-400" />
                ) : (
                  <XCircle size={16} className="text-red-400" />
                )}
                <span className={`text-sm font-medium ${result.validation.valid ? "text-green-400" : "text-red-400"}`}>
                  {result.validation.valid ? "القيد صالح" : "القيد يحتوي على أخطاء"}
                </span>
              </div>
              {result.validation.errors.map((e, i) => (
                <div key={i} className="text-xs text-red-300 flex items-start gap-1 mt-1">
                  <XCircle size={12} className="mt-0.5 shrink-0" />
                  {e}
                </div>
              ))}
              {result.validation.warnings.map((w, i) => (
                <div key={i} className="text-xs text-yellow-300 flex items-start gap-1 mt-1">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {result.zatca_compliance && (
            <div className={`glass-card rounded-xl p-4 border ${result.zatca_compliance.compliant ? "border-green-500/20" : "border-orange-500/20"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className={result.zatca_compliance.compliant ? "text-green-400" : "text-orange-400"} />
                <span className={`text-sm font-medium ${result.zatca_compliance.compliant ? "text-green-400" : "text-orange-400"}`}>
                  {result.zatca_compliance.compliant ? "متوافق مع ZATCA" : "تحقق من متطلبات ZATCA"}
                </span>
              </div>
              {result.zatca_compliance.issues.map((issue, i) => (
                <div key={i} className="text-xs text-orange-300 flex items-start gap-1 mt-1">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {issue}
                </div>
              ))}
              {result.zatca_compliance.notes.map((note, i) => (
                <div key={i} className="text-xs text-slate-400 flex items-start gap-1 mt-1">
                  <BookOpen size={12} className="mt-0.5 shrink-0" />
                  {note}
                </div>
              ))}
            </div>
          )}

          {(result.top_debit_candidates || result.top_credit_candidates) && (
            <div className="glass-card rounded-xl border border-white/5">
              <button
                onClick={() => setShowCandidates(!showCandidates)}
                className="w-full flex items-center justify-between p-4 text-sm text-slate-300 hover:text-white transition-colors"
              >
                <span>عرض أفضل 3 خيارات بديلة</span>
                {showCandidates ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showCandidates && (
                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-blue-400 mb-2 font-semibold uppercase">حسابات الدين البديلة</div>
                    {result.top_debit_candidates?.map((c) => (
                      <div
                        key={c.code}
                        onClick={() => setSelectedDebit(c.code)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors mb-1 ${selectedDebit === c.code ? "bg-blue-500/20 border border-blue-500/30" : "hover:bg-white/5"}`}
                      >
                        <span className="font-mono text-sm text-white">{c.code}</span>
                        <span className="text-xs text-slate-400">{c.name}</span>
                        <ConfidenceBadge value={c.confidence} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-purple-400 mb-2 font-semibold uppercase">حسابات الدائن البديلة</div>
                    {result.top_credit_candidates?.map((c) => (
                      <div
                        key={c.code}
                        onClick={() => setSelectedCredit(c.code)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors mb-1 ${selectedCredit === c.code ? "bg-purple-500/20 border border-purple-500/30" : "hover:bg-white/5"}`}
                      >
                        <span className="font-mono text-sm text-white">{c.code}</span>
                        <span className="text-xs text-slate-400">{c.name}</span>
                        <ConfidenceBadge value={c.confidence} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!feedbackSent ? (
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="text-sm text-slate-300 mb-3 flex items-center gap-2">
                <Send size={14} />
                هل التنبؤ صحيح؟ ساعد النموذج على التعلم
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => feedbackMutation.mutate(true)}
                  disabled={feedbackMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl hover:bg-green-500/20 transition-all text-sm"
                >
                  <ThumbsUp size={14} />
                  صحيح
                </button>
                <button
                  onClick={() => { setShowCandidates(true); feedbackMutation.mutate(false); }}
                  disabled={feedbackMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-all text-sm"
                >
                  <ThumbsDown size={14} />
                  غير صحيح
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-xl p-3">
              <CheckCircle size={16} />
              شكراً! تم حفظ تصحيحك وسيُستخدم لتحسين النموذج.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
