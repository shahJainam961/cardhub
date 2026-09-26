import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Modal dialog that pops in with a little bounce. */
export function Overlay({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className={`panel max-h-[92vh] w-full overflow-y-auto p-6 text-center ${wide ? "max-w-2xl" : "max-w-md"}`}
        initial={{ scale: 0.85, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
      >
        <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}
