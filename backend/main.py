from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Dict
import pandas as pd
import numpy as np
import io
from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

# Instantiate Core Engine Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(
    title="FairLens Analysis Controller", 
    description="Algorithmic Bias Detection and Generative AI Explaining APIs"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisResponse(BaseModel):
    bias_result: Dict[str, float] = Field(..., description="Calculated target metrics per demographic group")
    explanation: str = Field(..., description="Deep insight AI breakdown")

def construct_system_directive(sens_col: str, bias_result: dict) -> str:
    """Strict template enforcement for the generative fairness engine."""
    return (
        f"You are an AI fairness expert.\n\n"
        f"Sensitive Attribute: {sens_col.title()}\n"
        f"Outcome Distribution: {bias_result}\n\n"
        f"Generate a structured response with:\n\n"
        f"**1. Bias Status:** (Detected/Not Detected + Severity: Low/Moderate/High)\n"
        f"**2. Key Insight:** (include percentages and disparity)\n"
        f"**3. Real-World Impact:** (clear and concise)\n"
        f"**4. Recommended Actions:** (2-3 short, actionable steps)\n\n"
        f"Keep the tone professional, concise, and product-oriented.\n"
        f"Avoid overly academic language."
    )

@app.get("/generate-sample")
async def generate_sample(dataset_type: str = "hiring"):
    """Synthesizes mock datasets simulating systemic disparity mechanics"""
    size = np.random.randint(60, 100)
    
    if dataset_type == "loan":
        income_levels = np.random.choice(["High", "Medium", "Low"], size, p=[0.2, 0.5, 0.3])
        regions = np.random.choice(["Urban", "Suburban", "Rural"], size)
        approved = [1 if (i == "High" and np.random.rand() > 0.05) 
                    else (1 if (i == "Medium" and np.random.rand() > 0.4) 
                    else (1 if np.random.rand() > 0.85 else 0)) for i in income_levels]
        df = pd.DataFrame({"income_level": income_levels, "region": regions, "approved": approved})
        
    elif dataset_type == "education":
        school_types = np.random.choice(["Public", "Private"], size, p=[0.7, 0.3])
        regions = np.random.choice(["North", "South", "East", "West"], size)
        admitted = [1 if (s == "Private" and np.random.rand() > 0.15) 
                    else (1 if np.random.rand() > 0.65 else 0) for s in school_types]
        df = pd.DataFrame({"school_type": school_types, "region": regions, "admitted": admitted})
        
    else: 
        genders = np.random.choice(["Male", "Female"], size)
        exp = np.random.randint(1, 15, size)
        selected = [1 if (g == "Male" and np.random.rand() > 0.3) 
                    else (1 if (g == "Female" and np.random.rand() > 0.75) else 0) for g in genders]
        df = pd.DataFrame({"gender": genders, "experience": exp, "selected": selected})
        
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    return Response(content=csv_buffer.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f"attachment; filename={dataset_type}_sample.csv"
    })

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_data(
    file: UploadFile = File(...),
    sensitive_column: str = Form(...),
    target_column: str = Form(...)
):
    """Parses tabular datasets and computes target distributions before synthesizing an async generative report."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
        
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        columns = [str(c).strip().lower() for c in df.columns]
        df.columns = columns
        
        sens_col = sensitive_column.strip().lower()
        targ_col = target_column.strip().lower()
        
        if sens_col not in columns or targ_col not in columns:
            raise HTTPException(status_code=400, detail=f"Column mappings invalid. Ensure '{sens_col}' and '{targ_col}' exist.")
            
        df[sens_col] = df[sens_col].astype(str).str.title()
        
        grouped = df.groupby(sens_col)[targ_col].mean().to_dict()
        bias_result = {k: round(v, 2) for k, v in grouped.items()}
        
        explanation = "AI explanation unavailable. Check your API key or connection."
        try:
            prompt = construct_system_directive(sens_col, bias_result)
            
            # Using client.aio to gracefully spawn asynchronous non-blocking API requests within FastAPI's event loop
            response = await client.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0.2,
                )
            )
            
            if response and response.text:
                explanation = response.text
                
        except Exception as gemini_err:
            print(f"Generative API Runtime Exception: {gemini_err}")
            
        return AnalysisResponse(
            bias_result=bias_result,
            explanation=explanation
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
