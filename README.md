# FairLens 🔍

**Algorithmic Bias Detection Platform** — Built for the "Build with AI" Hackathon.

FairLens is an end-to-end AI auditing engine designed to ingest disparate operational datasets (Hiring, Admissions, Loan Approvals) and mathematically evaluate algorithmic bias against protected entities. Utilizing Google's robust **Gemini 2.5 Flash** model, the platform synthesizes complex distribution metrics into human-readable, executive-level insights. 

---

### Features
* **Universal CSV Ingestion**: Drag-and-drop tabular data to instantly parse sensitive entities against targeted outcomes.
* **Algorithmic Fairness Scoring**: Instant comparative evaluation scaling perfect parity ratios against real-world metrics.
* **Powered by Gemini**: Fully articulated inference pipeline translating mathematical discrepancies into operational directives.
* **Synthetic Auto-Demo**: Generate and inject realistic mock bias datasets for instantaneous testing and workflow demonstration.
* **Executive PDF Export**: Securely convert analysis suites into highly polished offline HTML-canvas PDF reports.

### Tech Stack
* **Frontend**: React, Vite, Tailwind CSS 3 (High-end Monochrome SaaS aesthetic), Axios, Lucide React.
* **Backend**: FastAPI (Python), Pandas, NumPy, Uvicorn.
* **Generative Engine**: Google GenAI SDK (`gemini-2.5-flash`).

### Installation

1. **Clone & Install Backend**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
2. **Configure Environment**
Create a `.env` in the `/backend` folder:
`GEMINI_API_KEY=your_gemini_key_here`

3. **Install Frontend**
```bash
cd frontend
npm install
```

### Execution
Run both servers locally in synchronized environments:
* API: `cd backend && uvicorn main:app --reload`
* UI: `cd frontend && npm run dev`
