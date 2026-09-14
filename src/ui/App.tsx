import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  Camera,
  CircleDashed,
  ChevronDown,
  CircleHelp,
  FlipHorizontal2,
  Focus,
  Grid2X2,
  Film,
  ImagePlus,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MonitorUp,
  Play,
  RotateCcw,
  ScanFace,
  Snowflake,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useStudio } from "./useStudio";
import { appUrl } from "../core/urls";

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
    >
      <span />
    </button>
  );
}
function Slider({
  label,
  value,
  min,
  max,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="slider-label">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
    </label>
  );
}
function Effect({
  icon,
  title,
  active,
  children,
  control,
}: {
  icon: ReactNode;
  title: string;
  active?: boolean;
  children: ReactNode;
  control?: ReactNode;
}) {
  return (
    <section className={`effect ${active ? "active" : ""}`}>
      <div className="effect-heading">
        <span className="effect-icon">{icon}</span>
        <h3>{title}</h3>
        {control}
      </div>
      {children}
    </section>
  );
}
function Help({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = element.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    element.addEventListener("keydown", keepFocus);
    element.showModal();
    return () => {
      element.removeEventListener("keydown", keepFocus);
      element.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="help-dialog"
      aria-labelledby="obs-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label="Close setup guide"
        onClick={close}
      >
        <X size={18} />
      </button>
      <MonitorUp size={25} className="accent" />
      <h2 id="obs-title">Connect OBS</h2>
      <ol>
        <li>
          <strong>Open OBS Output</strong>
          <p>Start the camera, set your look, then open the output window.</p>
        </li>
        <li>
          <strong>OBS → Window Capture</strong>
          <p>
            Select “Magic Cam — Clean Output”. Crop browser chrome and fit the
            image without stretching it.
          </p>
        </li>
        <li>
          <strong>Start OBS Virtual Camera</strong>
          <p>Select it as your camera in your meeting or streaming app.</p>
        </li>
      </ol>
      <p className="help-note">
        Keep both windows open and the output visible. It shares this studio’s
        processed stream. Use Window Capture; manage audio in OBS.
      </p>
      <button className="button primary" onClick={close}>
        Close
      </button>
    </dialog>
  );
}

export function App() {
  const {
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
    customSeconds,
    setCustomSeconds,
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
  } = useStudio();
  const toggleFreeze = useCallback(() => {
    const current = studio.current;
    if (current?.state.capture !== "live") return;
    if (current.state.frozen) current.release();
    else
      current.freeze(
        duration < 0
          ? Math.max(1, Math.min(3600, Number(customSeconds) || 8))
          : duration,
      );
  }, [studio, duration, customSeconds]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        help ||
        studio.current?.state.capture !== "live"
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, a, [role="switch"], [role="textbox"], dialog',
          ))
      )
        return;
      // Own the Space gesture so a focused button cannot also fire on keyup.
      event.preventDefault();
      if (!event.repeat) toggleFreeze();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [help, studio, toggleFreeze]);
  const lastImageMode = useRef<"overlay" | "replace">("overlay");
  if (settings.imageMode !== "off") lastImageMode.current = settings.imageMode;
  const modeDescription =
    state.trackingMode === "worker"
      ? "Worker · up to 15 inferences/s"
      : state.trackingMode === "main"
        ? "Main thread fallback · up to 8/s"
        : "Processing stays on this device";
  async function fullscreen() {
    try {
      if (!canvas.current?.requestFullscreen) throw new Error("unsupported");
      await canvas.current.requestFullscreen();
    } catch {
      setNotice("Fullscreen unavailable. Use the clean output window.");
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Magic Cam studio">
          <img src={appUrl("magic-star.svg")} width="32" height="32" alt="" />
          <h1>Magic Cam</h1>
        </div>
        <div className="top-actions">
          <span
            className="local-status"
            title="Processing stays in this browser · visual settings are saved for this site"
          >
            <LockKeyhole size={12} />
            <span>On-device</span>
          </span>
          <button
            className="icon-button"
            title="OBS setup guide"
            aria-label="OBS setup guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
          </button>
          <button
            className={`button output-button ${state.outputOpen ? "connected" : ""}`}
            aria-label={
              state.outputOpen ? "Show OBS output" : "Open OBS output"
            }
            onClick={() => {
              if (!studio.current?.openOutput())
                setNotice(
                  "Allow pop-ups for this site, then open output again.",
                );
            }}
          >
            <MonitorUp size={16} />
            <span>OBS Output</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </header>
      <main className="workspace">
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button
              className="icon-button"
              aria-label="Dismiss notice"
              onClick={() => setNotice("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="studio-layout">
          <div className="preview-column">
            <div className="section-heading">
              <h2>Preview</h2>
              <span
                className={`live-tag ${live ? "is-live" : ""} ${state.frozen ? "frozen" : ""}`}
              >
                <i />
                {state.frozen ? "Frozen" : live ? "Live" : "Camera off"}
              </span>
            </div>
            <section className="preview-panel">
              <div
                className={`preview ${live ? "has-video" : ""}`}
                style={{ aspectRatio: `${state.width} / ${state.height}` }}
              >
                <canvas
                  ref={canvas}
                  aria-label="Final composited webcam preview"
                />
                {!live && (
                  <div className="empty-preview">
                    <img
                      className="idle-mark"
                      src={appUrl("magic-star.svg")}
                      width="56"
                      height="56"
                      alt=""
                    />
                    {state.capture !== "idle" && (
                      <div className="capture-message" role="status">
                        <h2>
                          {starting
                            ? "Connecting"
                            : state.capture === "denied"
                              ? "Camera access denied"
                              : state.capture === "disconnected"
                                ? "Camera disconnected"
                                : "Camera unavailable"}
                        </h2>
                        {state.message && <p>{state.message}</p>}
                      </div>
                    )}
                    {!starting ? (
                      <button
                        className="button start-camera"
                        onClick={() => void start()}
                      >
                        <Camera size={15} />
                        {state.capture === "idle"
                          ? "Start camera"
                          : "Try again"}
                      </button>
                    ) : (
                      <LoaderCircle className="spin" size={20} />
                    )}
                  </div>
                )}
                {live && state.frozen && (
                  <div className="frame-badge">
                    <Snowflake size={13} />
                    {state.freezeRemaining === null
                      ? "Frozen"
                      : `${state.freezeRemaining.toFixed(1)}s`}
                  </div>
                )}
                {live &&
                  !state.frozen &&
                  settings.pixelate &&
                  settings.imageMode !== "replace" &&
                  state.tracking !== "tracked" && (
                    <div className="frame-badge tracking-badge" role="status">
                      <ScanFace size={13} />
                      {trackingLabel}
                    </div>
                  )}
              </div>
            </section>
            <section className="source-panel">
              <Camera size={16} className="source-icon" />
              <div className="select-wrap">
                <select
                  id="camera"
                  aria-label="Video source"
                  value={deviceId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDeviceId(value);
                    if (live || starting)
                      void studio.current?.start(value).then(refreshDevices);
                  }}
                >
                  <option value="">Default camera</option>
                  {devices
                    .filter((device) => device.deviceId)
                    .map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${index + 1}`}
                      </option>
                    ))}
                </select>
                <ChevronDown size={13} />
              </div>
              <div className="source-actions">
                <button
                  className={`icon-button ${settings.mirror ? "selected" : ""}`}
                  aria-pressed={settings.mirror}
                  title="Mirror webcam"
                  aria-label="Mirror webcam"
                  onClick={() => update({ mirror: !settings.mirror })}
                >
                  <FlipHorizontal2 size={17} />
                </button>
                <button
                  className="icon-button"
                  title="Fullscreen preview"
                  aria-label="Fullscreen preview"
                  onClick={() => void fullscreen()}
                >
                  <Maximize2 size={15} />
                </button>
                <span className="divider" />
                <button
                  className={`button hold-button ${state.frozen ? "held" : ""}`}
                  disabled={!live}
                  aria-label={state.frozen ? "Release frame" : "Freeze frame"}
                  aria-keyshortcuts="Space"
                  title="Space · freeze / release"
                  onClick={toggleFreeze}
                >
                  {state.frozen ? <Play size={12} /> : <Snowflake size={12} />}
                  <span>{state.frozen ? "Release" : "Freeze"}</span>
                </button>
                <span className="divider" />
                <button
                  className={`button capture-button ${live || starting ? "stop-button" : ""}`}
                  onClick={() =>
                    live || starting ? studio.current?.stop() : void start()
                  }
                >
                  {live || starting ? (
                    <Square size={11} fill="currentColor" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                  {live ? "Stop" : starting ? "Cancel" : "Start"}
                </button>
              </div>
            </section>
            <div className="telemetry">
              <span
                className={`camera-status ${live ? "online" : ""}`}
                title={live ? "Camera connected" : "Camera offline"}
                aria-label={live ? "Camera connected" : "Camera offline"}
                data-testid="camera-status"
                data-live={live}
              >
                <i />
                {state.width} × {state.height}
              </span>
              <span
                className="metric"
                title="Measured compositing frames per second"
              >
                <b>{live ? Math.round(state.fps) : "—"}</b>
                <small>fps</small>
              </span>
              <span
                className="metric"
                title="Last face inference duration; not end-to-end latency"
              >
                <b>
                  {state.inferenceMs === null
                    ? "—"
                    : state.inferenceMs.toFixed(1)}
                </b>
                <small>ms</small>
              </span>
              <span
                className="tracking-status"
                data-testid="tracking-status"
                data-mode={state.trackingMode ?? "off"}
                title={modeDescription}
              >
                <Focus size={12} />
                {state.frozen ? "Face tracking paused" : trackingLabel}
              </span>
            </div>
            {state.trackingError && (
              <p className="error-text" role="alert">
                {state.trackingError} Toggle Face Mosaic to retry.
              </p>
            )}
          </div>
          <aside className="effects-column">
            <div className="section-heading">
              <h2>Tools</h2>
              <button
                className="icon-button"
                aria-label="Reset visual settings"
                title="Restore clean camera"
                onClick={reset}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="effects-rack">
              <Effect
                icon={<CircleDashed size={17} />}
                title="Backdrop Blur"
                active={settings.backgroundBlur}
                control={
                  <Toggle
                    label="Enable Backdrop Blur"
                    checked={settings.backgroundBlur}
                    onChange={() =>
                      update({ backgroundBlur: !settings.backgroundBlur })
                    }
                  />
                }
              >
                {settings.backgroundBlur && (
                  <div className="effect-adjustments">
                    <Slider
                      label="Strength"
                      value={settings.blurAmount}
                      min={0}
                      max={100}
                      onChange={(n) => update({ blurAmount: n })}
                    />
                    <div title="Increases blur with distance from the person. Zero keeps the backdrop uniformly blurred.">
                      <Slider
                        label="Blur ramp"
                        value={settings.blurFalloff}
                        min={0}
                        max={100}
                        onChange={(n) => update({ blurFalloff: n })}
                      />
                    </div>
                    <p
                      className={`effect-status ${state.segmentation === "error" ? "error-text" : ""}`}
                      role="status"
                      data-testid="segmentation-status"
                      data-state={state.segmentation}
                    >
                      {settings.imageMode === "replace" ? (
                        "Off during feed replacement"
                      ) : state.frozen ? (
                        "Paused while frozen"
                      ) : !live ? (
                        "Starts with camera"
                      ) : settings.blurAmount === 0 ? (
                        "Strength at 0%"
                      ) : state.segmentation === "loading" ? (
                        <>
                          <LoaderCircle size={12} className="spin" />
                          Loading person mask…
                        </>
                      ) : state.segmentation === "error" ? (
                        "Unavailable · toggle to retry"
                      ) : state.segmentation === "lost" ? (
                        "Person not found"
                      ) : (
                        "Person mask active"
                      )}
                      {state.segmentationMs !== null && (
                        <span title="Measured person segmentation duration">
                          {state.segmentationMs.toFixed(1)} ms
                        </span>
                      )}
                    </p>
                    {state.segmentationError && (
                      <p className="error-text" role="alert">
                        {state.segmentationError}
                      </p>
                    )}
                  </div>
                )}
              </Effect>
              <Effect
                icon={<Film size={17} />}
                title="Film Grain"
                active={settings.grain}
                control={
                  <Toggle
                    label="Enable Film Grain"
                    checked={settings.grain}
                    onChange={() => update({ grain: !settings.grain })}
                  />
                }
              >
                {settings.grain && (
                  <div className="effect-adjustments">
                    <Slider
                      label="Intensity"
                      value={settings.grainAmount}
                      min={0}
                      max={100}
                      onChange={(n) => update({ grainAmount: n })}
                    />
                    <div title="Fine to coarse monochrome grain.">
                      <Slider
                        label="Scale"
                        value={settings.grainSize}
                        min={0}
                        max={100}
                        onChange={(n) => update({ grainSize: n })}
                      />
                    </div>
                  </div>
                )}
              </Effect>
              <Effect
                icon={<Grid2X2 size={17} />}
                title="Face Mosaic"
                active={settings.pixelate}
                control={
                  <Toggle
                    label="Enable Face Mosaic"
                    checked={settings.pixelate}
                    onChange={() => update({ pixelate: !settings.pixelate })}
                  />
                }
              >
                {settings.pixelate && (
                  <Slider
                    label="Block size"
                    min={4}
                    max={64}
                    value={settings.pixelSize}
                    unit=" px"
                    onChange={(n) => update({ pixelSize: n })}
                  />
                )}
                {settings.pixelate && settings.imageMode === "replace" && (
                  <p className="effect-note">Off during feed replacement</p>
                )}
              </Effect>
              <Effect
                icon={<Snowflake size={17} />}
                title="Frame Hold"
                active={state.frozen}
              >
                <div className="duration-row">
                  <label htmlFor="duration">Duration</label>
                  <div className="select-wrap">
                    <select
                      id="duration"
                      value={duration}
                      onChange={(event) =>
                        setDuration(Number(event.target.value))
                      }
                    >
                      <option value={3}>3 seconds</option>
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={0}>Until released</option>
                      <option value={-1}>Custom</option>
                    </select>
                    <ChevronDown size={12} />
                  </div>
                </div>
                {duration < 0 && (
                  <label className="custom-duration">
                    Seconds
                    <input
                      id="custom-seconds"
                      type="number"
                      min={1}
                      max={3600}
                      value={customSeconds}
                      onChange={(event) => setCustomSeconds(event.target.value)}
                    />
                  </label>
                )}
                <div className="shortcut-note">
                  <kbd>Space</kbd>
                  <span>Freeze / release</span>
                </div>
              </Effect>
              <Effect
                icon={<ImagePlus size={17} />}
                title="Image Layer"
                active={settings.imageMode !== "off"}
                control={
                  <Toggle
                    label="Enable Image Layer"
                    checked={settings.imageMode !== "off"}
                    disabled={!imageName}
                    onChange={() =>
                      update({
                        imageMode:
                          settings.imageMode === "off"
                            ? lastImageMode.current
                            : "off",
                      })
                    }
                  />
                }
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
                  hidden
                  onChange={(event) => {
                    void upload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <div
                  className="image-drop"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void upload(event.dataTransfer.files[0]);
                  }}
                >
                  {imageName ? (
                    <div className="image-file">
                      <button
                        className="image-thumbnail"
                        title="Change image"
                        aria-label="Change image"
                        onClick={() => fileInput.current?.click()}
                      >
                        <img src={imageUrl} alt="Uploaded layer thumbnail" />
                      </button>
                      <strong title={imageName}>{imageName}</strong>
                      <button
                        className="icon-button"
                        aria-label="Remove image"
                        title="Remove image"
                        onClick={removeImage}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="upload-zone"
                      title="Drop an image or browse · up to 20 MB"
                      onClick={() => fileInput.current?.click()}
                    >
                      {uploading ? (
                        <LoaderCircle className="spin" size={19} />
                      ) : (
                        <Upload size={19} />
                      )}
                      <span>{uploading ? "Opening…" : "Choose image"}</span>
                    </button>
                  )}
                </div>
                {imageName && (
                  <>
                    <div className="segmented" aria-label="Layer mode">
                      <button
                        aria-pressed={settings.imageMode === "overlay"}
                        className={
                          settings.imageMode === "overlay" ? "selected" : ""
                        }
                        onClick={() => update({ imageMode: "overlay" })}
                      >
                        <Layers size={12} />
                        Overlay
                      </button>
                      <button
                        aria-label="Replace camera feed"
                        aria-pressed={settings.imageMode === "replace"}
                        className={
                          settings.imageMode === "replace" ? "selected" : ""
                        }
                        onClick={() => update({ imageMode: "replace" })}
                      >
                        Replace feed
                      </button>
                    </div>
                    {settings.imageMode === "overlay" && (
                      <div className="image-adjustments">
                        <Slider
                          label="Scale"
                          min={5}
                          max={100}
                          value={settings.imageSize}
                          onChange={(n) => update({ imageSize: n })}
                        />
                        <Slider
                          label="Opacity"
                          min={0}
                          max={100}
                          value={settings.imageOpacity}
                          onChange={(n) => update({ imageOpacity: n })}
                        />
                        <div className="position-sliders">
                          <Slider
                            label="X position"
                            min={0}
                            max={100}
                            value={settings.imageX}
                            onChange={(n) => update({ imageX: n })}
                          />
                          <Slider
                            label="Y position"
                            min={0}
                            max={100}
                            value={settings.imageY}
                            onChange={(n) => update({ imageY: n })}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Effect>
            </div>
          </aside>
        </div>
      </main>
      {help && <Help close={() => setHelp(false)} />}
    </div>
  );
}
