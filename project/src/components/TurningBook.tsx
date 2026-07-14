import { motion } from "motion/react";

interface TurningBookProps {
  className?: string;
  delay?: number;
  size?: number;
  /** Soft color variation for the cover */
  tone?: "sage" | "moss" | "olive";
}

const TONES = {
  sage: { cover: "#5f8f6e", spine: "#3d6a4c", pageEdge: "#e8f0e4" },
  moss: { cover: "#4f8f28", spine: "#2f5c18", pageEdge: "#f2f7ee" },
  olive: { cover: "#6b8f3d", spine: "#456028", pageEdge: "#eef5e6" },
} as const;

/** Decorative open book with looping page-turn animation. */
export function TurningBook({
  className = "",
  delay = 0,
  size = 160,
  tone = "sage",
}: TurningBookProps) {
  const colors = TONES[tone];
  const ease = [0.45, 0.05, 0.55, 0.95] as const;

  return (
    <div
      className={`turning-book ${className}`}
      style={{ width: size, height: size * 0.78 }}
      aria-hidden
    >
      <motion.div
        className="turning-book__stage"
        initial={{ opacity: 0, y: 12, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -4 }}
        transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Soft ground shadow */}
        <div className="turning-book__shadow" />

        {/* Left cover + static pages */}
        <div className="turning-book__cover turning-book__cover--left" style={{ background: colors.cover }}>
          <div className="turning-book__spine" style={{ background: colors.spine }} />
          <div className="turning-book__pages turning-book__pages--left" style={{ background: colors.pageEdge }}>
            <span />
            <span />
            <span />
          </div>
        </div>

        {/* Right cover + static pages */}
        <div className="turning-book__cover turning-book__cover--right" style={{ background: colors.cover }}>
          <div className="turning-book__pages turning-book__pages--right" style={{ background: colors.pageEdge }}>
            <span />
            <span />
            <span />
          </div>
        </div>

        {/* Turning pages — hinge at the spine */}
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="turning-book__flip"
            style={{
              transformOrigin: "left center",
              zIndex: 4 - i,
            }}
            initial={{ rotateY: 0 }}
            animate={{ rotateY: [0, 0, -178, -178, 0] }}
            transition={{
              duration: 5.2,
              delay: delay + 0.55 + i * 1.35,
              repeat: Infinity,
              ease,
              times: [0, 0.12, 0.42, 0.72, 1],
            }}
          >
            <div className="turning-book__leaf turning-book__leaf--front">
              <div className="turning-book__lines" />
            </div>
            <div className="turning-book__leaf turning-book__leaf--back">
              <div className="turning-book__lines turning-book__lines--dense" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
