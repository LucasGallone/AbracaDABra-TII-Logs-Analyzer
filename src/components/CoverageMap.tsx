import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents, LayersControl, CircleMarker } from 'react-leaflet';
import { Mountain, X, Radio, RadioTower, Filter, Check, Layers } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import L from 'leaflet';
import { ScanStats } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { sortChannels } from '../lib/utils';

import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom icons
const rxIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const txIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function BoundsUpdater({ bounds, disabled }: { bounds: L.LatLngBounds; disabled?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.isValid() && !disabled) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds, disabled]);

  useEffect(() => {
    const handleReset = () => {
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], animate: false });
      }
    };
    window.addEventListener('reset-map-view', handleReset);
    return () => window.removeEventListener('reset-map-view', handleReset);
  }, [bounds, map]);
  return null;
}

function MapPopupCloser() {
  const map = useMap();
  useEffect(() => {
    const handleClose = () => {
      map.closePopup();
    };
    window.addEventListener('close-map-popups', handleClose);
    return () => window.removeEventListener('close-map-popups', handleClose);
  }, [map]);
  return null;
}

function MapClickHandler({ onUpdateStats, rxCoords }: { onUpdateStats?: React.Dispatch<React.SetStateAction<ScanStats | null>>, rxCoords: [number, number] | null }) {
  useMapEvents({
    click(e) {
      window.dispatchEvent(new CustomEvent('close-map-popups'));
      if (!rxCoords && onUpdateStats) {
        onUpdateStats(prev => prev ? { ...prev, rxLat: e.latlng.lat, rxLon: e.latlng.lng } : null);
      }
    }
  });
  return null;
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg: number) { return deg * (Math.PI/180); }

const ClassicRadioIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="8" width="20" height="12" rx="2" />
    <line x1="4" y1="8" x2="16" y2="2" />
    <circle cx="8" cy="14" r="3" />
    <line x1="14" y1="11" x2="20" y2="11" />
    <line x1="14" y1="14" x2="20" y2="14" />
    <line x1="14" y1="17" x2="20" y2="17" />
  </svg>
);

