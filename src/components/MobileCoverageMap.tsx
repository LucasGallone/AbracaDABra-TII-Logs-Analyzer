import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents, Polyline, Marker, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MobileMultiplexStat, MobilePoint, MobileTransmitterStat } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { Layers, Navigation, X, Maximize2, Minimize2, LocateFixed, ChevronDown } from 'lucide-react';
import L from 'leaflet';
import { ElevationProfile, MAP_TILES } from './CoverageMap';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { TruncatedText } from './TruncatedText';

// Custom icons
const txIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function getSnrColor(snr: number) {
  if (snr < 7.0) return "#ef4444"; // red-500
  if (snr < 10.0) return "#f97316"; // orange-500
  return "#10b981"; // emerald-500
}

function getLevelColor(level: number) {
  if (level <= -35.0) return "#ef4444"; // red
  if (level <= -25.0) return "#f97316"; // orange
  return "#10b981"; // green
}

function getMapSnrColor(snr: number) {
  if (snr < 5.0) return "#991b1b"; // dark red
  if (snr < 7.0) return "#ef4444"; // red
  if (snr < 10.0) return "#f97316"; // orange
  if (snr < 13.0) return "#86efac"; // light green
  if (snr < 23.0) return "#10b981"; // green
  return "#059669"; // dark green
}

function getMapLevelColor(level: number) {
  if (level >= -10.0) return "#059669"; // dark green
  if (level >= -20.0) return "#10b981"; // green
  if (level >= -25.0) return "#86efac"; // light green
  if (level >= -35.0) return "#f97316"; // orange
  if (level >= -40.0) return "#ef4444"; // red
  return "#991b1b"; // dark red
}

function MapEventHandler({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: (e) => {
     const origEvent = e.originalEvent as any;
     if (origEvent && (origEvent._stopped || origEvent.defaultPrevented)) return;
     onClick();
  }});
  return null;
}

