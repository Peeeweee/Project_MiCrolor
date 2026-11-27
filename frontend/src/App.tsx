import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { MobileNavBar } from './components/MobileNavBar';
import { UploadZone } from './components/UploadZone';
import { ImageGallery } from './components/ImageGallery';
import { PreviewWorkspace } from './components/PreviewWorkspace';
import { RightSidebar } from './components/RightSidebar';
import { PresetsPanel } from './components/PresetsPanel';
import { BatchHistoryPanel } from './components/BatchHistoryPanel';
import { ExportPanel } from './components/ExportPanel';
import {
  DEFAULT_SOFT_PALE_PINK,
  NEUTRAL_SETTINGS,
  type BatchJobStatus,
  type ColorSettings,
  type ExportRequest,
  type ImageRecord,
  type NavSection,
  type PresetItem,
} from './types';
import { api } from './utils/api';

export default function App() {
  const [section, setSection] = useState<NavSection>('library');
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [jobs, setJobs] = useState<BatchJobStatus[]>([]);
  const [activeJob, setActiveJob] = useState<BatchJobStatus | null>(null);
  const [defaultExportDir, setDefaultExportDir] = useState<string>('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ColorSettings>(() => {
    try {
      const saved = localStorage.getItem('microscope_studio_settings_v1');
      if (saved) return { ...DEFAULT_SOFT_PALE_PINK, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SOFT_PALE_PINK;
  });

  useEffect(() => {
    try {
      localStorage.setItem('microscope_studio_settings_v1', JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Array<{ filename: string; error: string }>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileColorOpen, setMobileColorOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [health, imgList, presetList, jobList] = await Promise.all([
        api.health(),
        api.listImages(),
        api.listPresets(),
        api.listJobs(),
      ]);
      setDefaultExportDir(health.defaultExportDir);
      setImages(imgList);
      setPresets(presetList);
      setJobs(jobList);
      if (imgList.length > 0 && !activeImageId) {
        setActiveImageId(imgList[0].id);
      }
      const running = jobList.find((j) => j.status === 'running') || null;
      setActiveJob(running);
    } catch {
      // Backend may still be booting
    }
  }, [activeImageId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Poll active batch job progress without blocking UI
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const [job, imgList] = await Promise.all([api.getJob(activeJob.jobId), api.listImages()]);
        setActiveJob(job);
        setImages(imgList);
        if (job.status !== 'running') {
          const allJobs = await api.listJobs();
          setJobs(allJobs);
          if (job.status === 'completed') {
            showToast(`Batch complete: ${job.completed} processed (${job.failed} failed).`);
          } else if (job.status === 'cancelled') {
            showToast('Batch processing cancelled.');
          }
        }
      } catch {
        // ignore transient poll error
      }
    }, 450);
    return () => clearInterval(timer);
  }, [activeJob, showToast]);

  const activePresetName = useMemo(() => {
    const match = presets.find((p) => p.id === settings.presetId);
    return match ? match.name : 'Custom Adjustment';
  }, [presets, settings.presetId]);

  const activeImage = useMemo(
    () => images.find((i) => i.id === activeImageId) || images[0] || null,
    [images, activeImageId]
  );

  const totalBytes = useMemo(() => images.reduce((acc, i) => acc + i.sizeBytes, 0), [images]);
  const processedCount = useMemo(
    () => images.filter((i) => i.status === 'processed').length,
    [images]
  );

  const handleUploadFiles = async (files: File[]) => {
    setUploading(true);
    setUploadErrors([]);
    setUploadProgress({ done: 0, total: files.length });
    try {
      const res = await api.uploadImages(files, (done, total) => {
        setUploadProgress({ done, total });
      });
      if (res.errors.length > 0) setUploadErrors(res.errors);
      if (res.uploaded.length > 0) {
        const updated = await api.listImages();
        setImages(updated);
        // Auto-select newly uploaded images so the user can immediately click Process
        setSelectedIds((prev) => {
          const next = new Set(prev);
          res.uploaded.forEach((u) => next.add(u.id));
          return next;
        });
        if (!activeImageId) setActiveImageId(res.uploaded[0].id);
        setSection('library');
        showToast(`Imported ${res.uploaded.length} microscope photograph(s).`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(images.map((i) => i.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleRemoveImage = async (id: string) => {
    await api.deleteImage(id);
    setImages((prev) => prev.filter((i) => i.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeImageId === id) {
      const remaining = images.filter((i) => i.id !== id);
      setActiveImageId(remaining[0]?.id || null);
    }
  };

  const handleClearAll = async () => {
    await api.clearImages();
    setImages([]);
    setSelectedIds(new Set());
    setActiveImageId(null);
    showToast('Upload queue cleared.');
  };

  const startBatchForIds = async (
    ids: string[],
    customSettings?: ColorSettings,
    customPresetName?: string,
    force = false
  ) => {
    if (ids.length === 0) return;
    const useSettings = customSettings || settings;
    const useName = customPresetName || activePresetName;
    try {
      const job = await api.startBatch(ids, useSettings, useName, force);
      setActiveJob(job);
      setJobs((prev) => [job, ...prev]);
      const imgList = await api.listImages();
      setImages(imgList);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start batch');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    await api.cancelJob(jobId);
  };

  const handleSelectPreset = (preset: PresetItem) => {
    setSettings({ ...preset.settings });
  };

  const handleSavePreset = async (name: string, description: string) => {
    const created = await api.createPreset(name, description, settings);
    setPresets((prev) => [...prev, created]);
    setSettings({ ...created.settings });
    showToast(`Saved custom preset "${created.name}".`);
  };

  const handleDeletePreset = async (presetId: string) => {
    await api.deletePreset(presetId);
    setPresets((prev) => prev.filter((p) => p.id !== presetId));
    showToast('Deleted custom preset.');
  };

  const handleExportSingle = (id: string) => {
    setActiveImageId(id);
    setSection('export');
  };

  const handleRunExport = async (req: ExportRequest) => {
    // Always pass active settings so newly uploaded files & preset switches export with latest edits
    const res = await api.exportImages({ ...req, settings });
    const imgList = await api.listImages();
    setImages(imgList);
    showToast(`Exported ${res.exportedCount} image(s) as ${res.format} with "${activePresetName}".`);
    return res;
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col text-[#1f1a1d]">
      <TopBar
        imageCount={images.length}
        selectedCount={selectedIds.size}
        processedCount={processedCount}
        totalBytes={totalBytes}
        activeJob={activeJob}
        onCancelJob={handleCancelJob}
        onOpenColorDrawer={() => setMobileColorOpen(true)}
        activePresetName={activePresetName}
        onQuickProcessAll={() => {
          const targetIds =
            selectedIds.size > 0
              ? images.filter((i) => selectedIds.has(i.id)).map((i) => i.id)
              : images.map((i) => i.id);
          startBatchForIds(targetIds);
        }}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <LeftSidebar
          activeSection={section}
          onSelectSection={setSection}
          imageCount={images.length}
          processedCount={processedCount}
          presetCount={presets.length}
          jobCount={jobs.length}
        />

        <main className="flex-1 min-w-0 overflow-hidden relative">
          {section === 'upload' && (
            <div className="h-full overflow-y-auto">
              <UploadZone
                onUploadFiles={handleUploadFiles}
                uploading={uploading}
                uploadProgress={uploadProgress}
                uploadErrors={uploadErrors}
              />
            </div>
          )}

          {section === 'library' && (
            <ImageGallery
              images={images}
              settings={settings}
              selectedIds={selectedIds}
              activeImageId={activeImageId}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onInspectImage={(id) => {
                setActiveImageId(id);
                setSection('preview');
              }}
              onRemoveImage={handleRemoveImage}
              onClearAll={handleClearAll}
              onRetryImage={(id) => startBatchForIds([id], undefined, undefined, true)}
              onUploadFiles={handleUploadFiles}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadErrors={uploadErrors}
            />
          )}

          {section === 'preview' && (
            <PreviewWorkspace
              images={images}
              activeImageId={activeImageId}
              settings={settings}
              onSelectActive={setActiveImageId}
              onExportSingle={handleExportSingle}
              onProcessSingle={(id) => startBatchForIds([id])}
            />
          )}

          {section === 'presets' && (
            <PresetsPanel
              presets={presets}
              activeSettings={settings}
              onSelectPreset={handleSelectPreset}
              onDeletePreset={handleDeletePreset}
              onApplyPresetToAll={(p) => {
                setSettings({ ...p.settings });
                startBatchForIds(
                  images.map((i) => i.id),
                  p.settings,
                  p.name
                );
              }}
              imageCount={images.length}
            />
          )}

          {section === 'history' && (
            <BatchHistoryPanel
              jobs={jobs}
              onLoadSettings={(s) => {
                setSettings({ ...s });
                showToast('Loaded settings from batch history.');
              }}
            />
          )}

          {section === 'export' && (
            <ExportPanel
              images={images}
              selectedIds={selectedIds}
              activeImageId={activeImageId}
              defaultExportDir={defaultExportDir}
              onRunExport={handleRunExport}
            />
          )}

          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#fde384] border-2 border-[#1f1a1d] text-sm font-semibold text-[#1f1a1d] shadow-[2.5px_3px_0_#1f1a1d]">
              {toast}
            </div>
          )}
        </main>

        <RightSidebar
          presets={presets}
          settings={settings}
          onChangeSettings={setSettings}
          onSelectPreset={handleSelectPreset}
          onReset={() => setSettings({ ...NEUTRAL_SETTINGS })}
          onSavePreset={handleSavePreset}
          onApplyAll={() => startBatchForIds(images.map((i) => i.id))}
          onApplySelected={() =>
            startBatchForIds(images.filter((i) => selectedIds.has(i.id)).map((i) => i.id))
          }
          onGoExport={() => setSection('export')}
          imageCount={images.length}
          selectedCount={selectedIds.size}
          isProcessing={activeJob?.status === 'running'}
          activeImage={activeImage}
        />
      </div>

      {/* Mobile Bottom Navigation Bar (iPhone & Android safe-area aware) */}
      <MobileNavBar
        activeSection={section}
        onSelectSection={setSection}
        onOpenColorDrawer={() => setMobileColorOpen(true)}
        imageCount={images.length}
        processedCount={processedCount}
      />

      {/* Native-physics Mobile Bottom Sheet Drawer via Vaul (emilkowalski/vaul) */}
      <Drawer.Root open={mobileColorOpen} onOpenChange={setMobileColorOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-[#1f1a1d]/40 backdrop-blur-[2px] z-40 lg:hidden" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 lg:hidden flex flex-col rounded-t-3xl bg-[#fdf6f2] border-t-2 border-x-2 border-[#1f1a1d] max-h-[86dvh] outline-none shadow-2xl">
            <div className="mx-auto w-12 h-1.5 shrink-0 rounded-full bg-[#cfc4bd] my-2.5" />
            <Drawer.Title className="sr-only">Color Presets and Adjustments</Drawer.Title>
            <div className="flex-1 min-h-0 overflow-hidden">
              <RightSidebar
                inDrawer
                presets={presets}
                settings={settings}
                onChangeSettings={setSettings}
                onSelectPreset={handleSelectPreset}
                onReset={() => setSettings({ ...NEUTRAL_SETTINGS })}
                onSavePreset={handleSavePreset}
                onApplyAll={() => {
                  startBatchForIds(images.map((i) => i.id));
                  setMobileColorOpen(false);
                }}
                onApplySelected={() => {
                  startBatchForIds(images.filter((i) => selectedIds.has(i.id)).map((i) => i.id));
                  setMobileColorOpen(false);
                }}
                onGoExport={() => {
                  setMobileColorOpen(false);
                  setSection('export');
                }}
                imageCount={images.length}
                selectedCount={selectedIds.size}
                isProcessing={activeJob?.status === 'running'}
                activeImage={activeImage}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
