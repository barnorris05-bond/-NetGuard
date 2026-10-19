import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore';
import { cn } from './ui';

const tones = {
  success: {
    icon: CircleCheck,
    wrap: 'border-emerald-400/25 bg-[#081812]/95 text-emerald-200',
    iconColor: 'text-emerald-300',
  },
  error: {
    icon: CircleAlert,
    wrap: 'border-rose-400/25 bg-[#180a10]/95 text-rose-200',
    iconColor: 'text-rose-300',
  },
  info: {
    icon: Info,
    wrap: 'border-cyan-400/25 bg-[#071520]/95 text-cyan-100',
    iconColor: 'text-cyan-300',
  },
};

export function ToastViewport() {
  const toasts = useNetworkStore((state) => state.toasts);
  const dismiss = useNetworkStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = tones[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 32, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]',
                tone.wrap,
              )}
            >
              <tone.icon size={15} className={cn('mt-0.5 shrink-0', tone.iconColor)} />
              <p className="flex-1 text-[11.5px] leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="mt-0.5 text-current/40 transition-colors hover:text-current"
                aria-label="Dismiss notification"
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
