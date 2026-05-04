using UnityEngine;
using UnityEngine.Profiling;

namespace NomadGo.Diagnostics
{
    public class MemoryMonitor : MonoBehaviour
    {
        private bool showOverlay = true;
        private float updateInterval = 1f;
        private float updateTimer = 0f;
        private long totalMemoryMB = 0;
        private long usedMemoryMB = 0;
        private long gcMemoryMB = 0;
        private GUIStyle memStyle;
        private bool styleInitialized = false;

        public long TotalMemoryMB => totalMemoryMB;
        public long UsedMemoryMB => usedMemoryMB;
        public bool ShowOverlay { get => showOverlay; set => showOverlay = value; }

        private void Update()
        {
            updateTimer += Time.deltaTime;
            if (updateTimer >= updateInterval)
            {
                updateTimer = 0f;
                UpdateMemoryInfo();
            }
        }

        private void UpdateMemoryInfo()
        {
            totalMemoryMB = Profiler.GetTotalReservedMemoryLong() / (1024 * 1024);
            usedMemoryMB = Profiler.GetTotalAllocatedMemoryLong() / (1024 * 1024);
            gcMemoryMB = Profiler.GetMonoUsedSizeLong() / (1024 * 1024);
        }

        private void InitStyle()
        {
            if (styleInitialized) return;

            memStyle = new GUIStyle();
            memStyle.fontSize = 14;
            memStyle.normal.textColor = Color.white;
            memStyle.padding = new RectOffset(6, 6, 4, 4);

            Texture2D bg = new Texture2D(1, 1);
            bg.SetPixel(0, 0, new Color(0, 0, 0, 0.6f));
            bg.Apply();
            memStyle.normal.background = bg;

            styleInitialized = true;
        }

        private void OnGUI()
        {
            if (!showOverlay) return;

            InitStyle();

            float x = Screen.width - 200;
            float y = 100;

            Color memColor = usedMemoryMB > 512 ? Color.red : (usedMemoryMB > 256 ? Color.yellow : Color.green);
            memStyle.normal.textColor = memColor;

            GUI.Label(new Rect(x, y, 190, 22), $"Mem: {usedMemoryMB}MB / {totalMemoryMB}MB", memStyle);

            memStyle.normal.textColor = Color.white;
            GUI.Label(new Rect(x, y + 25, 190, 22), $"GC Heap: {gcMemoryMB}MB", memStyle);
        }
    }
}
