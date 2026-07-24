import React from 'react';

export function PadelRacquetIcon({ size = 28, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Padel Racquet"
    >
      {/* Solid round face */}
      <ellipse
        cx="13"
        cy="10"
        rx="8.5"
        ry="9"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />

      {/* Hole pattern — triangular arrangement */}
      <circle cx="13" cy="7" r="1.1" fill={color} opacity="0.7" />
      <circle cx="10" cy="12" r="1.1" fill={color} opacity="0.7" />
      <circle cx="16" cy="12" r="1.1" fill={color} opacity="0.7" />

      {/* Short neck */}
      <path
        d="M10.5 18.5 L11.5 21 L14.5 21 L15.5 18.5"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
      />

      {/* Handle */}
      <rect x="10.5" y="21" width="4" height="6" rx="2" fill={color} />

      {/* Grip wrap */}
      <line
        x1="10.3"
        y1="23"
        x2="14.7"
        y2="23"
        stroke="var(--bg, #fff)"
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

export function TennisRacquetIcon({ size = 28, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tennis Racquet"
    >
      {/* Racquet head (oval frame) */}
      <ellipse
        cx="11"
        cy="10"
        rx="8"
        ry="9.5"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />

      {/* Vertical strings */}
      <line
        x1="8"
        y1="1.2"
        x2="8"
        y2="18.8"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="11"
        y1="0.6"
        x2="11"
        y2="19.4"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="1.2"
        x2="14"
        y2="18.8"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* Horizontal strings */}
      <line
        x1="3.2"
        y1="7"
        x2="18.8"
        y2="7"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="2.6"
        y1="10"
        x2="19.4"
        y2="10"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <line
        x1="3.2"
        y1="13"
        x2="18.8"
        y2="13"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* Throat / neck */}
      <path
        d="M8 18.5 L9.5 21.5 L12.5 21.5 L14 18.5"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
      />

      {/* Handle */}
      <rect x="10" y="21.5" width="2" height="5.5" rx="1" fill={color} />

      {/* Grip wrap lines */}
      <line
        x1="9.8"
        y1="23.2"
        x2="12.2"
        y2="23.2"
        stroke={color}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="9.8"
        y1="25.0"
        x2="12.2"
        y2="25.0"
        stroke={color}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function PickleballPaddleIcon({ size = 28, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pickleball Paddle"
    >
      {/* Paddle face (rounded rectangle, wider/flatter than tennis) */}
      <rect
        x="3"
        y="1.5"
        width="17"
        height="16"
        rx="4"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />

      {/* Hole pattern (3x3 grid of small circles — pickleball paddle perforations) */}
      <circle cx="7.5" cy="6" r="1" fill={color} opacity="0.7" />
      <circle cx="11.5" cy="6" r="1" fill={color} opacity="0.7" />
      <circle cx="15.5" cy="6" r="1" fill={color} opacity="0.7" />

      <circle cx="7.5" cy="9.5" r="1" fill={color} opacity="0.7" />
      <circle cx="11.5" cy="9.5" r="1" fill={color} opacity="0.7" />
      <circle cx="15.5" cy="9.5" r="1" fill={color} opacity="0.7" />

      <circle cx="7.5" cy="13" r="1" fill={color} opacity="0.7" />
      <circle cx="11.5" cy="13" r="1" fill={color} opacity="0.7" />
      <circle cx="15.5" cy="13" r="1" fill={color} opacity="0.7" />

      {/* Short neck */}
      <path
        d="M9.5 17.5 L9.5 20 L13.5 20 L13.5 17.5"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
      />

      {/* Handle */}
      <rect x="10" y="20" width="3" height="7" rx="1.5" fill={color} />

      {/* Grip wrap lines */}
      <line
        x1="9.8"
        y1="22"
        x2="13.2"
        y2="22"
        stroke={color}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      <line
        x1="9.8"
        y1="24"
        x2="13.2"
        y2="24"
        stroke={color}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      <line
        x1="9.8"
        y1="26"
        x2="13.2"
        y2="26"
        stroke={color}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
