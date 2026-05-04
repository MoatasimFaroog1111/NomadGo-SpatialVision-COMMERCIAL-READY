using UnityEngine;

namespace NomadGo.AppShell
{
    public class AppManager : MonoBehaviour
    {
        public static AppManager Instance { get; private set; }

        [Header("AR")]
        [SerializeField] private GameObject arSessionObject;
        [SerializeField] private Camera arCamera;

        [Header("Subsystems (auto-located if not assigned)")]
        [SerializeField] private Diagnostics.DiagnosticsManager diagnosticsManager;
        [SerializeField] private Storage.SessionStorage sessionStorage;
        [SerializeField] private Sync.SyncPulseManager syncPulseManager;
        [SerializeField] private Vision.FrameProcessor frameProcessor;
        [SerializeField] private Counting.CountManager countManager;
        [SerializeField] private Vision.ModelDownloader modelDownloader;

        private AppConfig appConfig;
        private bool isInitialized = false;

        // Public accessors so other scripts never call FindObjectOfType
        public AppConfig Config                          => appConfig;
        public Camera ARCamera                           => arCamera;
        public bool IsInitialized                        => isInitialized;
        public Diagnostics.DiagnosticsManager Diagnostics => diagnosticsManager;
        public Storage.SessionStorage SessionStorage     => sessionStorage;
        public Sync.SyncPulseManager SyncPulse           => syncPulseManager;
        public Vision.FrameProcessor FrameProcessor      => frameProcessor;
        public Counting.CountManager CountManager        => countManager;
        public Vision.ModelDownloader ModelDownloader    => modelDownloader;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            LoadConfiguration();
        }

        private void Start()
        {
            LocateSubsystems();
            InitializeSubsystems();
        }

        // ------------------------------------------------------------------
        // Configuration
        // ------------------------------------------------------------------

        private void LoadConfiguration()
        {
            TextAsset configText = Resources.Load<TextAsset>("CONFIG");
            if (configText == null)
            {
                Debug.LogError("[AppManager] CONFIG.json not found in Resources folder.");
                appConfig = CreateDefaultConfig();
                return;
            }

            try
            {
                appConfig = JsonUtility.FromJson<AppConfig>(configText.text);
                Debug.Log($"[AppManager] Config loaded: {appConfig.app.name} v{appConfig.app.version}");
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[AppManager] Config parse error: {ex.Message}. Using defaults.");
                appConfig = CreateDefaultConfig();
            }
        }

        private AppConfig CreateDefaultConfig()
        {
            return new AppConfig
            {
                app = new AppInfo { name = "NomadGo", version = "1.0.0", build = 1 },
                model = new ModelConfig
                {
                    path = "Models/yolov8n.onnx",
                    labels_path = "Models/labels.txt",
                    input_width = 640,
                    input_height = 640,
                    confidence_threshold = 0.20f,
                    nms_threshold = 0.5f,
                    max_detections = 100
                },
                counting = new CountingConfig
                {
                    row_cluster_vertical_gap = 50f,
                    row_limit = 6,
                    iou_threshold = 0.4f,
                    tracking_max_age_frames = 15,
                    min_detection_confidence = 0.45f
                },
                spatial = new SpatialConfig
                {
                    enable_depth_refinement = false,
                    plane_detection_mode = "Horizontal",
                    max_plane_count = 10
                },
                sync = new SyncConfig
                {
                    local_mode             = true,
                    local_storage_path     = "Pulses",
                    base_url               = "",
                    pulse_interval_seconds = 10f,
                    retry_max_attempts     = 5,
                    retry_base_delay_seconds = 2f,
                    retry_max_delay_seconds  = 60f,
                    queue_persistent       = true
                },
                storage = new StorageConfig
                {
                    provider = "json",
                    autosave_interval_seconds = 2f,
                    session_export_path = "Sessions/"
                },
                diagnostics = new DiagnosticsConfig
                {
                    show_fps_overlay = true,
                    log_inference_time = true,
                    show_memory_monitor = false,
                    log_tracking_events = false,
                    verbose_mode = false
                }
            };
        }

        // ------------------------------------------------------------------
        // Subsystem discovery (runs once at Start)
        // ------------------------------------------------------------------

