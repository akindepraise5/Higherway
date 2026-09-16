/**
 * The Higherway mark: an arc, like a road going over a rise. Used on covers,
 * in the masthead and in the footer. Inline rather than a file, because it is
 * drawn at half a dozen sizes and never needs a network request.
 */
export function Arc({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 11" className={className} aria-hidden="true" focusable="false">
      <title>Higherway</title>
      <path
        d="M2 9.2C5 3.6 11 1 18 1s13 2.6 16 8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex flex-col items-start gap-px ${className}`}>
      <Arc className="h-[11px] w-9 text-gold-2" />
      <span className="font-serif text-[23px] leading-none tracking-[-0.018em]">Higherway</span>
    </span>
  )
}
