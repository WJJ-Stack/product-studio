import { useEffect, useMemo, useRef, useState } from "react";

const SCENES = [
  { id: "studio", name: "极简影棚", swatch: "linear-gradient(135deg,#f4f1ec,#d9d4cc)" },
  { id: "forest", name: "自然森系", swatch: "linear-gradient(135deg,#d7eadc,#6f9b7a)" },
  { id: "cafe", name: "生活咖啡馆", swatch: "linear-gradient(135deg,#f0e0c8,#b8885a)" },
  { id: "luxury", name: "轻奢鎏金", swatch: "linear-gradient(135deg,#3a342c,#c9a45c)" },
];

const PLATFORMS = [
  { id: "xiaohongshu", name: "小红书" },
  { id: "taobao", name: "淘宝 / 京东" },
  { id: "moments", name: "朋友圈" },
  { id: "douyin", name: "抖音" },
];

const RATIOS = [
  { id: "1:1", name: "1:1 电商主图" },
  { id: "3:4", name: "3:4 小红书" },
  { id: "4:3", name: "4:3 横版宣传" },
];

const HIST_KEY = "product-studio-history";
const MAX_BYTES = 10 * 1024 * 1024;

const SAMPLES = [
  { src: "/samples/serum.jpg", name: "轻盈焕亮精华液", extra: "玻璃滴管瓶，干净台面，柔光" },
  { src: "/samples/perfume.jpg", name: "夜色木质香水", extra: "玻璃香水瓶，高级质感" },
  { src: "/samples/coffee.jpg", name: "手冲精品咖啡豆", extra: "牛皮纸袋包装，生活感" },
  { src: "/samples/watch.jpg", name: "极简石英腕表", extra: "白底静物，主体清晰" },
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const inputRef = useRef(null);
  const [image, setImage] = useState("");
  const [scene, setScene] = useState("studio");
  const [ratio, setRatio] = useState("1:1");
  const [platform, setPlatform] = useState("xiaohongshu");
  const [name, setName] = useState("轻盈焕亮精华液");
  const [extra, setExtra] = useState("");
  const [health, setHealth] = useState({ ok: false, message: "正在检测千问服务..." });
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHist, setShowHist] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, message: "无法连接本地后端（请先启动 FastAPI）" }));
    try {
      setHistory(JSON.parse(localStorage.getItem(HIST_KEY) || "[]"));
    } catch {
      setHistory([]);
    }
  }, []);

  const step = useMemo(() => {
    if (result || busy) return 3;
    if (image) return 2;
    return 1;
  }, [image, result, busy]);

  async function useSample(s) {
    const resp = await fetch(s.src);
    const blob = await resp.blob();
    setImage(await fileToDataUrl(new File([blob], "sample.jpg", { type: blob.type || "image/jpeg" })));
    setName(s.name);
    setExtra(s.extra);
    setError("");
  }

  async function onFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("仅支持 JPG、PNG、WebP");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("图片超过 10MB");
      return;
    }
    setError("");
    setImage(await fileToDataUrl(file));
  }

  async function generate() {
    if (!image || !name.trim() || !health.ok || busy) return;
    setBusy(true);
    setError("");
    setPhase("分析商品主体与光影...");
    const t = setTimeout(() => setPhase("正在构思专业构图..."), 2500);
    const t2 = setTimeout(() => setPhase("同步撰写营销文案..."), 6000);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: image,
          scene,
          ratio,
          platform,
          product_name: name.trim(),
          extra,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.detail || data.message || `请求失败 ${resp.status}`);
      }
      setResult(data);
      const item = {
        id: Date.now(),
        image: data.image,
        title: data.title,
        body: data.body,
        tags: data.tags,
        product_name: data.product_name,
      };
      const next = [item, ...history].slice(0, 12);
      setHistory(next);
      localStorage.setItem(HIST_KEY, JSON.stringify(next));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      clearTimeout(t);
      clearTimeout(t2);
      setBusy(false);
      setPhase("");
    }
  }

  function download() {
    if (!result?.image) return;
    const a = document.createElement("a");
    a.href = result.image;
    a.download = `${result.product_name || "product"}.png`;
    a.click();
  }

  async function copyText() {
    if (!result) return;
    const tags = (result.tags || []).map((t) => `#${t}`).join(" ");
    await navigator.clipboard.writeText(`${result.title}\n\n${result.body}\n\n${tags}`);
  }

  const platformLabel = PLATFORMS.find((p) => p.id === platform)?.name || platform;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="logo">造</div>
          造物工坊 <span className="badge">AI</span>
        </div>
        <button className="ghost" onClick={() => setShowHist(true)}>
          最近作品
        </button>
      </header>

      <section className="hero">
        <div>
          <div className="kicker">AI PRODUCT STUDIO</div>
          <h1>
            随手拍，也能变成
            <br />
            专业商品大片
          </h1>
          <p>上传商品照片，选择心仪场景，生成电商主图与营销文案。</p>
          <div className="checks">
            <span>✓ 智能构图</span>
            <span>✓ 多平台尺寸</span>
            <span>✓ 文案同步生成</span>
          </div>
        </div>
        <div className="stack">
          <div className="card-art back" />
          <div className="card-art" />
        </div>
      </section>

      <nav className="steps">
        <span className={step >= 1 ? "step on" : "step"}>1 上传商品</span>
        <span className={step >= 2 ? "step on" : "step"}>2 定制场景</span>
        <span className={step >= 3 ? "step on" : "step"}>3 生成作品</span>
      </nav>

      <section className="grid">
        <div className="panel">
          <h2>01 上传商品图</h2>
          <p className="hint">建议使用背景干净、主体清晰的照片</p>
          <div
            className="drop"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files[0]);
            }}
          >
            {image ? (
              <img src={image} alt="商品预览" />
            ) : (
              <div>
                <div className="plus">＋</div>
                点击或拖拽上传
                <br />
                支持 JPG、PNG、WebP，最大 10MB
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => onFile(e.target.files[0])}
          />
          <div className="file-meta">
            {image ? (
              <button className="link" onClick={() => inputRef.current?.click()}>
                更换图片
              </button>
            ) : (
              <span>没有图片？点下方真实商品照试用</span>
            )}
          </div>
          <div className="sample-row">
            {SAMPLES.map((s) => (
              <button key={s.src} className="sample" type="button" onClick={() => useSample(s)} title={s.name}>
                <img src={s.src} alt={s.name} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>02 定制生成效果</h2>
          <p className="hint">告诉 AI 你想要的画面</p>
          <div className="scenes">
            {SCENES.map((s) => (
              <button
                key={s.id}
                className={scene === s.id ? "scene on" : "scene"}
                onClick={() => setScene(s.id)}
              >
                <div className="swatch" style={{ background: s.swatch }} />
                <b>{s.name}</b>
              </button>
            ))}
          </div>
          <div className="row">
            <label>
              图片比例
              <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                {RATIOS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              文案平台
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            商品名称
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：夏日冷萃咖啡" />
          </label>
          <label style={{ marginTop: 12 }}>
            补充描述 选填
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="例如：晨间阳光、清新、带少量绿叶点缀"
            />
          </label>
          <button className="primary" disabled={!image || !name.trim() || !health.ok || busy} onClick={generate}>
            {busy ? "AI 正在构思画面…" : "✦ 立即生成商品大片"}
          </button>
          <div className={`status ${health.ok ? "ok" : "bad"}`}>{health.message}</div>
          {error ? <div className="status bad">{error}</div> : null}
          {phase ? <div className="loading">{phase}</div> : null}
        </div>
      </section>

      {(result || busy) && (
        <section className="result">
          <div>
            <h2>你的商品大片{result ? "已就绪" : "生成中"}</h2>
            {result?.image ? <img src={result.image} alt="生成结果" /> : <div className="panel loading">{phase}</div>}
            {result ? (
              <div className="actions">
                <button className="ghost" onClick={download}>
                  下载图片
                </button>
                <button className="ghost" onClick={generate} disabled={busy}>
                  再生成一张
                </button>
              </div>
            ) : null}
          </div>
          <div className="copy-box">
            <h3>AI 营销文案</h3>
            <p className="hint">适配{platformLabel}</p>
            {result ? (
              <>
                <p>
                  <b>爆款标题</b>
                  <br />
                  {result.title}
                </p>
                <p>
                  <b>正文</b>
                  <br />
                  {result.body}
                </p>
                <div className="tags">
                  {(result.tags || []).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
                <button className="ghost" style={{ marginTop: 12 }} onClick={copyText}>
                  复制文案
                </button>
              </>
            ) : (
              <p className="loading">文案撰写中…</p>
            )}
          </div>
        </section>
      )}

      {showHist ? (
        <aside className="drawer">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <b>最近作品</b>
            <button className="link" onClick={() => setShowHist(false)}>
              关闭
            </button>
          </div>
          {history.length === 0 ? <p className="hint">还没有作品</p> : null}
          {history.map((h) => (
            <div key={h.id} className="hist-item" onClick={() => { setResult(h); setShowHist(false); }}>
              <img src={h.image} alt="" />
              <div>
                <b>{h.product_name}</b>
                <div className="hint">{h.title}</div>
              </div>
            </div>
          ))}
        </aside>
      ) : null}
    </>
  );
}
