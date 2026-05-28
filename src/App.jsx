import React, { useState, useEffect, useRef } from 'react';
import { Maximize, ChevronLeft, ChevronRight, BookOpen, Loader2, Search, X, Sparkles, Info } from 'lucide-react';

export default function App() {
  // --- App State ---
  const [appState, setAppState] = useState('initializing'); // initializing, ready, loading_pdf, viewing
  const [loadingText, setLoadingText] = useState('Loading Core Engines...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // --- Flipbook State ---
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // --- Search & AI State ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState('idle'); 
  const [aiResult, setAiResult] = useState('');
  
  // --- Refs ---
  const flipbookContainerRef = useRef(null);
  const flipbookRef = useRef(null);
  const pageFlipInstance = useRef(null);
  const pdfDocument = useRef(null);
  const pageSize = useRef({ width: 0, height: 0 }); // Store for resize logic
  const pageTextCache = useRef({}); // INSTANT SEARCH CACHE

  const scale = 2.0; // High-res render scale
  const pdfUrl = '/catalogue.pdf';

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
        
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        setAppState('ready');
      } catch (err) {
        console.error("Failed to load scripts:", err);
        setLoadingText("Failed to load required libraries. Please refresh.");
      }
    };

    loadScripts();
    
    return () => {
      if (pageFlipInstance.current) {
        pageFlipInstance.current.destroy();
      }
    };
  }, []);

  // --- Layout Engine ---
  const resizeBook = () => {
    if (!flipbookContainerRef.current || !flipbookRef.current || !pageSize.current.width) return;
    
    const container = flipbookContainerRef.current;
    const { width: baseW, height: baseH } = pageSize.current;
    
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    
    const isMobile = window.innerWidth < 768;
    const targetRatio = isMobile ? (baseW / baseH) : ((baseW * 2) / baseH);
    
    let finalWidth, finalHeight;
    
    if (cWidth / cHeight > targetRatio) {
      finalHeight = cHeight;
      finalWidth = cHeight * targetRatio;
    } else {
      finalWidth = cWidth;
      finalHeight = cWidth / targetRatio;
    }
    
    flipbookRef.current.style.width = `${finalWidth}px`;
    flipbookRef.current.style.height = `${finalHeight}px`;
    
    if (pageFlipInstance.current) {
      pageFlipInstance.current.update();
    }
  };

  useEffect(() => {
    window.addEventListener('resize', resizeBook);
    return () => window.removeEventListener('resize', resizeBook);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsAiOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Background Text Indexer ---
  const buildSearchIndex = async (doc, numPages) => {
    for (let i = 1; i <= numPages; i++) {
      try {
        if (pageTextCache.current[i]) continue;
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        
        // Basic sorting to maintain some spatial relationships
        textContent.items.sort((a, b) => {
          if (Math.abs(a.transform[5] - b.transform[5]) > 5) return b.transform[5] - a.transform[5]; // Sort Y
          return a.transform[4] - b.transform[4]; // Sort X
        });
        
        pageTextCache.current[i] = textContent.items.map(item => item.str).join(' ');
        
        // Yield to keep UI smooth
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
      } catch (e) {
        console.warn(`Failed to index page ${i}`, e);
      }
    }
    console.log("Background Search Indexing Complete!");
  };

  // --- 2. Load PDF and Build Flipbook ---
  const loadAbkCatalogue = async () => {
    setAppState('loading_pdf');
    setLoadingText("Fetching ABK Catalogue...");
    setLoadingProgress(10);

    try {
      const response = await fetch(pdfUrl);

      if (!response || !response.ok) {
         throw new Error(`Failed to fetch the local PDF. Ensure /catalogue.pdf exists in the public directory.`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const pdfData = new Uint8Array(arrayBuffer);
      
      setLoadingProgress(30);
      setLoadingText("Parsing PDF structure...");

      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      pdfDocument.current = await loadingTask.promise;
      
      const numPages = pdfDocument.current.numPages;
      setTotalPages(numPages);

      setLoadingText("Rendering high-res pages...");
      if (flipbookRef.current) flipbookRef.current.innerHTML = '';

      const page1 = await pdfDocument.current.getPage(1);
      const viewport1 = page1.getViewport({ scale: 1 });
      pageSize.current = { width: viewport1.width, height: viewport1.height };

      for (let i = 1; i <= numPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page bg-white overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]';
        
        if (i === 1 || i === numPages) pageDiv.setAttribute('data-density', 'hard');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'page-content w-full h-full flex justify-center items-center bg-white';

        const canvas = document.createElement('canvas');
        canvas.className = 'w-full h-full object-fill bg-white';
        
        const page = await pdfDocument.current.getPage(i);
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        contentDiv.appendChild(canvas);
        pageDiv.appendChild(contentDiv);
        flipbookRef.current.appendChild(pageDiv);

        setLoadingProgress(30 + ((i / numPages) * 70));
      }

      flipbookRef.current.style.display = 'block';
      flipbookRef.current.style.opacity = '0';

      resizeBook();

      const isMobile = window.innerWidth < 768;

      pageFlipInstance.current = new window.St.PageFlip(flipbookRef.current, {
        width: pageSize.current.width,
        height: pageSize.current.height,
        size: "stretch", 
        minWidth: 200,   
        maxWidth: 2000,
        minHeight: 300,  
        maxHeight: 3000,
        maxShadowOpacity: 0.6,
        showCover: !isMobile, 
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
      
      setTimeout(() => {
        if (flipbookRef.current) {
          flipbookRef.current.style.transition = 'opacity 0.4s ease-in-out';
          flipbookRef.current.style.opacity = '1';
        }
      }, 150);
      
      // Start background indexing for instant search
      buildSearchIndex(pdfDocument.current, numPages);

    } catch (error) {
      console.error(error);
      setAppState('ready');
      alert("Failed to load catalogue. Please ensure 'catalogue.pdf' is in the public folder.");
    }
  };

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

  // --- PDF Text Extraction Utility ---
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
        if (pageTextCache.current[pageNum]) {
          text += pageTextCache.current[pageNum] + "\n\n";
        } else {
          const page = await pdfDocument.current.getPage(pageNum);
          const content = await page.getTextContent();
          text += content.items.map(i => i.str).join(' ') + "\n\n";
        }
      } catch (e) {
        console.warn(`Could not extract text from page ${pageNum}`);
      }
    }
    return text.trim();
  };

  // --- AI Insights Spread Summary ---
  useEffect(() => {
    if (isAiOpen) {
      setAiStatus('idle');
      setAiResult('');
    }
  }, [currentPage, isAiOpen]);

  const generateAiSummary = async () => {
    setAiStatus('scanning');
    try {
      const text = await extractTextFromVisiblePages();
      if (!text || text.length < 15) {
        setAiStatus('insufficient');
        return;
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      const prompt = `Analyze this exact text extracted from the current spread of the ABK Imports Product Catalogue. 
      Provide a highly structured summary in Markdown. 
      Focus on: Brands, Product Categories, and general pricing or features mentioned. 
      Be concise.
      
      RAW TEXT:\n${text}`;

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: "You are an AI assistant for a B2B pet supply distributor. Output strictly in well-formatted Markdown." }] }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!result.candidates) throw new Error("API failed.");

      setAiResult(result.candidates[0].content.parts[0].text);
      setAiStatus('success');

    } catch (error) {
      console.error(error);
      setAiStatus('error');
    }
  };

  // --- Super Smart AI Contextual Search ---
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !pdfDocument.current) return;

    setIsSearching(true);
    setSearchResults([]);
    const query = searchQuery.toLowerCase().trim();
    const rawMatches = [];

    try {
      // 1. FAST Local Pass: Use pre-built background index
      for (let i = 1; i <= totalPages; i++) {
        let pageText = pageTextCache.current[i];
        
        // Fallback if background worker hasn't finished this page yet
        if (!pageText) {
          const page = await pdfDocument.current.getPage(i);
          const textContent = await page.getTextContent();
          pageText = textContent.items.map(item => item.str).join(' ');
          pageTextCache.current[i] = pageText;
        }
        
        if (pageText.toLowerCase().includes(query)) {
           rawMatches.push({ pageIndex: i - 1, pageNumber: i, rawText: pageText });
           // Stop after finding 5 distinct pages to keep extraction blazing fast
           if (rawMatches.length >= 5) break; 
        }
      }
      
      if (rawMatches.length === 0) {
        setIsSearching(false);
        return;
      }

      // 2. AI Intelligence Pass: Reconstruct exact variant details from a targeted text snippet
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      const structuredResults = [];

      for (const match of rawMatches) {
        // Grab a 1000-character window around the match for context (saves tokens & speeds up API)
        const matchIdx = match.rawText.toLowerCase().indexOf(query);
        const snippetStart = Math.max(0, matchIdx - 400);
        const snippetEnd = Math.min(match.rawText.length, matchIdx + 600);
        const snippet = match.rawText.substring(snippetStart, snippetEnd);

        const prompt = `
          The user searched for: "${query}".
          Here is a snippet of raw text extracted from a catalogue page where this term was found.
          
          Intelligently reconstruct the product context. Find the main product group, the specific variant, the SKU, and the Price (MRP).
          Respond ONLY with a JSON array of objects matching this exact schema:
          [
            {
              "sku": "The SKU code (e.g., #631528 or CC1204)",
              "variantName": "The specific variant (e.g., Biscuit Chicken, Pumpkin Spice Small)",
              "parentProduct": "The main product header (e.g., Chip Chops (70 gm) or Twistix Dental Treats)",
              "price": "The price (e.g., Rs. 225.00)"
            }
          ]
          If you cannot find clear context, provide your best guess based on proximity.
          
          RAW SNIPPET:
          ${snippet}
        `;

        const payload = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.1 
          }
        };

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const aiResult = await response.json();
          
          if (aiResult.candidates && aiResult.candidates[0].content.parts[0].text) {
             const parsedData = JSON.parse(aiResult.candidates[0].content.parts[0].text);
             if (parsedData && parsedData.length > 0) {
               // Only take the first item that matches closely
               structuredResults.push({
                 pageIndex: match.pageIndex,
                 pageNumber: match.pageNumber,
                 details: parsedData[0] 
               });
             } else {
               structuredResults.push({ pageIndex: match.pageIndex, pageNumber: match.pageNumber, details: null });
             }
          }
        } catch (aiErr) {
          console.error("AI Context extraction failed for page", match.pageNumber, aiErr);
          structuredResults.push({ pageIndex: match.pageIndex, pageNumber: match.pageNumber, details: null });
        }
      }
      
      setSearchResults(structuredResults);
      
      // Auto-jump if there's exactly 1 perfect match
      if (structuredResults.length === 1) {
        jumpToSearchResult(structuredResults[0].pageIndex);
      }
      
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  const jumpToSearchResult = (pageIndex) => {
    pageFlipInstance.current?.flip(pageIndex);
    if (window.innerWidth < 768) {
      setIsSearchOpen(false);
    }
  };

  // --- CSS Overrides for Markdown injected content ---
  const markdownStyles = `
    @keyframes slideFadeIn {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-fade {
      animation: slideFadeIn 0.5s ease-out forwards;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: white; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; border-bottom: 1px solid #334155; padding-bottom: 0.3em;}
    .markdown-body p { margin-bottom: 1em; }
    .markdown-body ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; color: #cbd5e1; }
    .markdown-body li { margin-bottom: 0.25em; }
    .markdown-body strong { color: #60a5fa; font-weight: 600; }
  `;

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden text-white font-sans bg-[#0f172a] relative">
      <style dangerouslySetInnerHTML={{ __html: markdownStyles }} />
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `
          radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
          radial-gradient(at 50% 0%, hsla(225,39%,30%,0.2) 0, transparent 50%), 
          radial-gradient(at 100% 0%, hsla(339,49%,30%,0.2) 0, transparent 50%)`
      }} />

      {/* --- Top Navigation --- */}
      <div className="absolute top-0 left-0 right-0 p-4 px-6 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4">
          <img src="https://www.abkgrooming.com/cdn/shop/files/abk_red_logo.png?v=1729148610&width=200" alt="ABK Imports Logo" className="h-8 md:h-10 object-contain drop-shadow-md" />
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white drop-shadow-md">Product Catalogue</h1>
            <p className="text-[10px] md:text-xs text-red-400 font-semibold tracking-widest uppercase">2026–27</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {appState === 'viewing' && (
            <>
              <button 
                onClick={() => { setIsSearchOpen(true); setIsAiOpen(false); }} 
                className="p-2 px-3 rounded-lg bg-[#1e293b] border border-slate-700 hover:bg-slate-700 transition-all text-gray-300 hover:text-white shadow-lg flex items-center gap-2" 
                title="Search Catalogue"
              >
                <Search size={18} />
                <span className="hidden md:block text-sm font-semibold">Search Catalogue</span>
              </button>
              <button 
                onClick={() => { setIsAiOpen(true); setIsSearchOpen(false); }} 
                className="bg-blue-600/20 border border-blue-500/40 text-blue-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.2)]"
              >
                <Sparkles size={16} />
                <span className="hidden md:block">AI Insights</span>
              </button>
            </>
          )}
          <button onClick={toggleFullScreen} className="p-2 rounded-lg bg-[#1e293b] border border-slate-700 hover:bg-slate-700 transition-all text-gray-300 hover:text-white shadow-lg" title="Toggle Fullscreen">
            <Maximize size={18} />
          </button>
        </div>
      </div>

      {/* --- Hover Navigation Zones (Desktop Only) --- */}
      {appState === 'viewing' && (
        <>
          <div className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-4 h-[60%] w-[80px] z-40 items-center justify-start cursor-pointer opacity-0 hover:opacity-100 hover:-translate-x-1 transition-all group" onClick={() => pageFlipInstance.current?.flipPrev()}>
            <div className="bg-[#0f172a] border border-slate-700 text-white p-4 rounded-full shadow-2xl transition-all group-hover:bg-blue-600 group-hover:border-blue-500 group-hover:shadow-[0_0_20px_rgba(37,99,235,0.6)]">
              <ChevronLeft size={32} strokeWidth={3} />
            </div>
          </div>
          
          <div className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-4 h-[60%] w-[80px] z-40 items-center justify-end cursor-pointer opacity-0 hover:opacity-100 hover:translate-x-1 transition-all group" onClick={() => pageFlipInstance.current?.flipNext()}>
            <div className="bg-[#0f172a] border border-slate-700 text-white p-4 rounded-full shadow-2xl transition-all group-hover:bg-blue-600 group-hover:border-blue-500 group-hover:shadow-[0_0_20px_rgba(37,99,235,0.6)]">
              <ChevronRight size={32} strokeWidth={3} />
            </div>
          </div>
        </>
      )}

      {/* --- Main Scene Area --- */}
      <div 
        ref={flipbookContainerRef}
        className="absolute top-[80px] md:top-[90px] bottom-[80px] md:bottom-[90px] left-[2%] md:left-[3%] right-[2%] md:right-[3%] z-10 flex justify-center items-center"
        style={{ isolation: 'isolate' }} 
      >
        
        {(appState === 'initializing' || appState === 'ready') && (
          <div className="text-center absolute z-20 w-full max-w-4xl px-4">
            <div className="bg-[#1e293b] border border-slate-700 p-8 md:p-14 rounded-3xl flex flex-col items-center relative overflow-hidden shadow-2xl">
              <div className="absolute -top-32 -right-32 w-64 h-64 bg-red-600/20 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="relative z-10 flex flex-col items-center">
                <img src="https://www.abkgrooming.com/cdn/shop/files/abk_red_logo.png?v=1729148610&width=200" alt="ABK Imports Logo" className="h-16 md:h-20 object-contain mb-6 drop-shadow-2xl" />
                <h3 className="text-2xl md:text-3xl text-white font-bold mb-6">Product Catalogue 2026–27</h3>
                
                <p className="text-gray-300 max-w-2xl mb-10 text-sm md:text-lg leading-relaxed text-center">
                  Seamlessly browse our curated portfolio of international and in-house pet care brands. 
                  Experience our digital catalogue with realistic page-turning physics.
                </p>

                <button 
                  onClick={loadAbkCatalogue}
                  disabled={appState === 'initializing'}
                  className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 text-white px-8 md:px-10 py-4 rounded-xl font-bold transition-all shadow-[0_0_25px_rgba(220,38,38,0.5)] hover:shadow-[0_0_35px_rgba(220,38,38,0.7)] flex items-center gap-3 transform hover:-translate-y-1 disabled:hover:translate-y-0 disabled:shadow-none"
                >
                  {appState === 'initializing' ? <Loader2 className="animate-spin" size={22} /> : <BookOpen size={22} />}
                  {appState === 'initializing' ? 'Initializing Engine...' : 'Open Digital Catalogue'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={flipbookRef} className="hidden relative z-10 drop-shadow-2xl"></div>
        
      </div>

      {/* --- Bottom Controls --- */}
      {appState === 'viewing' && (
        <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-3 md:gap-4 items-center bg-[#0f172a] px-4 md:px-6 py-2 md:py-3 rounded-full md:rounded-2xl border border-slate-700 shadow-2xl">
          <span className="text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-widest hidden sm:block">Page</span>
          <div className="bg-[#1e293b] px-4 py-1.5 rounded-lg border border-slate-600 min-w-[80px] md:min-w-[100px] text-center shadow-inner">
            <span className="font-bold text-sm md:text-base text-white font-mono tracking-wider">{getIndicatorText()}</span>
          </div>
        </div>
      )}

      {/* --- Loading Overlay --- */}
      {appState === 'loading_pdf' && (
        <div className="fixed inset-0 bg-[#0f172a] z-[200] flex flex-col items-center justify-center p-4 text-center">
          <div className="relative w-20 h-20 md:w-24 md:h-24 mb-8">
            <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-[spin_0.8s_linear_infinite]"></div>
            <div className="absolute inset-0 border-4 border-red-500 border-b-transparent rounded-full animate-[spin_1.2s_linear_infinite_reverse]"></div>
          </div>
          <h3 className="text-xl md:text-2xl font-bold mb-5 tracking-wide text-white">{loadingText}</h3>
          <div className="w-64 md:w-80 h-2 md:h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700">
            <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 transition-all duration-200" style={{ width: `${loadingProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* --- AI Smart Search Sidebar --- */}
      <div 
        className="fixed top-0 flex flex-col border-l border-slate-700 bg-[#0f172a] z-[300] h-screen w-full sm:w-[420px] shadow-[0_0_50px_rgba(0,0,0,0.8)]"
        style={{
          transition: 'right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          right: isSearchOpen ? '0px' : '-100%'
        }}
      >
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-[#1e293b]">
          <div className="flex items-center gap-3 text-blue-400">
            <div className="p-2 bg-blue-500/20 border border-blue-500/30 rounded-lg">
              <Search size={20} strokeWidth={2.5} />
            </div>
            <h3 className="font-bold text-lg text-white tracking-wide">AI Smart Search</h3>
          </div>
          <button onClick={() => setIsSearchOpen(false)} className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-white">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-5 border-b border-slate-800 bg-[#1e293b]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SKU or Product Name (e.g. 631528)"
              className="flex-grow bg-[#0f172a] border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            <button 
              type="submit" 
              disabled={isSearching || !searchQuery.trim()} 
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-5 py-3 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)] disabled:shadow-none"
            >
              {isSearching ? <Loader2 size={20} className="animate-spin" /> : 'Search'}
            </button>
          </form>
        </div>
        
        <div className="flex-grow p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 bg-[#0f172a]">
          
          {isSearching && (
            <div className="flex flex-col items-center justify-center h-full text-center text-blue-400">
              <Loader2 size={40} className="animate-spin mb-4" />
              <p className="font-medium tracking-wide">Extracting & Analyzing context...</p>
            </div>
          )}

          {!isSearching && searchResults.length === 0 && searchQuery && (
             <div className="text-center text-slate-500 mt-10 p-6">
                <Search size={48} strokeWidth={1} className="mx-auto mb-4 opacity-30" />
                <p>No matches found for <strong className="text-slate-300">"{searchQuery}"</strong></p>
             </div>
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-4 animate-slide-fade">
              <p className="text-sm text-slate-400 mb-4 px-1 font-medium flex items-center justify-between">
                <span>Found in {searchResults.length} location(s)</span>
                <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full border border-blue-500/30">AI Analyzed</span>
              </p>
              
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => jumpToSearchResult(result.pageIndex)}
                  className="w-full text-left bg-[#1e293b] hover:bg-slate-800 p-0 rounded-xl border border-slate-700 hover:border-blue-500/50 transition-all group flex flex-col shadow-lg overflow-hidden relative"
                >
                  <div className="bg-slate-900/50 p-3 px-4 flex justify-between items-center border-b border-slate-700/50">
                    <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                       <BookOpen size={14} className="text-blue-400" />
                       Page {result.pageNumber}
                    </span>
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                  </div>
                  
                  <div className="p-4 flex flex-col gap-2">
                    {result.details ? (
                      <>
                        {result.details.parentProduct && (
                          <h4 className="font-bold text-white leading-tight">{result.details.parentProduct}</h4>
                        )}
                        {result.details.variantName && (
                          <div className="text-sm text-blue-300 font-medium">Variant: {result.details.variantName}</div>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          {result.details.sku && (
                             <span className="bg-slate-800 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded font-mono">
                               SKU: {result.details.sku}
                             </span>
                          )}
                          {result.details.price && (
                             <span className="text-green-400 text-sm font-bold">{result.details.price}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-400 italic">
                         Exact match found, but detailed product context could not be confidently reconstructed from the raw text layout.
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* --- AI Insights Sidebar (Page Summary) --- */}
      <div 
        className="fixed top-0 flex flex-col border-l-4 border-blue-600 bg-[#0f172a] h-screen w-[420px] shadow-[0_0_50px_rgba(0,0,0,0.8)]"
        style={{
          zIndex: 9999,
          transform: 'translateZ(9999px)',
          transition: 'right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          right: isAiOpen ? '0px' : '-450px'
        }}
      >
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-[#1e293b]">
          <div className="flex items-center gap-3 text-blue-400">
            <div className="p-2 bg-blue-500/20 border border-blue-500/30 rounded-lg">
              <Sparkles size={20} strokeWidth={2.5} />
            </div>
            <h3 className="font-bold text-lg text-white tracking-wide">AI Page Insights</h3>
          </div>
          <button onClick={() => setIsAiOpen(false)} className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-white">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        
        <div className="flex-grow p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 bg-[#0f172a]">
          {aiStatus === 'idle' && (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 mt-10">
              <Info size={56} strokeWidth={1} className="mb-6 opacity-50" />
              <p className="max-w-[250px] font-medium leading-relaxed">Analyze the current spread to instantly extract brands, categories, and SKU data.</p>
            </div>
          )}

          {aiStatus === 'scanning' && (
            <div className="flex flex-col items-center justify-center h-full text-center text-blue-400 mt-10">
              <Loader2 size={48} className="animate-spin mb-6" />
              <p className="font-medium tracking-wide">Scanning Catalogue...</p>
            </div>
          )}

          {aiStatus === 'insufficient' && (
            <div className="bg-[#1e293b] p-5 rounded-xl border border-slate-700 text-center shadow-inner mt-4">
                <p className="text-gray-300 font-medium">Insufficient text found on this spread. It appears to be primarily visual.</p>
            </div>
          )}

          {aiStatus === 'error' && (
            <div className="bg-red-900/30 text-red-400 p-5 rounded-xl border border-red-800/80 flex items-center gap-3 mt-4">
                Failed to generate insights. Please try again.
            </div>
          )}

          {aiStatus === 'success' && (
            <div dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(aiResult) : aiResult }} className="markdown-body animate-slide-fade" />
          )}
        </div>
        
        <div className="p-5 border-t border-slate-800 bg-[#1e293b]">
          <button 
            onClick={generateAiSummary}
            disabled={aiStatus === 'scanning'}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:opacity-100 text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] disabled:shadow-none"
          >
            {aiStatus === 'scanning' ? (
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
