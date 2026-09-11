import html2canvas from "html2canvas";

// Shared "save as image" export for Formation and Starting XI posters.
//
// Both posters are naturally different shapes on screen (Formation is a
// tall pitch, Starting XI is a wider card grid), and their height also
// varies with content (number of subs, formation shape, etc). Rather than
// exporting whatever shape happens to render, every export is composed
// onto a fixed portrait frame — the Instagram "feed post" ratio, 4:5
// (1080x1350) — so every saved image is consistently portrait and ready
// to post as-is.
//
// The captured poster is scaled to fit ENTIRELY inside that frame (never
// cropped) and centered; any leftover space top/bottom or left/right is
// filled with the poster's own background color so it reads as a clean
// margin rather than a visible bar.
const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1350; // 4:5 portrait — Instagram feed-post size

export async function exportPosterAsImage(node, { filename, format, backgroundColor = "#0a1830" }) {
  if (!node) return;

  const captured = await html2canvas(node, {
    useCORS: true,
    scale: 2,
    backgroundColor,
  });

  const frame = document.createElement("canvas");
  frame.width = EXPORT_WIDTH;
  frame.height = EXPORT_HEIGHT;
  const ctx = frame.getContext("2d");
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

  const scale = Math.min(EXPORT_WIDTH / captured.width, EXPORT_HEIGHT / captured.height);
  const drawWidth = captured.width * scale;
  const drawHeight = captured.height * scale;
  const dx = (EXPORT_WIDTH - drawWidth) / 2;
  const dy = (EXPORT_HEIGHT - drawHeight) / 2;
  ctx.drawImage(captured, 0, 0, captured.width, captured.height, dx, dy, drawWidth, drawHeight);

  const link = document.createElement("a");
  link.download = `${filename}.${format}`;
  link.href = format === "png" ? frame.toDataURL("image/png") : frame.toDataURL("image/jpeg", 0.95);
  link.click();
}
