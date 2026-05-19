export const transformColumnHeader = (header: string, index?: number): string => {
  const lowerH = header.trim().toLowerCase();

  // Time column logic
  if (
    index === 0 ||
    lowerH.startsWith('time') || 
    lowerH.startsWith('čas') || 
    lowerH.startsWith('zeit') || 
    lowerH.startsWith('data\\ora') || 
    lowerH.startsWith('czas')
  ) {
    const tzMatch = header.match(/\((.+?)\)/);
    if (tzMatch) {
      return `Time (${tzMatch[1]})`;
    }
    return 'Time (UTC)';
  }

  // Pre-defined mapping
  const headerMap: Record<string, string> = {
    // Channel
    'kanál': 'Channel',
    'kanal': 'Channel',
    'canale': 'Channel',
    'kanał': 'Channel',
    'canal': 'Channel',
    'channel': 'Channel',

    // Frequency
    'frekvence [khz]': 'Frequency [kHz]',
    'frequenz [khz]': 'Frequency [kHz]',
    'frequenza [khz]': 'Frequency [kHz]',
    'częstotliwość [khz]': 'Frequency [kHz]',
    'fréquence [khz]': 'Frequency [kHz]',
    'frequency [khz]': 'Frequency [kHz]',

    // UEID
    'ueid': 'UEID',
    'identyfikator ue': 'UEID',

    // Label
    'název': 'Label',
    'label': 'Label',
    'mux': 'Label',
    'etykieta': 'Label',
    'nom': 'Label',

    // SNR 
    'snr [db]': 'SNR [dB]',

    // Main
    'main': 'Main',
    'stazione': 'Main',
    'główny': 'Main',
    'principal': 'Main',

    // Sub
    'sub': 'Sub',
    'sottostazione': 'Sub',
    'pod': 'Sub',
    'sous': 'Sub',

    // Level
    'úroveň [db]': 'Level [dB]',
    'feldstärke [db]': 'Level [dB]',
    'livello [db]': 'Level [dB]',
    'poziom [db]': 'Level [dB]',
    'niveau [db]': 'Level [dB]',
    'level [db]': 'Level [dB]',

    // Location
    'umístění': 'Location',
    'standort': 'Location',
    'postazione': 'Location',
    'lokalizacja': 'Location',
    'emplacement': 'Location',
    'location': 'Location',

    // Power
    'výkon [kw]': 'Power [kW]',
    'leistung [kw]': 'Power [kW]',
    'potenza [kw]': 'Power [kW]',
    'moc [kw]': 'Power [kW]',
    'puissance [kw]': 'Power [kW]',
    'power [kw]': 'Power [kW]',

    // Distance
    'vzdálenost [km]': 'Distance [km]',
    'entfernung [km]': 'Distance [km]',
    'distanza [km]': 'Distance [km]',
    'dystans [km]': 'Distance [km]',
    'distance [km]': 'Distance [km]',

    // Azimuth
    'azimut [°]': 'Azimuth [deg]',
    'azimut [deg]': 'Azimuth [deg]',
    'azimuth [deg]': 'Azimuth [deg]',
    'azymut [st.]': 'Azimuth [deg]',
    
    // Lat/Lon (TX)
    'zem. šířka (tx)': 'Latitude (TX)',
    'breitenkreis (tx)': 'Latitude (TX)',
    'latitudine (tx)': 'Latitude (TX)',
    'szerokość geograficzna (tx)': 'Latitude (TX)',
    'latitude (tx)': 'Latitude (TX)',
    
    'zem. délka (tx)': 'Longitude (TX)',
    'längenkreis (tx)': 'Longitude (TX)',
    'longitudine (tx)': 'Longitude (TX)',
    'długość geograficzna (tx)': 'Longitude (TX)',
    'longitude (tx)': 'Longitude (TX)',

    // Lat/Lon (RX)
    'zem. šířka (rx)': 'Latitude (RX)',
    'breitenkreis (rx)': 'Latitude (RX)',
    'latitudine (rx)': 'Latitude (RX)',
    'szerokość geograficzna (rx)': 'Latitude (RX)',
    'latitude (rx)': 'Latitude (RX)',
    
    'zem. délka (rx)': 'Longitude (RX)',
    'längenkreis (rx)': 'Longitude (RX)',
    'longitudine (rx)': 'Longitude (RX)',
    'długość geograficzna (rx)': 'Longitude (RX)',
    'longitude (rx)': 'Longitude (RX)'
  };

  if (headerMap[lowerH]) {
    return headerMap[lowerH];
  }
  
  return header;
};
