import "./styles.css";
import "./custom-editor-popout.css";

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { CustomEditorChrome } from "./custom-editor-chrome.jsx";
import { createCustomSlideEditor } from "./custom-slide-editor.js";
import { uploadCustomImage } from "./custom-slide-bridge.js";
import { createPopoutSequence, writeRecovery } from "./custom-editor-popout-protocol.js";

function PopoutEditor() {
  const editorRoot = useRef(null);
  const editor = useRef(null);
  const channel = useRef(null);
  const sequence = useRef(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState("주 창에 연결하는 중…");
  const [slideName, setSlideName] = useState("커스텀 슬라이드");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URL(location.href).searchParams;
    const sessionId = params.get("session");
    const slideId = params.get("slide");
    if (!sessionId || !slideId) {
      setStatus("편집 세션 정보가 없습니다.");
      return;
    }
    document.body.dataset.theme = localStorage.getItem("biblics-theme") || "dark";
    const bus = new BroadcastChannel(`samil-custom-editor:${sessionId}`);
    const messages = createPopoutSequence({ sessionId, slideId });
    channel.current = bus;
    sequence.current = messages;
    let disposed = false;

    createCustomSlideEditor(editorRoot.current, {
      uploadImage: (file) => uploadCustomImage(file),
      onChange() {
        if (!readyRef.current || !editor.current) return;
        const session = editor.current.exportSession();
        writeRecovery(localStorage, sessionId, session);
        bus.postMessage(messages.next("EDITOR_CHANGED", { session }));
      },
      onError: (message) => setStatus(message),
    }).then((instance) => {
      if (disposed) return instance.destroy();
      editor.current = instance;
      bus.postMessage(messages.next("READY", {}));
    });

    bus.onmessage = async ({ data }) => {
      const accepted = messages.accept(data);
      if (!accepted.valid || disposed) return;
      if (data.type === "INITIALIZE_SESSION") {
        setSlideName(data.payload.slideName || "커스텀 슬라이드");
        document.title = `${data.payload.slideName || "커스텀 슬라이드"} 편집`;
        await editor.current.importSession(data.payload.session);
        readyRef.current = true;
        setReady(true);
        setStatus("주 창과 연결됨");
      } else if (data.type === "SAVE_RESULT") {
        if (data.payload.saved) {
          editor.current.markSaved();
          setStatus("저장됨");
        } else {
          setStatus("저장하지 못했습니다.");
        }
      } else if (data.type === "FINAL_ACK") {
        window.close();
      }
    };

    const sendFinal = () => {
      if (!editor.current) return;
      bus.postMessage(
        messages.next("FINAL_SNAPSHOT", {
          session: editor.current.exportSession(),
        })
      );
    };
    window.addEventListener("pagehide", sendFinal);
    editorRoot.current.__sendFinal = sendFinal;
    return () => {
      disposed = true;
      window.removeEventListener("pagehide", sendFinal);
      bus.close();
      editor.current?.destroy();
    };
  }, []);

  function save() {
    if (!ready || !editor.current) return;
    setStatus("저장 중…");
    channel.current.postMessage(
      sequence.current.next("SAVE_REQUEST", {
        session: editor.current.exportSession(),
      })
    );
  }

  function mergeBack() {
    setStatus("주 창으로 합치는 중…");
    editorRoot.current.__sendFinal?.();
  }

  return (
    <main className="popout-shell">
      <header className="popout-header">
        <h1>{slideName}</h1>
        <span className="popout-status" role="status">{status}</span>
        <button type="button" className="ghost small" onClick={mergeBack} disabled={!ready}>
          주 창으로 합치기
        </button>
        <button type="button" className="cta small" onClick={save} disabled={!ready}>
          저장
        </button>
      </header>
      <section
        ref={editorRoot}
        className="custom-editor popout-editor"
        data-react-chrome="true"
        aria-label="독립 커스텀 슬라이드 편집기"
      >
        <CustomEditorChrome />
        <div className="custom-editor-body">
          <div className="custom-editor-stage" data-custom-editor="stage">
            <canvas width="1280" height="720" data-custom-editor="canvas" />
          </div>
        </div>
        <p className="custom-editor-status" data-custom-editor="status" role="status"></p>
        <p className="custom-editor-error" data-custom-editor="error" role="alert" hidden></p>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-custom-editor="file" hidden />
      </section>
    </main>
  );
}

createRoot(document.getElementById("customEditorPopoutRoot")).render(<PopoutEditor />);
