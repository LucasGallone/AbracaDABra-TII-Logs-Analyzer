import { RawDABRow, ScanStats, Transmitter, MultiplexStat, MobileScanStats, MobileMultiplexStat, MobilePoint, MobilePointTransmitter, MobileTransmitterStat } from '../types';

export function parseMobileDABData(data: RawDABRow[]): MobileScanStats | null {
  if (!data || data.length === 0) return null;

  const validData = data.filter(r => r.Label && r.Main && r.Sub);
  if (validData.length === 0) return null;

  let dates: number[] = [];
  let startTime = new Date();
  const timeKey = Object.keys(validData[0]).find(k => k.startsWith('Time')) || 'Time (UTC)';

  let timeZoneStr: string | undefined = undefined;
  if (timeKey) {
    const tzMatch = timeKey.trim().match(/^Time \((.+?)\)$/);
    if (tzMatch && tzMatch[1]) {
      const tz = tzMatch[1];
      if (/^[A-Z]{3,4}$/.test(tz)) {
        timeZoneStr = `[${tz}]`;
      }
    }
  }
  
  // Sort data chronologically to support combination of multiple CSV files
  validData.sort((a, b) => {
    const timeA = new Date(a[timeKey]).getTime();
    const timeB = new Date(b[timeKey]).getTime();
    if (isNaN(timeA) || isNaN(timeB)) return 0;
    return timeA - timeB;
  });

  dates = validData.map(r => new Date(r[timeKey]).getTime()).filter(t => !isNaN(t));
  if (dates.length > 0) {
    startTime = new Date(Math.min(...dates));
  }

  const muxPointsMap = new Map<string, Map<string, MobilePoint>>();
  const muxEidMap = new Map<string, string>();
  const muxFreqMap = new Map<string, number>();
  const muxDetailsMap = new Map<string, { channel: string, label: string }>();

  validData.forEach(row => {
    const label = row.Label?.trim() || '';
    const channel = row.Channel?.trim() || '';
    if (!label || !channel) return;

    const latStrRX = row['Latitude (RX)']?.replace(',', '.') || '';
    const lonStrRX = row['Longitude (RX)']?.replace(',', '.') || '';
    const altStrRX = row['Altitude (RX)']?.replace(',', '.') || '';
    const latRX = parseFloat(latStrRX);
    const lonRX = parseFloat(lonStrRX);
    const altRX = parseFloat(altStrRX);
    if (isNaN(latRX) || isNaN(lonRX) || latRX === 0 || lonRX === 0) return;

    const muxKey = `${channel}_${label}`;
    if (!muxPointsMap.has(muxKey)) {
      muxPointsMap.set(muxKey, new Map());
      muxDetailsMap.set(muxKey, { channel, label });
    }

    if (!muxFreqMap.has(muxKey) && row['Frequency [kHz]']) {
      const freq = parseFloat(row['Frequency [kHz]'].replace(',', '.'));
      if (!isNaN(freq)) {
        muxFreqMap.set(muxKey, freq);
      }
    }

    if (!muxEidMap.has(muxKey) && row.UEID) {
      const ueid = row.UEID?.trim() || '';
      muxEidMap.set(muxKey, ueid.substring(ueid.length - 4));
    }

    const pointKey = `${latRX}_${lonRX}`;
    const pointsMap = muxPointsMap.get(muxKey)!;
    
    const snrStr = row['SNR [dB]']?.replace(',', '.') || '';
    const snr = parseFloat(snrStr) || 0;

    const timeStr = row[timeKey];
    let timeMs: number | undefined = undefined;
    if (timeStr) {
      const parsedTime = new Date(timeStr).getTime();
      if (!isNaN(parsedTime)) timeMs = parsedTime;
    }

    if (!pointsMap.has(pointKey)) {
      pointsMap.set(pointKey, {
        lat: latRX,
        lon: lonRX,
        altitude: !isNaN(altRX) ? altRX : undefined,
        snr: snr,
        timeMs: timeMs,
        transmitters: []
      });
    }

    const point = pointsMap.get(pointKey)!;
    
    if (snr > point.snr) {
      point.snr = snr;
    }

    const mainStr = (row.Main?.trim() || '').padStart(2, '0');
    const subStr = (row.Sub?.trim() || '').padStart(2, '0');
    if (mainStr === '00' && subStr === '00') return;
    const tii = `${mainStr}-${subStr}`;

    const levelStr = row['Level [dB]']?.replace(',', '.') || '';
    const levelVal = parseFloat(levelStr);
    const level = isNaN(levelVal) ? -Infinity : levelVal;

    const location = row.Location?.trim() || '';
    const power = parseFloat(row['Power [kW]']?.replace(',', '.')) || 0;
    const distance = parseFloat(row['Distance [km]']?.replace(',', '.')) || 0;

    const latStrTX = row['Latitude (TX)']?.replace(',', '.') || '';
    const lonStrTX = row['Longitude (TX)']?.replace(',', '.') || '';
    const altStrTX = row['Altitude (TX)']?.replace(',', '.') || '';
    const antStrTX = row['Antenna Height (TX)']?.replace(',', '.') || '';
    const latTX = parseFloat(latStrTX);
    const lonTX = parseFloat(lonStrTX);
    const altTX = parseFloat(altStrTX);
    const antTX = parseFloat(antStrTX);

    // Add transmitter to point if not already there, or update if level is higher
    const existingTx = point.transmitters.find(t => t.tii === tii);
    if (!existingTx) {
      point.transmitters.push({
        tii,
        location,
        level,
        power,
        distance,
        lat: (!isNaN(latTX) && latTX !== 0) ? latTX : undefined,
        lon: (!isNaN(lonTX) && lonTX !== 0) ? lonTX : undefined,
        altitude: !isNaN(altTX) ? altTX : undefined,
        antennaHeight: !isNaN(antTX) ? antTX : undefined
      });
    } else if (level > existingTx.level) {
      existingTx.level = level;
      existingTx.distance = distance;
    }
  });

  const multiplexes: MobileMultiplexStat[] = [];
  let channelSet = new Set<string>();

  for (const [muxKey, pointsMap] of muxPointsMap.entries()) {
    const points = Array.from(pointsMap.values());
    if (points.length === 0) continue;

    const details = muxDetailsMap.get(muxKey)!;
    channelSet.add(details.channel);

    let maxSnr = 0;
    const txStatsMap = new Map<string, MobileTransmitterStat>();

    points.forEach(p => {
      if (p.snr > maxSnr) maxSnr = p.snr;

      p.transmitters.forEach(tx => {
        if (!txStatsMap.has(tx.tii)) {
          txStatsMap.set(tx.tii, {
            tii: tx.tii,
            location: tx.location,
            power: tx.power,
            lat: tx.lat,
            lon: tx.lon,
            altitude: tx.altitude,
            antennaHeight: tx.antennaHeight,
            pointCount: 0,
            minLevel: Infinity,
            maxLevel: -Infinity,
            minDistance: Infinity,
            maxDistance: -Infinity
          });
        }
        
        const stat = txStatsMap.get(tx.tii)!;
        stat.pointCount++;
        if (tx.level !== -Infinity && tx.level < stat.minLevel) stat.minLevel = tx.level;
        if (tx.level > stat.maxLevel) stat.maxLevel = tx.level;
        if (tx.distance > 0 && tx.distance < stat.minDistance) stat.minDistance = tx.distance;
        if (tx.distance > stat.maxDistance) stat.maxDistance = tx.distance;
      });
    });

    const transmitters = Array.from(txStatsMap.values());
    transmitters.forEach(t => {
      if (t.minLevel === Infinity) t.minLevel = 0;
      if (t.maxLevel === -Infinity) t.maxLevel = 0;
      if (t.minDistance === Infinity) t.minDistance = 0;
      if (t.maxDistance === -Infinity) t.maxDistance = 0;
    });

    transmitters.sort((a, b) => b.maxLevel - a.maxLevel);

    multiplexes.push({
      label: details.label,
      channel: details.channel,
      frequency: muxFreqMap.get(muxKey) || 0,
      eid: muxEidMap.get(muxKey) || '',
      points,
      transmitters,
      maxSnr
    });
  }

  multiplexes.sort((a, b) => {
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

  return {
    startTime,
    timeZoneStr,
    channelCount: channelSet.size,
    multiplexCount: multiplexes.length,
    multiplexes
  };
}

export async function enrichWithAltitudes(stats: ScanStats | MobileScanStats, isMobile: boolean): Promise<void> {
  const coords: { lat: number, lon: number, id: string }[] = [];
  const coordsElevMap = new Map<string, number>();

  const processCoord = (item: { lat?: number, lon?: number, altitude?: number }) => {
    if (item.lat !== undefined && item.lon !== undefined && item.altitude === undefined) {
      const id = `${item.lat},${item.lon}`;
      if (!coordsElevMap.has(id)) {
        coordsElevMap.set(id, -1);
        coords.push({ lat: item.lat, lon: item.lon, id });
      }
    }
  };

  if (isMobile) {
    (stats as MobileScanStats).multiplexes.forEach(m => {
      m.points.forEach(processCoord);
      m.transmitters.forEach(processCoord);
    });
  } else {
    const s = stats as ScanStats;
    if (s.rxLat !== undefined && s.rxLon !== undefined) {
      processCoord({ lat: s.rxLat, lon: s.rxLon, altitude: s.rxAltitude });
    }
    s.multiplexes.forEach(m => m.transmitters.forEach(processCoord));
  }

  if (coords.length === 0) return;

  for (let i = 0; i < coords.length; i += 100) {
    const chunk = coords.slice(i, i + 100);
    const lats = chunk.map(c => c.lat).join(',');
    const lons = chunk.map(c => c.lon).join(',');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); 
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) continue;
      
      const data = await res.json();
      if (data && Array.isArray(data.elevation)) {
        chunk.forEach((coord, idx) => {
          const elev = data.elevation[idx];
          if (typeof elev === 'number') {
            coordsElevMap.set(coord.id, elev);
          }
        });
      }
    } catch (e) {
      console.error('Failed to fetch altitude', e);
    }
  }

  const applyAltitude = (item: { lat?: number, lon?: number, altitude?: number }) => {
    if (item.lat !== undefined && item.lon !== undefined && item.altitude === undefined) {
      const elev = coordsElevMap.get(`${item.lat},${item.lon}`);
      if (elev !== undefined && elev !== -1) {
        item.altitude = elev;
      }
    }
  };

  if (isMobile) {
    (stats as MobileScanStats).multiplexes.forEach(m => {
      m.points.forEach(applyAltitude);
      m.transmitters.forEach(applyAltitude);
    });
  } else {
    const s = stats as ScanStats;
    if (s.rxLat !== undefined && s.rxLon !== undefined) {
      applyAltitude({
        lat: s.rxLat,
        lon: s.rxLon,
        get altitude() { return s.rxAltitude; },
        set altitude(v) { s.rxAltitude = v; }
      });
    }
    s.multiplexes.forEach(m => m.transmitters.forEach(applyAltitude));
  }
}

