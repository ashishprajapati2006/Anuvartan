import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import numpy as np
from PIL import Image
import io

# Use lightweight tflite-runtime only — avoids pulling in TensorFlow's
# protobuf dependency which clashes with the installed protobuf version.
# Try tensorflow.lite first (works on Python 3.11 Windows via full tensorflow package)
# Fall back to tflite_runtime (works on Linux/older Python)
Interpreter = None
try:
    from tensorflow.lite.python.interpreter import Interpreter
    print("Using tensorflow.lite interpreter")
except ImportError:
    try:
        import tflite_runtime.interpreter as tflite
        Interpreter = tflite.Interpreter
        print("Using tflite-runtime")
    except ImportError:
        print("No TFLite backend found. Model inference will use mock responses.")


app = FastAPI()

# Load Vision Model
MODEL_PATH = "wound_model.tflite"
interpreter = None
input_details = None
output_details = None

# Class Labels
CLASS_NAMES = [
    "Abrasions", "Bruises", "Burns", "Cut", "Diabetic Wounds", 
    "Laseration", "Normal", "Pressure Wounds", "Surgical Wounds", "Venous Wounds"
]

try:
    if os.path.exists(MODEL_PATH):
        if Interpreter is None:
            raise RuntimeError("No TFLite backend available")
        print(f"Loading TFLite model from {MODEL_PATH}...")
        interpreter = Interpreter(model_path=MODEL_PATH)
        interpreter.allocate_tensors()
        
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        print("Model loaded successfully (TFLite).")
    else:
        print(f"Warning: Model not found at {MODEL_PATH}. Using dummy predictions.")
except Exception as e:
    print(f"Error loading model: {e}")

class PredictionResponse(BaseModel):
    risk_score: int
    status: str
    confidence: float

def prepare_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert('RGB')
    img = img.resize((224, 224))
    img_array = np.array(img, dtype=np.float32)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = img_array / 255.0
    return img_array

@app.post("/predict/wound", response_model=PredictionResponse)
async def predict_wound(file: UploadFile = File(...)):
    if interpreter:
        try:
            contents = await file.read()
            img_array = prepare_image(contents)
            
            # TFLite Inference
            interpreter.set_tensor(input_details[0]['index'], img_array)
            interpreter.invoke()
            predictions = interpreter.get_tensor(output_details[0]['index'])
            
            predicted_class_idx = np.argmax(predictions[0])
            confidence = float(np.max(predictions[0]))
            status = CLASS_NAMES[predicted_class_idx]
            
            print(f"DEBUG: Prediction Raw: {predictions[0]}")
            print(f"DEBUG: Max Confidence: {confidence} for Class: {status}")

            # Heuristic Risk Score based on wound type
            high_risk_types = ["Diabetic Wounds", "Surgical Wounds", "Venous Wounds", "Pressure Wounds"]
            
            risk_score = 0
            if status in high_risk_types:
                risk_score = int(70 + (confidence * 20)) 
            elif status == "Normal":
                risk_score = int(10 + (confidence * 10))
            else:
                risk_score = int(40 + (confidence * 20))
            
            risk_score = min(100, max(0, risk_score))

            return {
                "risk_score": risk_score,
                "status": status,
                "confidence": round(confidence * 100, 2)
            }
        except Exception as e:
            print(f"Prediction Error: {e}")
            return {"risk_score": 0, "status": "Error", "confidence": 0.0}
    else:
        return {
            "risk_score": 85,
            "status": "infected (mock)",
            "confidence": 0.0
        }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
