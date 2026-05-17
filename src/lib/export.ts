import { ScanStats } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Language, translations } from '../i18n';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

export function generateTXT(stats: ScanStats, language: Language, includeLocation: boolean = true, locationName: string | null = null, notes: string = '') {
  const t = (key: keyof typeof translations.fr) => translations[language][key];
  const dateLocale = language === 'fr' ? fr : enUS;
  const dateFormat = language === 'fr' ? "dd/MM/yyyy 'à' HH'h'mm" : "dd/MM/yyyy 'at' HH:mm";
  const formattedDate = format(stats.startTime, dateFormat, { locale: dateLocale });

  const lines: string[] = [];
  lines.push(`--- ${t('reportTitle')} ---`);
  lines.push(`${t('scanStart')} ${formattedDate}`);
  if (includeLocation && stats.rxLat !== undefined && stats.rxLon !== undefined) {
    const locStr = locationName ? `${locationName} (${stats.rxLat.toFixed(5)}, ${stats.rxLon.toFixed(5)})` : `${stats.rxLat.toFixed(5)}, ${stats.rxLon.toFixed(5)}`;
    lines.push(language === 'fr' ? `Lieu de réception : ${locStr}` : `Receiver location: ${locStr}`);
  }
  if (notes) {
    lines.push('');
    lines.push(`${language === 'fr' ? 'Notes :' : 'Notes:'}`);
    lines.push(notes);
  }
  lines.push('');
  lines.push(language === 'fr' ? `[Nombre de canaux reçus : ${stats.channelCount}]` : `[Channels received: ${stats.channelCount}]`);
  lines.push(language === 'fr' ? `[Nombre de multiplex reçus : ${stats.multiplexCount}]` : `[Multiplexes received: ${stats.multiplexCount}]`);
  lines.push(language === 'fr' ? `[Nombre d'émetteurs reçus : ${stats.globalTransmitterCount}]` : `[Transmitters received: ${stats.globalTransmitterCount}]`);
  lines.push(language === 'fr' ? `[Codes TII détectés : ${stats.globalEmissionCount}]` : `[TII codes detected: ${stats.globalEmissionCount}]`);
  lines.push('');

  if (stats.furthestTransmitter) {
    lines.push(`* ${t('furthestTx').toUpperCase()} *`);
    lines.push(`  ${stats.furthestTransmitter.location} (${stats.furthestTransmitter.distance.toFixed(1)} km)`);
    lines.push('');
  }

  if (stats.closestTransmitter) {
    lines.push(`* ${t('closestTx').toUpperCase()} *`);
    lines.push(`  ${stats.closestTransmitter.location} (${stats.closestTransmitter.distance.toFixed(1)} km)`);
    lines.push('');
  }

  lines.push(`--- ${t('muxDetail').toUpperCase()} ---`);
  stats.multiplexes.forEach(mux => {
    lines.push('');
    lines.push(`>> ${mux.channel} - ${mux.label} (${t('eid')} ${mux.eid})`);
    lines.push(`   ${t('maxSnr')}${language === 'fr' ? ' :' : ':'} ${mux.maxSnr.toFixed(1)} dB`);
    lines.push(`   ${mux.transmitters.length === 1 ? t('receivedTxSingular') : t('receivedTxPlural')}:`);
    
    mux.transmitters.forEach(tx => {
      const unknownTxStr = language === 'fr' ? '[Site inconnu]' : '[Unknown site]';
      lines.push(`     - [${tx.tii}] ${tx.location || unknownTxStr} (${t('distance')}: ${tx.distance.toFixed(1)} km, ${t('power')}: ${tx.power.toFixed(1)} kW) -> ${tx.level.toFixed(1)} dB`);
    });

    if (mux.bestTransmitter) {
      const unknownTxStr = language === 'fr' ? '[Site inconnu]' : '[Unknown site]';
      lines.push(`   > ${t('bestTx')}: ${mux.bestTransmitter.location || unknownTxStr} (${mux.bestTransmitter.level.toFixed(1)})`);
    }
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scan_report_${format(stats.startTime, 'yyyyMMdd_HHmm')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generatePDF(stats: ScanStats, language: Language, mapImg?: { url: string, ratio: number }, includeLocation: boolean = true, locationName: string | null = null, notes: string = '') {
  const t = (key: keyof typeof translations.fr) => translations[language][key];
  const dateLocale = language === 'fr' ? fr : enUS;
  const dateFormat = language === 'fr' ? "dd/MM/yyyy 'à' HH'h'mm" : "dd/MM/yyyy 'at' HH:mm";
  const formattedDate = format(stats.startTime, dateFormat, { locale: dateLocale });

  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text(t('reportTitle'), 14, 20);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${t('scanStart')} ${formattedDate}`, 14, 28);
  
  let currentYBase = 35;
  if (includeLocation && stats.rxLat !== undefined && stats.rxLon !== undefined) {
     const locStr = locationName ? `${locationName} (${stats.rxLat.toFixed(5)}, ${stats.rxLon.toFixed(5)})` : `${stats.rxLat.toFixed(5)}, ${stats.rxLon.toFixed(5)}`;
     doc.text(language === 'fr' ? `Lieu de réception : ${locStr}` : `Receiver location: ${locStr}`, 14, 34);
     currentYBase = 42;
  }
  
  if (notes) {
     doc.setFontSize(10);
     doc.setTextColor(100);
     const splitNotes = doc.splitTextToSize(`${language === 'fr' ? 'Notes :' : 'Notes:'} ${notes}`, 180);
     doc.text(splitNotes, 14, currentYBase - 2);
     currentYBase += (splitNotes.length * 5) + 2;
  }

  // Global Stats
  autoTable(doc, {
    startY: currentYBase,
    head: [[t('channelsReceived'), t('multiplexReceived'), t('uniqueSites'), t('emissionsDetected')]],
    body: [[
      stats.channelCount.toString(),
      stats.multiplexCount.toString(),
      stats.globalTransmitterCount.toString(),
      stats.globalEmissionCount.toString()
    ]],
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] }
  });

  // Highlights
  let currentY = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setFontSize(14);
  doc.setTextColor(40);
  
  if (stats.furthestTransmitter) {
    doc.text(t('furthestTx'), 14, currentY);
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text(`${stats.furthestTransmitter.location} - ${stats.furthestTransmitter.distance.toFixed(1)} km`, 14, currentY + 6);
    currentY += 16;
  }

  if (stats.closestTransmitter) {
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text(t('closestTx'), 14, currentY);
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text(`${stats.closestTransmitter.location} - ${stats.closestTransmitter.distance.toFixed(1)} km`, 14, currentY + 6);
    currentY += 16;
  }

  // Add the Maximum SNR Chart
  if (stats.multiplexes.length > 0) {
    // Separation before chart
    currentY += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, currentY, 196, currentY);
    currentY += 10;

    // Check if we need a new page
    if (currentY + 10 > 280) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text(t('maxSnrChart'), 14, currentY);
    currentY += 8;

    const MAX_SNR = 32.0;
    const sortedForChart = [...stats.multiplexes].sort((a, b) => a.frequency - b.frequency);

    sortedForChart.forEach(mux => {
        if (currentY > 275) {
            doc.addPage();
            currentY = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(mux.channel, 14, currentY);
        
        let label = mux.label;
        if (label.length > 25) {
            label = label.substring(0, 22) + '...';
        }
        doc.text(label, 26, currentY);

        // Draw bar
        const barStartX = 80;
        const barMaxWidth = 90;
        const barHeight = 4;
        const barY = currentY - 3.5;
        
        // Background bar
        doc.setFillColor(235, 235, 235);
        doc.rect(barStartX, barY, barMaxWidth, barHeight, 'F');
        
        // Colored bar
        const widthPercent = Math.min((mux.maxSnr / MAX_SNR) * 100, 100);
        const barWidth = (widthPercent / 100) * barMaxWidth;
        
        if (mux.maxSnr < 7.0) {
            doc.setFillColor(239, 68, 68); // red-500
        } else if (mux.maxSnr < 10.0) {
            doc.setFillColor(249, 115, 22); // orange-500
        } else {
            doc.setFillColor(34, 197, 94); // green-500
        }
        
        if (barWidth > 0) {
            doc.rect(barStartX, barY, barWidth, barHeight, 'F');
        }

        // Text value
        doc.setTextColor(80);
        const snrText = `${mux.maxSnr.toFixed(1)} dB`;
        doc.text(snrText, barStartX + barMaxWidth + 4, currentY);

        currentY += 6;
    });

    currentY += 5;
  }

  if (mapImg) {
    // Separation before map
    currentY += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, currentY, 196, currentY);
    currentY += 10;

    // Check if we need a new page for map
    if (currentY + 100 > 280) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text(t('receptionMap'), 14, currentY);
    
    // Auto scale map image
    // Map width on A4 (210mm wide, 14 left, 14 right -> 182 max width)
    const maxWidth = 182;
    const imgRatio = mapImg.ratio;
    doc.addImage(mapImg.url, 'JPEG', 14, currentY + 5, maxWidth, maxWidth * imgRatio);
    currentY += (maxWidth * imgRatio) + 15;
  }

  // Multiplexes
  doc.addPage();
  currentY = 20;
  doc.setFontSize(16);
  doc.setTextColor(40);
  doc.text(t('muxDetail'), 14, currentY);
  currentY += 10;

  stats.multiplexes.forEach(mux => {
    // Check if we need a new page
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(13);
    doc.setTextColor(41, 128, 185);
    doc.text(`[${mux.channel}] ${mux.label}`, 14, currentY);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${t('eid')} ${mux.eid} | ${t('maxSnr')}${language === 'fr' ? ' :' : ':'} ${mux.maxSnr.toFixed(1)} dB`, 14, currentY + 5);
    
    currentY += 10;

    const tableData = mux.transmitters.map(tx => {
      let locationText = tx.location || (language === 'fr' ? '[Site inconnu]' : '[Unknown site]');
      if (mux.transmitters.length > 1 && mux.bestTransmitter?.tii === tx.tii) {
        locationText = `• ${locationText}`;
      }
      return [
        tx.tii,
        locationText,
        `${tx.distance.toFixed(1)} km`,
        `${tx.power.toFixed(1)} kW`,
        `${tx.level.toFixed(1)} dB`
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['TII', language === 'fr' ? "Site d'émission" : "Transmitter Site", t('distance'), t('power'), language === 'fr' ? 'Niveau' : 'Level']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
      margin: { left: 14 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1 && mux.transmitters.length > 1 && mux.bestTransmitter?.tii === data.row.raw[0]) {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;
  });

  doc.save(`scan_report_${format(stats.startTime, 'yyyyMMdd_HHmm')}.pdf`);
}
