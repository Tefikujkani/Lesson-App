import { motion } from "motion/react";

interface BloomFlowerProps {
  className?: string;
  delay?: number;
  size?: number;
  mirror?: boolean;
}

/** Soft botanical bloom for the login corners — watercolor peony feel. */
export function BloomFlower({
  className = "",
  delay = 0,
  size = 200,
  mirror = false,
}: BloomFlowerProps) {
  const ease = [0.22, 1, 0.36, 1] as const;
  const uid = mirror ? "br" : "tl";

  return (
    <div
      className={`bloom-flower ${mirror ? "bloom-flower--mirror" : ""} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 200 200" className="bloom-flower__svg" fill="none">
        <defs>
          <radialGradient id={`bloomWash-${uid}`} cx="42%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#fff6f0" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#f0c4b4" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c8e6d4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`petalSoft-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7d6cb" />
            <stop offset="100%" stopColor="#e8a898" />
          </linearGradient>
          <linearGradient id={`petalDeep-${uid}`} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#efc0b2" />
            <stop offset="100%" stopColor="#d98878" />
          </linearGradient>
          <linearGradient id={`leafGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8fbf9a" />
            <stop offset="100%" stopColor="#5e9470" />
          </linearGradient>
        </defs>

        <motion.circle
          cx="96"
          cy="92"
          r="52"
          fill={`url(#bloomWash-${uid})`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.3, delay: delay + 0.1, ease }}
          style={{ transformOrigin: "96px 92px" }}
        />

        {/* Stem */}
        <motion.path
          d="M108 118 C112 138 108 156 102 178"
          stroke="#6a9a78"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity={0.55}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.55 }}
          transition={{ duration: 1, delay: delay + 0.35, ease }}
        />

        {/* Leaves */}
        <motion.path
          d="M106 142 C88 138 74 128 70 114 C86 118 98 128 106 142Z"
          fill={`url(#leafGrad-${uid})`}
          fillOpacity="0.72"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: delay + 0.5, ease }}
          style={{ transformOrigin: "96px 130px" }}
        />
        <motion.path
          d="M110 148 C126 144 140 136 144 122 C130 128 118 136 110 148Z"
          fill={`url(#leafGrad-${uid})`}
          fillOpacity="0.58"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: delay + 0.58, ease }}
          style={{ transformOrigin: "116px 138px" }}
        />

        {/* Outer petals — organic peony shapes */}
        {[
          { d: "M96 92 C78 54 52 48 42 68 C36 88 58 104 78 108 C88 104 96 98 96 92Z", fill: `url(#petalDeep-${uid})`, opacity: 0.78, rot: -8 },
          { d: "M96 92 C118 50 148 48 156 70 C160 92 136 108 114 108 C104 104 96 98 96 92Z", fill: `url(#petalSoft-${uid})`, opacity: 0.82, rot: 6 },
          { d: "M96 92 C64 78 48 98 54 118 C64 138 88 136 100 118 C102 108 100 98 96 92Z", fill: `url(#petalDeep-${uid})`, opacity: 0.7, rot: -2 },
          { d: "M96 92 C128 76 148 94 144 116 C136 138 110 136 100 116 C98 106 96 98 96 92Z", fill: `url(#petalSoft-${uid})`, opacity: 0.74, rot: 4 },
          { d: "M96 92 C86 58 104 42 122 54 C136 66 128 90 110 98 C102 98 96 96 96 92Z", fill: "#f3c8bc", opacity: 0.86, rot: 0 },
        ].map((petal, i) => (
          <motion.path
            key={i}
            d={petal.d}
            fill={petal.fill}
            fillOpacity={petal.opacity}
            initial={{ opacity: 0, scale: 0.35, rotate: petal.rot - 12 }}
            animate={{ opacity: 1, scale: 1, rotate: petal.rot }}
            transition={{ duration: 1.05, delay: delay + 0.2 + i * 0.06, ease }}
            style={{ transformOrigin: "96px 92px" }}
          />
        ))}

        {/* Inner folded petals */}
        {[
          { d: "M96 92 C88 72 78 74 76 86 C76 96 86 100 94 96Z", fill: "#f8e0d8", delay: 0.55 },
          { d: "M96 92 C108 74 118 76 120 88 C120 98 108 100 98 96Z", fill: "#f0cbbf", delay: 0.62 },
          { d: "M96 92 C90 86 88 96 92 104 C96 108 102 104 100 96Z", fill: "#e9b4a4", delay: 0.68 },
        ].map((petal, i) => (
          <motion.path
            key={`inner-${i}`}
            d={petal.d}
            fill={petal.fill}
            fillOpacity="0.92"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: delay + petal.delay, ease }}
            style={{ transformOrigin: "96px 92px" }}
          />
        ))}

        {/* Center — soft seed cluster */}
        <motion.circle
          cx="96"
          cy="92"
          r="9"
          fill="#f2c96a"
          fillOpacity="0.95"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.55, delay: delay + 0.85, ease }}
          style={{ transformOrigin: "96px 92px" }}
        />
        <motion.circle
          cx="96"
          cy="92"
          r="4.5"
          fill="#e09a45"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: delay + 0.95, ease }}
          style={{ transformOrigin: "96px 92px" }}
        />
      </svg>
    </div>
  );
}
