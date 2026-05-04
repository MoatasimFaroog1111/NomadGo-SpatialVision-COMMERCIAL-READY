using UnityEngine;
using TMPro;

namespace NomadGo.AROverlay
{
    public class CountLabel : MonoBehaviour
    {
        [Header("Label Settings")]
        [SerializeField] private TextMeshProUGUI labelText;
        [SerializeField] private RectTransform backgroundPanel;
        [SerializeField] private float fadeSpeed = 2f;

        private CanvasGroup canvasGroup;
        private string currentText = "";
        private bool isVisible = false;
        private float targetAlpha = 0f;

        private void Awake()
        {
            canvasGroup = GetComponent<CanvasGroup>();
            if (canvasGroup == null)
            {
                canvasGroup = gameObject.AddComponent<CanvasGroup>();
            }
            canvasGroup.alpha = 0f;
        }

        public void SetCount(string label, int count, Vector2 screenPosition)
        {
            currentText = $"{label}: {count}";
            if (labelText != null)
            {
                labelText.text = currentText;
            }

            RectTransform rt = GetComponent<RectTransform>();
            if (rt != null)
            {
                rt.anchoredPosition = screenPosition;
            }

            Show();
        }

        public void SetPosition(Vector2 screenPosition)
        {
            RectTransform rt = GetComponent<RectTransform>();
            if (rt != null)
            {
                rt.anchoredPosition = screenPosition;
            }
        }

        public void Show()
        {
            isVisible = true;
            targetAlpha = 1f;
        }

        public void Hide()
        {
            isVisible = false;
            targetAlpha = 0f;
        }

        private void Update()
        {
            if (canvasGroup != null)
            {
                canvasGroup.alpha = Mathf.Lerp(canvasGroup.alpha, targetAlpha, Time.deltaTime * fadeSpeed);
            }
        }

        public void UpdateText(string text)
        {
            currentText = text;
            if (labelText != null)
            {
                labelText.text = currentText;
            }
        }
    }
}
