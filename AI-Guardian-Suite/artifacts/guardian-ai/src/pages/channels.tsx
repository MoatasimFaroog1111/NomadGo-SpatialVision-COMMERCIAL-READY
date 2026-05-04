import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  Smartphone,
  Zap,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  AlertTriangle,
  Globe,
  Lock,
  BarChart3,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

interface ChannelSettings {
  id: number;
  whatsappEnabled: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsappNumber: string;
  smsEnabled: boolean;
  twilioSmsNumber: string;
  autoPostMaxAmount: number;
  totalWhatsappProcessed: number;
  totalSmsProcessed: number;
  totalAutoPosted: number;
  totalPendingApproval: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="text-muted-foreground hover:text-foreground transition-colors p-1"
      title="نسخ"
    >
      {copied ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function WebhookUrlCard({ path, label }: { path: string; label: string }) {
  // Build the public URL for the webhook
  const rawHost = typeof window !== "undefined" ? window.location.hostname : "";
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const apiBase = base ? base.replace(/\/[^/]+$/, "") : "";
  const webhookUrl = `https://${rawHost}${apiBase}/api/webhooks/${path}`;

  return (
    <div className="bg-black/20 border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-mono">{label}</span>
        <div className="flex items-center gap-1">
          <CopyButton text={webhookUrl} />
          <a
            href={webhookUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <p className="text-xs font-mono text-blue-300 break-all">{webhookUrl}</p>
    </div>
  );
}

export default function ChannelsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<ChannelSettings>({
    queryKey: ["channelSettings"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("channels/settings"));
      if (!res.ok) throw new Error("Failed to load channel settings");
      return res.json();
    },
  });

  const [form, setForm] = useState<Partial<ChannelSettings>>({});
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<ChannelSettings>) => {
      const res = await fetch(getApiUrl("channels/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channelSettings"] });
      toast({
        title: "✅ Settings saved",
        description: "Channel configuration updated.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "❌ Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => saveMutation.mutate(form);

  const set = <K extends keyof ChannelSettings>(
    key: K,
    val: ChannelSettings[K],
  ) => setForm((prev) => ({ ...prev, [key]: val }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              قنوات التواصل
            </h1>
            <p className="text-sm text-muted-foreground">
              واتساب · رسائل SMS · استقبال الفواتير تلقائياً
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          حفظ الإعدادات
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "واتساب معالج",
            value: settings?.totalWhatsappProcessed ?? 0,
            icon: MessageCircle,
            color: "text-green-400",
          },
          {
            label: "SMS معالج",
            value: settings?.totalSmsProcessed ?? 0,
            icon: Smartphone,
            color: "text-blue-400",
          },
          {
            label: "ترحيل تلقائي",
            value: settings?.totalAutoPosted ?? 0,
            icon: Zap,
            color: "text-amber-400",
          },
          {
            label: "بانتظار موافقة",
            value: settings?.totalPendingApproval ?? 0,
            icon: AlertTriangle,
            color: "text-orange-400",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color}`} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Twilio Credentials */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4 text-blue-400" />
            بيانات اعتماد Twilio
          </CardTitle>
          <CardDescription>
            ستحتاج إلى حساب Twilio مع تفعيل WhatsApp Business API.{" "}
            <a
              href="https://console.twilio.com"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              console.twilio.com <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account SID</Label>
              <Input
                value={form.twilioAccountSid ?? ""}
                onChange={(e) => set("twilioAccountSid", e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Auth Token</Label>
              <Input
                type="password"
                value={form.twilioAuthToken ?? ""}
                onChange={(e) => set("twilioAuthToken", e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="font-mono text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">واتساب Business</CardTitle>
                <CardDescription>
                  استقبال الفواتير عبر واتساب ومعالجتها تلقائياً
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  form.whatsappEnabled
                    ? "border-green-500/50 text-green-400"
                    : "border-muted"
                }
              >
                {form.whatsappEnabled ? "مُفعَّل" : "معطَّل"}
              </Badge>
              <Switch
                checked={form.whatsappEnabled ?? false}
                onCheckedChange={(v) => set("whatsappEnabled", v)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>رقم واتساب Twilio</Label>
            <Input
              value={form.twilioWhatsappNumber ?? ""}
              onChange={(e) => set("twilioWhatsappNumber", e.target.value)}
              placeholder="whatsapp:+14155238886"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              الصيغة: whatsapp:+1XXXXXXXXXX
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              Webhook URL — أضفه في لوحة Twilio
            </Label>
            <WebhookUrlCard
              path="whatsapp"
              label="POST /api/webhooks/whatsapp"
            />
          </div>

          {/* How it works */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-green-400">كيف يعمل</p>
            <div className="space-y-1.5">
              {[
                "العميل يرسل صورة/PDF الفاتورة عبر واتساب",
                "Twilio يعيد توجيه الملف إلى GuardianAI",
                "الذكاء الاصطناعي يستخرج البيانات ويطابق المورد",
                "إذا المبلغ ≤ الحد وثقة ≥ 85% → ترحيل تلقائي في أودو",
                "الرد التلقائي: تفاصيل القيد أو طلب الموافقة",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMS */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">رسائل SMS</CardTitle>
                <CardDescription>
                  استقبال الأوامر والإشعارات عبر الرسائل النصية
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  form.smsEnabled
                    ? "border-blue-500/50 text-blue-400"
                    : "border-muted"
                }
              >
                {form.smsEnabled ? "مُفعَّل" : "معطَّل"}
              </Badge>
              <Switch
                checked={form.smsEnabled ?? false}
                onCheckedChange={(v) => set("smsEnabled", v)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>رقم SMS Twilio</Label>
            <Input
              value={form.twilioSmsNumber ?? ""}
              onChange={(e) => set("twilioSmsNumber", e.target.value)}
              placeholder="+14155238886"
              className="font-mono text-sm"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              Webhook URL — أضفه في لوحة Twilio
            </Label>
            <WebhookUrlCard path="sms" label="POST /api/webhooks/sms" />
          </div>

          {/* SMS commands */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-400">
              الأوامر المتاحة عبر SMS
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { cmd: "STATUS", desc: "حالة النظام والإحصائيات" },
                { cmd: "HELP", desc: "قائمة الأوامر" },
              ].map(({ cmd, desc }) => (
                <div
                  key={cmd}
                  className="flex items-center gap-2 bg-black/20 rounded px-2 py-1.5"
                >
                  <code className="text-xs font-mono text-blue-300">{cmd}</code>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shared limit */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-amber-400" />
            حد الترحيل التلقائي
          </CardTitle>
          <CardDescription>
            الفواتير التي تقل عن هذا المبلغ وثقة ≥ 85% تُرحَّل تلقائياً. ما فوقه
            يذهب لطابور الموافقة.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label>الحد الأقصى للترحيل التلقائي (ريال سعودي)</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={form.autoPostMaxAmount ?? 10000}
                onChange={(e) =>
                  set("autoPostMaxAmount", Number(e.target.value))
                }
                className="font-mono"
              />
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-400">
                {(form.autoPostMaxAmount ?? 10000).toLocaleString("ar-SA")}
              </p>
              <p className="text-xs text-muted-foreground">ريال سعودي</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            دليل الإعداد السريع مع Twilio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { n: 1, text: "أنشئ حساباً في twilio.com وانتقل لـ Console" },
            { n: 2, text: "انسخ Account SID و Auth Token من الصفحة الرئيسية" },
            {
              n: 3,
              text: "واتساب: أنشئ WhatsApp Sender وأضف الـ Webhook URL أعلاه في حقل 'When a message comes in'",
            },
            {
              n: 4,
              text: "SMS: احصل على رقم Twilio وأضف الـ Webhook URL في إعدادات الرقم",
            },
            { n: 5, text: "فعّل القناة المطلوبة واحفظ الإعدادات" },
            { n: 6, text: "اختبر بإرسال صورة فاتورة من هاتفك" },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-purple-400">
                  {n}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
