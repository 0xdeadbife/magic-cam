import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";

function Output() {
  React.useEffect(() => {
    document.title = "Magic Cam — Clean Output";
    window.opener?.postMessage("magic-cam-output-ready", location.origin);
  }, []);
  return (
    <main className="output-only">
      <video autoPlay muted playsInline aria-label="Processed studio output" />
      {!window.opener && (
        <p>
          Open OBS Output from the Magic Cam studio to connect its processed
          video.
        </p>
      )}
    </main>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("output") ? <Output /> : <App />,
);
