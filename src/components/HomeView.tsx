import { useRef } from 'react';
import { Camera, ImagePlus, MapPin, ShieldAlert, Cpu } from 'lucide-react';
import type { DetectionEngineMode } from '../types/detection';

interface HomeViewProps {
  engineMode: DetectionEngineMode;
  onChangeEngine: (mode: DetectionEngineMode) => void;
  yoloUrl: string;
  onChangeYoloUrl: (url: string) => void;
  onStartScan: () => void;
  onUploadFile: (file: File) => void;
  onLoadSampleImage: (url: string, label: string) => void;
}

const SAMPLE_POTHOLE_URL = '/src/assets/images/sample_pothole_road_1795283268248.jpg';
const SAMPLE_CRACK_URL = '/src/assets/images/sample_cracked_road_1795283268498.jpg';

export function HomeView({
  engineMode,
  onChangeEngine,
  yoloUrl,
  onChangeYoloUrl,
  onStartScan,
  onUploadFile,
  onLoadSampleImage,
}: HomeViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between px-4 py-6 sm:px-6 lg:py-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left / Primary Hero Column */}
        <div className="lg:col-span-7">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-amber-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="M4 19L8 5" />
                <path d="M20 19L16 5" />
                <path d="M12 6v2" />
                <path d="M12 11v2" />
                <path d="M12 16v3" />
                <rect x="8.5" y="9" width="7" height="5" rx="1" stroke="#F59E0B" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                RoadGuard AI
              </h1>
              <p className="text-sm text-slate-600">
                Real-Time Road Damage Detection Prototype
              </p>
            </div>
          </div>

          <h2 className="mt-6 max-w-xl text-balance text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">
            Point your phone camera at the road to spot potholes and cracks live.
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
            Captures live rear-camera frames, draws severity bounding boxes over the feed, logs
            GPS coordinates for each confirmed defect, and plots your inspection route on a map.
          </p>

          {/* Primary Actions — thumb-friendly 48px+ targets */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onStartScan}
              className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-slate-950 transition-colors hover:bg-amber-400 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap"
            >
              <Camera className="h-5 w-5 shrink-0" />
              <span>Start Road Scan</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-900 transition-colors hover:bg-slate-100 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap"
            >
              <ImagePlus className="h-5 w-5 shrink-0 text-slate-700" />
              <span>Upload Image</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload road image"
            />
          </div>

          {/* Pipeline Overview */}
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <Camera className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Rear Camera</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Streams frames continuously at mobile resolution.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Damage Overlay</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Boxes potholes &amp; cracks with confidence and severity.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
                <span>GPS &amp; Leaflet</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Tags each detection and plots locations after scan.
              </p>
            </div>
          </div>
        </div>

        {/* Right / Modular Detection Engine & Sample Test Panel */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                Detection Engine
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Switch between real AI vision, a local FastAPI YOLO server, or the offline pipeline stub.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { id: 'gemini', label: 'AI Vision' },
                  { id: 'yolo', label: 'YOLO API' },
                  { id: 'stub', label: 'Demo Stub' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeEngine(opt.id)}
                  className={`min-h-[44px] rounded-lg px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    engineMode === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {engineMode === 'gemini' && (
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Uses server-side Gemini Vision (<span className="font-mono-data">gemini-4-hydrogen</span>) to inspect each captured road frame for genuine potholes and cracks.
              </p>
            )}

            {engineMode === 'yolo' && (
              <div className="mt-3 space-y-2">
                <label
                  htmlFor="yolo-endpoint"
                  className="block text-xs font-medium text-slate-700"
                >
                  Python FastAPI YOLO Endpoint
                </label>
                <input
                  id="yolo-endpoint"
                  type="url"
                  value={yoloUrl}
                  onChange={(e) => onChangeYoloUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8000/detect-base64"
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-mono-data text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                <p className="text-xs text-slate-500">
                  Run <span className="font-mono-data">uvicorn main:app --port 8000</span> inside <span className="font-mono-data">backend/</span>.
                </p>
              </div>
            )}

            {engineMode === 'stub' && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
                Simulation Mode: Emits clearly labeled <span className="font-semibold">[SIM]</span> bounding boxes to test camera, GPS, and map rendering offline without a model.
              </p>
            )}
          </div>

          {/* Quick Sample Photos for indoor / desktop verification */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Quick Sample Road Photos
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Testing indoors? Run the detector on a sample road frame:
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onLoadSampleImage(SAMPLE_POTHOLE_URL, 'Sample Pothole Road')}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition-colors hover:border-slate-400"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-200">
                  <img
                    src={SAMPLE_POTHOLE_URL}
                    alt="Sample asphalt pothole road"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </div>
                <div className="px-3 py-2 text-xs font-medium text-slate-800">
                  Test Pothole
                </div>
              </button>

              <button
                type="button"
                onClick={() => onLoadSampleImage(SAMPLE_CRACK_URL, 'Sample Cracked Road')}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition-colors hover:border-slate-400"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-200">
                  <img
                    src={SAMPLE_CRACK_URL}
                    alt="Sample cracked pavement road"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </div>
                <div className="px-3 py-2 text-xs font-medium text-slate-800">
                  Test Cracks
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
