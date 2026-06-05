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
    const label = row.Label.trim();
    const channel = row.Channel.trim();
    if (!label || !channel) return;

    const latStrRX = row['Latitude (RX)']?.replace(',', '.') || '';
    const lonStrRX = row['Longitude (RX)']?.replace(',', '.') || '';
    const latRX = parseFloat(latStrRX);
    const lonRX = parseFloat(lonStrRX);
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
      const ueid = row.UEID.trim();
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
        snr: snr,
        timeMs: timeMs,
        transmitters: []
      });
    }

    const point = pointsMap.get(pointKey)!;
    
    if (snr > point.snr) {
      point.snr = snr;
    }

    const mainStr = row.Main.trim().padStart(2, '0');
    const subStr = row.Sub.trim().padStart(2, '0');
    if (mainStr === '00' && subStr === '00') return;
    const tii = `${mainStr}-${subStr}`;

    const levelStr = row['Level [dB]']?.replace(',', '.') || '';
    const levelVal = parseFloat(levelStr);
    const level = isNaN(levelVal) ? -Infinity : levelVal;

    const location = row.Location.trim();
    const power = parseFloat(row['Power [kW]']?.replace(',', '.')) || 0;
    const distance = parseFloat(row['Distance [km]']?.replace(',', '.')) || 0;

    const latStrTX = row['Latitude (TX)']?.replace(',', '.') || '';
    const lonStrTX = row['Longitude (TX)']?.replace(',', '.') || '';
    const latTX = parseFloat(latStrTX);
    const lonTX = parseFloat(lonStrTX);

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
        lon: (!isNaN(lonTX) && lonTX !== 0) ? lonTX : undefined
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

  const processTransmitter = (tx: { lat?: number, lon?: number }) => {
    if (tx.lat !== undefined && tx.lon !== undefined) {
      const id = `${tx.lat},${tx.lon}`;
      if (!coordsElevMap.has(id)) {
        coordsElevMap.set(id, -1);
        coords.push({ lat: tx.lat, lon: tx.lon, id });
      }
    }
  };

  if (isMobile) {
    (stats as MobileScanStats).multiplexes.forEach(m => m.transmitters.forEach(processTransmitter));
  } else {
    (stats as ScanStats).multiplexes.forEach(m => m.transmitters.forEach(processTransmitter));
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

  const applyAltitude = (tx: { lat?: number, lon?: number, altitude?: number }) => {
    if (tx.lat !== undefined && tx.lon !== undefined) {
      const elev = coordsElevMap.get(`${tx.lat},${tx.lon}`);
      if (elev !== undefined && elev !== -1) {
        tx.altitude = elev;
      }
    }
  };

  if (isMobile) {
    (stats as MobileScanStats).multiplexes.forEach(m => m.transmitters.forEach(applyAltitude));
  } else {
    (stats as ScanStats).multiplexes.forEach(m => m.transmitters.forEach(applyAltitude));
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

  for (const row of validData) {
    if (row['Latitude (RX)'] && row['Longitude (RX)']) {
      const lat = parseFloat(row['Latitude (RX)'].replace(',', '.'));
      const lon = parseFloat(row['Longitude (RX)'].replace(',', '.'));
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        rxLat = lat;
        rxLon = lon;
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
    const label = row.Label.trim();
    const channel = row.Channel.trim();
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
      const ueid = row.UEID.trim();
      muxEidMap.set(muxKey, ueid.substring(ueid.length - 4));
    }

    const tiiMap = muxMap.get(muxKey)!;
    const mainStr = row.Main.trim().padStart(2, '0');
    const subStr = row.Sub.trim().padStart(2, '0');
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
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    // Track SNR for min/max
    if (!isNaN(snr)) {
      muxSnrMap.get(muxKey)!.push(snr);
    }

    const existingTx = tiiMap.get(tii);

    // Keep the one with the highest Level
    if (!existingTx || level > existingTx.level) {
      tiiMap.set(tii, {
        label,
        channel,
        tii,
        location: row.Location.trim(),
        snr,
        level,
        power,
        distance,
        azimuth: hasAzimuth ? azimuth : undefined,
        lat: !isNaN(lat) && lat !== 0 ? lat : undefined,
        lon: !isNaN(lon) && lon !== 0 ? lon : undefined
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
    channelCount: channelSet.size,
    multiplexCount: multiplexes.length, // Multiplexes per channel
    globalTransmitterCount: locationSet.size, // Unique physical locations
    globalEmissionCount, // Total TIIs decoded
    furthestTransmitter,
    closestTransmitter,
    multiplexes
  };
}