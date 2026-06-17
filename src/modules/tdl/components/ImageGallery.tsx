import { useEffect, useState } from "react";
import { tdlSignedUrlMap } from "../storage";

// Read-only thumbnail strip. Paths are resolved to short-lived signed URLs on
// mount and whenever the set of paths changes.
export function ImageGallery({ images }: { images: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = images.join(",");

  useEffect(() => {
    if (images.length === 0) {
      setUrls({});
      return;
    }
    let active = true;
    void tdlSignedUrlMap(images).then((m) => {
      if (active) setUrls(m);
    });
    return () => {
      active = false;
    };
  }, [key]);

  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((path) => {
        const url = urls[path];
        return url ? (
          <a key={path} href={url} target="_blank" rel="noreferrer" className="block">
            <img
              src={url}
              alt=""
              className="h-20 w-20 rounded-lg border border-line object-cover"
            />
          </a>
        ) : (
          <div
            key={path}
            className="h-20 w-20 animate-pulse rounded-lg border border-line bg-surface2"
          />
        );
      })}
    </div>
  );
}
