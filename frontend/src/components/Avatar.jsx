import { useState } from "react";
import { resolveFileUrl } from "../utils/fileUrl";

// Round picture of a person, or their initials when there's no photo.
export default function Avatar({ name, photoUrl, size = 32, className = "" }) {
  const [broken, setBroken] = useState(false);
  const initials = String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  return photoUrl && !broken ? (
    <img className={`avatar ${className}`} style={style} src={resolveFileUrl(photoUrl)} alt={name || ""} onError={() => setBroken(true)} />
  ) : (
    <span className={`avatar avatar-initials ${className}`} style={style} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
