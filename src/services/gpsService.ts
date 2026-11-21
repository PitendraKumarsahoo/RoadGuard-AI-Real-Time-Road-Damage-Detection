import type { GpsCoordinate } from '../types/detection';

export type GpsStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'unsupported';

export interface GpsWatchHandle {
  stop: () => void;
}

export function mapGpsError(err: GeolocationPositionError): {
  status: GpsStatus;
  message: string;
} {
  if (err.code === err.PERMISSION_DENIED) {
    return {
      status: 'denied',
      message: 'Location permission denied. Detections will be saved without GPS coordinates.',
    };
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return {
      status: 'unavailable',
      message: 'GPS signal unavailable indoors. Move outdoors for satellite lock.',
    };
  }
  return {
    status: 'unavailable',
    message: 'GPS fix timed out. Continuing scan while waiting for signal.',
  };
}

export function startGpsWatch(
  onFix: (coord: GpsCoordinate) => void,
  onStatusChange: (status: GpsStatus, message?: string) => void
): GpsWatchHandle {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    onStatusChange(
      'unsupported',
      'Geolocation API is not supported on this browser.'
    );
    return { stop: () => {} };
  }

  onStatusChange('requesting');

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onStatusChange('active');
      onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null,
        capturedAt: position.timestamp || Date.now(),
      });
    },
    (err) => {
      const mapped = mapGpsError(err);
      onStatusChange(mapped.status, mapped.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 4000,
      timeout: 12000,
    }
  );

  return {
    stop: () => {
      navigator.geolocation.clearWatch(watchId);
    },
  };
}

export function getSingleGpsFix(): Promise<GpsCoordinate | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
          capturedAt: position.timestamp || Date.now(),
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 6000,
      }
    );
  });
}