export function parseDABData(data: RawDABRow[]): ScanStats | null {
  if (!data || data.length === 0) return null;

  // Filter out invalid rows
  const validData = data.filter(r => r.Label && r.Main && r.Sub);
  if (validData.length === 0) return null;

  // 1. Determine Start Time and receiver coordinates
  let dates: number[] = [];
  let startTime = new Date();

  // Find the exact name of the Time column
  const timeKey = Object.keys(validData[0]).find(k => k.startsWith('Time')) || 'Time (UTC)';

  let timeZoneStr: string | undefined = undefined;
  if (timeKey) {
    const tzMatch = timeKey.trim().match(/^Time \((.+?)\)$/);
    if (tzMatch && tzMatch[1]) {
      const tz = tzMatch[1];
      if (/^[A-Z]{3,4}$/.test(tz)) {
        timeZoneStr = `[${tz}]`;
      }
    }

    dates = validData.map(r => new Date(r[timeKey]).getTime()).filter(t => !isNaN(t));
    if (dates.length > 0) {
      startTime = new Date(Math.min(...dates));
    }
  }

  let rxLat: number | undefined = undefined;
  let rxLon: number | undefined = undefined;
  let rxAltitude: number | undefined = undefined;

  for (const row of validData) {
    if (row['Latitude (RX)'] && row['Longitude (RX)']) {
      const lat = parseFloat(row['Latitude (RX)'].replace(',', '.'));
      const lon = parseFloat(row['Longitude (RX)'].replace(',', '.'));
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        rxLat = lat;
        rxLon = lon;
        if (row['Altitude (RX)']) {
          const alt = parseFloat(row['Altitude (RX)'].replace(',', '.'));
          if (!isNaN(alt)) rxAltitude = alt;
        }
        break; // Take first valid coordinate
      }
    }
  }

  // 2. Groupings: Group by Channel + Label to handle same multiplex on multiple channels
  const muxMap = new Map<string, Map<string, Transmitter>>();
  const muxEidMap = new Map<string, string>();
  const muxFreqMap = new Map<string, number>();
  const muxSnrMap = new Map<string, number[]>();
  const muxDetailsMap = new Map<string, { channel: string, label: string }>();

  validData.forEach(row => {
    const label = row.Label?.trim() || '';
    const channel = row.Channel?.trim() || '';
    if (!label || !channel) return;

    const muxKey = `${channel}_${label}`;

    if (!muxMap.has(muxKey)) {
      muxMap.set(muxKey, new Map());
      muxSnrMap.set(muxKey, []);
      muxDetailsMap.set(muxKey, { channel, label });
    }

    if (!muxFreqMap.has(muxKey) && row['Frequency [kHz]']) {
      const freq = parseFloat(row['Frequency [kHz]'].replace(',', '.'));
      if (!isNaN(freq)) {
        muxFreqMap.set(muxKey, freq);
      }
    }

    // Process EID
    if (!muxEidMap.has(muxKey) && row.UEID) {
      const ueid = row.UEID?.trim() || '';
      muxEidMap.set(muxKey, ueid.substring(ueid.length - 4));
    }

    const tiiMap = muxMap.get(muxKey)!;
    const mainStr = (row.Main?.trim() || '').padStart(2, '0');
    const subStr = (row.Sub?.trim() || '').padStart(2, '0');
    const tii = `${mainStr}-${subStr}`;
    
    // Parse numeric values, with safe fallbacks
    const snrStr = row['SNR [dB]']?.replace(',', '.') || '';
    const levelStr = row['Level [dB]']?.replace(',', '.') || '';
    const powStr = row['Power [kW]']?.replace(',', '.') || '';
    const distStr = row['Distance [km]']?.replace(',', '.') || '';
    const azStr = row['Azimuth [deg]']?.replace(',', '.') || '';

    const snr = parseFloat(snrStr) || 0;
    const levelVal = parseFloat(levelStr);
    const level = isNaN(levelVal) ? -Infinity : levelVal;
    
    const power = parseFloat(powStr) || 0;
    const distance = parseFloat(distStr) || 0;
    const azimuth = parseFloat(azStr);
    const hasAzimuth = !isNaN(azimuth);
    
    const latStr = row['Latitude (TX)']?.replace(',', '.') || '';
    const lonStr = row['Longitude (TX)']?.replace(',', '.') || '';
    const altStrTX = row['Altitude (TX)']?.replace(',', '.') || '';
    const antStrTX = row['Antenna Height (TX)']?.replace(',', '.') || '';
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    const altTX = parseFloat(altStrTX);
    const antTX = parseFloat(antStrTX);

    // Track SNR for min/max
    if (!isNaN(snr)) {
      muxSnrMap.get(muxKey)!.push(snr);
    }

    const existingTx = tiiMap.get(tii);

    const hasCoords = !isNaN(lat) && lat !== 0 && !isNaN(lon) && lon !== 0;
    let txLat = hasCoords ? lat : undefined;
    let txLon = hasCoords ? lon : undefined;
    let isEstimated = false;

    if (!hasCoords && rxLat !== undefined && rxLon !== undefined && distance > 0 && hasAzimuth) {
      const dest = calculateDestinationPoint(rxLat, rxLon, distance, azimuth);
      txLat = dest.lat;
      txLon = dest.lon;
      isEstimated = true;
    }

    // Keep the one with the highest Level
    if (!existingTx || level > existingTx.level) {
      tiiMap.set(tii, {
        label,
        channel,
        tii,
        location: row.Location?.trim() || '',
        snr,
        level,
        power,
        distance,
        azimuth: hasAzimuth ? azimuth : undefined,
        lat: txLat,
        lon: txLon,
        altitude: !isNaN(altTX) ? altTX : undefined,
        antennaHeight: !isNaN(antTX) ? antTX : undefined,
        isEstimated
      });
    }
  });

  // 3. Compile stats
  let channelSet = new Set<string>();
  let locationSet = new Set<string>();
  let globalEmissionCount = 0;
  
  let furthestTransmitter: Transmitter | null = null;
  let closestTransmitter: Transmitter | null = null;

  const multiplexes: MultiplexStat[] = [];

  for (const [muxKey, txMap] of muxMap.entries()) {
    const transmitters = Array.from(txMap.values());
    if (transmitters.length === 0) continue;

    const details = muxDetailsMap.get(muxKey)!;
    
    // Sort transmitters from strongest to weakest Level
    transmitters.sort((a, b) => b.level - a.level);
    
    const bestTransmitter = transmitters[0] || null;

    transmitters.forEach(tx => {
      channelSet.add(tx.channel);
      if (tx.location) {
        locationSet.add(tx.location);
      } else {
        locationSet.add(`unknown_${tx.tii}`);
      }
      globalEmissionCount++;

      // Find global furthest
      if (!furthestTransmitter || tx.distance > furthestTransmitter.distance) {
        furthestTransmitter = tx;
      }

      // Find global closest
      if (tx.distance > 0) {
        if (!closestTransmitter || tx.distance < closestTransmitter.distance) {
          closestTransmitter = tx;
        }
      }
    });

    const snrs = muxSnrMap.get(muxKey) || [];
    const maxSnr = snrs.length > 0 ? Math.max(...snrs) : 0;

    multiplexes.push({
      label: details.label,
      channel: details.channel,
      frequency: muxFreqMap.get(muxKey) || 0,
      eid: muxEidMap.get(muxKey) || '',
      transmitters,
      bestTransmitter,
      maxSnr
    });
  }

  // Sort multiplexes by channel number and letter
  multiplexes.sort((a, b) => {
    const aMatch = a.channel.match(/(\d+)([a-zA-Z]*)/);
    const bMatch = b.channel.match(/(\d+)([a-zA-Z]*)/);
    
    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1], 10);
      const bNum = parseInt(bMatch[1], 10);
      
      if (aNum !== bNum) return aNum - bNum;
      
      // If numbers match, compare the letters
      return (aMatch[2] || '').localeCompare(bMatch[2] || '');
    }
    
    // Fallback to basic string sort if format is unexpected
    return a.channel.localeCompare(b.channel);
  });

  return {
    startTime,
    timeZoneStr,
    rxLat,
    rxLon,
    rxAltitude,
    channelCount: channelSet.size,
    multiplexCount: multiplexes.length, // Multiplexes per channel
    globalTransmitterCount: locationSet.size, // Unique physical locations
    globalEmissionCount, // Total TIIs decoded
    furthestTransmitter,
    closestTransmitter,
    multiplexes
  };
}

