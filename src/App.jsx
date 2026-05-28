import React, { useState, useEffect, useRef } from 'react';
import { Maximize, ChevronLeft, ChevronRight, BookOpen, Loader2, Search, X } from 'lucide-react';

export default function App() {
  // --- App State ---
  const [appState, setAppState] = useState('initializing'); // initializing, ready, loading_pdf, viewing
  const [loadingText, setLoadingText] = useState('Loading Core Engines...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // --- Flipbook State ---
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // --- Search State ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  
  // --- Refs ---
  const flipbookContainerRef = useRef(null);
  const flipbookRef = useRef(null);
  const pageFlipInstance = useRef(null);
  const pdfDocument = useRef(null);
  const pageSize = useRef({ width: 0, height: 0 }); // Store for resize logic

  const scale = 2.0; // High-res render scale
  
  // Using the local public file directly for instant loading
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
          loadScript('https://cdn.jsdelivr.net/npm/page-flip/dist/js/page-flip.browser.js')
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

  // --- Layout Engine (Fixes Cropping, Overlap & Mobile Responsiveness) ---
  const resizeBook = () => {
    if (!flipbookContainerRef.current || !flipbookRef.current || !pageSize.current.width) return;
    
    const container = flipbookContainerRef.current;
    const { width: baseW, height: baseH } = pageSize.current;
    
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    
    // Detect mobile device to force single page (portrait) aspect ratio
    const isMobile = window.innerWidth < 768;
    const targetRatio = isMobile ? (baseW / baseH) : ((baseW * 2) / baseH);
    
    let finalWidth, finalHeight;
    
    // Fit perfectly within the safe container boundaries
    if (cWidth / cHeight > targetRatio) {
      finalHeight = cHeight;
      finalWidth = cHeight * targetRatio;
    } else {
      finalWidth = cWidth;
      finalHeight = cWidth / targetRatio;
    }
    
    // Apply exact safe pixel boundaries
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

  // --- Keyboard Listeners ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

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

      // Initialize with opacity 0 to prevent the visual glitch of the first page swirling/stretching wildly
      flipbookRef.current.style.display = 'block';
      flipbookRef.current.style.opacity = '0';

      // Ensure dimensions are set rigidly before initializing
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
      
      // Fade in smoothly after layout is perfectly settled
      setTimeout(() => {
        if (flipbookRef.current) {
          flipbookRef.current.style.transition = 'opacity 0.4s ease-in-out';
          flipbookRef.current.style.opacity = '1';
        }
      }, 150);
      
    } catch (error) {
      console.error(error);
      setAppState('ready');
      alert("Failed to load catalogue. Please ensure 'catalogue.pdf' is in the public folder.");
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
    // Portrait mode (Mobile single page)
    return `${currentPage + 1} / ${totalPages}`;
  };

  // --- 4. OCR Search Logic ---
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !pdfDocument.current) return;

    setIsSearching(true);
    setSearchResults([]);
    const query = searchQuery.toLowerCase();
    const results = [];

    try {
      for (let i = 1; i <= totalPages; i++) {
        // Yield occasionally to prevent UI freezing
        if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));

        const page = await pdfDocument.current.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract plain text string
        const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();

        if (pageText.includes(query)) {
          results.push(i - 1); // St.PageFlip uses 0-based index
        }
      }
      
      setSearchResults(results);
      
      // If we find exactly one matching result, or just want to jump to the first immediately
      if (results.length > 0) {
        pageFlipInstance.current.flip(results[0]);
      }
    } catch (err) {
      console.error("Search extraction failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  const jumpToSearchResult = (pageIndex) => {
    pageFlipInstance.current?.flip(pageIndex);
    if (window.innerWidth < 768) {
      setIsSearchOpen(false); // Auto-hide search panel on mobile
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden text-white font-sans bg-[#0f172a] relative">
      {/* Background radial gradients */}
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
            <button 
              onClick={() => setIsSearchOpen(true)} 
              className="p-2 px-3 rounded-lg bg-blue-600/20 border border-blue-500 hover:bg-blue-600 transition-all text-blue-300 hover:text-white shadow-lg flex items-center gap-2" 
              title="Search Catalogue"
            >
              <Search size={18} />
              <span className="hidden md:block text-sm font-semibold">Search SKU</span>
            </button>
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

      {/* --- Main Scene Area (Isolated and perfectly bound) --- */}
      <div 
        ref={flipbookContainerRef}
        className="absolute top-[80px] md:top-[90px] bottom-[80px] md:bottom-[90px] left-[2%] md:left-[3%] right-[2%] md:right-[3%] z-10 flex justify-center items-center"
        style={{ isolation: 'isolate' }} 
      >
        
        {/* Initial Landing Page */}
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

        {/* PageFlip Container DOM Node */}
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

      {/* --- SKU Search Sidebar --- */}
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
            <h3 className="font-bold text-lg text-white tracking-wide">Find SKU</h3>
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
              placeholder="e.g., 631467 or Twistix"
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
              <p className="font-medium tracking-wide">Scanning {totalPages} pages...</p>
            </div>
          )}

          {!isSearching && searchResults.length === 0 && searchQuery && (
             <div className="text-center text-slate-500 mt-10 p-6">
                <Search size={48} strokeWidth={1} className="mx-auto mb-4 opacity-30" />
                <p>No matches found for <strong className="text-slate-300">"{searchQuery}"</strong></p>
             </div>
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400 mb-4 px-2 font-medium">Found in {searchResults.length} page(s):</p>
              {searchResults.map((pageIndex) => (
                <button
                  key={pageIndex}
                  onClick={() => jumpToSearchResult(pageIndex)}
                  className="w-full flex items-center justify-between bg-[#1e293b] hover:bg-slate-700 p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all group"
                >
                  <span className="font-semibold text-white">Jump to Page {pageIndex + 1}</span>
                  <div className="bg-slate-800 p-1.5 rounded-md group-hover:bg-blue-600 group-hover:text-white transition-colors text-slate-400">
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
