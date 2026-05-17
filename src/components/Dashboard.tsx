import React, { useState, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Activity, MapPin, Radio, Signal, AlertCircle, FileText, Download, Map as MapIcon, List, ArrowDownUp, Image as ImageIcon } from 'lucide-react';
import { ScanStats, MultiplexStat } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { generatePDF, generateTXT } from '../lib/export';
import { CoverageMap } from './CoverageMap';
import { toJpeg } from 'html-to-image';

interface DashboardProps {
  stats: ScanStats;
  onReset: () => void;
}

function StatCard({ title, value, icon, subtitle }: { title: string, value: string | number, icon: React.ReactNode, subtitle?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
      </div>
      <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      {subtitle && <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">{subtitle}</div>}
    </div>
  );
}

function HighlightCard({ title, location, valueUnit, valueLabel, icon }: { title: string, location: string, valueUnit: string, valueLabel: string, icon: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-xl border border-blue-100 dark:border-blue-800/60 p-6 transition-colors">
      <div className="flex items-center space-x-2 mb-3 text-blue-800 dark:text-blue-300">
         {icon}
         <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="text-lg font-bold text-slate-800 dark:text-slate-200 break-words">{location}</div>
      <div className="text-blue-600 dark:text-blue-400 font-medium mt-1">{valueLabel} : {valueUnit}</div>
    </div>
  );
}

function getSnrColorClass(snr: number) {
  if (snr < 7.0) return "text-red-500 dark:text-red-400";
  if (snr < 10.0) return "text-orange-500 dark:text-orange-400";
  return "text-green-600 dark:text-green-500";
}

function getSnrBgColorClass(snr: number) {
  if (snr < 7.0) return "bg-red-500 dark:bg-red-400";
  if (snr < 10.0) return "bg-orange-500 dark:bg-orange-400";
  return "bg-green-500 dark:bg-green-500";
}

const MultiplexCard: React.FC<{ mux: MultiplexStat, compact?: boolean }> = ({ mux, compact }) => {
  const { t, language } = useAppContext();
  
    if (compact) {
      return (
        <div className="bg-white dark:bg-[#313338] rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm overflow-hidden flex flex-col lg:flex-row hover:shadow-md transition-shadow">
          {/* Header Info */}
          <div className="bg-slate-50 dark:bg-[#2B2D31]/50 px-4 py-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700/50 flex flex-col w-full lg:w-64 shrink-0">
            <div>
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span 
                    className="cursor-help bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded text-sm font-bold border border-indigo-200 dark:border-indigo-800/50 whitespace-nowrap"
                    title={mux.frequency > 0 ? `${(mux.frequency / 1000).toFixed(3)} MHz` : ''}
                  >
                    {mux.channel}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate flex-1" title={mux.label}>
                    {mux.label}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                 <span>EID: {mux.eid}</span>
                 <span className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-slate-700 dark:text-slate-300">
                    {mux.transmitters.length} {mux.transmitters.length > 1 ? t('txPlural').toLowerCase() : t('txSingular').toLowerCase()}
                 </span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('maxSnr')}</div>
              <div className={`font-bold text-sm ${getSnrColorClass(mux.maxSnr)}`}>
                {mux.maxSnr.toFixed(1)} dB
              </div>
            </div>
          </div>
          
          {/* Transmitters list */}
          <div className="p-3 flex-1 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-700/50 min-w-0">
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
               {mux.transmitters.map((tx, i) => (
                   <div key={i} className="flex justify-between items-center text-xs bg-slate-50 dark:bg-[#2B2D31]/30 p-1.5 rounded-md border border-slate-100 dark:border-slate-700/30">
                     <div className="flex items-center gap-2 overflow-hidden w-full">
                        <span className="font-mono text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 py-0.5 px-1.5 rounded shrink-0">
                          {tx.tii}
                        </span>
                        <span className="truncate text-slate-700 dark:text-slate-200 font-medium" title={tx.location || t('unknownSite')}>
                          {tx.location || t('unknownSite')}
                        </span>
                     </div>
                     <div className="flex items-center gap-2 shrink-0 ml-2">
                        <div className="hidden sm:flex gap-1.5 opacity-80">
                           {(tx.distance > 0) && (
                             <span className="text-blue-700 dark:text-blue-400 whitespace-nowrap">{tx.distance.toFixed(1)} km</span>
                           )}
                           {(tx.power > 0) && (
                             <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{tx.power.toFixed(1)} kW</span>
                           )}
                        </div>
                        <span className="font-mono text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap w-12 text-right">{tx.level.toFixed(1)}</span>
                     </div>
                   </div>
               ))}
             </div>
          </div>

          {/* Best Received Transmitter */}
          <div className="p-3 w-full lg:w-48 shrink-0 flex flex-col justify-center bg-amber-50/30 dark:bg-amber-900/10">
             <h4 className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-500 mb-1 flex items-center gap-1">
               <Signal className="w-3 h-3 shrink-0" /> {t('bestTx')}
             </h4>
             {mux.bestTransmitter ? (
               <div className="text-xs break-words">
                  <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2" title={mux.bestTransmitter.location || t('unknown')}>
                    {mux.bestTransmitter.location || t('unknown')}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                     TII: <span className="font-mono">{mux.bestTransmitter.tii}</span>
                  </div>
               </div>
             ) : (
               <span className="text-slate-400 italic text-[10px]">{t('insufficientData')}</span>
             )}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-[#313338] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/50 overflow-hidden flex flex-col transition-colors items-start">
        <div className="bg-slate-50 dark:bg-[#2B2D31]/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700/50 flex justify-between items-start w-full">
          <div>
          <div className="flex items-center gap-2 mb-1">
            <span 
              className="cursor-help bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded text-sm font-bold border border-indigo-200 dark:border-indigo-800/50 whitespace-nowrap"
              title={mux.frequency > 0 ? `${(mux.frequency / 1000).toFixed(3)} MHz` : ''}
            >
              {mux.channel}
            </span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight w-full break-all max-w-[200px] sm:max-w-xs">{mux.label}</h3>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 flex gap-3">
            <span>{t('eid')} <span className="font-medium text-slate-700 dark:text-slate-300">{mux.eid}</span></span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-semibold shrink-0 ml-2 mt-0.5 whitespace-nowrap">
            {mux.transmitters.length} {mux.transmitters.length > 1 ? t('txPlural') : t('txSingular')}
          </div>
          <div className="text-sm mt-1 whitespace-nowrap">
            <span className="text-slate-500 dark:text-slate-400 mr-1">{t('maxSnr')} :</span>
            <span className={`font-bold ${getSnrColorClass(mux.maxSnr)}`}>
              {mux.maxSnr.toFixed(1)} dB
            </span>
          </div>
        </div>
      </div>
      
      <div className={`${compact ? 'p-4' : 'p-6'} flex-1 flex flex-col w-full`}>
        <div className="mb-4">
          <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-2">
            {mux.transmitters.length > 1 ? t('receivedTxPlural') : t('receivedTxSingular')}
          </h4>
          <div className="space-y-3">
            {mux.transmitters.map((tx, i) => (
               <div key={i} className={`flex justify-between items-center text-sm bg-slate-50 dark:bg-[#2B2D31]/30 ${compact ? 'p-1.5' : 'p-2'} rounded-md`}>
                 <div className="flex items-start gap-2 overflow-hidden flex-col w-full">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono ${compact ? 'text-[10px]' : 'text-xs'} font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 py-0.5 px-1.5 rounded whitespace-nowrap`}>
                        {tx.tii}
                      </span>
                      <span className={`truncate text-slate-700 dark:text-slate-200 font-medium ${compact ? 'text-xs' : ''} pb-1`}>
                        {tx.location || t('unknownSite')}
                      </span>
                    </div>
                    {!compact && (
                      <div className="flex flex-wrap gap-2 text-xs mt-0.5">
                         {(tx.distance > 0) && (
                           <span className="font-medium text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded whitespace-nowrap">{t('distance')} : {tx.distance.toFixed(1)} km</span>
                         )}
                         {(tx.power > 0) && (
                           <span className="font-medium text-slate-600 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded whitespace-nowrap">{t('power')} : {tx.power.toFixed(1)} kW</span>
                         )}
                      </div>
                    )}
                 </div>
                 <div className={`ml-2 text-slate-600 dark:text-slate-300 shrink-0 font-mono ${compact ? 'text-[10px]' : 'text-xs'} text-right`}>
                    <span className="block font-medium">{tx.level.toFixed(1)} dB</span>
                 </div>
               </div>
            ))}
          </div>
        </div>
        
        <div className={`mt-auto ${compact ? 'pt-3' : 'pt-4'} border-t border-slate-100 dark:border-slate-700/50 text-sm`}>
           <h4 className="text-xs uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-500 mb-2 flex items-center gap-1">
             <Signal className="w-3 h-3 shrink-0" /> {t('bestTx')}
           </h4>
           {mux.bestTransmitter ? (
             <div className="flex justify-between items-center text-left">
                <span className={`font-medium text-slate-800 dark:text-slate-200 truncate ${compact ? 'text-xs' : ''}`}>
                  {mux.bestTransmitter.location || t('unknown')} <span className="text-slate-500 dark:text-slate-400 font-normal">({language === 'fr' ? `TII : ${mux.bestTransmitter.tii}` : `TII: ${mux.bestTransmitter.tii}`})</span>
                </span>
             </div>
           ) : (
             <span className="text-slate-400 italic text-xs">{t('insufficientData')}</span>
           )}
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ stats, onReset }: DashboardProps) {
  const { language, t } = useAppContext();
  const [sortMode, setSortMode] = useState<'channel' | 'label'>('channel');
  const [showMapLines, setShowMapLines] = useState(() => {
    const saved = localStorage.getItem('dab_showMapLines');
    return saved !== null ? saved === 'true' : true;
  });
  const [compactMode, setCompactMode] = useState(() => {
    const saved = localStorage.getItem('dab_compactMode');
    return saved !== null ? saved === 'true' : false;
  });
  const [locationName, setLocationName] = useState<string | null>(null);
  const [exportConfig, setExportConfig] = useState<{type: 'pdf'|'txt'} | null>(null);
  const [includeLocationInExport, setIncludeLocationInExport] = useState(() => {
    const saved = localStorage.getItem('dab_includeLocationInExport');
    return saved !== null ? saved === 'true' : true;
  });
  const [exportNotes, setExportNotes] = useState('');

  useEffect(() => {
    localStorage.setItem('dab_showMapLines', String(showMapLines));
  }, [showMapLines]);

  useEffect(() => {
    localStorage.setItem('dab_compactMode', String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    localStorage.setItem('dab_includeLocationInExport', String(includeLocationInExport));
  }, [includeLocationInExport]);

  useEffect(() => {
    if (stats.rxLat !== undefined && stats.rxLon !== undefined) {
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${stats.rxLat}&lon=${stats.rxLon}&zoom=18&addressdetails=1`)
        .then(res => res.json())
        .then(data => {
          if (data && data.display_name) {
             const addr = data.address;
             const city = addr?.city || addr?.town || addr?.village || addr?.municipality;
             const country = addr?.country;
             let shortName = city && country ? `${city}, ${country}` : data.display_name;
             const road = addr?.road || addr?.pedestrian || addr?.suburb;
             if (road && city && country) {
                shortName = `${road}, ${city}, ${country}`;
             }
             setLocationName(shortName);
          }
        })
        .catch(err => console.error(err));
    }
  }, [stats.rxLat, stats.rxLon]);
  
  const dateLocale = language === 'fr' ? fr : enUS;
  const dateFormat = language === 'fr' ? "dd/MM/yyyy 'à' HH'h'mm" : "dd/MM/yyyy 'at' HH:mm";
  const formattedDate = format(stats.startTime, dateFormat, { locale: dateLocale });

  const mapRef = useRef<HTMLDivElement>(null);

  const captureMap = async (): Promise<string | undefined> => {
    if (!mapRef.current) return undefined;
    
    // Close the pop-ups and reset the map view
    window.dispatchEvent(new CustomEvent('close-map-popups'));
    window.dispatchEvent(new CustomEvent('reset-map-view'));
    window.dispatchEvent(new CustomEvent('show-all-muxes-for-export'));
    
    // Wait a little longer for the fitBounds animation or reset to complete.
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      mapRef.current.classList.add('export-mode');
      const dataUrl = await toJpeg(mapRef.current, { quality: 0.9, backgroundColor: '#ffffff', style: { transform: 'scale(1)' } });
      mapRef.current.classList.remove('export-mode');
      window.dispatchEvent(new CustomEvent('restore-muxes-after-export'));
      return dataUrl;
    } catch(err) {
      console.error('Failed to capture map:', err);
      if (mapRef.current) mapRef.current.classList.remove('export-mode');
      window.dispatchEvent(new CustomEvent('restore-muxes-after-export'));
      return undefined;
    }
  };

  const triggerExport = async () => {
    if (!exportConfig) return;
    
    if (exportConfig.type === 'pdf') {
      let mapImgData: { url: string; ratio: number } | undefined;
      if (mapRef.current) {
        const dataUrl = await captureMap();
        if (dataUrl) {
          const rect = mapRef.current.getBoundingClientRect();
          mapImgData = { url: dataUrl, ratio: rect.height / rect.width };
        }
      }
      generatePDF(stats, language, mapImgData, includeLocationInExport, locationName, exportNotes);
    } else {
      generateTXT(stats, language, includeLocationInExport, locationName, exportNotes);
    }
    setExportConfig(null);
    setExportNotes('');
  };

  const handleExportMapJPEG = async () => {
    const dataUrl = await captureMap();
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `carte_dab_${format(stats.startTime, 'yyyyMMdd_HHmm')}.jpg`;
      a.click();
    }
  };

  const sortedMultiplexes = useMemo(() => {
    return [...stats.multiplexes].sort((a, b) => {
      if (sortMode === 'channel') {
        const aMatch = a.channel.match(/(\d+)([a-zA-Z]*)/);
        const bMatch = b.channel.match(/(\d+)([a-zA-Z]*)/);
        if (aMatch && bMatch) {
          const aNum = parseInt(aMatch[1], 10);
          const bNum = parseInt(bMatch[1], 10);
          if (aNum !== bNum) return aNum - bNum;
          return (aMatch[2] || '').localeCompare(bMatch[2] || '');
        }
        return a.channel.localeCompare(b.channel);
      } else if (sortMode === 'label') {
        return a.label.localeCompare(b.label);
      }
      return 0;
    });
  }, [stats.multiplexes, sortMode]);

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">{t('reportTitle')}</h1>
           <p className="text-slate-500 dark:text-slate-400 mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
             <span className="flex items-center gap-2">
               <Activity className="w-4 h-4" />
               {t('scanStart')} <span className="font-semibold text-slate-700 dark:text-slate-300">{formattedDate}</span>
             </span>
             {(stats.rxLat !== undefined && stats.rxLon !== undefined) && (
               <>
                 <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                 <span className="flex items-start sm:items-center gap-1.5 text-sm">
                   <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5 sm:mt-0" />
                   <span className="flex flex-col text-slate-700 dark:text-slate-300">
                     <span className="font-medium break-words text-left max-w-[200px] sm:max-w-md">{locationName || `${stats.rxLat.toFixed(5)}, ${stats.rxLon.toFixed(5)}`}</span>
                     {locationName && (
                       <span className="text-xs text-slate-500 font-normal">({stats.rxLat.toFixed(5)}, {stats.rxLon.toFixed(5)})</span>
                     )}
                   </span>
                 </span>
               </>
             )}
           </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => {
              if (stats.rxLat !== undefined) setExportConfig({ type: 'txt' });
              else generateTXT(stats, language, false, null);
            }}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            {t('exportTxt')}
          </button>
          <button 
            onClick={() => {
              if (stats.rxLat !== undefined) setExportConfig({ type: 'pdf' });
              else {
                // if no geolocation is available, export directly
                captureMap().then(mapUrl => {
                  let imgData = undefined;
                  if (mapUrl && mapRef.current) {
                     const rect = mapRef.current.getBoundingClientRect();
                     imgData = { url: mapUrl, ratio: rect.height / rect.width };
                  }
                  generatePDF(stats, language, imgData, false, null);
                });
              }
            }}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            {t('exportPdf')}
          </button>
          <button 
            onClick={onReset}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap ml-2"
          >
            {t('analyzeAnother')}
          </button>
        </div>
      </div>

      {/* Global Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title={t('channelsReceived')} 
          value={stats.channelCount} 
          icon={<Radio strokeWidth={2.5} />} 
        />
        <StatCard 
          title={t('multiplexReceived')} 
          value={stats.multiplexCount} 
          icon={<Activity strokeWidth={2.5} />} 
        />
        <StatCard 
          title={t('uniqueSites')} 
          value={stats.globalTransmitterCount} 
          icon={<MapPin strokeWidth={2.5} />} 
        />
        <StatCard 
          title={t('emissionsDetected')} 
          value={stats.globalEmissionCount} 
          icon={<Signal strokeWidth={2.5} />} 
        />
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <HighlightCard 
          title={t('furthestTx')}
          location={stats.furthestTransmitter?.location || t('unknown')}
          valueUnit={`${stats.furthestTransmitter?.distance?.toFixed(1) || 0} km`}
          valueLabel={t('distance')}
          icon={<MapPin className="w-5 h-5" />}
        />
         <HighlightCard 
          title={t('closestTx')}
          location={stats.closestTransmitter?.location || t('unknown')}
          valueUnit={`${stats.closestTransmitter?.distance?.toFixed(1) || 0} km`}
          valueLabel={t('distance')}
          icon={<MapPin className="w-5 h-5" />}
        />
      </div>

      {/* Maximum SNR Chart */}
      {stats.multiplexes.length > 0 && (() => {
        const sortedForChart = [...stats.multiplexes].sort((a, b) => a.frequency - b.frequency);
        const MAX_SNR = 32.0;
        
        return (
          <div className="bg-white dark:bg-[#313338] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/80 p-6 mb-10 transition-colors">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
              <Signal className="w-5 h-5 text-blue-500" /> 
              {t('maxSnrChart')}
            </h3>
            <div className="space-y-4">
              {sortedForChart.map(mux => (
                <div key={`${mux.eid}-${mux.channel}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  {/* Mobile header */}
                  <div className="flex justify-between items-center sm:hidden w-full px-1">
                    <span className="font-bold text-slate-700 dark:text-slate-300 text-sm truncate flex-1">{mux.channel} - {mux.label}</span>
                    <span className="font-bold text-sm ml-2 text-slate-700 dark:text-slate-300">{mux.maxSnr.toFixed(1)} dB</span>
                  </div>
                  {/* Desktop columns */}
                  <div className="hidden sm:block w-12 font-bold text-slate-700 dark:text-slate-300 text-right shrink-0">
                     {mux.channel}
                  </div>
                  <div className="hidden sm:block w-32 md:w-48 font-medium text-slate-800 dark:text-slate-200 text-sm truncate shrink-0">
                     {mux.label}
                  </div>
                  {/* Bar */}
                  <div className="flex-1 flex items-center gap-3 w-full">
                    <div className="flex-1 h-5 sm:h-6 bg-slate-100 dark:bg-slate-800/80 rounded-md overflow-hidden relative border border-slate-200 dark:border-slate-700/50">
                      <div 
                        className={`h-full rounded-r-md transition-all duration-500 ${getSnrBgColorClass(mux.maxSnr)}`}
                        style={{ width: `${Math.min((mux.maxSnr / MAX_SNR) * 100, 100)}%` }}
                      />
                    </div>
                    {/* Desktop value */}
                    <div className="hidden sm:block w-16 text-sm font-bold shrink-0 text-right text-slate-700 dark:text-slate-300">
                      {mux.maxSnr.toFixed(1)} dB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Separator before Multiplex Details */}
      <hr className="border-slate-200 dark:border-slate-700/80 my-10" />

      {/* Multiplex List Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {t('muxDetail')}
        </h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700/80 px-2.5 py-1.5 rounded-lg shadow-sm">
            <input 
              type="checkbox" 
              checked={compactMode} 
              onChange={(e) => setCompactMode(e.target.checked)} 
              className="rounded border-slate-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" 
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 select-none whitespace-nowrap">{t('compactView')}</span>
          </label>
          <span className="hidden sm:inline text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 ml-2"><ArrowDownUp className="w-4 h-4" /> {t('sortBy')}</span>
          <select 
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as any)}
            className="bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 transition-colors focus:outline-none cursor-pointer"
          >
            <option value="channel">{t('sortByChannels')}</option>
            <option value="label">{t('sortByMultiplexes')}</option>
          </select>
        </div>
      </div>
      <div className={`grid grid-cols-1 ${compactMode ? 'gap-4' : 'md:grid-cols-2 lg:grid-cols-3 gap-6'} mb-10`}>
        {sortedMultiplexes.map((mux) => (
          <MultiplexCard key={`${mux.channel}-${mux.label}`} mux={mux} compact={compactMode} />
        ))}
      </div>
      {sortedMultiplexes.length === 0 && (
        <div className="bg-slate-50 dark:bg-[#313338]/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center mb-10">
           <AlertCircle className="w-8 h-8 mb-3 text-slate-400 dark:text-slate-500" />
           <p>{t('noMuxFound')}</p>
        </div>
      )}

      {/* Separator */}
      <hr className="border-slate-200 dark:border-slate-700/80 my-10" />

      {/* Map Section */}
      {stats.rxLat !== undefined || stats.globalTransmitterCount > 0 ? (
        <div className="space-y-4 mb-10">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-3">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              {t('receptionMap')}
            </h2>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleExportMapJPEG}
                className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                <ImageIcon className="w-4 h-4" />
                {t('exportMapJpeg')}
              </button>
              <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-lg shadow-sm">
                <input 
                  type="checkbox" 
                  checked={showMapLines} 
                  onChange={(e) => setShowMapLines(e.target.checked)} 
                  className="rounded border-slate-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" 
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 select-none">{t('showLines')}</span>
              </label>
            </div>
          </div>
          <div ref={mapRef}>
            <CoverageMap stats={stats} showLines={showMapLines} />
          </div>
        </div>
      ) : (
        <div className="space-y-4 mb-10 text-center text-slate-500 py-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <MapIcon className="w-12 h-12 mx-auto mb-3 text-slate-400 opacity-50" />
          <p>{t('noGeodata')}</p>
        </div>
      )}

      {exportConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-[#313338] rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700/80">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                {language === 'fr' ? "Options d'exportation" : "Export Options"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                {language === 'fr' 
                  ? "Souhaitez-vous inclure la localisation exacte de ce scan dans cet export ? Vous pouvez également indiquer des notes si nécessaire." 
                  : "Would you like to include the exact location of this scan in this export? You can also add notes if necessary."}
              </p>
              <label className="flex items-center gap-3 cursor-pointer p-3 mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#2B2D31]/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <input 
                  type="checkbox" 
                  checked={includeLocationInExport} 
                  onChange={(e) => setIncludeLocationInExport(e.target.checked)} 
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 bg-white dark:bg-slate-700"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                   {language === 'fr' ? "Inclure les données de localisation" : "Include location data"}
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {language === 'fr' ? "Notes personnalisées (optionnel) :" : "Custom notes (optional):"}
                </label>
                <textarea 
                  value={exportNotes}
                  onChange={(e) => setExportNotes(e.target.value)}
                  placeholder={language === 'fr' ? "Ajouter des notes à propos de ce scan..." : "Add notes about this scan..."}
                  className="w-full h-24 p-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#2B2D31] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-[#2B2D31] border-t border-slate-200 dark:border-slate-700/80 flex justify-end gap-3">
              <button 
                onClick={() => setExportConfig(null)} 
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {language === 'fr' ? "Annuler" : "Cancel"}
              </button>
              <button 
                onClick={triggerExport} 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                {exportConfig.type === 'pdf' ? <Download className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                {language === 'fr' ? "Exporter" : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
