// On a phone, a plain <a download> link just drops the file into the
// browser's Downloads/Files app — from there people have to dig it out and
// move it into Photos by hand, which is what was getting complained about.
// The Web Share API's native share sheet has a "Save Image"/"Save to
// Photos" option built in on both iOS and Android, so that's what we use
// when the browser supports sharing a file; anywhere it doesn't (desktop
// browsers, mainly), this falls back to the old download-link approach.
export async function saveCanvasAsImage(canvas, filename) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("Failed to render image");

  const file = new File([blob], filename, { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return; // handled by the native share sheet, Save to Photos included
    } catch (err) {
      if (err.name === "AbortError") return; // user cancelled the share sheet — don't also force a download
      // any other share failure falls through to the plain download below
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
