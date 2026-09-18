export const BRAND_BLUE = "#2563EB";

const LOGO_POINTS = {
  topLeft: [8, 8],
  bottomLeft: [8, 25],
  topRight: [24, 8],
  bottomRight: [24, 25],
  hub: [16, 16],
};

function NexusLogoIcon({ size = 32, className = "" }) {
  const { topLeft, bottomLeft, topRight, bottomRight, hub } = LOGO_POINTS;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Nexus"
      className={className}
    >
      <path
        d={`M${topLeft[0]} ${topLeft[1]} L${bottomLeft[0]} ${bottomLeft[1]}`}
        stroke={BRAND_BLUE}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d={`M${topLeft[0]} ${topLeft[1]} L${bottomRight[0]} ${bottomRight[1]}`}
        stroke={BRAND_BLUE}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d={`M${topRight[0]} ${topRight[1]} L${bottomRight[0]} ${bottomRight[1]}`}
        stroke={BRAND_BLUE}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d={`M${bottomLeft[0]} ${bottomLeft[1]} L${hub[0]} ${hub[1]}`}
        stroke={BRAND_BLUE}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d={`M${hub[0]} ${hub[1]} L${topRight[0]} ${topRight[1]}`}
        stroke={BRAND_BLUE}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {[topLeft, bottomLeft, topRight, bottomRight].map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="2.4" fill={BRAND_BLUE} />
      ))}
      <circle cx={hub[0]} cy={hub[1]} r="2.8" fill={BRAND_BLUE} />
    </svg>
  );
}

export function NexusLogo({ size = 32, showWordmark = true, className = "" }) {
  if (!showWordmark) {
    return <NexusLogoIcon size={size} className={className} />;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <NexusLogoIcon size={size} />
      <span
        className="font-semibold tracking-tight text-foreground"
        style={{ fontSize: size * 0.72, lineHeight: 1 }}
      >
        Nexus
      </span>
    </span>
  );
}

export default NexusLogoIcon;