import React, { useState, useEffect, useRef } from 'react';
import { Maximize, Sparkles, X, ChevronLeft, ChevronRight, BookOpen, Loader2, Info } from 'lucide-react';

export default function App() {
  // --- App State ---
  const [appState, setAppState] = useState('initializing'); // initializing, ready, loading_pdf, viewing
  const [loadingText, setLoadingText] = useState('Loading Core Engines...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // --- Flipbook State ---
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isAiOpen, setIsAiOpen] = useState(false);
  
  // --- AI State ---
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContent, setAiContent] = useState('');
  
  // --- Refs ---
  const flipbookContainerRef = useRef(null);
  const flipbookRef = useRef(null);
  const pageFlipInstance = useRef(null);
  const pdfDocument = useRef(null);

  const scale = 2.0; // High-res render scale
  
  // ABK Imports PDF
  const pdfUrl = 'https://5489382d-e5dd-44ec-a4eb-680874f5cf71.usrfiles.com/ugd/548938_976dfb283a734b59b1edf75759e74bee.pdf';

  // --- 1. Load External Scripts ---
  useEffect(() => {
    const loadScripts = async () => {
      const loadScript = (src) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve();
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      };

      try {
        await Promise.all([
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'),
          loadScript('https://cdn.jsdelivr.net/npm/page-flip/dist/js/page-flip.browser.js'),
          loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js')
        ]);
        
        // Configure PDF.js worker
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        setAppState('ready');
      } catch (err) {
        console.error("Failed to load scripts:", err);
        setLoadingText("Failed to load required libraries. Please refresh.");
      }
    };

    loadScripts();
    
    // Cleanup on unmount
    return () => {
      if (pageFlipInstance.current) {
        pageFlipInstance.current.destroy();
      }
    };
  }, []);

  // --- 2. Load PDF and Build Flipbook ---
  const loadAbkCatalogue = async () => {
    setAppState('loading_pdf');
    setLoadingText("Fetching ABK Catalogue...");
    setLoadingProgress(10);

    try {
      let response = null;
      
      // Attempt 1: AllOrigins proxy (often more reliable in iframes)
      try {
        response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(pdfUrl));
      } catch (e) {
        console.warn("AllOrigins proxy failed:", e);
      }
      
      // Attempt 2: CorsProxy
      if (!response || !response.ok) {
        try {
          response = await fetch('https://corsproxy.io/?' + encodeURIComponent(pdfUrl));
        } catch (e) {
          console.warn("CorsProxy failed:", e);
        }
      }
      
      // Attempt 3: Direct fetch (in case CORS is surprisingly allowed or proxies are blocked)
      if (!response || !response.ok) {
        try {
          response = await fetch(pdfUrl);
        } catch (e) {
          console.warn("Direct fetch failed:", e);
          throw new Error("Network request failed for all endpoints. Check console and adblockers.");
        }
      }

      if (!response || !response.ok) {
         throw new Error(`Failed to fetch the PDF. Status: ${response?.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const pdfData = new Uint8Array(arrayBuffer);
      
      setLoadingProgress(30);
      setLoadingText("Parsing PDF structure...");

      // Pass the raw byte array directly to PDF.js
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      pdfDocument.current = await loadingTask.promise;
      
      const numPages = pdfDocument.current.numPages;
      setTotalPages(numPages);

      // 2. Build DOM manually to hand over to PageFlip (React shouldn't manage these children)
      setLoadingText("Rendering high-res pages...");
      if (flipbookRef.current) {
        flipbookRef.current.innerHTML = ''; // Clear previous
      }

      const page1 = await pdfDocument.current.getPage(1);
      const viewport1 = page1.getViewport({ scale: 1 });
      const baseWidth = viewport1.width;
      const baseHeight = viewport1.height;

      for (let i = 1; i <= numPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page bg-white overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]';
        
        if (i === 1 || i === numPages) pageDiv.setAttribute('data-density', 'hard');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'page-content w-full h-full flex justify-center items-center';

        const canvas = document.createElement('canvas');
        canvas.className = 'w-full h-full object-fill';
        
        const page = await pdfDocument.current.getPage(i);
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        contentDiv.appendChild(canvas);
        pageDiv.appendChild(contentDiv);
        flipbookRef.current.appendChild(pageDiv);

        setLoadingProgress(30 + ((i / numPages) * 70)); // Remaining 70% is rendering
      }

      flipbookRef.current.style.display = 'block';

      // 3. Initialize St.PageFlip
      pageFlipInstance.current = new window.St.PageFlip(flipbookRef.current, {
        width: baseWidth,
        height: baseHeight,
        size: "stretch",
        minWidth: 300,
        maxWidth: 2000,
        minHeight: 400,
        maxHeight: 3000,
        maxShadowOpacity: 0.6,
        showCover: true,
        mobileScrollSupport: false,
        usePortrait: true,
        flippingTime: 1000
      });

      pageFlipInstance.current.loadFromHTML(flipbookRef.current.querySelectorAll('.page'));

      pageFlipInstance.current.on('flip', (e) => setCurrentPage(e.data));
      pageFlipInstance.current.on('changeState', (e) => {
        if (e.data === 'read') setCurrentPage(pageFlipInstance.current.getCurrentPageIndex());
      });

      setAppState('viewing');
      
    } catch (error) {
      console.error(error);
      setAppState('ready');
      alert("Failed to load catalogue. Please check your network connection.");
    }
  };

  // --- 3. UI Helpers ---
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const getIndicatorText = () => {
    if (!pageFlipInstance.current) return '1 / 1';
    const orientation = pageFlipInstance.current.getOrientation();
    if (orientation === 'landscape') {
      if (currentPage === 0) return `Cover / ${totalPages}`;
      if (currentPage >= totalPages - 1) return `Back Cover / ${totalPages}`;
      return `${currentPage + 1} - ${Math.min(currentPage + 2, totalPages)} / ${totalPages}`;
    }
    return `${currentPage + 1} / ${totalPages}`;
  };

  // Clear AI content if page turns
  useEffect(() => {
    if (isAiOpen) {
      setAiContent(`
        <div class="flex flex-col items-center justify-center h-full text-center text-gray-400 mt-20 opacity-60">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-4"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 2v6h6"/></svg>
            <p class="max-w-[250px]">Spread changed. Click "Scan Current Spread" to analyze the new pages.</p>
        </div>`);
    }
  }, [currentPage, isAiOpen]);

  // --- 4. AI Insights Integration ---
  const extractTextFromVisiblePages = async () => {
    if (!pdfDocument.current || !pageFlipInstance.current) return "";
    
    const orientation = pageFlipInstance.current.getOrientation();
    let pagesToExtract = [];
    
    if (orientation === 'portrait') {
      pagesToExtract.push(currentPage + 1);
    } else {
      if (currentPage === 0) {
        pagesToExtract.push(1);
      } else if (currentPage >= totalPages - 1) {
        pagesToExtract.push(totalPages);
      } else {
        pagesToExtract.push(currentPage + 1);
        if (currentPage + 2 <= totalPages) pagesToExtract.push(currentPage + 2);
      }
    }

    let text = "";
    for (const pageNum of pagesToExtract) {
      try {
        const page = await pdfDocument.current.getPage(pageNum);
        const content = await page.getTextContent();
        text += content.items.map(i => i.str).join(' ') + "\n\n";
      } catch (e) {
        console.warn(`Could not extract text from page ${pageNum}`);
      }
    }
    return text.trim();
  };

  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiContent('');
    
    try {
      const text = await extractTextFromVisiblePages();
      
      if (!text || text.length < 15) {
        setAiContent(`
          <div class="bg-gray-800/50 p-5 rounded-xl border border-gray-700 text-center">
              <p class="text-gray-300">Insufficient text found on this spread. It appears to be primarily visual.</p>
          </div>
        `);
        setAiLoading(false);
        return;
      }

      const apiKey = ""; // Injected by env
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      
      const prompt = `Analyze this exact text extracted from the current spread of the ABK Imports Product Catalogue (2026-27). 
      Provide a clean, highly structured summary in Markdown. 
      Focus on:
      1. Identifying the specific Brands mentioned (e.g., Trixie, Bio-Groom).
      2. Listing the main Product Categories/Types on this page.
      3. Noting any specific SKUs, sizes, or variants if they are easily readable.
      Be concise and professional, designed for B2B distributors.\n\nRAW TEXT:\n${text}`;

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: "You are an AI assistant for a B2B pet supply distributor. Output strictly in well-formatted Markdown using bullet points and bold text for easy scanning." }] }
      };

      let result = null;
      let delay = 1000;
      
      for(let i=0; i<3; i++) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) { result = await response.json(); break; }
        await new Promise(r => setTimeout(r, delay)); delay *= 2;
      }

      if (!result) throw new Error("API failed.");

      const summaryText = result.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";
      
      setAiContent(`<div class="markdown-body opacity-0 translate-y-4 transition-all duration-500 ease-out" id="markdown-result">${window.marked.parse(summaryText)}</div>`);
      
      setTimeout(() => {
        const el = document.getElementById('markdown-result');
        if(el) el.classList.remove('opacity-0', 'translate-y-4');
      }, 50);

    } catch (error) {
      console.error(error);
      setAiContent(`
        <div class="bg-red-900/20 text-red-400 p-5 rounded-xl border border-red-800/50 flex items-center gap-3">
            Failed to generate insights. Please try again.
        </div>`);
    } finally {
      setAiLoading(false);
    }
  };

  // --- CSS Overrides for Markdown injected content ---
  const markdownStyles = `
    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: white; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3em;}
    .markdown-body p { margin-bottom: 1em; }
    .markdown-body ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; color: #cbd5e1; }
    .markdown-body li { margin-bottom: 0.25em; }
    .markdown-body strong { color: #93c5fd; font-weight: 600; }
  `;

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden text-white font-sans bg-[#0f172a] relative">
      <style>{markdownStyles}</style>
      {/* Background radial gradients */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `
          radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
          radial-gradient(at 50% 0%, hsla(225,39%,30%,0.2) 0, transparent 50%), 
          radial-gradient(at 100% 0%, hsla(339,49%,30%,0.2) 0, transparent 50%)`
      }} />

      {/* --- Top Navigation --- */}
      <div className="absolute top-0 left-0 right-0 p-4 px-6 flex justify-between items-center z-50 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-4">
          <img src="https://www.abkgrooming.com/cdn/shop/files/abk_red_logo.png?v=1729148610&width=200" alt="ABK Imports Logo" className="h-10 object-contain drop-shadow-md" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">Product Catalogue</h1>
            <p className="text-xs text-red-400 font-semibold tracking-widest uppercase">2026–27</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={toggleFullScreen} className="p-2 rounded-lg bg-slate-900/60 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-gray-300 hover:text-white shadow-lg" title="Toggle Fullscreen">
            <Maximize size={18} />
          </button>
          
          {appState === 'viewing' && (
            <button 
              onClick={() => setIsAiOpen(!isAiOpen)} 
              className="bg-blue-600/20 border border-blue-500/40 text-blue-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.2)]"
            >
              <Sparkles size={16} />
              AI Insights
            </button>
          )}
        </div>
      </div>

      {/* --- Main Scene Area --- */}
      <div 
        ref={flipbookContainerRef}
        className="flex-grow flex justify-center items-center w-full h-full relative z-10 box-border"
        style={{ padding: 'calc(4rem + 3%) 3% 3% 3%' }} // Exact padding requested
      >
        
        {/* Hover Navigation Zones (Active only when viewing) */}
        {appState === 'viewing' && (
          <>
            <div className="absolute top-1/2 -translate-y-1/2 left-4 h-[60%] w-[100px] z-40 flex items-center justify-start cursor-pointer opacity-0 hover:opacity-100 hover:-translate-x-1 transition-all group" onClick={() => pageFlipInstance.current?.flipPrev()}>
              <div className="bg-slate-900/70 backdrop-blur-md border border-white/15 text-white p-4 rounded-full shadow-2xl transition-all group-hover:bg-blue-600/90 group-hover:shadow-[0_0_20px_rgba(37,99,235,0.5)]">
                <ChevronLeft size={36} strokeWidth={2.5} />
              </div>
            </div>
            
            <div className="absolute top-1/2 -translate-y-1/2 right-4 h-[60%] w-[100px] z-40 flex items-center justify-end cursor-pointer opacity-0 hover:opacity-100 hover:translate-x-1 transition-all group" onClick={() => pageFlipInstance.current?.flipNext()}>
              <div className="bg-slate-900/70 backdrop-blur-md border border-white/15 text-white p-4 rounded-full shadow-2xl transition-all group-hover:bg-blue-600/90 group-hover:shadow-[0_0_20px_rgba(37,99,235,0.5)]">
                <ChevronRight size={36} strokeWidth={2.5} />
              </div>
            </div>
          </>
        )}

        {/* Initial Landing Page */}
        {(appState === 'initializing' || appState === 'ready') && (
          <div className="text-center absolute z-20 w-full max-w-4xl px-4">
            <div className="bg-slate-900/60 backdrop-blur-xl border-t border-white/20 p-14 rounded-3xl flex flex-col items-center relative overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
              <div className="absolute -top-32 -right-32 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>

              <div className="relative z-10 flex flex-col items-center">
                <img src="https://www.abkgrooming.com/cdn/shop/files/abk_red_logo.png?v=1729148610&width=200" alt="ABK Imports Logo" className="h-20 object-contain mb-6 drop-shadow-2xl" />
                <h3 className="text-3xl text-white font-bold mb-6">Product Catalogue 2026–27</h3>
                
                <p className="text-gray-300 max-w-2xl mb-10 text-lg leading-relaxed text-center">
                  Seamlessly browse our curated portfolio of international and in-house pet care brands. 
                  Experience our digital catalogue with realistic page-turning physics and AI-powered product insights.
                </p>

                <button 
                  onClick={loadAbkCatalogue}
                  disabled={appState === 'initializing'}
                  className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:opacity-50 text-white px-10 py-4 rounded-xl font-bold transition-all shadow-[0_0_25px_rgba(220,38,38,0.4)] hover:shadow-[0_0_35px_rgba(220,38,38,0.6)] flex items-center gap-3 transform hover:-translate-y-1 disabled:hover:translate-y-0"
                >
                  {appState === 'initializing' ? <Loader2 className="animate-spin" size={22} /> : <BookOpen size={22} />}
                  {appState === 'initializing' ? 'Initializing Engine...' : 'Open Digital Catalogue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PageFlip Container DOM Node (React leaves this interior alone after mount) */}
        <div ref={flipbookRef} className="flip-book shadow-[0_0_20px_0_rgba(0,0,0,0.5)] hidden"></div>
        
      </div>

      {/* --- Bottom Controls --- */}
      {appState === 'viewing' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-4 items-center bg-slate-900/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 shadow-lg">
          <span className="text-sm font-medium text-gray-400">Page</span>
          <div className="bg-black/40 px-4 py-1.5 rounded-lg border border-white/10 min-w-[100px] text-center">
            <span className="font-bold text-white font-mono tracking-wider">{getIndicatorText()}</span>
          </div>
        </div>
      )}

      {/* --- Loading Overlay --- */}
      {appState === 'loading_pdf' && (
        <div className="fixed inset-0 bg-[#0f172a]/98 backdrop-blur-xl z-[200] flex flex-col items-center justify-center">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-white/5 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-[spin_0.8s_linear_infinite]"></div>
            <div className="absolute inset-0 border-4 border-red-500 border-b-transparent rounded-full animate-[spin_1.2s_linear_infinite_reverse]"></div>
          </div>
          <h3 className="text-2xl font-bold mb-5 tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">{loadingText}</h3>
          <div className="w-80 h-2 bg-gray-900 rounded-full overflow-hidden shadow-inner border border-white/5">
            <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 transition-all duration-200" style={{ width: `${loadingProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* --- Exact Selection Implementation: AI Sidebar --- */}
      <div 
        className="fixed top-0 flex flex-col border-l border-white/10 bg-[#0f172a]/98 z-[100] h-screen w-[420px]"
        style={{
          boxShadow: '-20px 0 50px rgba(0,0,0,0.5)',
          transition: 'right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          right: isAiOpen ? '0px' : '-450px'
        }}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-3 text-blue-400">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Sparkles size={20} strokeWidth={2.5} />
            </div>
            <h3 className="font-bold text-lg text-white">AI Assistant</h3>
          </div>
          <button onClick={() => setIsAiOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        
        {/* Sidebar Content Area */}
        <div className="flex-grow p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {aiContent ? (
            <div dangerouslySetInnerHTML={{ __html: aiContent }} className="text-[#e2e8f0] text-[0.95rem] leading-relaxed" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 mt-20 opacity-60">
              <Info size={48} strokeWidth={1} className="mb-4" />
              <p className="max-w-[250px]">Analyze the current spread to instantly extract brands, categories, and SKU data.</p>
            </div>
          )}
        </div>
        
        {/* Sidebar Footer / Action Button */}
        <div className="p-5 border-t border-white/10 bg-black/40 backdrop-blur-md">
          <button 
            onClick={generateAiSummary}
            disabled={aiLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-70 text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] disabled:shadow-none"
          >
            {aiLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Scanning Catalogue...</span>
              </>
            ) : (
              <span>Scan Current Spread</span>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