function ProfileTooltip({ active, payload, label, language, onHoverPoint }: any) {
  const lat = active && payload && payload.length ? Number(payload[0].payload.lat) : null;
  const lon = active && payload && payload.length ? Number(payload[0].payload.lon) : null;

  useEffect(() => {
    if (lat !== null && lon !== null) {
       if (onHoverPoint) onHoverPoint([lat, lon]);
    } else {
       if (onHoverPoint) onHoverPoint(null);
    }
  }, [lat, lon]);

  if (active && payload && payload.length) {
    const elev = payload.find((p: any) => p.dataKey === 'elevation');
    if (elev) {
      return (
        <div style={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#0f172a', padding: '10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', pointerEvents: 'none' }}>
          <p style={{ margin: 0, marginBottom: '5px', fontWeight: 600 }}>{label} km</p>
          <p style={{ margin: 0, color: '#3b82f6' }}>Altitude{language === 'fr' ? ' : ' : ': '}{Math.round(Number(elev.value))}m</p>
        </div>
      );
    }
  }
  return null;
}

export function ElevationProfile({ rxCoords, txCoords, location, onClose, onHoverPoint, onClickPoint, isProfileZoomed, onObstructionChange }: { rxCoords: [number, number]; txCoords: [number, number]; location: string; onClose: () => void; onHoverPoint?: (coords: [number, number] | null) => void; onClickPoint?: (coords: [number, number]) => void; isProfileZoomed?: boolean; onObstructionChange?: (obstructed: boolean) => void; }) {
  const [rawData, setRawData] = useState<number[] | null>(null);
  const hoveredCoordsRef = useRef<[number, number] | null>(null);
  const [rxHeight, setRxHeight] = useState('3');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);
  const { language } = useAppContext();

  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      setLoading(true);
      setError(false);
      setTimeoutError(false);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
         if (active) {
            setTimeoutError(true);
            controller.abort();
         }
      }, 10000);
      try {
        const steps = 50;
        const lats = [];
        const lons = [];
        const p1 = L.CRS.EPSG3857.project(L.latLng(rxCoords[0], rxCoords[1]));
        const p2 = L.CRS.EPSG3857.project(L.latLng(txCoords[0], txCoords[1]));

        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const px = p1.x + (p2.x - p1.x) * f;
          const py = p1.y + (p2.y - p1.y) * f;
          const latLng = L.CRS.EPSG3857.unproject(L.point(px, py));
          
          lats.push(latLng.lat.toFixed(5));
          lons.push(latLng.lng.toFixed(5));
        }
        
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`, { signal: controller.signal });
        if (!res.ok) throw new Error('API Error');
        const json = await res.json();
        
        if (active && json.elevation) {
          setRawData(json.elevation);
        }
      } catch (err: any) {
        if (active) {
          if (err.name !== 'AbortError') setError(true);
        }
      } finally {
        clearTimeout(timeoutId);
        if (active) setLoading(false);
      }
    };
    fetchProfile();
    return () => { active = false; };
  }, [rxCoords[0], rxCoords[1], txCoords[0], txCoords[1]]);

  const profileData = useMemo(() => {
    if (!rawData) return null;
    const steps = rawData.length - 1;
    const totalDist = getDistanceFromLatLonInKm(rxCoords[0], rxCoords[1], txCoords[0], txCoords[1]);
    const startElev = rawData[0] + Number(rxHeight || '0');
    const endElev = rawData[rawData.length - 1];
    let hasObstruction = false;
    
    const p1 = L.CRS.EPSG3857.project(L.latLng(rxCoords[0], rxCoords[1]));
    const p2 = L.CRS.EPSG3857.project(L.latLng(txCoords[0], txCoords[1]));

    const chartData = rawData.map((elev: number, idx: number) => {
      const f = idx / steps;
      const dist = Number((f * totalDist).toFixed(1));
      const expectedElev = startElev + f * (endElev - startElev);
      
      const px = p1.x + (p2.x - p1.x) * f;
      const py = p1.y + (p2.y - p1.y) * f;
      const latLng = L.CRS.EPSG3857.unproject(L.point(px, py));
      const lat = latLng.lat;
      const lon = latLng.lng;
      
      if (idx > 0 && idx < steps && elev >= expectedElev) {
        hasObstruction = true;
      }
      
      return {
        distance: dist,
        elevation: elev,
        lineOfSight: expectedElev,
        lat,
        lon
      };
    });
    
    return { chartData, hasObstruction };
  }, [rawData, rxHeight, rxCoords[0], rxCoords[1], txCoords[0], txCoords[1]]);

  useEffect(() => {
    if (onObstructionChange) {
      onObstructionChange(profileData?.hasObstruction ?? false);
    }
  }, [profileData?.hasObstruction, onObstructionChange]);

  return (
    <div className="absolute top-4 left-14 z-[1000] w-80 shrink-0 bg-white dark:bg-[#313338] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700/80 flex flex-col pointer-events-auto">
       <div className="flex justify-between items-center bg-slate-50 dark:bg-[#2B2D31] px-4 py-3 border-b border-slate-200 dark:border-slate-700/80 rounded-t-xl">
         <span className="font-semibold text-sm truncate pr-2 text-slate-800 dark:text-slate-200">
           {language === 'fr' ? 'Profil topographique' : 'Elevation profile'}
         </span>
         <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-1 shadow-sm transition-colors shrink-0">
           <X className="w-4 h-4" />
         </button>
       </div>
       
       <div className="relative px-4 py-2 text-slate-600 dark:text-slate-400 bg-white dark:bg-[#313338] border-b border-slate-100 dark:border-slate-700/50 flex">
         
         {/* Left Side: Receiver */}
         <div className="flex flex-col items-center w-16 shrink-0 z-10">
            <ClassicRadioIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-500 mb-1" />
            <span className="text-[10px] font-medium">{language === 'fr' ? 'Récepteur' : 'Receiver'}</span>
         </div>
         
         {/* Middle: Dashed Line and Centered Input */}
         <div className="flex-1 flex flex-col items-center relative px-1">
            <div className="w-full absolute top-[11px] border-t-2 border-dashed border-slate-300 dark:border-slate-600 -z-0"></div>
            
            <div className="mt-[26px] flex items-center gap-1 z-10 bg-white dark:bg-[#313338] px-1.5 rounded-full">
              <input 
                type="number" 
                value={rxHeight} 
                onChange={(e) => setRxHeight(e.target.value)} 
                className="w-12 h-5 text-xs text-center border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[9px]">{language === 'fr' ? 'm/sol' : 'm/ground'}</span>
            </div>
         </div>
         
         {/* Right Side: Transmitter */}
         <div className="flex flex-col items-center w-16 shrink-0 z-10">
            <RadioTower className="w-5 h-5 text-blue-600 dark:text-blue-500 mb-1" />
            <span className="text-[10px] font-medium">{language === 'fr' ? 'Émetteur' : 'Transmitter'}</span>
         </div>
       </div>

       <div className="p-4 h-52 bg-white dark:bg-[#313338] rounded-b-xl overflow-hidden cursor-pointer" style={{ minHeight: '200px' }} onClick={() => { if (onClickPoint) { if (isProfileZoomed) { onClickPoint([0, 0]); } else if (hoveredCoordsRef.current) { onClickPoint(hoveredCoordsRef.current); } } }}>
         {loading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
               {language === 'fr' ? 'Chargement...' : 'Loading...'}
            </div>
         ) : timeoutError ? (
            <div className="h-full flex items-center justify-center text-red-500 text-sm text-center px-4">
               {language === 'fr' ? 'La communication avec l\'API de calcul du profil topographique a échoué. Merci de réessayer ultérieurement.' : 'Communication with the elevation profile calculation API failed. Please try again later.'}
            </div>
         ) : error ? (
            <div className="h-full flex items-center justify-center text-red-500 text-sm text-center px-4">
               {language === 'fr' ? 'La communication avec l\'API de calcul du profil topographique a échoué. Merci de réessayer ultérieurement.' : 'Communication with the elevation profile calculation API failed. Please try again later.'}
            </div>
         ) : profileData ? (
            <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={200}>
              <ComposedChart 
                onMouseMove={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length && onClickPoint) {
                    const item = state.activePayload[0].payload;
                    if (item && item.lat !== undefined && item.lon !== undefined) {
                      hoveredCoordsRef.current = [Number(item.lat), Number(item.lon)];
                    }
                  }
                }}
                data={profileData.chartData} 
                onMouseLeave={() => { hoveredCoordsRef.current = null; if (onHoverPoint) onHoverPoint(null); }} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
              >
                <defs>
                   <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                   </linearGradient>
                </defs>
                <XAxis dataKey="distance" type="number" textAnchor="end" tick={{fontSize: 10, fill: '#64748b'}} tickMargin={5} tickFormatter={(val) => `${val}km`} domain={['dataMin', 'dataMax']} tickCount={6} />
                <YAxis tick={{fontSize: 10, fill: '#64748b'}} width={40} tickMargin={5} tickFormatter={(val) => `${val}m`} tickCount={5} />
                 <RechartsTooltip content={<ProfileTooltip language={language} onHoverPoint={(coords: any) => { hoveredCoordsRef.current = coords; if (onHoverPoint) onHoverPoint(coords); }} />} />
                <Area type="monotone" dataKey="elevation" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorElev)" />
                <Line type="linear" dataKey="lineOfSight" stroke={profileData.hasObstruction ? '#ef4444' : '#4ade80'} strokeWidth={3} dot={false} strokeDasharray="4 4" activeDot={false} />
              </ComposedChart>
            </ResponsiveContainer>
         ) : null}
       </div>
    </div>
  );
}

interface CoverageMapProps {
  stats: ScanStats;
  showLines: boolean;
  onUpdateStats?: React.Dispatch<React.SetStateAction<ScanStats | null>>;
}

export const MAP_TILES = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  {
    id: 'opentopo',
    name: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
  },
  {
    id: 'carto_light',
    name: 'CartoDB Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  {
    id: 'esri_satellite',
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash;; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  }
];

export function CoverageMap({ stats, showLines, onUpdateStats }: CoverageMapProps) {
  const { t, language } = useAppContext();
  const [selectedTxForProfile, setSelectedTxForProfile] = useState<{lat: number, lon: number, location: string} | null>(null);
  const [profileHoverPoint, setProfileHoverPoint] = useState<[number, number] | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapType, setMapType] = useState(MAP_TILES[0].id);
  const [selectedMuxKeys, setSelectedMuxKeys] = useState<Set<string>>(() => new Set(stats.multiplexes.map(m => `${m.channel}-${m.label}`)));
  const [forceShowAllMuxes, setForceShowAllMuxes] = useState(false);

  const mapRef = useRef<L.Map>(null);
  const prevViewRef = useRef<{ center: L.LatLng, zoom: number } | null>(null);
  const profileZoomBeforeRef = useRef<{ center: L.LatLng, zoom: number } | null>(null);
  const [isProfileZoomed, setIsProfileZoomed] = useState(false);
  const [isProfileObstructed, setIsProfileObstructed] = useState(false);

  useEffect(() => {
    if (!selectedTxForProfile) {
      setIsProfileZoomed(false);
      setIsProfileObstructed(false);
      profileZoomBeforeRef.current = null;
    }
  }, [selectedTxForProfile]);

  useEffect(() => {
    const handleCloseEvents = () => {
      setFilterOpen(false);
      setMapPickerOpen(false);
      setSelectedTxForProfile(null);
    };
    const handleForceShow = () => setForceShowAllMuxes(true);
    const handleRestore = () => setForceShowAllMuxes(false);

    window.addEventListener('close-map-popups', handleCloseEvents);
    window.addEventListener('show-all-muxes-for-export', handleForceShow);
    window.addEventListener('restore-muxes-after-export', handleRestore);
    
    return () => {
      window.removeEventListener('close-map-popups', handleCloseEvents);
      window.removeEventListener('show-all-muxes-for-export', handleForceShow);
      window.removeEventListener('restore-muxes-after-export', handleRestore);
    };
  }, []);

  const sortedChannels = useMemo(() => {
    return [...stats.multiplexes].sort((a, b) => {
      const cmp = sortChannels(a.channel, b.channel);
      if (cmp !== 0) return cmp;
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [stats.multiplexes]);

  const { rxCoords, uniqueTransmitters, bounds } = useMemo(() => {
    let rxC: [number, number] | null = null;
    if (stats.rxLat !== undefined && stats.rxLon !== undefined && !isNaN(stats.rxLat) && !isNaN(stats.rxLon)) {
      rxC = [Number(stats.rxLat), Number(stats.rxLon)];
    }

    const txMap = new Map<string, { lat: number; lon: number; location: string; altitude?: number; distance: number; azimuth?: number; muxData: { channel: string; label: string; tii: string; powerStr: string; }[] }>();
    const bnd = new L.LatLngBounds([]);

    if (rxC) {
      bnd.extend(rxC);
    }

    stats.multiplexes.forEach(mux => {
      mux.transmitters.forEach(tx => {
        if (tx.lat !== undefined && tx.lon !== undefined && !isNaN(tx.lat) && !isNaN(tx.lon)) {
          const tLat = Number(tx.lat);
          const tLon = Number(tx.lon);
          const key = `${tLat.toFixed(5)}_${tLon.toFixed(5)}`;
          if (!txMap.has(key)) {
            txMap.set(key, { lat: tLat, lon: tLon, location: tx.location, altitude: tx.altitude, distance: tx.distance || 0, azimuth: tx.azimuth, muxData: [] });
          }
          const entry = txMap.get(key)!;
          // Add multiplex label if not already in list
          const powerStr = tx.power > 0 ? tx.power.toFixed(1) : '0';
          if (!entry.muxData.some((m: any) => m.channel === mux.channel && m.label === mux.label)) {
            entry.muxData.push({ channel: mux.channel, label: mux.label, tii: tx.tii, powerStr });
          }
        }
      });
    });

    const filteredTxMap = new Map<string, any>();
    txMap.forEach((entry, key) => {
      // Check if the TX has any of the selected multiplexes
      const hasSelectedMux = forceShowAllMuxes || entry.muxData.some((m: any) => selectedMuxKeys.has(`${m.channel}-${m.label}`));
      if (hasSelectedMux) {
         filteredTxMap.set(key, {
           ...entry,
           muxData: [...entry.muxData].sort((a: any, b: any) => sortChannels(a.channel, b.channel))
         });
         bnd.extend([entry.lat, entry.lon]);
      }
    });

    return {
      rxCoords: rxC,
      uniqueTransmitters: Array.from(filteredTxMap.values()),
      bounds: bnd
    };
  }, [stats, selectedMuxKeys, language, forceShowAllMuxes]);

  if (!rxCoords && uniqueTransmitters.length === 0) {
    return (
      <div className="h-96 bg-slate-100 dark:bg-slate-800 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700">
        <p className="text-slate-500 dark:text-slate-400">{t('noGeodata')}</p>
      </div>
    );
  }

  // Map center logic
  const center: [number, number] = rxCoords || (uniqueTransmitters.length > 0 ? [uniqueTransmitters[0].lat, uniqueTransmitters[0].lon] : [46.603354, 1.888334]); // fallback to France

  return (
    <div className="h-[500px] rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 relative z-0">
      {selectedTxForProfile && rxCoords && (
        <ElevationProfile 
          rxCoords={rxCoords} 
          txCoords={[selectedTxForProfile.lat, selectedTxForProfile.lon]} 
          location={selectedTxForProfile.location} 
          isProfileZoomed={isProfileZoomed} 
          onClose={() => {
            setSelectedTxForProfile(null);
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
      
      <div className="absolute top-4 right-4 z-[1000] flex gap-2 items-start export-hide">
         <div className="relative flex flex-col items-end">
           <button 
             onClick={() => {
               setMapPickerOpen(!mapPickerOpen);
               if (filterOpen) setFilterOpen(false);
             }} 
             className={`flex items-center justify-center w-10 h-10 rounded-lg border shadow-md font-medium text-sm transition-colors ${mapPickerOpen ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/50 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 dark:bg-[#313338] dark:border-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
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
                        name="mapType"
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

         <div className="relative flex flex-col items-end">
           <button 
             onClick={() => {
               setFilterOpen(!filterOpen);
               if (mapPickerOpen) setMapPickerOpen(false);
             }} 
             className={`flex items-center gap-2 px-3 h-10 rounded-lg border shadow-md font-medium text-sm transition-colors ${filterOpen ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/50 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 dark:bg-[#313338] dark:border-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
           >
             <Filter className="w-[18px] h-[18px]" />
             {language === 'fr' ? 'Filtrer par multiplex' : 'Filter by multiplex'}
           </button>
           
           {filterOpen && (
             <div className="absolute top-full right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white dark:bg-[#313338] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl pointer-events-auto">
             <div className="p-3 border-b border-slate-100 dark:border-slate-700/50 sticky top-0 bg-white dark:bg-[#313338] z-10">
               <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border ${selectedMuxKeys.size === sortedChannels.length ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors`}>
                    {selectedMuxKeys.size === sortedChannels.length && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={selectedMuxKeys.size === sortedChannels.length} 
                    onChange={() => {
                      if (selectedMuxKeys.size === sortedChannels.length) {
                        setSelectedMuxKeys(new Set());
                      } else {
                        setSelectedMuxKeys(new Set(sortedChannels.map(m => `${m.channel}-${m.label}`)));
                      }
                    }} 
                  />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    {language === 'fr' ? 'Afficher tous les multiplex' : 'Show all multiplexes'}
                  </span>
               </label>
             </div>
             <div className="p-2 space-y-1">
               {sortedChannels.map(mux => (
                 <label key={`${mux.channel}-${mux.label}`} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-colors group">
                    <div className={`w-5 h-5 rounded border ${selectedMuxKeys.has(`${mux.channel}-${mux.label}`) ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-blue-400'} flex items-center justify-center transition-colors shrink-0`}>
                      {selectedMuxKeys.has(`${mux.channel}-${mux.label}`) && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={selectedMuxKeys.has(`${mux.channel}-${mux.label}`)} 
                      onChange={() => {
                        setSelectedMuxKeys(prev => {
                          const next = new Set(prev);
                          const mKey = `${mux.channel}-${mux.label}`;
                          if (next.has(mKey)) next.delete(mKey);
                          else next.add(mKey);
                          return next;
                        });
                      }} 
                    />
                    <div className="text-sm text-slate-700 dark:text-slate-300 flex flex-col pt-0.5 truncate leading-tight">
                       <span className="font-medium">{mux.channel} - {mux.label}</span>
                    </div>
                 </label>
               ))}
             </div>
           </div>
         )}
        </div>
      </div>

      <MapContainer center={center} zoom={6} className="h-full w-full" ref={mapRef}>
        <MapPopupCloser />
        <MapClickHandler onUpdateStats={onUpdateStats} rxCoords={rxCoords} />
        <TileLayer
          key={mapType}
          attribution={MAP_TILES.find(t => t.id === mapType)?.attribution || ''}
          url={MAP_TILES.find(t => t.id === mapType)?.url || ''}
          crossOrigin="anonymous"
        />
        
        {rxCoords && (
          <Marker position={rxCoords} icon={rxIcon}>
            <Popup>
              <div className="font-bold">{language === 'fr' ? 'Lieu de réception' : 'Receiver Location'}</div>
            </Popup>
          </Marker>
        )}

        {uniqueTransmitters.map((tx, idx) => (
          <Marker key={idx} position={[tx.lat, tx.lon]} icon={txIcon}>
            <Popup>
              <div className="min-w-[200px] sm:min-w-[240px] relative pb-1">
                <div className="flex justify-between items-start mb-2 pr-8">
                  <div>
                    {tx.location ? (
                      <strong className="block text-slate-800 dark:text-slate-200 text-[13px] leading-tight flex items-center gap-1.5">
                         {tx.location}
                      </strong>
                    ) : (
                      <strong className="text-orange-600 dark:text-orange-500 font-bold text-[13px] leading-tight">
                        {language === 'fr' ? 'Site inconnu !' : 'Unknown site!'}
                      </strong>
                    )}
                    <div className="flex flex-col gap-0.5 mt-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {language === 'fr' 
                          ? `Distance : ${tx.distance > 0 ? tx.distance.toFixed(1) + ' km' : 'N/A'}` 
                          : `Distance: ${tx.distance > 0 ? tx.distance.toFixed(1) + ' km' : 'N/A'}`}
                      </span>
                      {(tx.altitude !== undefined && tx.altitude !== -1) || tx.azimuth !== undefined ? (
                        <span className="text-[11px] text-slate-500 font-medium">
                          {tx.altitude !== undefined && tx.altitude !== -1 ? (language === 'fr' ? `Altitude : ${Math.round(tx.altitude)}m` : `Altitude: ${Math.round(tx.altitude)}m`) : ''}
                          {tx.altitude !== undefined && tx.altitude !== -1 && tx.azimuth !== undefined ? ' - ' : ''}
                          {tx.azimuth !== undefined ? (language === 'fr' ? `Azimut : ${Math.round(tx.azimuth)}°` : `Azimuth: ${Math.round(tx.azimuth)}°`) : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {rxCoords && (
                   <button 
                     onClick={() => {
                       if (selectedTxForProfile?.lat === tx.lat && selectedTxForProfile?.lon === tx.lon) {
                         setSelectedTxForProfile(null);
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
                             rxCoords,
                             [tx.lat, tx.lon]
                           ], { padding: [50, 50] });
                         }
                         setSelectedTxForProfile({lat: tx.lat, lon: tx.lon, location: tx.location});
                       }
                     }} 
                     className={`absolute top-0 right-0 p-1.5 rounded-md transition-colors ${selectedTxForProfile?.lat === tx.lat && selectedTxForProfile?.lon === tx.lon ? 'bg-amber-200 hover:bg-amber-300 text-amber-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`} 
                     title={language === 'fr' ? "Visualiser le profil topographique" : "Visualize the elevation profile"}
                   >
                     <Mountain className="w-4 h-4" />
                   </button>
                )}
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 border-b border-slate-100 pb-1.5">
                  {tx.muxData.length > 1 
                    ? (language === 'fr' ? `Multiplex reçus` : `Multiplexes received`) 
                    : (language === 'fr' ? `Multiplex reçu` : `Multiplex received`)}
                </div>
                <ul className="text-xs m-0 pl-0 list-none space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                  {tx.muxData.map((m: any, i: number) => (
                    <li key={i} className="flex gap-2 items-center bg-slate-50 p-1.5 rounded-lg border border-slate-100 shadow-sm">
                      <span className="font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-1 rounded shadow-sm text-[11px] shrink-0">{m.channel}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 truncate text-[12px]">{m.label}</div>
                        <div className="text-[10px] text-slate-500 flex gap-2 font-medium mt-0.5">
                          <span title="TII Code">TII: <span className="text-slate-700">{m.tii}</span></span>
                          <span title={language === 'fr' ? "Puissance" : "Power"}>
                            {language === 'fr' ? `PAR: ` : `ERP: `}<span className="text-slate-700">{m.powerStr} kW</span>
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          </Marker>
        ))}

        {showLines && rxCoords && uniqueTransmitters.map((tx, idx) => (
          <Polyline 
            key={`line-${idx}`} 
            positions={[rxCoords, [tx.lat, tx.lon]]} 
            color="#3b82f6" 
            weight={3} 
            opacity={0.6}
          />
        ))}

        {selectedTxForProfile && rxCoords && !showLines && (
          <Polyline 
            positions={[rxCoords, [selectedTxForProfile.lat, selectedTxForProfile.lon]]} 
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

        {bounds.isValid() && <BoundsUpdater bounds={bounds} disabled={!!selectedTxForProfile} />}
      </MapContainer>
    </div>
  );
}
