export class CameraCapture {
  readonly video = document.createElement("video");
  private stream: MediaStream | null = null;
  private generation = 0;
  constructor(private onDisconnect: () => void) {
    this.video.muted = true;
    this.video.playsInline = true;
  }
  async start(deviceId: string): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera access requires localhost or HTTPS and a supported browser.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    stream.getVideoTracks()[0].onended = () => this.onDisconnect();
    this.video.srcObject = stream;
    await this.video.play();
    return generation === this.generation;
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}
