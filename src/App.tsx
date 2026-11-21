import { useEffect, useRef, useState } from 'react';
import { HomeView } from './components/HomeView';
import { ImageInspectView } from './components/ImageInspectView';
import { ResultsView } from './components/ResultsView';
import { ScanView } from './components/ScanView';
import type { DetectionEngineMode, ScanSessionSummary } from './types/detection';

type AppScreen =
  | { name: 'home' }
  | { name: 'scan' }
  | { name: 'inspect'; imageUrl: string; label: string; isObjectUrl: boolean }
  | { name: 'results'; summary: ScanSessionSummary };

export default function App() {
  const [screen, setScreen] = useState<AppScreen>({ name: 'home' });
  const [engineMode, setEngineMode] = useState<DetectionEngineMode>('gemini');
  const [yoloUrl, setYoloUrl] = useState<string>('http://127.0.0.1:8000/detect-base64');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (screen.name === 'inspect' && screen.isObjectUrl) {
        URL.revokeObjectURL(screen.imageUrl);
      }
    };
  }, [screen]);

  const openFileForInspection = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setScreen({
      name: 'inspect',
      imageUrl: objectUrl,
      label: file.name || 'Uploaded Road Photo',
      isObjectUrl: true,
    });
  };

  const openSampleForInspection = (url: string, label: string) => {
    setScreen({
      name: 'inspect',
      imageUrl: url,
      label,
      isObjectUrl: false,
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 text-slate-900">
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) openFileForInspection(file);
          e.target.value = '';
        }}
        className="hidden"
        aria-label="Fallback image upload input"
      />

      {screen.name === 'home' && (
        <HomeView
          engineMode={engineMode}
          onChangeEngine={setEngineMode}
          yoloUrl={yoloUrl}
          onChangeYoloUrl={setYoloUrl}
          onStartScan={() => setScreen({ name: 'scan' })}
          onUploadFile={openFileForInspection}
          onLoadSampleImage={openSampleForInspection}
        />
      )}

      {screen.name === 'scan' && (
        <ScanView
          engineMode={engineMode}
          yoloUrl={yoloUrl}
          onStopScan={(summary) => setScreen({ name: 'results', summary })}
          onCancel={() => setScreen({ name: 'home' })}
          onSwitchToUpload={() => {
            setScreen({ name: 'home' });
            window.setTimeout(() => uploadInputRef.current?.click(), 50);
          }}
        />
      )}

      {screen.name === 'inspect' && (
        <ImageInspectView
          imageSourceUrl={screen.imageUrl}
          imageLabel={screen.label}
          engineMode={engineMode}
          yoloUrl={yoloUrl}
          onBack={() => setScreen({ name: 'home' })}
          onUploadAnother={openFileForInspection}
          onViewSummary={(summary) => setScreen({ name: 'results', summary })}
        />
      )}

      {screen.name === 'results' && (
        <ResultsView
          summary={screen.summary}
          onStartNewScan={() => setScreen({ name: 'scan' })}
          onBackHome={() => setScreen({ name: 'home' })}
        />
      )}
    </div>
  );
}
