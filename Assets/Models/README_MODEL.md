# ONNX Model Placement

Place your ONNX model file here.

## Expected File
- **Filename**: `yolov8n.onnx`
- **Format**: ONNX (Open Neural Network Exchange)
- **Input Resolution**: 640x640 RGB
- **Output**: Detection boxes, class IDs, confidence scores

## How to Obtain a Demo Model

1. Install ultralytics: `pip install ultralytics`
2. Export YOLOv8n to ONNX:
   ```python
   from ultralytics import YOLO
   model = YOLO('yolov8n.pt')
   model.export(format='onnx', imgsz=640, opset=12)
   ```
3. Copy the generated `yolov8n.onnx` file to this directory.

## Custom Model Training

For inventory-specific detection, train a custom model:
```python
from ultralytics import YOLO
model = YOLO('yolov8n.pt')
model.train(data='your_inventory_dataset.yaml', epochs=50, imgsz=640)
model.export(format='onnx', imgsz=640, opset=12)
```

## Labels
The `labels.txt` file in this directory must match the class order of your ONNX model output.
