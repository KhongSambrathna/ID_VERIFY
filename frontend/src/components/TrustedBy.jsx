import { useEffect, useRef, useState } from "react";
import api from "../api/axios";

const AUTO_SCROLL_STEP = 1; // px per tick
const AUTO_SCROLL_INTERVAL = 30; // ms per tick
const AUTO_SCROLL_RESUME_DELAY = 2500; // ms after manual interaction before auto-scroll resumes

// Logos are managed in the database now (Admin > Sponsors), so this strip
// just renders whatever the admin has added — no code changes needed to add,
// rename, or remove a logo. When there are more logos than fit on screen it
// auto-scrolls sideways (pausing while the visitor hovers/touches/scrolls it),
// and the arrow buttons let anyone scroll it manually at any time.
export default function TrustedBy() {
  const [sponsors, setSponsors] = useState([]);
  const trackRef = useRef(null);
  const timerRef = useRef(null);
  const resumeTimeoutRef = useRef(null);

  useEffect(() => {
    api
      .get("/sponsors")
      .then(({ data }) => setSponsors(Array.isArray(data) ? data : []))
      .catch(() => setSponsors([]));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || sponsors.length === 0) return;

    const stop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };

    const start = () => {
      stop();
      timerRef.current = setInterval(() => {
        if (!track) return;
        // nothing to auto-scroll if the strip already fits on screen
        if (track.scrollWidth <= track.clientWidth + 2) return;
        const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
        if (atEnd) {
          track.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          track.scrollLeft += AUTO_SCROLL_STEP;
        }
      }, AUTO_SCROLL_INTERVAL);
    };

    const pauseThenResume = () => {
      stop();
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = setTimeout(start, AUTO_SCROLL_RESUME_DELAY);
    };

    start();
    track.addEventListener("mouseenter", stop);
    track.addEventListener("mouseleave", start);
    track.addEventListener("touchstart", pauseThenResume, { passive: true });
    track.addEventListener("wheel", pauseThenResume, { passive: true });

    return () => {
      stop();
      clearTimeout(resumeTimeoutRef.current);
      track.removeEventListener("mouseenter", stop);
      track.removeEventListener("mouseleave", start);
      track.removeEventListener("touchstart", pauseThenResume);
      track.removeEventListener("wheel", pauseThenResume);
    };
  }, [sponsors]);

  if (sponsors.length === 0) return null;

  const scrollByArrow = (direction) => {
    trackRef.current?.scrollBy({ left: direction * 220, behavior: "smooth" });
  };

  return (
    <section className="trusted-by">
      <div className="container">
        <p className="trusted-by-label">Trusted by</p>
        <div className="trusted-by-wrap">
          <button
            type="button"
            className="trusted-by-arrow trusted-by-arrow-left"
            onClick={() => scrollByArrow(-1)}
            aria-label="Scroll left"
          >
            ‹
          </button>
          <div className="trusted-by-logos" ref={trackRef}>
            {sponsors.map((s) => (
              <img key={s._id} src={s.logoUrl} alt={s.name} title={s.name} />
            ))}
          </div>
          <button
            type="button"
            className="trusted-by-arrow trusted-by-arrow-right"
            onClick={() => scrollByArrow(1)}
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
