using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

public class ClientCatalogManager : MonoBehaviour
{
    public static ClientCatalogManager Instance;

    private ClientCatalog catalog;
    private string path;

    public bool IsLoaded { get; private set; }
    public int ItemsCount => catalog?.items?.Count ?? 0;
    public string ClientName => string.IsNullOrEmpty(catalog?.client_name) ? "Unknown Client" : catalog.client_name;

    private void Awake()
    {
        Instance = this;
        path = Path.Combine(Application.persistentDataPath, "client_catalog.json");
        Load();
    }

    public void Load()
    {
        IsLoaded = false;

        if (!File.Exists(path))
        {
            Debug.LogWarning("[Catalog] File not found: " + path);
            return;
        }

        try
        {
            string json = File.ReadAllText(path, Encoding.UTF8);
            catalog = JsonUtility.FromJson<ClientCatalog>(json);

            IsLoaded = catalog != null && catalog.items != null && catalog.items.Count > 0;

            if (!ValidateCatalog(catalog, out string validationError))
            {
                Debug.LogError("[Catalog] Validation failed: " + validationError);
                catalog = null;
                IsLoaded = false;
                return;
            }

            Debug.Log(IsLoaded
                ? "[Catalog] Loaded products: " + ItemsCount
                : "[Catalog] File exists but no valid products found.");
        }
        catch (Exception ex)
        {
            Debug.LogError("[Catalog] Load failed: " + ex.Message);
            IsLoaded = false;
        }
    }

    public CatalogItem MatchByVisual(string detectedLabel)
    {
        if (!IsLoaded || catalog?.items == null || string.IsNullOrEmpty(detectedLabel))
            return null;

        string label = Normalize(detectedLabel);

        return catalog.items.FirstOrDefault(item =>
            MatchText(label, item.visual_class) ||
            MatchText(label, item.name) ||
            MatchText(label, item.category) ||
            MatchText(label, item.image_hint)
        );
    }

    public string BuildDetectionDisplayName(string detectedLabel)
    {
        CatalogItem item = MatchByVisual(detectedLabel);

        if (item == null)
            return detectedLabel;

        string productName = string.IsNullOrEmpty(item.name) ? detectedLabel : item.name;
        string sku = string.IsNullOrEmpty(item.sku) ? "" : " | SKU: " + item.sku;

        return productName + sku;
    }

    public string BuildReportText()
    {
        if (!IsLoaded || catalog?.items == null || catalog.items.Count == 0)
            return "Catalog not loaded.\nPlease upload client products file first.";

        StringBuilder sb = new StringBuilder();

        sb.AppendLine("CLIENT PRODUCTS REPORT");
        sb.AppendLine("Client: " + ClientName);
        sb.AppendLine("Total Products: " + ItemsCount);
        sb.AppendLine("--------------------------------");

        for (int i = 0; i < catalog.items.Count; i++)
        {
            CatalogItem item = catalog.items[i];

            sb.AppendLine((i + 1) + ". " + Safe(item.name));
            sb.AppendLine("SKU: " + Safe(item.sku));
            sb.AppendLine("Category: " + Safe(item.category));
            sb.AppendLine("Barcode: " + Safe(item.barcode));
            sb.AppendLine("Visual Class: " + Safe(item.visual_class));
            sb.AppendLine("Hint: " + Safe(item.image_hint));
            sb.AppendLine("--------------------------------");
        }

        return sb.ToString();
    }

    public ClientCatalog GetCatalog()
    {
        return catalog;
    }

    private bool ValidateCatalog(ClientCatalog value, out string error)
    {
        error = null;

        if (value == null)
        {
            error = "Catalog JSON root is invalid.";
            return false;
        }

        if (value.items == null || value.items.Count == 0)
        {
            error = "Catalog must contain at least one item.";
            return false;
        }

        var seenSkus = new System.Collections.Generic.HashSet<string>();
        for (int i = 0; i < value.items.Count; i++)
        {
            CatalogItem item = value.items[i];
            if (item == null)
            {
                error = "Item #" + (i + 1) + " is empty.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(item.name))
            {
                error = "Item #" + (i + 1) + " has no product name.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(item.visual_class) && string.IsNullOrWhiteSpace(item.image_hint))
            {
                error = "Item #" + (i + 1) + " must include visual_class or image_hint.";
                return false;
            }

            if (!string.IsNullOrWhiteSpace(item.sku))
            {
                string sku = Normalize(item.sku);
                if (!seenSkus.Add(sku))
                {
                    error = "Duplicate SKU: " + item.sku;
                    return false;
                }
            }
        }

        return true;
    }

    private bool MatchText(string detected, string catalogValue)
    {
        if (string.IsNullOrEmpty(detected) || string.IsNullOrEmpty(catalogValue))
            return false;

        string value = Normalize(catalogValue);

        return detected == value ||
               detected.Contains(value) ||
               value.Contains(detected);
    }

    private string Normalize(string value)
    {
        return value == null
            ? ""
            : value.ToLower()
                   .Trim()
                   .Replace("_", " ")
                   .Replace("-", " ");
    }

    private string Safe(string value)
    {
        return string.IsNullOrEmpty(value) ? "-" : value;
    }
}