function RecenterMap({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
}

export function MobileCoverageMap({ 
  multiplex, 
  timeZoneStr,
  allMultiplexes,
  onSelectMultiplex
}: { 
  multiplex: MobileMultiplexStat, 
  timeZoneStr?: string,
  allMultiplexes?: MobileMultiplexStat[],
  onSelectMultiplex?: (mux: MobileMultiplexStat) => void
}) {
  const { t, theme, language } = useAppContext();
  const dateLocale = language === 'fr' ? fr : enUS;
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'snr' | 'level'>('snr');
  const [activeLine, setActiveLine] = useState<{ pointLat: number, pointLon: number, txLat: number, txLon: number } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<(MobilePoint & { renderColor: string, txData: any }) | null>(null);
  const [isMuxDropdownOpen, setIsMuxDropdownOpen] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapType, setMapType] = useState(MAP_TILES[0].id);
  const [topoProps, setTopoProps] = useState<{ rxCoords: [number, number], txCoords: [number, number], location: string } | null>(null);
  const prevViewRef = useRef<{ center: L.LatLng, zoom: number } | null>(null);
  
  const mapRef = useRef<L.Map>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    observer.observe(mapContainerRef.current);
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedPoint(null);
    setActiveLine(null);
    setSelectedTx(null);
    setIsMuxDropdownOpen(false);
  }, [multiplex.channel, multiplex.label]);

  const bounds = React.useMemo(() => {
    if (multiplex.points.length === 0) return null;
    const lats = multiplex.points.map(p => p.lat);
    const lons = multiplex.points.map(p => p.lon);
    
    return L.latLngBounds(
      L.latLng(Math.min(...lats), Math.min(...lons)),
      L.latLng(Math.max(...lats), Math.max(...lons))
    );
  }, [multiplex]);

  // Filter and prepare points to render
  const renderPoints = multiplex.points.map(point => {
    if (selectedTx) {
      const txData = point.transmitters.find(t => t.tii === selectedTx);
      if (txData) {
        return {
          ...point,
          renderColor: colorMode === 'level' ? getMapLevelColor(txData.level) : getMapSnrColor(point.snr),
          txData: txData
        };
      }
      return null;
    }
    return {
      ...point,
      renderColor: getMapSnrColor(point.snr),
      txData: null
    };
  }).filter(p => p !== null) as (MobilePoint & { renderColor: string, txData: any })[];

  const selectedTxStat = multiplex.transmitters.find(t => t.tii === selectedTx);

  const sortedDropdownTransmitters = [...multiplex.transmitters].sort((a,b) => {
    const labelA = `${a.location || t('unknownSite')} [${a.tii}]`.toUpperCase();
    const labelB = `${b.location || t('unknownSite')} [${b.tii}]`.toUpperCase();
    return labelA.localeCompare(labelB);
  });

  return (
    <div className="bg-white dark:bg-[#313338] shadow-sm overflow-hidden flex flex-col relative w-full h-[600px] rounded-xl border border-slate-200 dark:border-slate-700/80">
      
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-blue-500" />
          <div className="flex items-center relative">
            <h3 
              className={`font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 ${allMultiplexes && allMultiplexes.length > 1 ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors' : ''}`}
              onClick={() => {
                if (allMultiplexes && allMultiplexes.length > 1) {
                  setIsMuxDropdownOpen(!isMuxDropdownOpen);
                }
              }}
            >
              {multiplex.channel} - {multiplex.label}
              {allMultiplexes && onSelectMultiplex && allMultiplexes.length > 1 && (
                 <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </h3>
            
            {isMuxDropdownOpen && allMultiplexes && onSelectMultiplex && (
              <>
                <div 
                  className="fixed inset-0 z-[1001]" 
                  onClick={() => setIsMuxDropdownOpen(false)}
                />
                <motion.div 
                  initial={{ opacity: 0, y: -5 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-10 left-0 min-w-[280px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-xl z-[1002] py-2 max-h-[300px] overflow-y-auto custom-scrollbar"
                >
                  {allMultiplexes.map(m => {
                    const isSelected = m.channel === multiplex.channel && m.label === multiplex.label;
                    return (
                      <button
                        key={`${m.channel}-${m.label}`}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
                        onClick={() => {
                          onSelectMultiplex(m);
                          setSelectedTx(null);
                          setIsMuxDropdownOpen(false);
                        }}
                      >
                        {m.channel} - {m.label}
                        {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </button>
                    )
                  })}
                </motion.div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">{t('filter')}</label>
            <select 
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
              value={selectedTx || ''}
              onChange={(e) => {
                setSelectedTx(e.target.value || null);
                setActiveLine(null);
                setSelectedPoint(null);
                setColorMode('snr');
              }}
            >
              <option value="">{t('allPointsSnr')}</option>
              {sortedDropdownTransmitters.map(tx => (
                <option key={tx.tii} value={tx.tii}>
                  {tx.location || t('unknownSite')} [{tx.tii}]
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedTxStat && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/50 flex flex-col sm:flex-row gap-4 justify-between shrink-0 z-10 w-full items-center">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700 dark:text-slate-300 items-center">
            <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-900 dark:text-white">{t('pointsReceived')}</span> {selectedTxStat.pointCount}</div>
            <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-900 dark:text-white">{t('maxLevel')}</span> <span className="font-medium text-green-600 dark:text-green-400">{selectedTxStat.maxLevel.toFixed(1)} dB</span></div>
            <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-900 dark:text-white">{t('minLevel')}</span> <span className="font-medium text-red-600 dark:text-red-400">{selectedTxStat.minLevel.toFixed(1)} dB</span></div>
            <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-900 dark:text-white">{t('minDist')}</span> {selectedTxStat.minDistance.toFixed(1)} km</div>
            <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-900 dark:text-white">{t('maxDist')}</span> {selectedTxStat.maxDistance.toFixed(1)} km</div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
             <button
                onClick={() => setColorMode('level')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${colorMode === 'level' ? 'bg-blue-600 text-white shadow' : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
             >
                {t('colorModeLevel')}
             </button>
             <button
                onClick={() => setColorMode('snr')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${colorMode === 'snr' ? 'bg-blue-600 text-white shadow' : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
             >
                {t('colorModeSnr')}
             </button>
          </div>
        </div>
      )}

      <div className="flex-1 w-full relative min-h-0 z-[1] flex overflow-hidden">
        {/* Map Container */}
        <div className="flex-1 relative w-full h-full min-h-[400px]" ref={mapContainerRef}>
          {topoProps && (
             <ElevationProfile 
               rxCoords={topoProps.rxCoords} 
               txCoords={topoProps.txCoords} 
               location={topoProps.location} 
               onClose={() => setTopoProps(null)} 
             />
          )}
          
          {bounds && (
            <button
              onClick={() => {
                if (mapRef.current) {
                  mapRef.current.fitBounds(bounds, { padding: [50, 50] });
                }
              }}
              title={t('recenterRoute')}
              className="absolute top-24 left-3 z-[400] w-8 h-8 bg-white dark:bg-slate-800 border-2 border-[rgba(0,0,0,0.2)] dark:border-slate-700 rounded flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors"
            >
              <LocateFixed className="w-[18px] h-[18px]" />
            </button>
          )}

          <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end pointer-events-auto">
             <button 
               onClick={(e) => {
                 e.stopPropagation();
                 setMapPickerOpen(!mapPickerOpen);
               }} 
               className={`flex items-center justify-center w-8 h-8 bg-white dark:bg-slate-800 border-2 border-[rgba(0,0,0,0.2)] dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors`}
               title={t('mapModelSelection')}
             >
               <Layers className="w-[18px] h-[18px]" />
             </button>
             
             {mapPickerOpen && (
               <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl pointer-events-auto overflow-hidden">
                 <div className="p-2 space-y-1">
                   {MAP_TILES.map(tile => (
                     <label key={tile.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-colors group">
                        <div className={`w-4 h-4 rounded-full border ${mapType === tile.id ? 'border-4 border-blue-500 bg-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors shrink-0`} />
                        <input 
                          type="radio" 
                          name="mapTypeMob"
                          className="hidden"
                          checked={mapType === tile.id} 
                          onChange={() => setMapType(tile.id)} 
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                          {tile.name}
                        </span>
                     </label>
                   ))}
                 </div>
               </div>
             )}
          </div>

          <MapContainer 
            center={[46.603354, 1.888334]} 
            zoom={6} 
            className="h-full w-full outline-none z-0 map-fixed"
            ref={mapRef}
            onClick={() => setMapPickerOpen(false)}
          >
            <TileLayer
              key={mapType}
              attribution={MAP_TILES.find(t => t.id === mapType)?.attribution || ''}
              url={MAP_TILES.find(t => t.id === mapType)?.url || ''}
              crossOrigin="anonymous"
            />
            {bounds && <RecenterMap bounds={bounds} />}

            {/* Render transmitter markers */}
            {multiplex.transmitters.map(tx => {
              if (tx.lat && tx.lon && (!selectedTx || tx.tii === selectedTx)) {
                return (
                  <Marker 
                    key={tx.tii} 
                    position={[tx.lat, tx.lon]}
                    icon={txIcon}
                  >
                    <Popup className="custom-popup dark-popup">
                      <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-2 mb-2 text-slate-800 dark:text-slate-100">
                        {tx.location ? tx.location : (
                          <div className="font-bold text-orange-600 dark:text-orange-500">
                            {t('unknownSite')}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
                        {tx.maxDistance > 0 && (
                          <div><span className="font-medium text-slate-500">{t('distanceField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.minDistance.toFixed(1)} - {tx.maxDistance.toFixed(1)} km</span></div>
                        )}
                        {tx.power > 0 && (
                          <div><span className="font-medium text-slate-500">{t('erpPowerField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.power.toFixed(1)} kW</span></div>
                        )}
                        <div><span className="font-medium text-slate-500">{t('tiiCodeField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.tii}</span></div>
                      </div>
                    </Popup>
                  </Marker>
                );
              }
              return null;
            })}

            {/* Render lines if active */}
            {activeLine && (
              <Polyline 
                positions={[
                  [activeLine.pointLat, activeLine.pointLon],
                  [activeLine.txLat, activeLine.txLon]
                ]} 
                color="#3b82f6" 
                weight={3} 
                dashArray="5, 10" 
                opacity={0.7} 
              />
            )}

            {/* Render lines indicator for transmitter */}
            {activeLine && (
               <CircleMarker 
                 center={[activeLine.txLat, activeLine.txLon]}
                 radius={8}
                 pathOptions={{ fillColor: "#3b82f6", color: "#ffffff", weight: 2, fillOpacity: 1 }}
               >
               </CircleMarker>
            )}

            {renderPoints.map((p, idx) => {
              const isSelected = selectedPoint && selectedPoint.lat === p.lat && selectedPoint.lon === p.lon && selectedPoint.timeMs === p.timeMs;
              const fillColor = isSelected ? '#a855f7' : p.renderColor;
              
              return (
              <CircleMarker
                key={`${p.lat}-${p.lon}-${colorMode}-${selectedTx || 'all'}`}
                center={[p.lat, p.lon]}
                radius={7} 
                pathOptions={{ fillColor: fillColor, color: 'rgba(0,0,0,0.5)', weight: 1.5, stroke: true, fillOpacity: 0.9 }}
                eventHandlers={{ click: (e) => {
                   if (e && e.originalEvent) {
                     L.DomEvent.stopPropagation(e.originalEvent);
                     (e.originalEvent as any)._stopped = true;
                   }
                   setSelectedPoint(p);
                } }}
              />
            );
          })}
          <MapEventHandler onClick={() => { setSelectedPoint(null); setActiveLine(null); setMapPickerOpen(false); setIsMuxDropdownOpen(false); }} />
        </MapContainer>
        </div>

        <AnimatePresence>
        {selectedPoint && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute bottom-0 left-0 right-0 lg:bottom-auto lg:top-4 lg:right-4 lg:left-auto w-full lg:w-[380px] h-[340px] lg:h-auto lg:max-h-[calc(100%-2rem)] overflow-y-auto bg-white dark:bg-[#2b2d31] rounded-t-2xl lg:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/80 custom-scrollbar z-[1000] flex flex-col"
          >
            <div className="font-sans flex flex-col gap-3 p-4">
              {/* Header: Date, Time & Mux Info */}
              <div className="flex justify-between items-start gap-3 pb-3 border-b border-slate-200 dark:border-slate-700/50">
                <div className="flex flex-col gap-1 pr-2 relative flex-1">
                  <span className="font-bold text-[17px] text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                    {multiplex.channel} - {multiplex.label}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase mt-0.5">
                    {selectedPoint.transmitters.length} {selectedPoint.transmitters.length > 1 ? t('txReceivedPlural') : t('txReceivedSingular')}
                  </span>
                </div>
                {/* Top right container for SNR and Close */}
                <div className="flex flex-col items-end shrink-0 gap-1.5 pt-0.5">
                   {/* Close button first */}
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       setSelectedPoint(null);
                       setActiveLine(null);
                     }}
                     className="p-1 -mr-1.5 -mt-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 rounded transition-colors"
                   >
                     <X className="w-5 h-5" />
                   </button>
                   {/* Then SNR */}
                   <div className="flex items-center gap-1.5">
                     <span className="text-[9px] text-slate-500 dark:text-slate-300 font-bold uppercase tracking-wider">{t('muxSnr').replace(':', '')}</span>
                     <span className="font-bold px-2.5 py-1.5 rounded-lg text-white text-sm shadow-sm whitespace-nowrap" style={{ backgroundColor: getSnrColor(selectedPoint.snr) }}>
                       {selectedPoint.snr.toFixed(1)} dB
                     </span>
                   </div>
                </div>
              </div>

              {/* Transmitters List */}
              {!selectedTx ? (
                <div className="flex flex-col gap-3">
                  {selectedPoint.transmitters.length === 0 ? (
                     <div className="text-xs text-slate-500 italic py-2 text-center bg-white dark:bg-slate-800/30 rounded-lg">{t('noTxDecoded')}</div>
                  ) : (
                    [...selectedPoint.transmitters].sort((a,b) => b.level - a.level).map(tx => (
                      <div key={tx.tii} className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex flex-col gap-3 transition-colors">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            {tx.location ? (
                              <TruncatedText 
                                lines={2}
                                className="font-bold text-slate-900 dark:text-slate-50 text-base leading-tight break-words" 
                                text={tx.location} 
                              />
                            ) : (
                              <div className="font-bold text-orange-600 dark:text-orange-500 text-base leading-tight break-words">
                                {t('unknownSite')}
                              </div>
                            )}
                            <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400 mt-1">
                              <div>
                                <span className="font-medium text-slate-500">{t('distanceField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.distance.toFixed(1)} km</span>
                              </div>
                              {tx.power > 0 && (
                                <div><span className="font-medium text-slate-500">{t('erpPowerField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.power.toFixed(1)} kW</span></div>
                              )}
                              <div><span className="font-medium text-slate-500">{t('tiiCodeField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.tii}</span></div>
                            </div>
                          </div>
                          <span className="font-bold text-sm px-2.5 py-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg whitespace-nowrap border border-slate-100 dark:border-slate-700/50 shrink-0" style={{ color: getLevelColor(tx.level) }}>
                            {tx.level.toFixed(1)} dB
                          </span>
                        </div>
                        {tx.lat && tx.lon && (
                          <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700/50 pt-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveLine(prev => {
                                  if (prev?.pointLat === selectedPoint.lat && prev?.pointLon === selectedPoint.lon && prev?.txLat === tx.lat) {
                                    if (mapRef.current && prevViewRef.current) {
                                      mapRef.current.setView(prevViewRef.current.center, prevViewRef.current.zoom);
                                      prevViewRef.current = null;
                                    }
                                    return null;
                                  } else {
                                    if (mapRef.current && !prevViewRef.current) {
                                      prevViewRef.current = { center: mapRef.current.getCenter(), zoom: mapRef.current.getZoom() };
                                    }
                                    if (mapRef.current) {
                                      mapRef.current.fitBounds([
                                        [selectedPoint.lat, selectedPoint.lon],
                                        [tx.lat, tx.lon]
                                      ], { padding: [50, 50] });
                                    }
                                    return {
                                      pointLat: selectedPoint.lat,
                                      pointLon: selectedPoint.lon,
                                      txLat: tx.lat!,
                                      txLon: tx.lon!
                                    };
                                  }
                                });
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${activeLine?.pointLat === selectedPoint.lat && activeLine?.pointLon === selectedPoint.lon && activeLine?.txLat === tx.lat ? 'bg-blue-200 dark:bg-blue-800/80 text-blue-800 dark:text-blue-200 hover:bg-blue-300 dark:hover:bg-blue-700' : 'bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300'}`}
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              {t('line')}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTopoProps({
                                  rxCoords: [selectedPoint.lat, selectedPoint.lon],
                                  txCoords: [tx.lat!, tx.lon!],
                                  location: tx.location || t('unknownSite')
                                });
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              {t('topoProfile')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedPoint.txData && (
                    <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex flex-col gap-3 transition-colors">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          {selectedPoint.txData.location ? (
                            <TruncatedText 
                              lines={2}
                              className="font-bold text-slate-900 dark:text-slate-50 text-base leading-tight break-words" 
                              text={selectedPoint.txData.location} 
                            />
                          ) : (
                            <div className="font-bold text-orange-600 dark:text-orange-500 text-base leading-tight break-words">
                              {t('unknownSite')}
                            </div>
                          )}
                          <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400 mt-1">
                            <div><span className="font-medium text-slate-500">{t('distanceField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{selectedPoint.txData.distance.toFixed(1)} km</span></div>
                            {selectedPoint.txData.power > 0 && (
                              <div><span className="font-medium text-slate-500">{t('erpPowerField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{selectedPoint.txData.power.toFixed(1)} kW</span></div>
                            )}
                            <div><span className="font-medium text-slate-500">{t('tiiCodeField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{selectedPoint.txData.tii}</span></div>
                          </div>
                        </div>
                        <span className="font-bold text-sm px-2.5 py-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg whitespace-nowrap border border-slate-100 dark:border-slate-700/50 shrink-0" style={{ color: getLevelColor(selectedPoint.txData.level) }}>
                          {selectedPoint.txData.level.toFixed(1)} dB
                        </span>
                      </div>
                      
                      {selectedPoint.txData.lat && selectedPoint.txData.lon && (
                        <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700/50 pt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveLine(prev => {
                                if (prev?.pointLat === selectedPoint.lat && prev?.pointLon === selectedPoint.lon && prev?.txLat === selectedPoint.txData!.lat) {
                                  if (mapRef.current && prevViewRef.current) {
                                    mapRef.current.setView(prevViewRef.current.center, prevViewRef.current.zoom);
                                    prevViewRef.current = null;
                                  }
                                  return null;
                                } else {
                                  if (mapRef.current && !prevViewRef.current) {
                                    prevViewRef.current = { center: mapRef.current.getCenter(), zoom: mapRef.current.getZoom() };
                                  }
                                  if (mapRef.current) {
                                    mapRef.current.fitBounds([
                                      [selectedPoint.lat, selectedPoint.lon],
                                      [selectedPoint.txData!.lat!, selectedPoint.txData!.lon!]
                                    ], { padding: [50, 50] });
                                  }
                                  return {
                                    pointLat: selectedPoint.lat,
                                    pointLon: selectedPoint.lon,
                                    txLat: selectedPoint.txData!.lat!,
                                    txLon: selectedPoint.txData!.lon!
                                  };
                                }
                              });
                            }}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${activeLine?.pointLat === selectedPoint.lat ? 'bg-blue-200 dark:bg-blue-800/80 text-blue-800 dark:text-blue-200 hover:bg-blue-300 dark:hover:bg-blue-700' : 'bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300'}`}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            {t('line')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTopoProps({
                                rxCoords: [selectedPoint.lat, selectedPoint.lon],
                                txCoords: [selectedPoint.txData!.lat!, selectedPoint.txData!.lon!],
                                location: selectedPoint.txData!.location || t('unknownSite')
                              });
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                          >
                            {t('topoProfile')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedPoint.timeMs && (
                <div className="flex justify-between items-center pt-3 mt-1 border-t border-slate-200 dark:border-slate-700/50">
                   <span className="text-[9px] text-slate-500 dark:text-slate-300 font-bold uppercase tracking-wider">{t('rxDate').replace(':', '')} / {t('rxTime').replace(':', '')}</span>
                   <div className="flex flex-col items-end text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
                      <span>{format(new Date(selectedPoint.timeMs), 'dd/MM/yyyy')}</span>
                      <span>{format(new Date(selectedPoint.timeMs), 'HH:mm:ss') + (timeZoneStr && timeZoneStr !== 'Local' ? ` [${timeZoneStr.replace(/[\[\]]/g, '')}]` : '')}</span>
                   </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

