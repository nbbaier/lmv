import {
	Check,
	ExternalLink,
	Eye,
	FileText,
	Loader2,
	Monitor,
	Moon,
	PanelLeft,
	Pencil,
	Save,
	Share2,
	Sun,
	Timer,
	TimerOff,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Button } from "./components/button";
import { Sidebar, scrollNodeIntoView } from "./components/sidebar";
import { Toggle } from "./components/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./components/tooltip";
import type { ApiFile, SortOrder } from "./lib/file-tree";
import { cn } from "./lib/utils";

type Theme = "light" | "dark" | "system";

type Toast = {
	id: number;
	type: "success" | "error" | "info";
	message: string;
	action?: { label: string; onClick: () => void };
};

function useToast() {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const addToast = useCallback((toast: Omit<Toast, "id">) => {
		const id = Date.now();
		setToasts((prev) => [...prev, { ...toast, id }]);
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 5000);
	}, []);

	const removeToast = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return { toasts, addToast, removeToast };
}

function ToastContainer({
	toasts,
	onRemove,
}: {
	toasts: Toast[];
	onRemove: (id: number) => void;
}) {
	if (toasts.length === 0) return null;

	return (
		<div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className={cn(
						"flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[300px] max-w-[400px] animate-in slide-in-from-right",
						toast.type === "success" && "bg-green-600 text-white",
						toast.type === "error" && "bg-red-600 text-white",
						toast.type === "info" && "bg-primary text-primary-foreground",
					)}
				>
					<span className="flex-1 text-sm">{toast.message}</span>
					{toast.action && (
						<button
							type="button"
							onClick={toast.action.onClick}
							className="flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:no-underline"
						>
							{toast.action.label}
							<ExternalLink className="h-3 w-3" />
						</button>
					)}
					<button
						type="button"
						onClick={() => onRemove(toast.id)}
						className="p-1 rounded hover:bg-white/20"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
			))}
		</div>
	);
}

function useTheme() {
	const [theme, setTheme] = useState<Theme>("system");

	useEffect(() => {
		const stored = localStorage.getItem("lmv-theme") as Theme | null;
		if (stored) setTheme(stored);
	}, []);

	useEffect(() => {
		localStorage.setItem("lmv-theme", theme);

		const root = document.documentElement;
		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemDark = window.matchMedia(
				"(prefers-color-scheme: dark)",
			).matches;
			root.classList.add(systemDark ? "dark" : "light");
		} else {
			root.classList.add(theme);
		}
	}, [theme]);

	useEffect(() => {
		if (theme !== "system") return;

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => {
			document.documentElement.classList.remove("light", "dark");
			document.documentElement.classList.add(e.matches ? "dark" : "light");
		};
		media.addEventListener("change", handler);
		return () => media.removeEventListener("change", handler);
	}, [theme]);

	return { theme, setTheme };
}

function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 640px)");
		const update = () => setIsMobile(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	return isMobile;
}

