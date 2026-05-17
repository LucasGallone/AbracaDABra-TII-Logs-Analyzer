export interface RawDABRow {
  'Time (UTC)': string;
  Channel: string;
  'Frequency [kHz]': string;
  UEID: string;
  Label: string;
  'SNR [dB]': string;
  Main: string;
  Sub: string;
  'Level [dB]': string;
  Location: string;
  'Power [kW]': string;
  'Distance [km]': string;
  'Azimuth [deg]': string;
  'Latitude (TX)': string;
  'Longitude (TX)': string;
  'Latitude (RX)': string;
  'Longitude (RX)': string;
}

export interface Transmitter {
  label: string;
  channel: string;
  tii: string; // "Main-Sub"
  location: string;
  snr: number;
  level: number;
  power: number;
  distance: number;
  azimuth?: number;
  lat?: number;
  lon?: number;
}

export interface MultiplexStat {
  label: string;
  channel: string;
  frequency: number; // in kHz format
  eid: string;
  transmitters: Transmitter[];
  bestTransmitter: Transmitter | null;
  maxSnr: number;
}

export interface ScanStats {
  startTime: Date;
  rxLat?: number;
  rxLon?: number;
  channelCount: number;
  multiplexCount: number;
  globalTransmitterCount: number; // Unique locations
  globalEmissionCount: number; // Unique TII across all mux
  furthestTransmitter: Transmitter | null;
  closestTransmitter: Transmitter | null;
  multiplexes: MultiplexStat[];
}
