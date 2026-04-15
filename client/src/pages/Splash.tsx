/*
 * Splash Page — Claude-inspired warm, clean entrance
 * Typography: Space Grotesk display, Source Serif 4 body
 * Colors: Warm dark (#141413), terracotta accent (#d97757), warm off-white (#faf9f5)
 * No login, no registration — just a beautiful entrance to the app
 */
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Bus, ArrowRight, MapPin, Navigation, Clock } from 'lucide-react';

export default function Splash() {
  const [, navigate] = useLocation();

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#141413' }}
    >
      {/* Subtle radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(217,119,87,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Floating transit lines — decorative */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <motion.path
          d="M-100,200 Q200,100 400,250 T800,180 T1200,300 T1600,200"
          stroke="#6a9bcc"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 3, ease: 'easeInOut' }}
        />
        <motion.path
          d="M-100,400 Q300,300 500,450 T900,350 T1300,500 T1700,380"
          stroke="#d97757"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 3, ease: 'easeInOut', delay: 0.5 }}
        />
        <motion.path
          d="M-100,600 Q250,500 450,620 T850,520 T1250,650 T1650,550"
          stroke="#788c5d"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 3, ease: 'easeInOut', delay: 1 }}
        />
      </svg>

      {/* Main content */}
      <motion.div
        className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Icon */}
        <motion.div
          className="mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="relative">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(217,119,87,0.12)', border: '1px solid rgba(217,119,87,0.2)' }}
            >
              <Bus className="w-8 h-8" style={{ color: '#d97757' }} />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: '#788c5d' }}>
              <div className="w-3 h-3 rounded-full animate-ping" style={{ background: '#788c5d', opacity: 0.4 }} />
            </div>
          </div>
        </motion.div>

        {/* Title — Space Grotesk display */}
        <motion.h1
          className="text-4xl md:text-5xl font-semibold mb-4"
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: '-0.035em',
            color: '#faf9f5',
            lineHeight: 1.15,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          LI Transit Navigator
        </motion.h1>

        {/* Subtitle — Source Serif 4 body */}
        <motion.p
          className="text-base md:text-lg mb-10 max-w-sm"
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            color: '#b0aea5',
            lineHeight: 1.6,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          Every Suffolk Transit and NICE bus route on Long Island.
          Real schedules. Intelligent trip planning.
        </motion.p>

        {/* Enter button — Claude-style warm accent */}
        <motion.button
          onClick={() => navigate('/explore')}
          className="group flex items-center gap-3 px-8 py-3.5 rounded-xl text-base font-medium transition-all"
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            background: '#d97757',
            color: '#141413',
            letterSpacing: '-0.01em',
          }}
          whileHover={{ scale: 1.03, boxShadow: '0 8px 30px rgba(217,119,87,0.3)' }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <span>Enter Navigator</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </motion.button>

        {/* Feature pills */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mt-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          {[
            { icon: MapPin, label: '69 Routes', color: '#6a9bcc' },
            { icon: Clock, label: 'Live Schedules', color: '#d97757' },
            { icon: Navigation, label: 'Trip Planner', color: '#788c5d' },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs"
              style={{
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                background: 'rgba(250,249,245,0.04)',
                border: '1px solid rgba(250,249,245,0.08)',
                color: '#b0aea5',
                fontWeight: 400,
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
              <span>{label}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Bottom attribution */}
      <motion.div
        className="absolute bottom-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
      >
        <p
          className="text-xs"
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            color: 'rgba(176,174,165,0.5)',
          }}
        >
          Built for Long Island Coalition for the Homeless
        </p>
      </motion.div>
    </div>
  );
}
