using UnityEngine;

namespace NomadGo.AppShell
{
    public class CatalogIndicatorUI : MonoBehaviour
    {
        private float statusHeight;

        private void Start()
        {
            statusHeight = Screen.height * 0.055f;
        }

        private void OnGUI()
        {
            DrawCatalogIndicator();
        }

        private void DrawCatalogIndicator()
        {
            var manager = FindObjectOfType<global::ClientCatalogManager>();

            string text = "Catalog: Not Loaded";
            Color color = Color.red;

            if (manager != null && manager.IsLoaded)
            {
                text = $"Catalog: Loaded ({manager.ItemsCount} items)";
                color = new Color(0.3f, 1f, 0.3f);
            }

            GUIStyle style = new GUIStyle();
            style.fontSize = Mathf.RoundToInt(Screen.height * 0.018f);
            style.normal.textColor = color;
            style.alignment = TextAnchor.MiddleLeft;
            style.fontStyle = FontStyle.Bold;

            GUI.Label(new Rect(10, statusHeight + 5, Screen.width, 40), text, style);
        }
    }
}
