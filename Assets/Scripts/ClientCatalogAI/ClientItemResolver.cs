using UnityEngine;

public static class ClientItemResolver
{
    public static string ResolveLabel(string aiLabel, float confidence)
    {
        // 1) حاول باركود (لاحقاً)
        // var barcode = BarcodeScanner.LastCode;
        // var byCode = ClientCatalogManager.Instance?.MatchByBarcode(barcode);
        // if (byCode != null) return $"{byCode.name}";

        // 2) Visual match
        var item = ClientCatalogManager.Instance?.MatchByVisual(aiLabel);

        if (item != null)
        {
            return $"{item.name}";
        }

        // 3) fallback
        return aiLabel;
    }
}