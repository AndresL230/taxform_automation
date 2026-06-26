import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Colored ground: teal and amber glows over paper. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 120% at 8% 0%, rgba(15,118,110,0.34), transparent 56%),' +
            'radial-gradient(120% 120% at 94% 100%, rgba(184,130,7,0.28), transparent 56%),' +
            '#FAFAF7',
        }}
      />

      <h1 className="text-6xl font-black leading-[0.95] tracking-tight text-ink sm:text-8xl">TaxExtract</h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
        Extract every field from your W-2 and 1099 forms in{' '}
        <span className="font-semibold text-accent">seconds</span>, checked and ready to review.
      </p>
      <Link
        to="/app"
        className="mt-8 inline-flex items-center gap-2 rounded-[3px] bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b5d56] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Get started
        <span aria-hidden>→</span>
      </Link>
      <p className="mt-10 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
        W-2 · 1099-NEC · 1099-INT · 1099-DIV
      </p>
    </div>
  )
}
