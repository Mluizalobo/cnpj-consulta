const svgProps = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});
export { svgProps };

export const IconSearch = (p) => (
  <svg {...svgProps()} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
export const IconLoader = (p) => (
  <svg {...svgProps()} className={"spin " + (p.className || "")} {...p}>
    <path d="M12 2a10 10 0 1 0 10 10" />
  </svg>
);
export const IconAlert = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);
export const IconCopy = (p) => (
  <svg {...svgProps()} {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
export const IconCheck = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const IconChevron = ({ open, ...p }) => (
  <svg {...svgProps(16)} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconCode = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </svg>
);
export const IconX = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </svg>
);
export const IconBuilding = (p) => (
  <svg {...svgProps()} {...p}>
    <rect x="4" y="2" width="16" height="20" rx="1" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
  </svg>
);
export const IconPin = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
export const IconPhone = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6.2 6.2l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
  </svg>
);
export const IconMail = (p) => (
  <svg {...svgProps()} {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </svg>
);
export const IconHash = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </svg>
);
export const IconLayers = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
export const IconGauge = (p) => (
  <svg {...svgProps()} {...p}>
    <path d="M12 14 15.5 9" />
    <circle cx="12" cy="14" r="1" />
    <path d="M4.6 19a9 9 0 1 1 14.8 0" />
  </svg>
);
