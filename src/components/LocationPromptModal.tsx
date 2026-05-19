import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { useAppContext } from '../contexts/AppContext';
import { MapPin } from 'lucide-react';
import { ScanStats } from '../types';

interface LocationPromptProps {
  onApply: (lat: number, lon: number, address?: string) => void;
  onSkip: () => void;
  stats: ScanStats;
}

function MapClickHandler({ setPos }: { setPos: (pos: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPos([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}

function MapUpdater({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) {
      map.flyTo(pos, map.getZoom());
    }
  }, [pos, map]);
  return null;
}

export function LocationPromptModal({ onApply, onSkip, stats }: LocationPromptProps) {
  const { t, language } = useAppContext();
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLon, setManualLon] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [saveLocation, setSaveLocation] = useState(false);
  const [reusedLocation, setReusedLocation] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('saved_tii_rx_coords');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 2 && !isNaN(parsed[0]) && !isNaN(parsed[1])) {
          setPos(parsed as [number, number]);
          setSaveLocation(true);
          setReusedLocation(true);
        }
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const validTx = stats.multiplexes.flatMap(m => m.transmitters).find(tx => !isNaN(tx.lat) && !isNaN(tx.lon) && tx.lat !== 0 && tx.lon !== 0);
  const center: [number, number] = validTx 
     ? [validTx.lat, validTx.lon]
     : [46.603354, 1.888334];

  useEffect(() => {
    if (pos) {
      setManualLat(pos[0].toFixed(5));
      setManualLon(pos[1].toFixed(5));
    }
  }, [pos]);

  const handleManualCoordsSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (!isNaN(lat) && !isNaN(lon)) {
      setPos([lat, lon]);
    }
  };

  const handleApply = async () => {
    if (!pos) return;
    setIsGeocoding(true);
    let addressName = undefined;
    try {
      const acceptLang = language === 'fr' ? 'fr' : 'en';
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos[0]}&lon=${pos[1]}&zoom=18&addressdetails=1&accept-language=${acceptLang}`);
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const street = addr.road || addr.pedestrian || addr.path || addr.hamlet || addr.suburb || '';
        const city = addr.city || addr.town || addr.village || addr.municipality || '';
        const country = addr.country || '';
        const parts = [street, city, country].filter(Boolean);
        addressName = parts.length > 0 ? parts.join(', ') : (data.display_name || '');
      } else if (data && data.display_name) {
        addressName = data.display_name;
      }
    } catch (e) {
      console.error(e);
    }
    setIsGeocoding(false);
    
    if (saveLocation) {
      localStorage.setItem('saved_tii_rx_coords', JSON.stringify([pos[0], pos[1]]));
    } else {
      localStorage.removeItem('saved_tii_rx_coords');
    }
    
    onApply(pos[0], pos[1], addressName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#313338] rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700/80">
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {t('locationPromptTitle')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('locationPromptDesc')}
            </p>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex-1 h-[300px] md:h-auto relative z-0">
             <MapContainer center={center} zoom={6} className="h-full w-full">
               <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
               <MapClickHandler setPos={setPos} />
               <MapUpdater pos={pos} />
               {pos && <Marker position={pos} />}
             </MapContainer>
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-4 py-2 rounded-full shadow-md border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 pointer-events-none whitespace-nowrap">
               {t('clickOnMapPin')}
             </div>
          </div>
          
          <div className="w-full md:w-80 p-6 flex flex-col gap-6 bg-white dark:bg-[#313338] border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-700/50 overflow-y-auto">
             {reusedLocation && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                   {language === 'fr' 
                     ? "Les coordonnées indiquées lors de l'import précédent ont été réutilisées. Vous pouvez les modifier pour cette session si nécessaire, et désactiver l'option de mémorisation si vous ne souhaitez plus l'utiliser pour les futurs imports." 
                     : "The GPS coordinates provided during the previous import have been reused. You can modify them for this session if necessary, and disable the save option if you no longer wish to use it for future imports."}
                </div>
             )}
             <form onSubmit={handleManualCoordsSubmit} className="flex flex-col gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('latitude')}</label>
                    <input 
                      type="number" 
                      step="any" 
                      value={manualLat}
                      onChange={e => setManualLat(e.target.value)}
                      onBlur={() => handleManualCoordsSubmit()}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 outline-none transition-colors"
                      placeholder={language === 'fr' ? "Exemple : 48.8566" : "e.g. 48.8566"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('longitude')}</label>
                    <input 
                      type="number" 
                      step="any" 
                      value={manualLon}
                      onChange={e => setManualLon(e.target.value)}
                      onBlur={() => handleManualCoordsSubmit()}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 outline-none transition-colors"
                      placeholder={language === 'fr' ? "Exemple : 2.3522" : "e.g. 2.3522"}
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2 cursor-pointer mt-1 text-sm text-slate-600 dark:text-slate-400">
                  <input type="checkbox" checked={saveLocation} onChange={e => setSaveLocation(e.target.checked)} className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs">{language === 'fr' ? 'Se souvenir de ces coordonnées pour les prochains imports' : 'Remember these coordinates for future imports'}</span>
                </label>
             </form>

             <div className="mt-auto space-y-3 pt-4">
               <button 
                 onClick={handleApply}
                 disabled={!pos || isGeocoding}
                 className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
               >
                 {isGeocoding ? (
                   <><MapPin className="w-4 h-4 animate-bounce" /> {t('locationPromptLoadingTitle')}</>
                 ) : (
                   <><MapPin className="w-4 h-4" /> {t('apply')}</>
                 )}
               </button>
               <button 
                 onClick={onSkip}
                 disabled={isGeocoding}
                 className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
               >
                 {t('locationPromptIgnore')}
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
