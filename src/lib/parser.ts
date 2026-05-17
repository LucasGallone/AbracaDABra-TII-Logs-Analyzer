import { RawDABRow, ScanStats, Transmitter, MultiplexStat } from '../types';

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

    // Process EID (last 4 characters of the UEID value)
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
      if (tx.location) locationSet.add(tx.location);
      globalEmissionCount++;

      // Find global furthest
      if (!furthestTransmitter || tx.distance > furthestTransmitter.distance) {
        furthestTransmitter = tx;
      }

      // Find global closest (ignoring distance 0 if it's missing data)
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
