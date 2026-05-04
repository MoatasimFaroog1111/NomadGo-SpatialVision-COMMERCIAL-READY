using System;
using System.IO;
using System.Text;
using UnityEngine;

public class ReportExporter : MonoBehaviour
{
    private string folderPath;

    private void Awake()
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        folderPath = "/storage/emulated/0/Download/NomadGo/";
#else
        folderPath = Path.Combine(Application.dataPath, "Exports/");
#endif

        if (!Directory.Exists(folderPath))
            Directory.CreateDirectory(folderPath);
    }

    public void ExportProductsReport()
    {
        try
        {
            ClientCatalogManager manager = ClientCatalogManager.Instance ?? FindObjectOfType<ClientCatalogManager>();

            if (manager == null || !manager.IsLoaded)
            {
                Debug.LogError("[ReportExporter] Catalog not loaded.");
                NotifyUI(false, "Export failed: catalog not loaded.");
                return;
            }

            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");

            string excelPath = Path.Combine(folderPath, "Client_Products_" + timestamp + ".csv");
            string pdfPath = Path.Combine(folderPath, "Client_Products_" + timestamp + ".pdf");

            ExportCSV(manager, excelPath);
            ExportPDF(manager, pdfPath);

            Debug.Log("[ReportExporter] Export done.");
            Debug.Log("[ReportExporter] Excel: " + excelPath);
            Debug.Log("[ReportExporter] PDF: " + pdfPath);

            NotifyUI(true, "Export completed successfully. Files saved to Downloads/NomadGo.");
        }
        catch (Exception ex)
        {
            Debug.LogError("[ReportExporter] Error: " + ex);
            NotifyUI(false, "Export failed: " + ex.Message);
        }
    }

    private void ExportCSV(ClientCatalogManager manager, string path)
    {
        ClientCatalog catalog = manager.GetCatalog();

        StringBuilder sb = new StringBuilder();

        sb.AppendLine("Client,SKU,Name,Category,Barcode,Visual,Hint");

        if (catalog != null && catalog.items != null)
        {
            foreach (CatalogItem item in catalog.items)
            {
                sb.AppendLine(
                    EscapeCsv(manager.ClientName) + "," +
                    EscapeCsv(item.sku) + "," +
                    EscapeCsv(item.name) + "," +
                    EscapeCsv(item.category) + "," +
                    EscapeCsv(item.barcode) + "," +
                    EscapeCsv(item.visual_class) + "," +
                    EscapeCsv(item.image_hint)
                );
            }
        }

        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(true));
    }

    private void ExportPDF(ClientCatalogManager manager, string path)
    {
        StringBuilder sb = new StringBuilder();

        sb.AppendLine("CLIENT PRODUCTS REPORT");
        sb.AppendLine("------------------------------");
        sb.AppendLine("Client: " + manager.ClientName);
        sb.AppendLine("Total Products: " + manager.ItemsCount);
        sb.AppendLine("------------------------------");
        sb.AppendLine(manager.BuildReportText());

        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(true));
    }

    private string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value))
            return "";

        string escaped = value.Replace("\"", "\"\"");

        if (escaped.Contains(",") || escaped.Contains("\"") || escaped.Contains("\n") || escaped.Contains("\r"))
            return "\"" + escaped + "\"";

        return escaped;
    }

    private void NotifyUI(bool success, string message)
    {
        NomadGo.AppShell.UIBuilder ui =
            NomadGo.AppShell.UIBuilder.Instance ?? FindObjectOfType<NomadGo.AppShell.UIBuilder>();

        if (ui != null)
            ui.SetCatalogUploadStatus(success, message);
    }
}
