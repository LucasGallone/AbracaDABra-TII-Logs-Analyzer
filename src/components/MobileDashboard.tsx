import React, { useState } from 'react';
import { MobileScanStats, MobileMultiplexStat, MobileTransmitterStat, RawDABRow } from '../types';
import { RefreshCcw, Radio, Activity, Navigation, List, LayoutGrid, Signal, MapPin, ArrowDownUp, Download } from 'lucide-react';
import Papa from 'papaparse';
import { TruncatedText } from './TruncatedText';
import { useAppContext } from '../contexts/AppContext';
import { MobileCoverageMap } from './MobileCoverageMap';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

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

export function MobileDashboard({ 
  stats, 
  onReset,
  fileCount = 1,
  rawData = []
}: { 
  stats: MobileScanStats, 
  onReset: () => void,
  fileCount?: number,
  rawData?: RawDABRow[]
}) {
  const { t, language } = useAppContext();
  const [selectedMux, setSelectedMux] = useState<MobileMultiplexStat | null>(stats.multiplexes[0] || null);
  const [compact, setCompact] = useState(false);
  const [sortBy, setSortBy] = useState<'channels' | 'multiplexes'>('channels');
  const [txSort, setTxSort] = useState<'pts-desc' | 'pts-asc' | 'name-asc'>('pts-desc');
  
  // Calculate TII and transmitters count
  const tiiSet = new Set<string>();
  const txSet = new Set<string>();
  
  stats.multiplexes.forEach(mux => {
    mux.transmitters.forEach(tx => {
      tiiSet.add(tx.tii);
      if (tx.location) {
        txSet.add(tx.location);
      } else {
        txSet.add(`unknown_${tx.tii}`);
      }
    });
  });

  const dateLocale = language === 'fr' ? fr : enUS;
  const dateFormat = language === 'fr' ? "dd/MM/yyyy" : "dd/MM/yyyy";
  const timeFormat = language === 'fr' ? "HH'h'mm" : "HH:mm";
  
  let formattedDate = format(stats.startTime, `${dateFormat} '${language==='fr'?'à':'at'}' ${timeFormat}`, { locale: dateLocale });
  if (stats.timeZoneStr) {
    formattedDate += ` ${stats.timeZoneStr}`;
  }

  const handleExportCsv = () => {
    if (!rawData || rawData.length === 0) return;
    const csvStr = Papa.unparse(rawData, { delimiter: ';' });
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `combined_mobile_scan_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortedMultiplexes = [...stats.multiplexes].sort((a, b) => {
    if (sortBy === 'multiplexes') {
      return a.label.localeCompare(b.label);
    }
    const aMatch = a.channel.match(/(\d+)([a-zA-Z]*)/);
    const bMatch = b.channel.match(/(\d+)([a-zA-Z]*)/);
    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1], 10);
      const bNum = parseInt(bMatch[1], 10);
      if (aNum !== bNum) return aNum - bNum;
      return (aMatch[2] || '').localeCompare(bMatch[2] || '');
    }
    return a.channel.localeCompare(b.channel);
  });

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-4">
        <div className="flex-1 min-w-0 pr-0 xl:pr-4">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">{t('reportTitle')}</h1>
           <div className="text-slate-500 dark:text-slate-400 mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
             <span className="flex items-center gap-2 whitespace-nowrap">
               <Activity className="w-4 h-4 shrink-0" />
               {fileCount > 1 ? (
                 <span>
                   {language === 'fr' ? (
                     <><span className="font-semibold">{fileCount}</span> fichiers combinés. Le plus ancien date du <span className="font-semibold">{format(stats.startTime, dateFormat, { locale: dateLocale })}</span>.</>
                   ) : (
                     <><span className="font-semibold">{fileCount}</span> files combined. The oldest is from <span className="font-semibold">{format(stats.startTime, dateFormat, { locale: dateLocale })}</span>.</>
                   )}
                 </span>
               ) : (
                 <>{t('scanStart')} <span className="font-semibold text-slate-700 dark:text-slate-300">{formattedDate}</span></>
               )}
             </span>
           </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto shrink-0 relative">
          {fileCount > 1 && (
            <button 
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-5 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              {language === 'fr' ? 'Exporter les données combinées en CSV' : 'Export the combined data to CSV'}
            </button>
          )}
          <button 
            onClick={onReset}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap"
          >
            {t('analyzeAnother')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          title={t('channelsReceived')} 
          value={stats.channelCount} 
          icon={<Radio className="w-6 h-6" />} 
        />
        <StatCard 
          title={t('multiplexReceived')} 
          value={stats.multiplexCount} 
          icon={<Activity className="w-6 h-6" />} 
        />
        <StatCard 
          title={t('transmittersReceived')} 
          value={txSet.size} 
          icon={<MapPin className="w-6 h-6" />} 
        />
        <StatCard 
          title={t('tiiCodesDetected')} 
          value={tiiSet.size} 
          icon={<Signal className="w-6 h-6" />} 
        />
      </div>

      {stats.multiplexes.length > 0 ? (
        <div className="mb-12">
          {selectedMux && (
            <div className="flex flex-col gap-6">
              <MobileCoverageMap 
                 multiplex={selectedMux}
                 timeZoneStr={stats.timeZoneStr}
                 allMultiplexes={stats.multiplexes}
                 onSelectMultiplex={setSelectedMux}
              />
              
              <div className="bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-500" />
                    {language === 'fr' ? 'Émetteurs reçus pour ce multiplex' : 'Transmitters received for this multiplex'}
                  </h3>
                  <div className="flex items-center gap-2 text-sm">
                    <label className="text-slate-500 dark:text-slate-400 font-medium">{t('sortBy')}</label>
                    <select
                      value={txSort}
                      onChange={(e) => setTxSort(e.target.value as any)}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg py-1.5 px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="pts-desc">{t('sortTxPtsDesc')}</option>
                      <option value="pts-asc">{t('sortTxPtsAsc')}</option>
                      <option value="name-asc">{t('sortTxNameAsc')}</option>
                    </select>
                  </div>
                </div>
                {selectedMux.transmitters.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...selectedMux.transmitters].sort((a, b) => {
                      if (txSort === 'name-asc') {
                        const locA = a.location || '';
                        const locB = b.location || '';
                        return locA.localeCompare(locB);
                      } else if (txSort === 'pts-asc') {
                        return a.pointCount - b.pointCount;
                      } else {
                        return b.pointCount - a.pointCount;
                      }
                    }).map(tx => (
                      <div key={tx.tii} className="bg-white dark:bg-[#2B2D31]/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 flex flex-col gap-3 shadow-sm min-w-0">
                        <div className="flex justify-between items-center gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 shrink-0">{tx.tii}</span>
                            {tx.location ? (
                              <TruncatedText 
                                 lines={2}
                                 text={tx.location} 
                                 className="text-slate-800 dark:text-slate-100 font-semibold text-[15px] leading-tight break-words" 
                              />
                            ) : (
                              <div className="text-orange-600 dark:text-orange-500 font-semibold text-[15px] leading-tight break-words">
                                {t('unknownSite')}
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 text-xs shrink-0 whitespace-nowrap">
                            {tx.pointCount} {language === 'fr' ? (tx.pointCount > 1 ? 'détections' : 'détection') : (tx.pointCount > 1 ? 'detections' : 'detection')}
                          </span>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mt-1 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="flex flex-col gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {(tx.minDistance > 0 || tx.maxDistance > 0) && (
                              <div>
                                {language === 'fr' 
                                  ? <span>Distance : {tx.minDistance.toFixed(1)} -&gt; {tx.maxDistance.toFixed(1)} km</span>
                                  : <span>Distance: {tx.minDistance.toFixed(1)} -&gt; {tx.maxDistance.toFixed(1)} km</span>}
                              </div>
                            )}
                            {tx.power > 0 && (
                              <div>
                                <span>{t('erpPowerField')}</span> <span>{tx.power.toFixed(1)} kW</span>
                              </div>
                            )}
                            {tx.altitude !== undefined && tx.altitude !== -1 && (
                              <div>
                                <span>{language === 'fr' ? 'Altitude du site :' : 'Site Altitude:'}</span> <span>{Math.round(tx.altitude)}m</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400 shrink-0 sm:text-right">
                            <div>
                               <span className="font-medium">{language === 'fr' ? 'Niveau Maxi :' : 'Max Level:'}</span> <span className="font-semibold text-green-600 dark:text-green-400">{tx.maxLevel.toFixed(1)} dB</span>
                            </div>
                            <div>
                               <span className="font-medium">{language === 'fr' ? 'Niveau Mini :' : 'Min Level:'}</span> <span className="font-semibold text-red-600 dark:text-red-400">{tx.minLevel.toFixed(1)} dB</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500 italic text-sm">{t('noTxDecoded')}</div>
                )}
              </div>
            </div>
          )}

          {stats.multiplexes.length > 1 && (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-12 mb-6 gap-4">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Signal className="w-6 h-6 text-blue-600 dark:text-blue-500" />
                  {t('muxDetail')}
                </h2>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700/80 px-2.5 py-1.5 rounded-lg shadow-sm">
                      <input 
                        type="checkbox" 
                        checked={compact} 
                        onChange={(e) => setCompact(e.target.checked)} 
                        className="rounded border-slate-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" 
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 select-none whitespace-nowrap">{t('compactView')}</span>
                    </label>
                    <span className="hidden sm:flex text-sm font-medium text-slate-500 dark:text-slate-400 items-center gap-1.5 ml-2"><ArrowDownUp className="w-4 h-4" /> {t('sortBy')}</span>
                    <select 
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 transition-colors focus:outline-none cursor-pointer"
                    >
                      <option value="channels">{t('sortByChannels')}</option>
                      <option value="multiplexes">{t('sortByMultiplexes')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedMultiplexes.map((mux, index) => (
                  <MobileMuxCard 
                    key={index} 
                    mux={mux} 
                    compact={compact}
                    isSelected={selectedMux?.channel === mux.channel && selectedMux?.label === mux.label}
                    onClick={() => setSelectedMux(mux)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="text-center p-12 bg-white dark:bg-[#313338] rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
           <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Aucun multiplex valide</h3>
           <p className="text-slate-500 dark:text-slate-400">{t('noMuxFound')}</p>
        </div>
      )}
    </div>
  );
}

function getSnrColorClass(snr: number) {
  if (snr < 7.0) return "text-red-500 dark:text-red-400";
  if (snr < 10.0) return "text-orange-500 dark:text-orange-400";
  return "text-green-600 dark:text-green-500";
}

function MobileMuxCard({ mux, compact, isSelected, onClick }: { key?: string | number, mux: MobileMultiplexStat, compact: boolean, isSelected: boolean, onClick: () => void }) {
  const { t, language } = useAppContext();
  
  const bestTransmitter = mux.transmitters.length > 0 
    ? [...mux.transmitters].sort((a,b) => b.maxLevel - a.maxLevel)[0]
    : null;

  if (compact) {
      return (
        <div 
          onClick={onClick}
          className={`cursor-pointer bg-white dark:bg-[#313338] rounded-xl border ${isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-700/80'} shadow-sm overflow-hidden flex flex-col lg:flex-row hover:shadow-md transition-all`}
        >
          {/* Header Info */}
          <div className={`px-4 py-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700/50 flex flex-col w-full lg:w-64 shrink-0 ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-slate-50 dark:bg-[#2B2D31]/50'}`}>
            <div>
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span 
                    className="cursor-help bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded text-sm font-bold border border-indigo-200 dark:border-indigo-800/50 whitespace-nowrap"
                    title={mux.frequency > 0 ? `${(mux.frequency / 1000).toFixed(3)} MHz` : ''}
                  >
                    {mux.channel}
                  </span>
                  <TruncatedText 
                    lines={1}
                    className="font-bold text-slate-800 dark:text-slate-100 flex-1 min-w-0" 
                    text={mux.label} 
                  />
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
          <div className="p-3 flex-1 flex flex-wrap content-center gap-2 border-b lg:border-b-0 border-slate-100 dark:border-slate-700/50 min-w-0">
             {mux.transmitters.map((tx, i) => (
                <span 
                  key={i}
                  title={tx.location || t('unknownSite')}
                  className="font-mono text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 py-1 px-2 rounded shrink-0 cursor-help transition-colors hover:bg-blue-200 dark:hover:bg-blue-800/40"
                >
                  {tx.tii}
                </span>
             ))}
          </div>
        </div>
      );
    }
    
    return (
      <div 
        onClick={onClick}
        className={`cursor-pointer bg-white dark:bg-[#313338] rounded-xl shadow-sm border ${isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-700/50'} overflow-hidden flex flex-col transition-colors items-start hover:shadow-md h-full`}
      >
        <div className={`bg-slate-50 dark:bg-[#2B2D31]/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700/50 flex justify-between items-start w-full ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
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
      
      <div className={`p-6 flex-1 flex flex-col w-full`}>
        <div className="mb-4">
          <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-2">
            {mux.transmitters.length > 1 ? t('receivedTxPlural') : t('receivedTxSingular')}
          </h4>
          <div className="grid gap-2 grid-cols-1 gap-y-3">
            {mux.transmitters.map((tx, i) => (
              <div key={i} className={`flex items-center justify-between pb-3 border-b border-slate-50 dark:border-slate-800/50 last:border-0 last:pb-0`}>
                 <div className="flex items-center gap-2.5 min-w-0 pr-3">
                   <div className="flex flex-col min-w-0">
                     {tx.location ? (
                       <TruncatedText 
                         lines={1}
                         className="font-semibold text-sm text-slate-800 dark:text-slate-200 transition-colors" 
                         text={tx.location} 
                       />
                     ) : (
                       <div className="text-orange-600 dark:text-orange-500 font-semibold text-sm transition-colors">
                         {t('unknownSite')}
                       </div>
                     )}
                     <div className="flex items-center gap-2 mt-0.5 max-w-full">
                       <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tracking-tight shrink-0 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                         {tx.tii}
                       </span>
                     </div>
                   </div>
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
