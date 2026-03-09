import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, Image, X, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useLocalization } from '@/hooks/useLocalization';
import { useDocumentStore } from '@/stores/documentStore';
import { generateId, compressImage } from '@/lib/utils';
import type { Document, DocumentType } from '@/types';

interface DocumentUploaderProps {
  documentType?: DocumentType;
  onUploadComplete?: (doc: Document) => void;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({ documentType = 'other', onUploadComplete }) => {
  const { t } = useLocalization();
  const { addDocument } = useDocumentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setProgress(0);

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // Compress image
      setProgress(20);
      const compressed = file.type.startsWith('image/') ? await compressImage(file) : file;

      // Simulate upload progress
      for (let i = 30; i <= 80; i += 10) {
        await new Promise((r) => setTimeout(r, 300));
        setProgress(i);
      }

      // Simulate OCR processing
      setProgress(90);
      await new Promise((r) => setTimeout(r, 1000));

      const doc: Document = {
        id: generateId(),
        type: documentType,
        name: `${documentType}_${Date.now()}`,
        originalName: file.name,
        url: URL.createObjectURL(compressed),
        thumbnailUrl: URL.createObjectURL(compressed),
        status: 'verified',
        confidence: 85 + Math.floor(Math.random() * 15),
        extractedData: {
          name: 'Demo User',
          document_number: `XXXX-XXXX-${Math.floor(1000 + Math.random() * 9000)}`,
        },
        uploadedAt: new Date(),
        fileSize: compressed.size || file.size,
      };

      setProgress(100);
      addDocument(doc);
      onUploadComplete?.(doc);

      setTimeout(() => {
        setUploading(false);
        setPreview(null);
        setProgress(0);
      }, 1000);
    } catch {
      setUploading(false);
      setProgress(0);
    }
  }, [documentType, addDocument, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {uploading ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-surface rounded-lg border-2 border-border p-6 space-y-4"
          >
            {preview && (
              <div className="w-full h-40 rounded-md overflow-hidden bg-gray-100">
                <img src={preview} alt="Preview" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  {progress < 90 ? 'Uploading...' : progress < 100 ? 'Processing OCR...' : 'Complete!'}
                </span>
                {progress === 100 ? (
                  <CheckCircle size={20} className="text-green" />
                ) : (
                  <Loader2 size={20} className="animate-spin text-saffron" />
                )}
              </div>
              <ProgressBar value={progress} variant="gradient" size="md" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setUploading(false); setPreview(null); }}
              icon={<X size={16} />}
            >
              {t('common.cancel')}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver ? 'border-saffron bg-saffron-light' : 'border-border hover:border-saffron/50'
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-saffron-light flex items-center justify-center">
                  <Upload size={28} className="text-saffron" />
                </div>
                <div>
                  <p className="font-semibold text-text-primary">
                    {t('docs.upload')}
                  </p>
                  <p className="text-sm text-text-muted mt-1">
                    Drag & drop or tap below
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    size="lg"
                    icon={<Camera size={20} />}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    {t('docs.take_photo')}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    icon={<Image size={20} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Gallery
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
      />
    </div>
  );
};
