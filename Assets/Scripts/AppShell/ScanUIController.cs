using UnityEngine;

namespace NomadGo.AppShell
{
    public class ScanUIController : MonoBehaviour
    {
        private void Awake()
        {
            var uiBuilder = FindObjectOfType<UIBuilder>();
            if (uiBuilder != null)
            {
                Debug.Log("[ScanUIController] UIBuilder detected. Disabling ScanUIController to prevent conflicts.");
                enabled = false;
                return;
            }

            Debug.Log("[ScanUIController] UIBuilder not found. Running in standalone mode.");
        }

        // Fallback: minimal OnGUI if no UIBuilder
        private void OnGUI()
        {
            if (!enabled) return;

            float W = Screen.width;
            float H = Screen.height;
            float btnH = 120;
            float btnM = 20;

            if (GUI.Button(new Rect(btnM, H - btnH - btnM, W - 2 * btnM, btnH), "Start Scan"))
            {
                if (AppManager.Instance != null) AppManager.Instance.StartScan();
            }
        }
    }
}
