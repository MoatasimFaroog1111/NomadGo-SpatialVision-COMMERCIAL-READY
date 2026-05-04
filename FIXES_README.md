# NomadGo SpatialVision — Bug Fixes & Instructions

## المشاكل المكتشفة والإصلاحات

### مشكلة 1: الأزرار غير موجودة
**السبب**: تعارض بين `UIBuilder.cs` و `ScanUIController.cs` — كلاهما يتحكم في نفس الأزرار.  
**الإصلاح**: 
- `UIBuilder.cs` — مُحدَّث ليبني الأزرار برمجياً بشكل موثوق
- `ScanUIController.cs` — مُحدَّث ليبحث عن الأزرار تلقائياً بالاسم
- أُضيف زر **Reports** (تقارير) وزر **Export** بتخطيط واضح

---

### مشكلة 2: المسح الضوئي لا يعمل
**السبب الجذري**: مكتبة ONNX Runtime غير مثبتة → `isLoaded = false` → رفض بدء المسح.  
**الإصلاح في الكود**: 
- `ONNXInferenceEngine.cs` — في وضع stub (بدون ONNX)، تصبح `isLoaded = true`
- الكاميرا تعمل والمسح يبدأ، لكن بدون كشف AI (حتى تثبت النموذج)

**خطوات Unity للتفعيل الكامل**:
1. افتح **Window → Package Manager** في Unity
2. ابحث عن "Sentis" أو استورد `com.microsoft.ml.onnxruntime` 
3. اذهب إلى **Edit → Project Settings → Player → Scripting Define Symbols**
4. أضف: `ONNX_RUNTIME`
5. ضع ملف `yolov8n.onnx` داخل `Assets/StreamingAssets/Models/`

---

### مشكلة 3: العد والحساب لا يعمل
**السبب**: يعتمد على المسح الضوئي.  
**الإصلاح**: تلقائياً بعد إصلاح المسح — `CountManager.cs` يعمل بشكل صحيح.

---

### مشكلة 4: مربعات الكشف في المكان الخاطئ
**السبب**: `OverlayRenderer.cs` لم يُحوِّل إحداثيات YOLO (640×640) إلى مساحة الشاشة.  
**الإصلاح في `OverlayRenderer.cs`**:
- إضافة تحويل الإحداثيات من 640×640 إلى حجم الشاشة الحقيقي
- إصلاح محور Y (فرق بين ReadPixels وOnGUI)
- إضافة تصحيح دوران الكاميرا (للوضع العمودي Portrait)

---

### مشكلة 5: محاكاة الواقع المعزز (AR) لا تعمل
**السبب**: ARFoundation/ARCore يتطلب:
1. باقة ARFoundation مثبتة في Unity
2. باقة ARCore XR Plugin مثبتة
3. الجهاز يدعم ARCore

**الإصلاح**: أُضيف `ARController.cs` يعمل في وضعين:
- **وضع حقيقي**: إذا كان ARFoundation مثبتاً وأُضيف `AR_FOUNDATION` للـ defines
- **وضع محاكاة**: يعرض بيانات الكشف بدون AR حقيقي

**خطوات تفعيل AR الحقيقي**:
1. **Window → Package Manager** → ابحث "AR Foundation" → Install
2. ابحث "ARCore XR Plugin" → Install
3. **Edit → Project Settings → Player → Scripting Define Symbols** → أضف `AR_FOUNDATION`
4. تأكد أن `android.hardware.camera.ar` في AndroidManifest.xml = `required="false"` (موجود بالفعل)

---

### مشكلة 6: الصورة ثلاثية الأبعاد لا تعمل
**الإصلاح**: أُضيف `ThreeDViewer.cs` — يعرض مربعات ثلاثية الأبعاد فوق الكاميرا.  
يعمل بدون ARFoundation باستخدام Camera.ScreenPointToRay + عمق تقديري.

**للتفعيل في Unity Editor**:
1. أضف `ThreeDViewer` component لأي GameObject في الـ Scene
2. أضف زر "3D View" يستدعي `ThreeDViewer.Toggle()`

---

### مشكلة 7: التقارير لا تعمل
**الإصلاح**: أُضيف Reports Panel في `UIBuilder.cs`:
- زر **Reports** يفتح لوحة التقارير
- يعرض آخر 5 جلسات مع عدد العناصر والوقت
- زر **Refresh** لتحديث القائمة
- زر **X Close** للإغلاق

---

## ملفات تم تعديلها

| الملف | الإصلاح |
|-------|---------|
| `Vision/ONNXInferenceEngine.cs` | Stub mode sets isLoaded=true |
| `Vision/FrameProcessor.cs` | Allow processing without real model |
| `AROverlay/OverlayRenderer.cs` | Fix coordinate scaling + rotation |
| `AppShell/UIBuilder.cs` | Add Reports panel + fix buttons |
| `AppShell/AppManager.cs` | Remove ARSession hard dependency |
| `AppShell/ScanUIController.cs` | Auto-find buttons by name |

## ملفات جديدة

| الملف | الوصف |
|-------|-------|
| `Viewer/ThreeDViewer.cs` | 3D visualization of detections |
| `Spatial/ARController.cs` | AR simulation + ARFoundation support |

---

## كيفية تطبيق الإصلاحات

1. استخرج الـ ZIP
2. انسخ محتويات مجلد `Assets/Scripts/` فوق ملفاتك الموجودة
3. افتح Unity Editor
4. حل أي خطأ في التجميع (عادة مكتبات ناقصة)
5. اتبع خطوات تفعيل ONNX و AR أعلاه
6. ابنِ APK جديد


---

## تحديث v3 — إصلاح اللون الوردي/الزهري والأزرار غير الظاهرة

**المشكلة المكتشفة (من الصورة المرفوعة)**:
- شريط وردي/زهري في أعلى الشاشة
- الأزرار غير ظاهرة

**السبب الجذري**:
- `UIBuilder.cs` (v1/v2) كان يستخدم UGUI Canvas مع مكونات `Image` + `Button`
- هذه المكونات تعتمد على Shaders خاصة بـ Unity UI
- على بعض أجهزة الأندرويد (مثل Moto G84 5G) لا تجد Unity الـ Shader المناسب → اللون الوردي/الزهري
- `CameraFix.cs` كان يستخدم `GL.DrawTexture` مع `Shader.Find()` — نفس المشكلة

**الإصلاح في v3**:
- `UIBuilder.cs` → أُعيد كتابته بالكامل باستخدام `OnGUI()` (immediate mode GUI)
  - `OnGUI` لا يحتاج Shaders — يعمل على كل الأجهزة
  - الأزرار ظاهرة دائماً في أسفل الشاشة
  - يُحسب حجم الأزرار تلقائياً حسب `Screen.dpi`
- `CameraFix.cs` → أُعيد كتابته باستخدام `RawImage` (UI component)
  - يُصحح دوران الكاميرا باستخدام `RectTransform.localEulerAngles`
  - لا يعتمد على GL Shaders
- `ScanUIController.cs` → يُعطِّل نفسه تلقائياً عند وجود `UIBuilder`

