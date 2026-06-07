import Image from "next/image";

import {
  SITE_ICON,
  SITE_ICON_DISPLAY_PX,
  SITE_ICON_SOURCE_PX,
} from "@/lib/site-brand";

/** Crisp brand mark — full-res PNG, browser downscales (avoids Next image compression blur). */
export function SiteLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src={SITE_ICON}
      alt=""
      width={SITE_ICON_SOURCE_PX}
      height={SITE_ICON_SOURCE_PX}
      sizes={`${SITE_ICON_DISPLAY_PX}px`}
      unoptimized
      priority
      className={`site-logo object-contain ${className}`.trim()}
      style={{ width: SITE_ICON_DISPLAY_PX, height: SITE_ICON_DISPLAY_PX }}
    />
  );
}
