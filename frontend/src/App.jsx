import { useState, useRef } from 'react'
import axios from 'axios'
import { UploadCloud, FileText, AlertTriangle, Check, Loader2, Sparkles, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import html2pdf from 'html2pdf.js'
import './App.css'

function App() {
  const [file, setFile] = useState(null)
  const [columns, setColumns] = useState([])
  const [sensitiveCol, setSensitiveCol] = useState('')
  const [targetCol, setTargetCol] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  const parseCSVColumns = async (f) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const firstLine = text.split('\n')[0];
        const cols = firstLine.split(',').map(c => c.trim().toLowerCase());
        resolve(cols);
      };
      reader.readAsText(f);
    });
  }

  const processNewFile = async (f) => {
    setFile(f);
    const cols = await parseCSVColumns(f);
    setColumns(cols);
    
    let sCol = cols[0] || '', tCol = cols[cols.length-1] || '';
    if (cols.includes('gender')) sCol = 'gender';
    if (cols.includes('income_level')) sCol = 'income_level';
    if (cols.includes('school_type')) sCol = 'school_type';
    
    if (cols.includes('selected')) tCol = 'selected';
    if (cols.includes('approved')) tCol = 'approved';
    if (cols.includes('admitted')) tCol = 'admitted';
    
    setSensitiveCol(sCol);
    setTargetCol(tCol);
    setError('');
    setResults(null);
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processNewFile(e.target.files[0])
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processNewFile(e.dataTransfer.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file to upload.');
      return;
    }
    if (!sensitiveCol || !targetCol) {
      setError('Please identify both a sensitive attribute and a target outcome.');
      return;
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('sensitive_column', sensitiveCol)
    formData.append('target_column', targetCol)

    setLoading(true)
    setError('')

    try {
      const response = await axios.post('http://127.0.0.1:8000/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      setResults(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'An error occurred during robust analysis.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateAndAnalyze = async (type) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`http://127.0.0.1:8000/generate-sample?dataset_type=${type}`, {
        responseType: 'blob'
      });
      const generatedFile = new File([res.data], `${type}_sample.csv`, { type: 'text/csv' });
      await processNewFile(generatedFile);
      
      const cols = await parseCSVColumns(generatedFile);
      
      let sCol = cols[0], tCol = cols[cols.length-1];
      if (cols.includes('gender')) sCol = 'gender';
      if (cols.includes('income_level')) sCol = 'income_level';
      if (cols.includes('school_type')) sCol = 'school_type';
      if (cols.includes('selected')) tCol = 'selected';
      if (cols.includes('approved')) tCol = 'approved';
      if (cols.includes('admitted')) tCol = 'admitted';
      
      const formData = new FormData();
      formData.append('file', generatedFile);
      formData.append('sensitive_column', sCol);
      formData.append('target_column', tCol);
      
      const analyzeRes = await axios.post('http://127.0.0.1:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResults(analyzeRes.data);
      
    } catch (err) {
      setError('Failed to securely auto-generate or analyze internal sample dataset.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const calculateBias = () => {
    const biasRes = results?.bias_result;
    if (!biasRes) return null;
    
    const keys = Object.keys(biasRes);
    if (keys.length < 2) return null;
    
    let rates = keys.map(k => ({ label: k, rate: (biasRes[k] * 100).toFixed(0), floatValue: biasRes[k] }));
    rates = rates.sort((a,b) => b.floatValue - a.floatValue); // Sort highest to lowest

    const vals = rates.map(r => r.floatValue);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const diff = Math.abs(max - min);
    const hasBias = diff > 0.15; // 15% threshold difference
    
    // Fairness Score: 100 = perfect parity.
    const fairnessScore = Math.max(0, 100 - (diff * 100)).toFixed(0);
    
    return {
      hasBias,
      message: hasBias ? 'Bias Detected' : 'Acceptable Parity',
      rates,
      score: fairnessScore
    }
  }

  const biasData = results ? calculateBias() : null;

  const downloadPDF = () => {
    const element = document.getElementById('report-content');
    const opt = {
      margin:       0.3,
      filename:     'FairLens_Bias_Audit_Report.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#000000' },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  }

  return (
    <div className="min-h-screen bg-[#000] text-white font-sans selection:bg-white selection:text-black pb-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111_1px,transparent_1px),linear-gradient(to_bottom,#111_1px,transparent_1px)] bg-[size:30px_30px] opacity-30 pointer-events-none fade-in"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black pointer-events-none"></div>
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24">
        
        {/* Header */}
        <header className="mb-14 sm:mb-20 text-center relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
          <h1 className="text-5xl sm:text-7xl font-semibold mb-4 tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] text-white">FAIRLENS.</h1>
          <p className="text-neutral-500 text-xs sm:text-[13px] max-w-xl mx-auto uppercase tracking-[0.3em] font-bold">Enterprise Bias Intelligence Engine</p>
        </header>

        {/* Quick Demo Segment */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10 fade-in">
          <span className="text-[10px] sm:text-xs uppercase tracking-widest text-neutral-600 font-medium mr-2">Auto-Demo</span>
          <button onClick={() => handleGenerateAndAnalyze('hiring')} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-800 text-[10px] sm:text-xs text-neutral-300 hover:text-black hover:bg-white transition-all uppercase tracking-wider font-medium">
            <Sparkles size={12} /> Hiring
          </button>
          <button onClick={() => handleGenerateAndAnalyze('loan')} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-800 text-[10px] sm:text-xs text-neutral-300 hover:text-black hover:bg-white transition-all uppercase tracking-wider font-medium">
            <Sparkles size={12} /> Loan
          </button>
          <button onClick={() => handleGenerateAndAnalyze('education')} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-800 text-[10px] sm:text-xs text-neutral-300 hover:text-black hover:bg-white transition-all uppercase tracking-wider font-medium">
            <Sparkles size={12} /> Education
          </button>
        </div>

        {/* Upload Card */}
        <div className="bg-[#050505] rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 mb-8 border border-neutral-900 transition-all hover:border-neutral-800">
          <div 
            className={`relative border border-dashed rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center transition-all duration-300 ease-in-out cursor-pointer flex flex-col items-center justify-center min-h-[220px] ${dragActive ? 'border-white bg-white/[0.02] scale-[1.01]' : 'border-neutral-800 hover:border-neutral-600 hover:bg-neutral-950/50'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            
            {file ? (
              <div className="flex flex-col items-center space-y-5 fade-in">
                <div className="w-16 h-16 rounded-full bg-black border border-neutral-800 flex items-center justify-center text-white">
                  <FileText size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-lg font-medium text-white tracking-tight">{file.name}</p>
                  <p className="text-sm text-neutral-500 mt-1 uppercase tracking-widest">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); setColumns([]); }}
                  className="text-xs text-neutral-500 hover:text-white transition-colors underline object-contain mt-2 uppercase tracking-wider font-medium"
                >
                  Clear Selection
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4 opacity-80 group-hover:opacity-100 transition-opacity">
                <div className="w-14 h-14 rounded-full bg-black border border-neutral-800 flex items-center justify-center text-white mb-2">
                  <UploadCloud size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-base font-medium text-white mb-2 tracking-tight">Upload internal dataset</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-widest">Any generic CSV supported</p>
                </div>
              </div>
            )}
          </div>

          {columns.length > 0 && (
            <div className="mt-8 flex flex-col sm:flex-row gap-4 w-full bg-[#0A0A0A] p-5 rounded-2xl border border-neutral-800 fade-in-up">
              <div className="flex-1 text-left">
                <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2 font-medium">Sensitive Entity</label>
                <select 
                  className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-neutral-500 transition-colors uppercase tracking-wider"
                  value={sensitiveCol}
                  onChange={(e) => setSensitiveCol(e.target.value)}
                >
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1 text-left">
                <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2 font-medium">Target Outcome</label>
                <select 
                  className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-neutral-500 transition-colors uppercase tracking-wider"
                  value={targetCol}
                  onChange={(e) => setTargetCol(e.target.value)}
                >
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col items-center">
            {error && (
              <div className="w-full mb-6 p-4 rounded-xl border border-neutral-800 flex items-start gap-3 text-left fade-in">
                <AlertTriangle className="text-white shrink-0 mt-0.5" size={18} strokeWidth={1.5} />
                <p className="text-neutral-300 text-sm leading-relaxed">{error}</p>
              </div>
            )}

            <button 
              onClick={(e) => { e.stopPropagation(); handleUpload(); }} 
              disabled={!file || loading}
              className={`w-full sm:w-auto px-12 py-5 rounded-[1.2rem] font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 relative ${
                !file || loading 
                  ? 'bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed' 
                  : 'bg-white text-black hover:bg-neutral-200 hover:-translate-y-0.5 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Executing Audit...
                </>
              ) : 'Run Deep Analysis'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {results && biasData && (
          <div className="space-y-6 fade-in-up mt-12 pb-12">
            
            {/* Download Button */}
            <div className="flex justify-end mb-2">
               <button onClick={downloadPDF} className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-neutral-800 text-xs font-medium uppercase tracking-widest text-neutral-400 hover:bg-white hover:text-black hover:border-white transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                 <Download size={14} /> Download Bias Report (PDF)
               </button>
            </div>

            <div id="report-content" className="space-y-6 pb-6 p-4 -m-4">
              {/* Metrics Card */}
              <div className="bg-[#050505] rounded-[2rem] p-6 sm:p-10 border border-neutral-900 transition-all">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 pb-8 border-b border-neutral-900">
                  <div>
                    <h2 className="text-xl font-semibold mb-2 tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">Algorithmic Distribution</h2>
                    <p className="text-neutral-500 text-xs uppercase tracking-widest">({sensitiveCol} vs {targetCol})</p>
                  </div>
                  
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="flex flex-col items-end">
                       <span className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold mb-1">Fairness Score</span>
                       <span className={`text-4xl font-black tracking-tighter ${biasData.hasBias ? 'text-white' : 'text-neutral-300'} drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]`}>{biasData.score}<span className="text-xl text-neutral-700">/100</span></span>
                    </div>
                    <div className="w-px h-10 bg-neutral-800 hidden sm:block"></div>
                    <div className={`px-5 py-3 rounded-full flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest border transition-all h-fit ${
                      biasData.hasBias 
                        ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' 
                        : 'bg-black text-white border-neutral-800'
                    }`}>
                      {biasData.hasBias ? <AlertTriangle size={16} strokeWidth={2.5} /> : <Check size={16} strokeWidth={2.5} />}
                      {biasData.message}
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  {biasData.rates.map((item, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between items-end mb-3">
                        <span className="text-xs font-medium text-neutral-400 capitalize tracking-wide">{item.label}</span>
                        <span className="text-2xl font-semibold tracking-tighter text-white">{item.rate}%</span>
                      </div>
                      <div className="w-full bg-neutral-900 rounded-full h-1 overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${item.rate}%`, backgroundColor: '#FFFFFF', opacity: Math.max(1 - (idx * 0.4), 0.2) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {/* AI Explanation Card */}
              <div className="bg-[#050505] rounded-[2rem] p-6 sm:p-10 border border-neutral-900 transition-all shadow-[inset_0_0_50px_rgba(255,255,255,0.02)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">Deep AI Analytics</h3>
                  <div className="px-3 py-1.5 rounded-full bg-[#111] border border-neutral-800 inline-flex items-center gap-2 w-max">
                    <Sparkles className="text-white" size={10} />
                    <span className="text-[9px] uppercase tracking-widest font-bold text-white">Gemini Architecture</span>
                  </div>
                </div>
                <div className="prose prose-invert prose-neutral max-w-none text-neutral-300 prose-p:leading-relaxed prose-p:text-[15px] sm:prose-p:text-base prose-p:font-light prose-p:tracking-wide">
                  <ReactMarkdown>{results.explanation}</ReactMarkdown>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

export default App
