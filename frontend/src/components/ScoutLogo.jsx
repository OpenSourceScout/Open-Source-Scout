export const SCOUT_LOGO_SRC = '/Opensource_Scout-Logo.png'

export default function ScoutLogo({
  className = 'h-8 w-8',
  alt = 'Open Source Scout',
}) {
  return (
    <img
      src={SCOUT_LOGO_SRC}
      alt={alt}
      className={`object-contain shrink-0 rounded-lg ${className}`}
      draggable={false}
    />
  )
}