export function App() {
	const isMobile = useIsMobile();

	const [files, setFiles] = useState<ApiFile[]>([]);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [cursorPath, setCursorPath] = useState<string | null>(null);
	const [pendingRefresh, setPendingRefresh] = useState(false);
	const [content, setContent] = useState("");
	const [editedContent, setEditedContent] = useState("");
	const [filename, setFilename] = useState<string>("");
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSharing, setIsSharing] = useState(false);
	const [shareConfigured, setShareConfigured] = useState(false);
	const [sidebarVisible, setSidebarVisible] = useState(true);
	const [sidebarWidthPct, setSidebarWidthPct] = useState(0.25);
	const [sortOrder, setSortOrder] = useState<SortOrder>("name-asc");
	const [filterText, setFilterText] = useState("");
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(),
	);
	const [autosave, setAutosave] = useState(() => {
		const stored = localStorage.getItem("lmv-autosave");
		return stored !== null ? stored === "true" : true;
	});
	const { theme, setTheme } = useTheme();
	const { toasts, addToast, removeToast } = useToast();

	const selectedPathRef = useRef<string | null>(null);
	const hasChangesRef = useRef(false);

	useEffect(() => {
		selectedPathRef.current = selectedPath;
	}, [selectedPath]);
	useEffect(() => {
		hasChangesRef.current = hasChanges;
	}, [hasChanges]);

	useEffect(() => {
		const storedVisible = localStorage.getItem("lmv-sidebar-visible");
		if (storedVisible) setSidebarVisible(storedVisible === "true");

		const storedWidth = localStorage.getItem("lmv-sidebar-width-pct");
		if (storedWidth) {
			const n = Number(storedWidth);
			if (Number.isFinite(n))
				setSidebarWidthPct(Math.min(0.6, Math.max(0.15, n)));
		}

		const storedSort = localStorage.getItem(
			"lmv-sort-order",
		) as SortOrder | null;
		if (storedSort) setSortOrder(storedSort);

		fetch("/api/files")
			.then((res) => res.json())
			.then(
				(data: {
					files: ApiFile[];
					singleFile: boolean;
					pendingRefresh?: boolean;
				}) => {
					setFiles(data.files || []);
					setPendingRefresh(Boolean(data.pendingRefresh));

					if ((data.files || []).length > 500) {
						addToast({
							type: "info",
							message: "Large file set: 500+ markdown files",
						});
					}

					if (data.singleFile && data.files?.[0]?.path) {
						setSelectedPath(data.files[0].path);
						setCursorPath(data.files[0].path);
					} else {
						// Expand first level by default
						const top = new Set<string>();
						for (const f of data.files || []) {
							const seg = f.path.split("/").filter(Boolean)[0];
							if (seg) top.add(seg);
						}
						setExpandedFolders(top);
					}
				},
			)
			.catch(console.error);

		fetch("/api/share")
			.then((res) => res.json())
			.then((data: { configured: boolean }) => {
				setShareConfigured(data.configured);
			})
			.catch(console.error);
	}, [addToast]);

	useEffect(() => {
		if (!selectedPath) return;

		fetch(`/api/file?path=${encodeURIComponent(selectedPath)}`)
			.then(async (res) => {
				const data = await res.json();
				if (!res.ok) {
					throw new Error(data.error || "Failed to read file");
				}
				return data as { content: string; filename: string };
			})
			.then((data) => {
				setContent(data.content);
				setEditedContent(data.content);
				setFilename(data.filename);
			})
			.catch((error) => {
				addToast({
					type: "error",
					message: (error as Error).message || "Failed to read file",
				});
				setContent("");
				setEditedContent("");
				setFilename(selectedPath.split("/").pop() || selectedPath);
			});
	}, [selectedPath, addToast]);

	const refreshFiles = useCallback(
		async (refresh: boolean) => {
			try {
				const res = await fetch(`/api/files${refresh ? "?refresh=1" : ""}`);
				const data = (await res.json()) as {
					files: ApiFile[];
					pendingRefresh?: boolean;
				};
				setFiles(data.files || []);
				setPendingRefresh(Boolean(data.pendingRefresh));
			} catch (_err) {
				addToast({
					type: "error",
					message: "Failed to refresh file list",
				});
			}
		},
		[addToast],
	);

	useEffect(() => {
		const es = new EventSource("/api/watch");

		const onFsChanged = (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data) as { pendingRefresh?: boolean };
				setPendingRefresh(Boolean(data.pendingRefresh));
			} catch {
				// ignore
			}
		};

		const onFileChanged = (e: MessageEvent) => {
			let data: { path?: string } | null = null;
			try {
				data = JSON.parse(e.data) as { path?: string };
			} catch {
				return;
			}
			if (!data?.path) return;
			if (data.path !== selectedPathRef.current) return;

			if (hasChangesRef.current) {
				addToast({
					type: "info",
					message: "File changed on disk",
					action: {
						label: "Reload",
						onClick: () => {
							const p = selectedPathRef.current;
							if (!p) return;
							fetch(`/api/file?path=${encodeURIComponent(p)}`)
								.then((res) => res.json())
								.then((d: { content: string; filename: string }) => {
									setContent(d.content);
									setEditedContent(d.content);
									setFilename(d.filename);
								})
								.catch(() => {});
						},
					},
				});
			} else {
				const p = selectedPathRef.current;
				if (!p) return;
				fetch(`/api/file?path=${encodeURIComponent(p)}`)
					.then((res) => res.json())
					.then((d: { content: string; filename: string }) => {
						setContent(d.content);
						setEditedContent(d.content);
						setFilename(d.filename);
						addToast({ type: "info", message: "File updated on disk" });
					})
					.catch(() => {});
			}
		};

		es.addEventListener("fs-changed", onFsChanged as EventListener);
		es.addEventListener("file-changed", onFileChanged as EventListener);
		return () => es.close();
	}, [addToast]);

	useEffect(() => {
		setHasChanges(editedContent !== content);
	}, [editedContent, content]);

	const handleSave = useCallback(async () => {
		if (!selectedPath) return;
		setIsSaving(true);
		try {
			const res = await fetch(
				`/api/file?path=${encodeURIComponent(selectedPath)}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ content: editedContent }),
				},
			);
			if (!res.ok) throw new Error("Failed to save file");

			setContent(editedContent);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2000);
			return true;
		} catch (error) {
			addToast({
				type: "error",
				message: (error as Error).message || "Failed to save file",
			});
			return false;
		} finally {
			setIsSaving(false);
		}
	}, [editedContent, selectedPath, addToast]);

	useEffect(() => {
		localStorage.setItem("lmv-sidebar-visible", String(sidebarVisible));
	}, [sidebarVisible]);

	useEffect(() => {
		localStorage.setItem("lmv-sidebar-width-pct", String(sidebarWidthPct));
	}, [sidebarWidthPct]);

	useEffect(() => {
		localStorage.setItem("lmv-sort-order", sortOrder);
	}, [sortOrder]);

	useEffect(() => {
		localStorage.setItem("lmv-autosave", String(autosave));
	}, [autosave]);

	useEffect(() => {
		if (!autosave || !isEditing || !hasChanges || !selectedPath) return;
		const timer = setTimeout(() => {
			handleSave();
		}, 1000);
		return () => clearTimeout(timer);
	}, [autosave, isEditing, hasChanges, selectedPath, editedContent, handleSave]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				if (isEditing && hasChanges) handleSave();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "e") {
				if (!selectedPath) return;
				e.preventDefault();
				setIsEditing((prev) => !prev);
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "b") {
				if (files.length <= 1) return;
				e.preventDefault();
				setSidebarVisible((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isEditing, hasChanges, handleSave, files.length, selectedPath]);

	const toggleEditing = () => {
		if (isEditing && hasChanges) {
			// Discard changes when switching back to view mode
			setEditedContent(content);
		}
		setIsEditing(!isEditing);
	};

	const handleShare = useCallback(async () => {
		if (!shareConfigured) {
			addToast({
				type: "error",
				message: "Set GITHUB_TOKEN env var to enable sharing",
			});
			return;
		}

		setIsSharing(true);
		try {
			const res = await fetch("/api/share", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: isEditing ? editedContent : content,
					filename,
					public: true,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				addToast({
					type: "error",
					message: data.error || "Failed to create gist",
				});
				return;
			}

			await navigator.clipboard.writeText(data.url);
			addToast({
				type: "success",
				message: "Gist created! URL copied to clipboard",
				action: {
					label: "Open",
					onClick: () => window.open(data.url, "_blank"),
				},
			});
		} catch (_err) {
			addToast({
				type: "error",
				message: "Failed to create gist",
			});
		} finally {
			setIsSharing(false);
		}
	}, [shareConfigured, isEditing, editedContent, content, filename, addToast]);

	const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
	const showSidebar = files.length > 1;

	const openPath = useCallback(
		async (path: string) => {
			if (path === selectedPath) return;

			if (hasChanges) {
				const ok = await handleSave();
				if (!ok) return;
			}

			setSelectedPath(path);
			setCursorPath(path);
			if (isMobile) setSidebarVisible(false);
		},
		[selectedPath, hasChanges, handleSave, isMobile],
	);

	const breadcrumbs = selectedPath
		? selectedPath.split("/").filter(Boolean)
		: [];
	const breadcrumbPaths = breadcrumbs.map((_, idx) =>
		breadcrumbs.slice(0, idx + 1).join("/"),
	);

	return (
		<TooltipProvider delayDuration={300}>
			<div className="min-h-screen bg-background flex flex-col">
				{/* Header */}
				<header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<div className="flex h-14 items-center justify-between px-4">
						<div className="flex items-center gap-2 min-w-0">
							{showSidebar && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setSidebarVisible((v) => !v)}
											aria-label="Toggle sidebar"
										>
											<PanelLeft className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Toggle sidebar (Cmd/Ctrl+B)</TooltipContent>
								</Tooltip>
							)}
							<FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
							{selectedPath ? (
								<div className="min-w-0">
									{showSidebar ? (
										<nav className="flex items-center gap-2 text-sm min-w-0">
											{breadcrumbs.map((seg, idx) => {
												// biome-ignore lint/style/noNonNullAssertion: <index is guaranteed to be in bounds>
												const full = breadcrumbPaths[idx]!;
												const isLast = idx === breadcrumbs.length - 1;
												if (isLast) {
													return (
														<span key={full} className="font-medium truncate">
															{seg}
														</span>
													);
												}
												return (
													<button
														key={full}
														type="button"
														className="text-muted-foreground hover:text-foreground truncate"
														onClick={() => {
															setSidebarVisible(true);
															setExpandedFolders((prev) => {
																const next = new Set(prev);
																const parts = full.split("/").filter(Boolean);
																for (let i = 0; i < parts.length; i++) {
																	next.add(parts.slice(0, i + 1).join("/"));
																}
																return next;
															});
															scrollNodeIntoView(full);
														}}
													>
														{seg}
														<span className="mx-2 text-muted-foreground/60">
															{">"}
														</span>
													</button>
												);
											})}
										</nav>
									) : (
										<h1 className="text-sm font-medium truncate max-w-[300px] sm:max-w-none">
											{filename}
										</h1>
									)}
									{hasChanges && (
										<span className="text-xs text-muted-foreground">
											(modified)
										</span>
									)}
								</div>
							) : (
								<h1 className="text-sm font-medium truncate">
									Select a file to view
								</h1>
							)}
						</div>

						<div className="flex items-center gap-2">
							{/* Share button */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										onClick={handleShare}
										disabled={isSharing || !selectedPath}
									>
										{isSharing ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Share2 className="h-4 w-4" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{shareConfigured
										? "Share as GitHub Gist"
										: "GITHUB_TOKEN not set"}
								</TooltipContent>
							</Tooltip>

							{/* Theme toggle */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => {
											const next: Record<Theme, Theme> = {
												system: "light",
												light: "dark",
												dark: "system",
											};
											setTheme(next[theme]);
										}}
									>
										<ThemeIcon className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
								</TooltipContent>
							</Tooltip>

							{/* Edit toggle */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Toggle
										variant="outline"
										pressed={isEditing}
										onPressedChange={toggleEditing}
										aria-label="Toggle edit mode"
										disabled={!selectedPath}
									>
										{isEditing ? (
											<Eye className="h-4 w-4" />
										) : (
											<Pencil className="h-4 w-4" />
										)}
									</Toggle>
								</TooltipTrigger>
								<TooltipContent>
									{isEditing ? "View mode (Cmd+E)" : "Edit mode (Cmd+E)"}
								</TooltipContent>
							</Tooltip>

							{/* Save button */}
							{isEditing && (
								<>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												size="sm"
												onClick={handleSave}
												disabled={!selectedPath || !hasChanges || isSaving}
												className={cn(
													"transition-all",
													saveSuccess && "bg-green-600 hover:bg-green-600",
												)}
											>
												{saveSuccess ? (
													<>
														<Check className="h-4 w-4" />
														Saved
													</>
												) : (
													<>
														<Save className="h-4 w-4" />
														Save
													</>
												)}
											</Button>
										</TooltipTrigger>
										<TooltipContent>Save changes (Cmd+S)</TooltipContent>
									</Tooltip>

									<Tooltip>
										<TooltipTrigger asChild>
											<Toggle
												variant="outline"
												pressed={autosave}
												onPressedChange={setAutosave}
												aria-label="Toggle autosave"
											>
												{autosave ? (
													<Timer className="h-4 w-4" />
												) : (
													<TimerOff className="h-4 w-4" />
												)}
											</Toggle>
										</TooltipTrigger>
										<TooltipContent>
											{autosave ? "Autosave on" : "Autosave off"}
										</TooltipContent>
									</Tooltip>
								</>
							)}
						</div>
					</div>
				</header>

				<div className="flex flex-1 min-h-0">
					{showSidebar && (
						<Sidebar
							files={files}
							selectedPath={selectedPath}
							cursorPath={cursorPath}
							onCursorPathChange={setCursorPath}
							onOpenPath={openPath}
							pendingRefresh={pendingRefresh}
							onRefresh={() => refreshFiles(true)}
							sidebarVisible={sidebarVisible}
							onSidebarVisibleChange={setSidebarVisible}
							sidebarWidthPct={sidebarWidthPct}
							onSidebarWidthPctChange={setSidebarWidthPct}
							sortOrder={sortOrder}
							onSortOrderChange={setSortOrder}
							filterText={filterText}
							onFilterTextChange={setFilterText}
							expandedFolders={expandedFolders}
							onExpandedFoldersChange={setExpandedFolders}
							isMobile={isMobile}
						/>
					)}

					{/* Main content */}
					<main className="flex-1 min-w-0 overflow-auto">
						<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
							{!selectedPath ? (
								<div className="text-muted-foreground text-sm">
									Select a file to view
								</div>
							) : isEditing ? (
								<div className="min-h-[calc(100vh-8rem)]">
									<textarea
										className="w-full min-h-[calc(100vh-10rem)] p-4 rounded-lg border border-input bg-background text-foreground font-mono text-sm leading-relaxed resize-none outline-none focus:ring-2 focus:ring-ring"
										value={editedContent}
										onChange={(e) => setEditedContent(e.target.value)}
										placeholder="Start writing markdown..."
										spellCheck={false}
									/>
								</div>
							) : (
								<article className="prose prose-neutral dark:prose-invert max-w-none">
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										rehypePlugins={[rehypeHighlight]}
										components={{
											h1: ({ children }) => (
												<h1 className="text-3xl font-bold mt-0 mb-4 pb-2 border-b border-border">
													{children}
												</h1>
											),
											h2: ({ children }) => (
												<h2 className="text-2xl font-semibold mt-8 mb-4 pb-1 border-b border-border">
													{children}
												</h2>
											),
											h3: ({ children }) => (
												<h3 className="text-xl font-semibold mt-6 mb-3">
													{children}
												</h3>
											),
											h4: ({ children }) => (
												<h4 className="text-lg font-semibold mt-5 mb-2">
													{children}
												</h4>
											),
											p: ({ children }) => (
												<p className="my-4 leading-7">{children}</p>
											),
											a: ({ href, children }) => (
												<a
													href={href}
													className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
												>
													{children}
												</a>
											),
											ul: ({ children }) => (
												<ul className="my-4 ml-6 list-disc space-y-1">
													{children}
												</ul>
											),
											ol: ({ children }) => (
												<ol className="my-4 ml-6 list-decimal space-y-1">
													{children}
												</ol>
											),
											li: ({ children }) => (
												<li className="leading-7">{children}</li>
											),
											blockquote: ({ children }) => (
												<blockquote className="border-l-4 border-muted-foreground/30 pl-4 my-4 italic text-muted-foreground">
													{children}
												</blockquote>
											),
											code: ({ className, children, node, ...props }) => {
												const isBlock =
													node?.position &&
													node.position.start.line !== node.position.end.line;
												if (!isBlock) {
													return (
														<code
															className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
															{...props}
														>
															{children}
														</code>
													);
												}
												return (
													<code className={className} {...props}>
														{children}
													</code>
												);
											},
											pre: ({ children }) => (
												<pre className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-4 my-4 overflow-x-auto text-sm">
													{children}
												</pre>
											),
											hr: () => <hr className="my-8 border-border" />,
											table: ({ children }) => (
												<div className="my-4 overflow-x-auto">
													<table className="w-full border-collapse">
														{children}
													</table>
												</div>
											),
											th: ({ children }) => (
												<th className="border border-border bg-muted px-4 py-2 text-left font-semibold">
													{children}
												</th>
											),
											td: ({ children }) => (
												<td className="border border-border px-4 py-2">
													{children}
												</td>
											),
											input: (props) => {
												if (props.type === "checkbox") {
													return (
														<input
															type="checkbox"
															checked={props.checked}
															disabled
															className="mr-2 h-4 w-4 accent-primary"
														/>
													);
												}
												return <input {...props} />;
											},
											img: ({ src, alt }) => (
												<img
													src={src}
													alt={alt}
													className="max-w-full h-auto rounded-lg my-4"
												/>
											),
										}}
									>
										{content}
									</ReactMarkdown>
								</article>
							)}
						</div>
					</main>
				</div>

				<ToastContainer toasts={toasts} onRemove={removeToast} />
			</div>
		</TooltipProvider>
	);
}
