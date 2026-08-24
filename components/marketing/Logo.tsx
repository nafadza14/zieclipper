import Image from 'next/image'

// Reusable brand mark. Uses the PNG mark shipped in /public + the wordmark
// "zieclip" (final product name — was zieclipper earlier).
export function Logo({ size = 40, text = true, textClassName }: { size?: number; text?: boolean; textClassName?: string }) {
  // Wordmark scales with the mark so proportions stay consistent when the
  // caller passes a bigger size.
  const textSize = Math.max(14, Math.round(size * 0.42))
  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src="/logo.png"
        alt="zieclip"
        width={size}
        height={size}
        priority
        className="rounded-md"
        style={{ height: size, width: 'auto' }}
      />
      {text && (
        <span
          className={textClassName ?? 'text-white font-semibold tracking-tight'}
          style={{ fontSize: textSize }}
        >
          zieclip
        </span>
      )}
    </span>
  )
}