/**
 * Calculates destination coordinates given starting point, distance (km) and bearing/azimuth (degrees).
 */
export function calculateDestinationPoint(
  lat1: number,
  lon1: number,
  distanceKm: number,
  azimuthDeg: number
): { lat: number; lon: number } {
  const R = 6371; // Earth's mean radius in kilometers
  const delta = distanceKm / R; // Angular distance in radians
  const theta = (azimuthDeg * Math.PI) / 180; // Bearing in radians
  const phi1 = (lat1 * Math.PI) / 180; // Latitude in radians
  const lambda1 = (lon1 * Math.PI) / 180; // Longitude in radians

  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  // Normalize longitude to -180 .. +180
  const lon2 = (((lambda2 * 180) / Math.PI + 540) % 360) - 180;
  const lat2 = (phi2 * 180) / Math.PI;

  return {
    lat: Number(lat2.toFixed(6)),
    lon: Number(lon2.toFixed(6))
  };
}

/**
 * Applies receiver coordinates to scan stats and calculates transmitter coordinates
 * if they are missing but distance and azimuth are available.
 */
export function applyRxCoordinates(
  stats: ScanStats,
  rxLat: number,
  rxLon: number,
  rxLocationName?: string
): ScanStats {
  const updatedMultiplexes = stats.multiplexes.map(mux => {
    let bestTransmitter: Transmitter | null = null;
    const transmitters = mux.transmitters.map(tx => {
      const needsCalculation = (tx.lat === undefined || tx.lon === undefined || tx.lat === 0 || tx.lon === 0 || tx.isEstimated);
      if (needsCalculation && tx.distance > 0 && tx.azimuth !== undefined && !isNaN(tx.azimuth)) {
        const dest = calculateDestinationPoint(rxLat, rxLon, tx.distance, tx.azimuth);
        return {
          ...tx,
          lat: dest.lat,
          lon: dest.lon,
          isEstimated: true
        };
      }
      return tx;
    });

    if (mux.bestTransmitter) {
      bestTransmitter = transmitters.find(t => t.tii === mux.bestTransmitter!.tii) || mux.bestTransmitter;
    }

    return {
      ...mux,
      transmitters,
      bestTransmitter
    };
  });

  let furthestTransmitter = stats.furthestTransmitter;
  let closestTransmitter = stats.closestTransmitter;

  if (furthestTransmitter) {
    const match = updatedMultiplexes.flatMap(m => m.transmitters).find(t => t.tii === furthestTransmitter!.tii && t.channel === furthestTransmitter!.channel);
    if (match) furthestTransmitter = match;
  }
  if (closestTransmitter) {
    const match = updatedMultiplexes.flatMap(m => m.transmitters).find(t => t.tii === closestTransmitter!.tii && t.channel === closestTransmitter!.channel);
    if (match) closestTransmitter = match;
  }

  return {
    ...stats,
    rxLat,
    rxLon,
    rxLocationName: rxLocationName !== undefined ? rxLocationName : stats.rxLocationName,
    multiplexes: updatedMultiplexes,
    furthestTransmitter,
    closestTransmitter
  };
}