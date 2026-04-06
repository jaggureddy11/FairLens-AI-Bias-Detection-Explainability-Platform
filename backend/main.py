from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import pandas as pd
import numpy as np
import io
from google import genai
import os
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/generate-sample")
def generate_sample(dataset_type: str = "hiring"):
    size = np.random.randint(60, 100)
    
    if dataset_type == "loan":
        income_levels = np.random.choice(["High", "Medium", "Low"], size, p=[0.2, 0.5, 0.3])
        regions = np.random.choice(["Urban", "Suburban", "Rural"], size)
        # Low income gets rejected heavily, implicitly introducing strong bias towards High income
        approved = [1 if (i == "High" and np.random.rand() > 0.05) 
                    else (1 if (i == "Medium" and np.random.rand() > 0.4) 
                    else (1 if np.random.rand() > 0.85 else 0)) for i in income_levels]
        df = pd.DataFrame({"income_level": income_levels, "region": regions, "approved": approved})
        
    elif dataset_type == "education":
        school_types = np.random.choice(["Public", "Private"], size, p=[0.7, 0.3])
        regions = np.random.choice(["North", "South", "East", "West"], size)
        # Private schools receive major advantage
        admitted = [1 if (s == "Private" and np.random.rand() > 0.15) 
                    else (1 if np.random.rand() > 0.65 else 0) for s in school_types]
        df = pd.DataFrame({"school_type": school_types, "region": regions, "admitted": admitted})
        
    else: # hiring
        genders = np.random.choice(["Male", "Female"], size)
        exp = np.random.randint(1, 15, size)
        # Bias against Female class
        selected = [1 if (g == "Male" and np.random.rand() > 0.3) 
                    else (1 if (g == "Female" and np.random.rand() > 0.75) else 0) for g in genders]
        df = pd.DataFrame({"gender": genders, "experience": exp, "selected": selected})
        
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    return Response(content=csv_buffer.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f"attachment; filename={dataset_type}_sample.csv"
    })

@app.post("/analyze")
async def analyze_data(
    file: UploadFile = File(...),
    sensitive_column: str = Form(...),
    target_column: str = Form(...)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        # Normalize original dataset column headers unconditionally
        columns = [str(c).strip().lower() for c in df.columns]
        df.columns = columns
        
        sens_col = sensitive_column.strip().lower()
        targ_col = target_column.strip().lower()
        
        if sens_col not in columns or targ_col not in columns:
            raise HTTPException(status_code=400, detail=f"Column mappings invalid. Ensure '{sens_col}' and '{targ_col}' exist.")
        
        # Strict uniform casing on sensitive data values
        df[sens_col] = df[sens_col].astype(str).str.title()
        
        # Calculate robust percentage map
        grouped = df.groupby(sens_col)[targ_col].mean().to_dict()
        bias_result = {k: round(v, 2) for k, v in grouped.items()}
        
        explanation = "AI explanation unavailable. Check your API key or connection."
        try:
            prompt = (
                f"You are the Lead Data Ethicist for FairLens, an algorithmic bias auditing platform.\n\n"
                f"**Audit Context:**\n"
                f"- Sensitive Entity Investigated: '{sens_col.title()}'\n"
                f"- Target Outcome Analyzed: '{targ_col.title()}'\n"
                f"- Mathematical Distribution: {bias_result}\n\n"
                f"**Directive:**\n"
                f"Provide a highly objective, professional executive summary outlining if demographic disparity exists. "
                f"Use precise bullet points to detail what this means in real-world terms and the operational risks if left unchecked."
            )
            
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0.3, # Low temperature for objective facts
                )
            )
            if response and response.text:
                explanation = response.text
        except Exception as gemini_err:
            print(f"Generative API Exception: {gemini_err}")
            
        return {
            "bias_result": bias_result,
            "explanation": explanation
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
