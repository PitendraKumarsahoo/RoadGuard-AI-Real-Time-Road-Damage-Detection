export interface CapturedFrame {
  dataUrl: string;
  width: number;
  height: number;
}

export interface CameraErrorInfo {
  code: 'insecure' | 'permission_denied' | 'not_found' | 'in_use' | 'unsupported' | 'unknown';
  title: string;
  message: string;
}

export function mapCameraError(err: unknown): CameraErrorInfo {
  if (typeof window !== 'undefined' && !window.isSecureContext && !navigator.mediaDevices) {
    return {
      code: 'insecure',
      title: 'HTTPS Required for Phone Camera',
      message:
        'Mobile browsers block rear camera access over plain HTTP. Open this app via HTTPS (or localhost) to enable live scanning, or use Upload Image below.',
    };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      code: 'unsupported',
      title: 'Camera API Unavailable',
      message:
        'This browser does not support getUserMedia camera streaming. You can still test road damage detection using Upload Image.',
    };
  }

  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'permission_denied',
      title: 'Camera Permission Denied',
      message:
        'Please allow camera access in your browser site settings and tap Retry Camera, or use Upload Image to analyze a saved road photo.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'not_found',
      title: 'No Camera Detected',
      message:
        'No active camera sensor was found on this device. Connect a camera or use Upload Image to test detection.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'in_use',
      title: 'Camera Busy',
      message:
        'Another app or browser tab is currently using the camera. Close other camera apps and tap Retry Camera.',
    };
  }

  const fallback = err instanceof Error ? err.message : 'Unable to initialize camera stream.';
  return {
    code: 'unknown',
    title: 'Camera Initialization Error',
    message: fallback,
  };
}

/**
 * Requests the smartphone's rear camera by default (`facingMode: { ideal: 'environment' }`).
 * Falls back gracefully to any available video input on laptops without a rear camera.
 */
export async function requestRearCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new DOMException('Camera API is not available in this context.', 'NotSupportedError');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (err) {
    // Retry with relaxed constraints if rear constraint fails with OverconstrainedError
    if (err instanceof DOMException && err.name === 'OverconstrainedError') {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
    throw err;
  }
}

export function stopCameraStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/**
 * Captures the current <video> frame onto an offscreen canvas scaled to `maxWidth`
 * for fast transmission to the AI detection backend.
 */
export function captureVideoFrame(
  video: HTMLVideoElement,
  offscreenCanvas: HTMLCanvasElement,
  maxWidth = 640
): CapturedFrame | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const scale = vw > maxWidth ? maxWidth / vw : 1;
  const targetWidth = Math.round(vw * scale);
  const targetHeight = Math.round(vh * scale);

  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;

  const ctx = offscreenCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.78);
  return {
    dataUrl,
    width: targetWidth,
    height: targetHeight,
  };
}