        private void LocateSubsystems()
        {
            if (diagnosticsManager == null)
                diagnosticsManager = FindObjectOfType<Diagnostics.DiagnosticsManager>();
            if (sessionStorage == null)
                sessionStorage = FindObjectOfType<Storage.SessionStorage>();
            if (syncPulseManager == null)
                syncPulseManager = FindObjectOfType<Sync.SyncPulseManager>();
            if (frameProcessor == null)
                frameProcessor = FindObjectOfType<Vision.FrameProcessor>();
            if (countManager == null)
                countManager = FindObjectOfType<Counting.CountManager>();

            // ModelDownloader: find or create on this GameObject
            if (modelDownloader == null)
                modelDownloader = FindObjectOfType<Vision.ModelDownloader>();
            if (modelDownloader == null)
                modelDownloader = gameObject.AddComponent<Vision.ModelDownloader>();
        }

        // ------------------------------------------------------------------
        // Initialization
        // ------------------------------------------------------------------

        private void InitializeSubsystems()
        {
            if (appConfig == null)
            {
                Debug.LogError("[AppManager] Config not available.");
                return;
            }

            if (diagnosticsManager != null)
            {
                try { diagnosticsManager.Initialize(appConfig.diagnostics); }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] DiagnosticsManager: {ex.Message}"); }
            }

            if (sessionStorage != null)
            {
                try { sessionStorage.Initialize(appConfig.storage); }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] SessionStorage: {ex.Message}"); }
            }

            if (syncPulseManager != null)
            {
                try { syncPulseManager.Initialize(appConfig.sync); }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] SyncPulseManager: {ex.Message}"); }
            }

            // Initialize ModelDownloader before FrameProcessor so cached paths are
            // available when the ONNX engine starts loading.
            if (modelDownloader != null && !string.IsNullOrEmpty(appConfig.model.remote_url))
            {
                try
                {
                    modelDownloader.Initialize(appConfig.model);

                    // When a fresh download completes at runtime, hot-swap the model
                    modelDownloader.OnComplete += (success) =>
                    {
                        if (success && frameProcessor != null)
                        {
                            string newOnnx   = modelDownloader.CachedModelPath;
                            string newLabels = modelDownloader.CachedLabelsPath;
                            if (!string.IsNullOrEmpty(newOnnx))
                            {
                                Debug.Log("[AppManager] New model downloaded — hot-swapping ONNX engine.");
                                var engine = frameProcessor.GetComponent<Vision.ONNXInferenceEngine>()
                                          ?? FindObjectOfType<Vision.ONNXInferenceEngine>();
                                engine?.ReloadModel(newOnnx, newLabels);
                            }
                        }
                    };
                }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] ModelDownloader: {ex.Message}"); }
            }
            else if (modelDownloader != null)
            {
                // remote_url is empty — initialise silently (no-op for downloader, but
                // makes the component available for future UI queries)
                try { modelDownloader.Initialize(appConfig.model); }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] ModelDownloader (dormant): {ex.Message}"); }
            }

            if (frameProcessor != null)
            {
                try { frameProcessor.Initialize(appConfig.model); }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] FrameProcessor: {ex.Message}"); }
            }

            if (countManager != null)
            {
                try { countManager.Initialize(appConfig.counting); }
                catch (System.Exception ex) { Debug.LogError($"[AppManager] CountManager: {ex.Message}"); }
            }

            // Inject cross-references after all subsystems are up
            if (syncPulseManager != null)
                syncPulseManager.InjectReferences(countManager, sessionStorage);

            if (sessionStorage != null)
                sessionStorage.InjectReferences(countManager, frameProcessor);

            if (countManager != null)
                countManager.InjectFrameProcessor(frameProcessor);

            isInitialized = true;
            Debug.Log("[AppManager] All subsystems initialized.");
        }

        // ------------------------------------------------------------------
        // Scan lifecycle
        // ------------------------------------------------------------------

        public void StartScan()
        {
            if (!isInitialized)
            {
                Debug.LogWarning("[AppManager] Subsystems not ready. Re-initializing...");
                LocateSubsystems();
                InitializeSubsystems();
            }

            if (arSessionObject != null)
                arSessionObject.SetActive(true);

            sessionStorage?.StartNewSession();

            // FIX: FrameProcessor.StartProcessing() now handles the case where the ONNX engine
            // is still loading by queuing a deferred start via coroutine (WaitUntilEngineReady).
            // This means calling StartScan() at any point after Initialize() is safe — the
            // processing will begin automatically as soon as the model finishes loading.
            frameProcessor?.StartProcessing();

            syncPulseManager?.StartPulsing();

            Debug.Log("[AppManager] Scan started.");
        }

        public void StopScan()
        {
            frameProcessor?.StopProcessing();
            syncPulseManager?.StopPulsing();
            sessionStorage?.EndCurrentSession();

            Debug.Log("[AppManager] Scan stopped.");
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }
}
