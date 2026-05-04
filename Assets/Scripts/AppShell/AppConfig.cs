using System;

namespace NomadGo.AppShell
{
    [Serializable]
    public class AppConfig
    {
        public AppInfo app;
        public ModelConfig model;
        public CountingConfig counting;
        public SpatialConfig spatial;
        public SyncConfig sync;
        public StorageConfig storage;
        public DiagnosticsConfig diagnostics;
    }

    [Serializable]
    public class AppInfo
    {
        public string name;
        public string version;
        public int build;
    }

    [Serializable]
    public class ModelConfig
    {
        public string path;
        public string labels_path;
        public int input_width;
        public int input_height;
        public float confidence_threshold;
        public float nms_threshold;
        public int max_detections;
        public string remote_url;
        public string model_version;
    }

    [Serializable]
    public class CountingConfig
    {
        public float row_cluster_vertical_gap;
        public int row_limit;
        public float iou_threshold;
        public int tracking_max_age_frames;
        public float min_detection_confidence;
    }

    [Serializable]
    public class SpatialConfig
    {
        public bool enable_depth_refinement;
        public string plane_detection_mode;
        public int max_plane_count;
    }

    [Serializable]
    public class SyncConfig
    {
        public bool local_mode;
        public string local_storage_path;   // used when local_mode = true
        public string base_url;             // used when local_mode = false
        public string api_key;              // sent as x-api-key when remote mode is enabled
        public float pulse_interval_seconds;
        public int retry_max_attempts;
        public float retry_base_delay_seconds;
        public float retry_max_delay_seconds;
        public bool queue_persistent;
    }

    [Serializable]
    public class StorageConfig
    {
        public string provider;
        public float autosave_interval_seconds;
        public string session_export_path;
    }

    [Serializable]
    public class DiagnosticsConfig
    {
        public bool show_fps_overlay;
        public bool log_inference_time;
        public bool show_memory_monitor;
        public bool log_tracking_events;
        public bool verbose_mode;
    }
}
