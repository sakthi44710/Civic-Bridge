import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, Image, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Progress';
import toast from 'react-hot-toast';

interface DocumentUploaderProps {
  onFileSelected: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
}

export function DocumentUploader({ onFileSelected, accept = 'image/*,.pdf', maxSizeMB = 10, label = 'Upload Document' }: DocumentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`File too large. Max ${maxSizeMB}MB.`);
      return;
    }
    setUploading(true);
    setProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) { clearInterval(interval); return 90; }
        return p + 15;
      });
    }, 200);

    await new Promise((r) => setTimeout(r, 1500));
    clearInterval(interval);
    setProgress(100);

    setTimeout(() => {
      setUploading(false);
      setProgress(0);
      onFileSelected(file);
      toast.success('Document uploaded! Processing...');
    }, 400);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  if (uploading) {
    return (
      <div className="card p-6 text-center space-y-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="h-16 w-16 mx-auto rounded-full border-4 border-saffron-200 border-t-saffron-400"
        />
        <p className="font-semibold text-slate-700">Processing document...</p>
        <ProgressBar value={progress} color="saffron" size="md" showValue />
        {progress === 100 && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center justify-center gap-2 text-india-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Done!</span>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Camera capture */}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        icon={<Camera className="h-5 w-5" />}
        onClick={() => cameraRef.current?.click()}
      >
        Take Photo
      </Button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />

      {/* Drag & drop area */}
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        animate={{ borderColor: dragOver ? '#FF9933' : '#E2E8F0', backgroundColor: dragOver ? '#FFF8F0' : '#F8FAFC' }}
        className="relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
      >
        <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">
          {dragOver ? 'Drop here!' : 'Or tap to pick from gallery'}
        </p>
        <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, PDF (max {maxSizeMB}MB)</p>
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      </motion.div>
    </div>
  );
}
