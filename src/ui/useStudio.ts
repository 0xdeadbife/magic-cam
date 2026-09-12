import { useEffect, useRef, useState } from "react";
import { Studio } from "../core/studio";
import { defaults, initialState, type Settings } from "../core/types";

export function useStudio() {
  const canvas = useRef<HTMLCanvasElement>(null),
    studio = useRef<Studio | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialState),
    [settings, setSettings] = useState<Settings>({ ...defaults });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [deviceId, setDeviceId] = useState("");
  const [duration, setDuration] = useState(5),
    [imageName, setImageName] = useState(""),
    [imageUrl, setImageUrl] = useState("");
  const [notice, setNotice] = useState(""),
    [help, setHelp] = useState(false),
    [uploading, setUploading] = useState(false);
  const imageGeneration = useRef(0);
  const live = state.capture === "live",
    starting = state.capture === "starting";
  async function refreshDevices() {
    try {
      setDevices(
        ((await navigator.mediaDevices?.enumerateDevices()) || []).filter(
          (d) => d.kind === "videoinput",
        ),
      );
    } catch {
      /* Permission may be needed first. */
    }
  }
  useEffect(() => {
    studio.current = new Studio(canvas.current!, setState);
    void refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      imageGeneration.current++;
      studio.current?.dispose();
      studio.current = null;
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        refreshDevices,
      );
    };
  }, []);
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  function update(patch: Partial<Settings>) {
    const next = { ...(studio.current?.settings ?? settings), ...patch };
    studio.current?.update(next);
    setSettings(next);
  }
  async function start() {
    setNotice("");
    await studio.current?.start(deviceId);
    await refreshDevices();
  }
  async function upload(file?: File) {
    if (!file) return;
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/avif",
        "image/bmp",
      ].includes(file.type)
    ) {
      setNotice("Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice("Choose an image smaller than 20 MB.");
      return;
    }
    const generation = ++imageGeneration.current;
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      if (generation !== imageGeneration.current || !studio.current) {
        bitmap.close();
        return;
      }
      if (bitmap.width * bitmap.height > 32_000_000) {
        bitmap.close();
        throw new Error("Choose an image under 32 megapixels.");
      }
      studio.current.setImage(bitmap);
      setImageName(file.name);
      setImageUrl(URL.createObjectURL(file));
      update({ imageMode: "overlay" });
      setNotice("");
    } catch (error) {
      if (generation !== imageGeneration.current) return;
      setNotice(
        error instanceof Error
          ? error.message
          : "This image could not be opened. Try another file.",
      );
    } finally {
      if (generation === imageGeneration.current) setUploading(false);
    }
  }
  function removeImage() {
    imageGeneration.current++;
    setUploading(false);
    studio.current?.setImage(null);
    setImageName("");
    setImageUrl("");
    update({ imageMode: "off" });
  }
  function reset() {
    imageGeneration.current++;
    setUploading(false);
    studio.current?.reset();
    setSettings({ ...defaults });
    setNotice("");
  }
  const trackingLabel = {
    off: "Tracking off",
    loading: "Loading face model",
    searching: "Looking for a face",
    tracked: "Face tracked",
    lost: "Face lost",
    error: "Tracker unavailable",
  }[state.tracking];
  return {
    canvas,
    studio,
    fileInput,
    state,
    settings,
    devices,
    deviceId,
    setDeviceId,
    duration,
    setDuration,
    imageName,
    imageUrl,
    notice,
    setNotice,
    help,
    setHelp,
    uploading,
    live,
    starting,
    refreshDevices,
    update,
    start,
    upload,
    removeImage,
    reset,
    trackingLabel,
  };
}
