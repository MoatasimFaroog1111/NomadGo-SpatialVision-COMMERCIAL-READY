using System;
using System.Collections.Generic;

[Serializable]
public class CatalogItem
{
    public string sku;
    public string name;
    public string category;
    public string barcode;
    public string visual_class;   // مثل: bottle, cup, box
    public string image_hint;     // اختياري
}

[Serializable]
public class ClientCatalog
{
    public string client_name;
    public List<CatalogItem> items;
}