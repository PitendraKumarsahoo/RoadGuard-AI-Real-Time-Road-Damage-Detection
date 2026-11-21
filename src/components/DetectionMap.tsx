import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { ConfirmedDetectionRecord } from '../types/detection';
import { formatCoordinate, formatDamageLabel, getSeverityColors } from '../utils/severity';

interface DetectionMapProps {
  records: ConfirmedDetectionRecord[];
  selectedId: string | null;
  onSelectRecord: (id: string) => void;
}

export function DetectionMap({
  records,
  selectedId,
  onSelectRecord,
}: DetectionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  const geoRecords = records.filter(
    (r): r is ConfirmedDetectionRecord & { latitude: number; longitude: number } =>
      r.latitude !== null && r.longitude !== null
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
    }).setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) {
      marker.remove();
    }
    markersRef.current.clear();

    if (geoRecords.length === 0) return;

    const bounds = L.latLngBounds([]);

    for (const rec of geoRecords) {
      const colors = getSeverityColors(rec.severity);
      const latlng: [number, number] = [rec.latitude, rec.longitude];
      bounds.extend(latlng);

      const marker = L.circleMarker(latlng, {
        radius: rec.id === selectedId ? 11 : 8,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: colors.markerHex,
        fillOpacity: 0.92,
      }).addTo(map);

      const timeStr = new Date(rec.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const popupEl = document.createElement('div');
      popupEl.className = 'text-xs leading-relaxed text-slate-900 min-w-[170px]';
      popupEl.innerHTML = `
        <div class="font-semibold text-sm mb-1">${
          rec.isSimulated ? '[Simulated] ' : ''
        }${formatDamageLabel(rec.type)} (${rec.severity})</div>
        <div>Confidence: <strong>${Math.round(rec.confidence * 100)}%</strong></div>
        <div>Time: ${timeStr}</div>
        <div class="font-mono text-[11px] text-slate-600 mt-1">${formatCoordinate(
          rec.latitude
        )}, ${formatCoordinate(rec.longitude)}</div>
      `;

      marker.bindPopup(popupEl);
      marker.on('click', () => onSelectRecord(rec.id));
      markersRef.current.set(rec.id, marker);
    }

    if (geoRecords.length === 1) {
      map.setView([geoRecords[0].latitude, geoRecords[0].longitude], 17);
    } else {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
    }
  }, [geoRecords.length, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (marker) {
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 17), {
        duration: 0.4,
      });
      marker.openPopup();
    }
  }, [selectedId]);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-80 lg:h-96">
      <div ref={containerRef} className="h-full w-full" />
      {geoRecords.length === 0 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-100/90 p-6 text-center backdrop-blur-xs">
          <p className="text-sm font-semibold text-slate-800">
            No GPS Coordinates Recorded
          </p>
          <p className="mt-1 max-w-xs text-xs text-slate-600">
            Allow location access during a road scan to plot detected potholes and cracks on the map.
          </p>
        </div>
      )}
    </div>
  );
}
