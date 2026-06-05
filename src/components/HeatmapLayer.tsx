import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { MobilePoint } from '../types';

export function HeatmapLayer({ 
  points, 
}: { 
  points: (MobilePoint & { renderColor: string })[],
  colorMode: 'snr' | 'level'
}) {
  const map = useMap();
  
  useEffect(() => {
    const layers: any[] = [];
    
    const groups = new Map<string, [number, number, number][]>();
    
    points.forEach(p => {
      const color = p.renderColor || '#a855f7';
      if (!groups.has(color)) {
        groups.set(color, []);
      }
      groups.get(color)!.push([p.lat, p.lon, 1]); // Constant intensity
    });

    groups.forEach((pts, color) => {
      const layer = L.heatLayer(pts, { 
        radius: 20, 
        blur: 15, 
        maxZoom: 17, 
        max: 1.0,
        minOpacity: 0.3,
        gradient: {
          0.0: color, 
          0.5: color,
          1.0: color 
        }
      });
      layers.push(layer);
      map.addLayer(layer);
    });

    return () => {
      layers.forEach(layer => map.removeLayer(layer));
    };
  }, [map, points]);

  return null;
}
