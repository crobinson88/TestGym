import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { tdlSignedUrlMap, uploadTdlImages } from "../storage";

// Editable image strip used while creating or editing an item's detail. Files
// upload immediately to Storage (needs a connection); only the returned object
// paths are kept on the row, so removing a thumbnail just drops the reference.
export function ImageEditor({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const paths = await uploadTdlImages(Array.from(files));
      onChange([...images, ...paths]);
    } catch {
      setError("Upload failed — check you're online and try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((path) => {
            const url = urls[path];
            return (
              <div key={path} className="relative">
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-20 w-20 rounded-lg border border-line object-cover"
                  />
                ) : (
                  <div className="h-20 w-20 animate-pulse rounded-lg border border-line bg-surface2" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(images.filter((p) => p !== path))}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-danger"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void onPick(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus className="mr-1 h-4 w-4" /> {busy ? "Uploading…" : "Add image"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
