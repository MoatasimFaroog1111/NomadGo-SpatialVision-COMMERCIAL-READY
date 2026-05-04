using UnityEngine;

namespace NomadGo.Diagnostics
{
    public class FPSOverlay : MonoBehaviour
    {
        private float deltaTime = 0f;
        private bool showOverlay = true;
        private GUIStyle fpsStyle;
        private bool styleInitialized = false;

        public float CurrentFPS => deltaTime > 0f ? 1f / deltaTime : 0f;
        public bool ShowOverlay { get => showOverlay; set => showOverlay = value; }

        private void Update()
        {
            deltaTime += (Time.unscaledDeltaTime - deltaTime) * 0.1f;
        }

        private void InitStyle()
        {
            if (styleInitialized) return;

            fpsStyle = new GUIStyle();
            fpsStyle.fontSize = 18;
            fpsStyle.fontStyle = FontStyle.Bold;
            fpsStyle.padding = new RectOffset(6, 6, 4, 4);

            Texture2D bg = new Texture2D(1, 1);
            bg.SetPixel(0, 0, new Color(0, 0, 0, 0.7f));
            bg.Apply();
            fpsStyle.normal.background = bg;

            styleInitialized = true;
        }

        private void OnGUI()
        {
            if (!showOverlay) return;

            InitStyle();

            float fps = CurrentFPS;
            Color fpsColor;

            if (fps >= 30f)
                fpsColor = Color.green;
            else if (fps >= 15f)
                fpsColor = Color.yellow;
            else
                fpsColor = Color.red;

            fpsStyle.normal.textColor = fpsColor;

            float x = Screen.width - 120;
            float y = 10;

            GUI.Label(new Rect(x, y, 110, 30), $"FPS: {fps:F0}", fpsStyle);
        }
    }
}
