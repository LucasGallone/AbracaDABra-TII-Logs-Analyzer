import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, CarFront, X } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';

interface ScanTypeModalProps {
  isOpen: boolean;
  fileCount?: number;
  onSelect: (type: 'fixed' | 'mobile') => void;
  onClose: () => void;
}

export function ScanTypeModal({ isOpen, fileCount = 1, onSelect, onClose }: ScanTypeModalProps) {
  const { t } = useAppContext();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-300 dark:bg-slate-800">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white dark:bg-[#1E1F22] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {fileCount > 1 ? t('scanTypeTitlePlural') : t('scanTypeTitle')}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 text-slate-600 dark:text-slate-300">
            <p className="mb-6 whitespace-pre-line">{fileCount > 1 ? t('scanTypeDescPlural') : t('scanTypeDesc')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => onSelect('fixed')}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-[#2B2D31] dark:hover:bg-slate-800 hover:border-blue-500 transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <MapPin className="w-6 h-6" />
                </div>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('scanTypeFixed')}
                </span>
              </button>

              <button
                onClick={() => onSelect('mobile')}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-[#2B2D31] dark:hover:bg-slate-800 hover:border-green-500 transition-all text-center group"
              >
                 <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CarFront className="w-6 h-6" />
                </div>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('scanTypeMobile')}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
