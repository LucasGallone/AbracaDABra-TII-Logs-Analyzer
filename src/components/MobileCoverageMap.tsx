import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents, Polyline, Marker, LayersControl, Polygon, Pane } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MobileMultiplexStat, MobilePoint, MobileTransmitterStat } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { Layers, Navigation, X, Maximize2, Minimize2, LocateFixed, ChevronDown, Check } from 'lucide-react';
import L from 'leaflet';
import { ElevationProfile, MAP_TILES } from './CoverageMap';
import { sortChannels } from '../lib/utils';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { TruncatedText } from './TruncatedText';
import { HeatmapLayer } from './HeatmapLayer';

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

function MapEventHandler({ onClick, onZoom }: { onClick: () => void, onZoom?: (zoom: number) => void }) {
  const map = useMapEvents({ 
    click: (e) => {
       const origEvent = e.originalEvent as any;
       if (origEvent && (origEvent._stopped || origEvent.defaultPrevented)) return;
       onClick();
    },
    zoom: () => {
       if (onZoom) onZoom(map.getZoom());
    },
    zoomend: () => {
       if (onZoom) onZoom(map.getZoom());
    }
  });
  useEffect(() => {
    if (onZoom) onZoom(map.getZoom());
  }, [map, onZoom]);
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

function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLon = deg2rad(lon2 - lon1);
  const l1 = deg2rad(lat1);
  const l2 = deg2rad(lat2);
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  return (brng * 180 / Math.PI + 360) % 360;
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
  const [colorMode, setColorMode] = useState<'snr' | 'level'>(() => {
    const saved = localStorage.getItem('map_colorMode');
    return saved === 'level' || saved === 'snr' ? saved : 'snr';
  });
  const [activeLine, setActiveLine] = useState<{ pointLat: number, pointLon: number, txLat: number, txLon: number } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<(MobilePoint & { renderColor: string, txData: any, hasSfnConflict: boolean }) | null>(null);
  const [isMuxDropdownOpen, setIsMuxDropdownOpen] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapType, setMapType] = useState(() => {
    const saved = localStorage.getItem('map_mapType');
    return saved || MAP_TILES[0].id;
  });
  const [mapZoom, setMapZoom] = useState(10);
  const [showPoints, setShowPoints] = useState(() => {
    const saved = localStorage.getItem('map_showPoints');
    return saved !== null ? saved === 'true' : true;
  });
  const [showHeatmap, setShowHeatmap] = useState(() => {
    const saved = localStorage.getItem('map_showHeatmap');
    return saved !== null ? saved === 'true' : false;
  });
  const [showPolygons, setShowPolygons] = useState(() => {
    const saved = localStorage.getItem('map_showPolygons');
    return saved !== null ? saved === 'true' : false;
  });
  const [showSfnConflicts, setShowSfnConflicts] = useState(() => {
    const saved = localStorage.getItem('map_showSfnConflicts');
    return saved !== null ? saved === 'true' : false;
  });
  const [snrFilterEnabled, setSnrFilterEnabled] = useState(() => {
    const saved = localStorage.getItem('map_snrFilterEnabled');
    return saved !== null ? saved === 'true' : false;
  });
  const [snrFilterThreshold, setSnrFilterThreshold] = useState<string>(() => {
    const saved = localStorage.getItem('map_snrFilterThreshold');
    return saved !== null ? saved : '';
  });
  const [snrFilterDirection, setSnrFilterDirection] = useState<'>=' | '<='>(() => {
    const saved = localStorage.getItem('map_snrFilterDirection');
    return saved === '>=' || saved === '<=' ? saved : '>=';
  });
  const [topoProps, setTopoProps] = useState<{ rxCoords: [number, number], txCoords: [number, number], location: string } | null>(null);
  const [profileHoverPoint, setProfileHoverPoint] = useState<[number, number] | null>(null);
  const prevViewRef = useRef<{ center: L.LatLng, zoom: number } | null>(null);
  const profileZoomBeforeRef = useRef<{ center: L.LatLng, zoom: number } | null>(null);
  const [isProfileZoomed, setIsProfileZoomed] = useState(false);
  const [isProfileObstructed, setIsProfileObstructed] = useState(false);

  useEffect(() => {
    localStorage.setItem('map_colorMode', colorMode);
  }, [colorMode]);
  
  useEffect(() => {
    localStorage.setItem('map_mapType', mapType);
  }, [mapType]);

  useEffect(() => {
    localStorage.setItem('map_showPoints', String(showPoints));
  }, [showPoints]);

  useEffect(() => {
    localStorage.setItem('map_showHeatmap', String(showHeatmap));
  }, [showHeatmap]);

  useEffect(() => {
    localStorage.setItem('map_showPolygons', String(showPolygons));
  }, [showPolygons]);

  useEffect(() => {
    localStorage.setItem('map_showSfnConflicts', String(showSfnConflicts));
  }, [showSfnConflicts]);

  useEffect(() => {
    localStorage.setItem('map_snrFilterEnabled', String(snrFilterEnabled));
  }, [snrFilterEnabled]);

  useEffect(() => {
    localStorage.setItem('map_snrFilterThreshold', snrFilterThreshold);
  }, [snrFilterThreshold]);

  useEffect(() => {
    localStorage.setItem('map_snrFilterDirection', snrFilterDirection);
  }, [snrFilterDirection]);

  useEffect(() => {
    if (!topoProps) {
      setIsProfileZoomed(false);
      setIsProfileObstructed(false);
      profileZoomBeforeRef.current = null;
    }
  }, [topoProps]);
  
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
  const renderPoints = React.useMemo(() => {
    return multiplex.points
      .filter(point => {
        if (snrFilterEnabled && snrFilterThreshold !== '') {
          const thresh = parseFloat(snrFilterThreshold);
          if (!isNaN(thresh)) {
            if (snrFilterDirection === '>=' && point.snr < thresh) return false;
            if (snrFilterDirection === '<=' && point.snr > thresh) return false;
          }
        }
        return true;
      })
      .map(point => {
        let hasSfnConflict = false;
        
        if (showSfnConflicts && point.transmitters.length > 1) {
          const maxLevel = Math.max(...point.transmitters.map(t => t.level));
          const maxLevelTx = point.transmitters.find(t => t.level === maxLevel);
          if (maxLevelTx) {
            hasSfnConflict = point.transmitters.some(tx => 
              tx.tii !== maxLevelTx.tii && 
              Math.abs(tx.distance - maxLevelTx.distance) >= 74 && 
              tx.level >= maxLevel - 15
            );
          }
        }

        if (selectedTx) {
          const txData = point.transmitters.find(t => t.tii === selectedTx);
          if (txData) {
            return {
              ...point,
              renderColor: colorMode === 'level' ? getMapLevelColor(txData.level) : getMapSnrColor(point.snr),
              txData: txData,
              hasSfnConflict
            };
          }
          return null;
        }
        return {
          ...point,
          renderColor: getMapSnrColor(point.snr),
          txData: null,
          hasSfnConflict
        };
      }).filter(p => p !== null) as (MobilePoint & { renderColor: string, txData: any, hasSfnConflict: boolean })[];
  }, [multiplex, selectedTx, colorMode, showSfnConflicts, snrFilterEnabled, snrFilterThreshold, snrFilterDirection]);

  const coveragePolygons = React.useMemo(() => {
    if (!showPolygons || !multiplex || !multiplex.transmitters || !multiplex.points) return [];
    
    const polygons: { tii: string; coords: [number, number][]; fillColor: string; }[] = [];
    
    const transmittersToProcess = selectedTx 
      ? multiplex.transmitters.filter(t => t.tii === selectedTx)
      : multiplex.transmitters;

    for (const tx of transmittersToProcess) {
      if (!tx.lat || !tx.lon) continue;

      const bins = new Map<number, { distance: number, coord: [number, number] }>();
      
      for (let i = 0; i < 360; i += 10) {
        bins.set(i, { distance: 0, coord: [tx.lat, tx.lon] }); // Fallback to TX location
      }

      for (const point of multiplex.points) {
        const txData = point.transmitters.find(t => t.tii === tx.tii);
        if (txData) {
          const bearing = getBearing(tx.lat, tx.lon, point.lat, point.lon); 
          const distance = getDistanceFromLatLonInKm(tx.lat, tx.lon, point.lat, point.lon);

          const binKey = Math.floor(bearing / 10) * 10;
          const currentMax = bins.get(binKey);

          if (currentMax && distance > currentMax.distance) {
            bins.set(binKey, { distance: distance, coord: [point.lat, point.lon] });
          }
        }
      }

      const coords: [number, number][] = [];
      for (let i = 0; i < 360; i += 10) {
        const b = bins.get(i);
        if (b) {
          coords.push(b.coord);
        }
      }

      polygons.push({
        tii: tx.tii,
        coords: coords,
        fillColor: '#3b82f6'
      });
    }

    return polygons;
  }, [multiplex, selectedTx, showPolygons]);

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
                  {[...allMultiplexes].sort((a, b) => {
                    const cmp = sortChannels(a.channel, b.channel);
                    if (cmp !== 0) return cmp;
                    return (a.label || '').localeCompare(b.label || '');
                  }).map(m => {
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
               isProfileZoomed={isProfileZoomed} 
               onClose={() => {
                 setTopoProps(null);
                 setProfileHoverPoint(null);
                 setIsProfileZoomed(false);
                 setIsProfileObstructed(false);
                 profileZoomBeforeRef.current = null;
                 if (prevViewRef.current && mapRef.current) {
                   mapRef.current.setView(prevViewRef.current.center, prevViewRef.current.zoom);
                   prevViewRef.current = null;
                 }
               }}
               onHoverPoint={setProfileHoverPoint}
               onObstructionChange={setIsProfileObstructed}
               onClickPoint={(coords) => {
                 if (!mapRef.current) return;
                 if (isProfileZoomed) {
                   if (profileZoomBeforeRef.current) {
                     mapRef.current.setView(profileZoomBeforeRef.current.center, profileZoomBeforeRef.current.zoom);
                   } else if (prevViewRef.current) {
                     mapRef.current.setView(prevViewRef.current.center, prevViewRef.current.zoom);
                   }
                   setIsProfileZoomed(false);
                   profileZoomBeforeRef.current = null;
                 } else {
                   profileZoomBeforeRef.current = {
                     center: mapRef.current.getCenter(),
                     zoom: mapRef.current.getZoom()
                   };
                   mapRef.current.setView(coords, 15);
                   setIsProfileZoomed(true);
                 }
               }}
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
               <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl pointer-events-auto overflow-hidden">
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
                   <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                   <label className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-colors group">
                      <div className={`w-4 h-4 rounded border ${showPoints ? 'border-4 border-blue-500 bg-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors shrink-0`} />
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={showPoints} 
                        onChange={() => setShowPoints(!showPoints)} 
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                        {t('layerPoints')}
                      </span>
                   </label>
                   <label className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-colors group">
                      <div className={`w-4 h-4 rounded border ${showHeatmap ? 'border-4 border-blue-500 bg-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors shrink-0`} />
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={showHeatmap} 
                        onChange={() => setShowHeatmap(!showHeatmap)} 
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                        {t('layerHeatmap')}
                      </span>
                   </label>
                   <label className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-colors group">
                      <div className={`w-4 h-4 rounded border ${showPolygons ? 'border-4 border-blue-500 bg-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors shrink-0`} />
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={showPolygons} 
                        onChange={() => setShowPolygons(!showPolygons)} 
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                        {t('layerHeatmapPoly')}
                      </span>
                   </label>

                   <div className="h-px bg-slate-200 dark:bg-slate-700/60 my-1 mx-2" />

                   <label className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-colors group">
                      <div className={`w-4 h-4 rounded border ${showSfnConflicts ? 'border-4 border-red-500 bg-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-red-400'} flex items-center justify-center transition-colors shrink-0`} />
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={showSfnConflicts} 
                        onChange={() => setShowSfnConflicts(!showSfnConflicts)} 
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                        {t('layerSFNConflicts')}
                      </span>
                   </label>

                   <div className="h-px bg-slate-200 dark:bg-slate-700/60 my-1 mx-2" />

                   <div className="p-2 space-y-2">
                     <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-4 h-4 rounded border ${snrFilterEnabled ? 'border-4 border-blue-500 bg-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors shrink-0`} />
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={snrFilterEnabled} 
                          onChange={() => setSnrFilterEnabled(!snrFilterEnabled)} 
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                          {t('snrFilter')}
                        </span>
                     </label>
                     
                     {snrFilterEnabled && (
                       <div className="flex items-center gap-2 pl-7">
                         <select 
                           value={snrFilterDirection}
                           onChange={(e) => setSnrFilterDirection(e.target.value as '>=' | '<=')}
                           className="text-xs shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                         >
                           <option value=">=">{t('higherThan')}</option>
                           <option value="<=">{t('lowerThan')}</option>
                         </select>
                         <div className="relative flex items-center w-20">
                           <input
                             type="number"
                             maxLength={4}
                             value={snrFilterThreshold}
                             onChange={(e) => setSnrFilterThreshold(e.target.value.substring(0, 4))}
                             className="text-xs w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded pl-2 pr-6 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 text-right font-medium"
                           />
                           <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 absolute right-2 pointer-events-none">dB</span>
                         </div>
                       </div>
                     )}
                   </div>
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
                          <div><span className="font-medium text-slate-500">{t('distanceField')}</span> <span className="font-medium text-slate-800 dark:text-slate-200">{tx.minDistance.toFixed(1)} &gt; {tx.maxDistance.toFixed(1)} km</span></div>
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
                opacity={0.7} 
              />
            )}

            {topoProps && !activeLine && (
              <Polyline 
                positions={[
                  [topoProps.rxCoords[0], topoProps.rxCoords[1]],
                  [topoProps.txCoords[0], topoProps.txCoords[1]]
                ]} 
                color="#3b82f6" 
                weight={3} 
                opacity={0.7} 
              />
            )}





            {profileHoverPoint && (
               <CircleMarker 
                 center={profileHoverPoint}
                 radius={8}
                 pathOptions={{ fillColor: isProfileObstructed ? "#ef4444" : "#22c55e", color: "#ffffff", weight: 2, fillOpacity: 1 }}
               />
            )}

            {showHeatmap && (
              <HeatmapLayer points={renderPoints} colorMode={colorMode} />
            )}

            {showPolygons && coveragePolygons.map((poly, idx) => (
               <Polygon
                 key={`poly-${poly.tii}-${idx}`}
                 positions={poly.coords}
                 pathOptions={{ 
                   fillColor: poly.fillColor, 
                   fillOpacity: 0.2, 
                   color: poly.fillColor, 
                   weight: 1,
                   opacity: 0.6
                 }}
               />
            ))}

            {showPoints && (
              <React.Fragment>
                <Pane name="sfnPane" style={{ zIndex: 410 }} className="sfn-pulse-pane">
                  {renderPoints.filter(p => p.hasSfnConflict).map(p => (
                    <CircleMarker
                      key={`sfn-${p.lat}-${p.lon}-${selectedTx || 'all'}`}
                      center={[p.lat, p.lon]}
                      radius={7}
                      interactive={false}
                      pathOptions={{
                        fill: false,
                        color: '#ef4444',
                        weight: 8,
                        stroke: true
                      }}
                    />
                  ))}
                </Pane>

                <Pane name="pointsPane" style={{ zIndex: 420 }}>
                  {renderPoints.map((p, idx) => {
                    const isSelected = selectedPoint && selectedPoint.lat === p.lat && selectedPoint.lon === p.lon && selectedPoint.timeMs === p.timeMs;
                    const fillColor = isSelected ? '#a855f7' : p.renderColor;
                    
                    return (
                      <CircleMarker
                        key={`${p.lat}-${p.lon}-${colorMode}-${selectedTx || 'all'}-${mapZoom >= 13}-${p.hasSfnConflict}`}
                        center={[p.lat, p.lon]}
                        radius={7} 
                        pathOptions={{ 
                          fillColor: fillColor, 
                          color: 'rgba(0,0,0,0.5)', 
                          weight: mapZoom >= 13 ? 1.5 : 0, 
                          stroke: mapZoom >= 13, 
                          fillOpacity: 0.9
                        }}
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
                </Pane>
              </React.Fragment>
            )}
          <MapEventHandler onClick={() => { setSelectedPoint(null); setActiveLine(null); setMapPickerOpen(false); setIsMuxDropdownOpen(false); }} onZoom={(z) => setMapZoom(z)} />
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
              <div className="flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-700/50">
                <div className="flex justify-between items-start gap-3">
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
                
                {selectedPoint.hasSfnConflict && (
                  <div className="flex items-center justify-center px-1.5 py-1.5 bg-red-100 dark:bg-opacity-10 text-red-700 dark:text-red-400 font-semibold text-[11px] rounded border border-red-200 dark:border-red-500/20 shadow-sm w-full">
                    {t('sfnConflictWarning')}
                  </div>
                )}
              </div>

              {/* Transmitters List */}
              {!selectedTx ? (() => {
                const maxLevel = selectedPoint.transmitters.length > 0 ? Math.max(...selectedPoint.transmitters.map(t => t.level)) : 0;
                const maxLevelTx = selectedPoint.transmitters.find(t => t.level === maxLevel);
                return (
                <div className="flex flex-col gap-3">
                  {selectedPoint.transmitters.length === 0 ? (
                     <div className="text-xs text-slate-500 italic py-2 text-center bg-white dark:bg-slate-800/30 rounded-lg">{t('noTxDecoded')}</div>
                  ) : (
                    [...selectedPoint.transmitters].sort((a,b) => b.level - a.level).map(tx => {
                      let isConflictTx = false;
                      if (selectedPoint.hasSfnConflict && maxLevelTx && tx.tii !== maxLevelTx.tii) {
                        if (Math.abs(tx.distance - maxLevelTx.distance) >= 74 && tx.level >= maxLevel - 15) {
                          isConflictTx = true;
                        }
                      }
                      return (
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
                          <div className="flex items-center gap-2 shrink-0">
                            {isConflictTx && (
                              <span 
                                className="text-lg leading-none cursor-help"
                                title={t('sfnConflictTooltip')}
                              >
                                ⚠️
                              </span>
                            )}
                            <span className="font-bold text-sm px-2.5 py-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg whitespace-nowrap border border-slate-100 dark:border-slate-700/50" style={{ color: getLevelColor(tx.level) }}>
                              {tx.level.toFixed(1)} dB
                            </span>
                          </div>
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
                                if (topoProps?.rxCoords[0] === selectedPoint.lat && topoProps?.rxCoords[1] === selectedPoint.lon && topoProps?.txCoords[0] === tx.lat) {
                                  setTopoProps(null);
                                  setProfileHoverPoint(null);
                                  if (prevViewRef.current && mapRef.current) {
                                    mapRef.current.setView(prevViewRef.current.center, prevViewRef.current.zoom);
                                    prevViewRef.current = null;
                                  }
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
                                  setTopoProps({
                                    rxCoords: [selectedPoint.lat, selectedPoint.lon],
                                    txCoords: [tx.lat!, tx.lon!],
                                    location: tx.location || t('unknownSite')
                                  });
                                }
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${topoProps?.rxCoords[0] === selectedPoint.lat && topoProps?.txCoords[0] === tx.lat ? 'bg-amber-200 dark:bg-amber-800/80 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700' : 'bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300'}`}
                            >
                              {t('topoProfile')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                   })
                  )}
                 </div>
               ); })() : (() => {
                 let isConflictTx = false;
                 if (selectedPoint.txData && selectedPoint.hasSfnConflict) {
                   const maxLevel = selectedPoint.transmitters.length > 0 ? Math.max(...selectedPoint.transmitters.map(t => t.level)) : 0;
                   const maxLevelTx = selectedPoint.transmitters.find(t => t.level === maxLevel);
                   if (maxLevelTx && selectedPoint.txData.tii !== maxLevelTx.tii) {
                     if (Math.abs(selectedPoint.txData.distance - maxLevelTx.distance) >= 74 && selectedPoint.txData.level >= maxLevel - 15) {
                       isConflictTx = true;
                     }
                   }
                 }
                 return (
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
                        <div className="flex items-center gap-2 shrink-0">
                          {isConflictTx && (
                            <span 
                              className="text-lg leading-none cursor-help"
                              title={t('sfnConflictTooltip')}
                            >
                              ⚠️
                            </span>
                          )}
                          <span className="font-bold text-sm px-2.5 py-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg whitespace-nowrap border border-slate-100 dark:border-slate-700/50" style={{ color: getLevelColor(selectedPoint.txData.level) }}>
                            {selectedPoint.txData.level.toFixed(1)} dB
                          </span>
                        </div>
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
                              if (topoProps?.rxCoords[0] === selectedPoint.lat && topoProps?.rxCoords[1] === selectedPoint.lon && topoProps?.txCoords[0] === selectedPoint.txData!.lat) {
                                setTopoProps(null);
                                setProfileHoverPoint(null);
                                if (prevViewRef.current && mapRef.current) {
                                  mapRef.current.setView(prevViewRef.current.center, prevViewRef.current.zoom);
                                  prevViewRef.current = null;
                                }
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
                                setTopoProps({
                                  rxCoords: [selectedPoint.lat, selectedPoint.lon],
                                  txCoords: [selectedPoint.txData!.lat!, selectedPoint.txData!.lon!],
                                  location: selectedPoint.txData!.location || t('unknownSite')
                                });
                              }
                            }}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${topoProps?.rxCoords[0] === selectedPoint.lat && topoProps?.txCoords[0] === selectedPoint.txData!.lat ? 'bg-amber-200 dark:bg-amber-800/80 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700' : 'bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300'}`}
                          >
                            {t('topoProfile')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ); })()}

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

