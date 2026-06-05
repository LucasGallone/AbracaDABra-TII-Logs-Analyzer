import { UploadCloud } from 'lucide-react';
import Papa from 'papaparse';
import React, { useCallback, useState } from 'react';
import { cn } from '../lib/utils';
import { RawDABRow } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { transformColumnHeader } from '../lib/headerMap';

interface FileUploadProps {
  onDataParsed: (data: RawDABRow[], fileCount: number) => void;
}

export function FileUpload({ onDataParsed }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useAppContext();

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const processFiles = async (files: FileList | File[]) => {
    setError(null);
    if (files.length === 0) return;
    
    let allData: RawDABRow[] = [];
    
    const parsePromises = Array.from(files).map(file => {
      return new Promise<RawDABRow[]>((resolve, reject) => {
        Papa.parse<RawDABRow>(file, {
          header: true,
          skipEmptyLines: true,
          delimiter: ';',
          transformHeader: transformColumnHeader,
          complete: (results) => {
            if (results.errors && results.errors.length > 0) {
              reject(results.errors[0].message);
            } else {
              resolve(results.data);
            }
          },
          error: (err) => reject(err.message)
        });
      });
    });

    try {
      const resultsArray = await Promise.all(parsePromises);
      for (const data of resultsArray) {
        if (data.length > 0) {
           allData = allData.concat(data);
        }
      }
      
      const firstRow: any = allData[0] || {};
      const numColumns = Object.keys(firstRow).length;
      const hasTimeColumn = Object.keys(firstRow).some(k => k.startsWith('Time'));

      if (allData.length > 0 && hasTimeColumn && firstRow['Channel'] && numColumns >= 8) {
        onDataParsed(allData, files.length);
      } else {
        setError('INVALID_FORMAT');
      }
    } catch (err: any) {
      setError(`${t('parseError')} ${err}`);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full max-w-2xl mx-auto">
      <div 
        onClick={handleClick}
        onDragOver={handleDragOver}
         onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "w-full p-12 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-200 cursor-pointer text-center bg-white dark:bg-slate-800",
          isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700"
        )}
      >
        <UploadCloud className={cn("w-16 h-16 mb-4 transition-colors", isDragging ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500")} />
        <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2 sm:whitespace-nowrap">{t('dropFile')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('orClick')}</p>
        
        <label className="relative" onClick={(e) => e.stopPropagation()}>
          <span className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm inline-block cursor-pointer">
            {t('selectFile')}
          </span>
          <input 
            type="file" 
            ref={fileInputRef}
            title=""
            multiple
            accept=".csv,text/csv" 
            onChange={handleFileChange} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
      
      {error && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-700 dark:text-red-400 w-full text-center text-sm">
          {error === 'INVALID_FORMAT' ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-semibold">{t('invalidFormatTitle')}</p>
                <p>{t('invalidFormatP1')}</p>
              </div>
              <p>
                {t('invalidFormatP2Part1')}
                <a href="https://github.com/LucasGallone/AbracaDABra-TII-Logs-Analyzer/issues/" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800 dark:hover:text-red-300">
                  {t('invalidFormatLink')}
                </a>
                {t('invalidFormatP2Part2')}
              </p>
            </div>
          ) : (
            error
          )}
        </div>
      )}
    </div>
  );
}