import EmptyState from "components/EmptyState";
import Mascot from "components/Mascot";
import Page from "components/Page";
import { useEffect, useMemo, useState } from "react";
import { useShellular } from "state";
import { getFilePreview } from "./filePreview";
import type { EditorPageProps } from "./types";
import "./style.scss";

export default function DesktopFilePreviewPage({
	filePath,
	comparison,
	gitComparison,
}: EditorPageProps) {
	const { readFileBytes } = useShellular();
	const preview = useMemo(() => getFilePreview(filePath), [filePath]);
	const [url, setUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(preview.kind !== "binary");
	const [error, setError] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
	const fileName = filePath.split("/").pop() || filePath;
	const isComparison = Boolean(comparison || gitComparison);

	useEffect(() => {
		if (preview.kind === "binary" || preview.kind === "text" || isComparison) {
			setLoading(false);
			return;
		}
		let active = true;
		let objectUrl: string | null = null;
		setLoading(true);
		setError(null);
		void readFileBytes(filePath)
			.then((bytes) => {
				if (!active) return;
				const buffer = new ArrayBuffer(bytes.byteLength);
				new Uint8Array(buffer).set(bytes);
				objectUrl = URL.createObjectURL(
					new Blob([buffer], { type: preview.mimeType }),
				);
				setUrl(objectUrl);
			})
			.catch((reason: Error) => {
				if (active) setError(reason.message || "Failed to preview file");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [filePath, isComparison, preview, readFileBytes]);

	return (
		<Page title={fileName} className="editor-page" noBottomSafeArea>
			{loading && <EmptyState message="Loading preview…" mascot="loading" />}
			{error && <div className="editor-error">{error}</div>}
			{!loading && !error && isComparison && (
				<EmptyState
					message="Binary file — diff not available"
					mascot="thinking"
				/>
			)}
			{!loading && !error && !isComparison && preview.kind === "binary" && (
				<div className="editor-binary-warning">
					<div className="editor-binary-warning__panel">
						<div className="editor-binary-warning__header">
							<Mascot state="thinking" size={42} tone="inline" />
							<h2>{fileName}</h2>
						</div>
						<p>
							This file is not safe to render as text, so it was not loaded into
							the editor.
						</p>
						<dl className="editor-binary-warning__meta">
							<div>
								<dt>Type</dt>
								<dd>{preview.label}</dd>
							</div>
							<div>
								<dt>Action</dt>
								<dd>Preview skipped</dd>
							</div>
						</dl>
						<div className="editor-binary-warning__path">{filePath}</div>
					</div>
				</div>
			)}
			{!loading &&
				!error &&
				!isComparison &&
				url &&
				preview.kind === "image" && (
					<div className="editor-media-viewer">
						<div className="editor-image-toolbar">
							<button
								type="button"
								onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
								aria-label="Zoom out"
							>
								<span className="icon-minus" />
							</button>
							<span>{Math.round(zoom * 100)}%</span>
							<button
								type="button"
								onClick={() => setZoom((value) => Math.min(5, value + 0.25))}
								aria-label="Zoom in"
							>
								<span className="icon-plus" />
							</button>
							<button
								type="button"
								onClick={() => setZoom(1)}
								aria-label="Reset zoom"
							>
								<span className="icon-maximize" />
							</button>
						</div>
						<section
							className="editor-image-stage overflow-auto"
							aria-label="Zoomable image preview"
						>
							<div
								className="editor-image-frame"
								style={{ transform: `scale(${zoom})` }}
							>
								<img src={url} alt={fileName} />
							</div>
						</section>
					</div>
				)}
			{!loading &&
				!error &&
				!isComparison &&
				url &&
				preview.kind === "video" && (
					<div className="editor-media-viewer">
						<video src={url} controls playsInline />
					</div>
				)}
			{!loading &&
				!error &&
				!isComparison &&
				url &&
				preview.kind === "audio" && (
					<div className="editor-audio-viewer">
						<div className="editor-audio-viewer__icon">
							<span className="icon-music" />
						</div>
						<div className="editor-audio-viewer__name">{fileName}</div>
						<audio src={url} controls />
					</div>
				)}
		</Page>
	);
}
