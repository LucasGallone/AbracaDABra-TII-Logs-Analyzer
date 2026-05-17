import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { Dashboard } from './components/Dashboard';
import { parseDABData } from './lib/parser';
import { RawDABRow, ScanStats } from './types';
import { useAppContext } from './contexts/AppContext';
import { Moon, Sun, Languages } from 'lucide-react';

export default function App() {
  const [stats, setStats] = useState<ScanStats | null>(null);
  const { theme, toggleTheme, language, toggleLanguage, t } = useAppContext();

  const handleDataParsed = (data: RawDABRow[]) => {
    const parsedStats = parseDABData(data);
    setStats(parsedStats);
  };

  const handleReset = () => {
    setStats(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#2B2D31] font-sans text-slate-900 dark:text-slate-100 selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-100 transition-colors">
      <header className="bg-white dark:bg-[#1E1F22] border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-10 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
             </div>
             <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{t('appTitle')}</span>
           </div>
           
           <div className="flex items-center gap-4">
             <button 
               onClick={toggleLanguage}
               className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
             >
               <Languages className="w-5 h-5" />
               <span className="hidden sm:inline">
                 <span className={language === 'en' ? 'font-bold text-slate-900 dark:text-white' : ''}>English</span>
                 <span className="mx-1 text-slate-400">/</span>
                 <span className={language === 'fr' ? 'font-bold text-slate-900 dark:text-white' : ''}>Français</span>
               </span>
             </button>
             
             <button 
               onClick={toggleTheme}
               className="p-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
               title={theme === 'light' ? t('darkMode') : t('lightMode')}
             >
               {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
             </button>
           </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center min-h-[calc(100vh-4rem)]">
        {!stats ? (
          <FileUpload onDataParsed={handleDataParsed} />
        ) : (
          <Dashboard stats={stats} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
