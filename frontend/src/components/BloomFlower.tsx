import { motion } from "motion/react";

interface BloomFlowerProps {
  className?: string;
  delay?: number;
  size?: number;
  mirror?: boolean;
}

/** Decorative bloom — petals unfurl from a closed bud. */
export function BloomFlower({
  className = "",
  delay = 0,
  size = 220,
  mirror = false,
}: BloomFlowerProps) {
  const petalEase = [0.22, 1, 0.36, 1] as const;

  return (
    <div
      className={`bloom-flower ${mirror ? "bloom-flower--mirror" : ""} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 200 200" className="bloom-flower__svg" fill="none">
        {/* Soft glow behind bloom */}
        <motion.circle
          cx="100"
          cy="100"
          r="48"
          fill="url(#bloomGlow)"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 0.55, scale: 1 }}
          transition={{ duration: 1.4, delay: delay + 0.2, ease: petalEase }}
          style={{ transformOrigin: "100px 100px" }}
        />

        {/* Stem suggestion */}
        <motion.path
          d={mirror ? "M118 152 C128 168 132 178 128 190" : "M82 152 C72 168 68 178 72 190"}
          stroke="#5a8f6e"
          strokeWidth="2.2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.55 }}
          transition={{ duration: 0.9, delay: delay + 0.35, ease: petalEase }}
        />

        {/* Leaves */}
        {[
          { d: "M78 148 C52 138 48 118 62 108 C74 122 82 134 78 148Z", delay: 0.45 },
          { d: "M122 150 C148 142 152 122 138 112 C126 126 120 138 122 150Z", delay: 0.55 },
        ].map((leaf, i) => (
          <motion.path
            key={i}
            d={leaf.d}
            fill="#6fa883"
            fillOpacity="0.55"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.85, delay: delay + leaf.delay, ease: petalEase }}
            style={{ transformOrigin: "100px 140px" }}
          />
        ))}

        {/* Petals — bloom open from center */}
        {[
          { rotate: -36, fill: "#f2b8a8" },
          { rotate: 36, fill: "#e8a090" },
          { rotate: -90, fill: "#efc4b8" },
          { rotate: 90, fill: "#e9a898" },
          { rotate: -150, fill: "#f5c9bc" },
          { rotate: 150, fill: "#df9688" },
        ].map((petal, i) => (
          <motion.g
            key={i}
            initial={{ scale: 0.12, opacity: 0, rotate: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: petal.rotate }}
            transition={{
              duration: 1.15,
              delay: delay + 0.15 + i * 0.07,
              ease: petalEase,
            }}
            style={{ transformOrigin: "100px 100px" }}
          >
            <ellipse cx="100" cy="68" rx="22" ry="42" fill={petal.fill} fillOpacity="0.88" />
          </motion.g>
        ))}

        {/* Center */}
        <motion.circle
          cx="100"
          cy="100"
          r="16"
          fill="#f0c35a"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: delay + 0.75, ease: petalEase }}
          style={{ transformOrigin: "100px 100px" }}
        />
        <motion.circle
          cx="100"
          cy="100"
          r="8"
          fill="#e8a54b"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.45, delay: delay + 0.9, ease: petalEase }}
          style={{ transformOrigin: "100px 100px" }}
        />

        <defs>
          <radialGradient id="bloomGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f5d0c5" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#c8e6d4" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
