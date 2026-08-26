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
import {
	isValidElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { RenderOptions } from "beautiful-mermaid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./components/button";
import { FrontmatterDisplay } from "./components/frontmatter";
import { Sidebar, scrollNodeIntoView } from "./components/sidebar";
import { TableOfContents } from "./components/toc";
import { Toggle } from "./components/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./components/tooltip";
import type { ApiFile, SortOrder } from "./lib/file-tree";
import { parseFrontmatter } from "./lib/frontmatter";
import { rehypeHighlight } from "./lib/syntax-highlighting";
import { cn } from "./lib/utils";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

const MERMAID_PALETTES: Record<ResolvedTheme, RenderOptions> = {
	light: {
		bg: "transparent",
		fg: "#29241f",
		line: "#928a80",
		accent: "#3a718c",
		border: "#b9b0a4",
		surface: "#f3efe8",
		muted: "#756e66",
		font: "IBM Plex Sans",
	},
	dark: {
		bg: "transparent",
		fg: "#e9e3db",
		line: "#817a72",
		accent: "#79aec2",
		border: "#6e6861",
		surface: "#27231f",
		muted: "#aaa39b",
		font: "IBM Plex Sans",
	},
};

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

function MermaidDiagram({
	chart,
	theme,
}: {
	chart: string;
	theme: ResolvedTheme;
}) {
	const [result, setResult] = useState<{
		chart: string;
		theme: ResolvedTheme;
		svg?: string;
		error?: string;
	}>();

	useEffect(() => {
		let cancelled = false;

		import("beautiful-mermaid")
			.then(({ renderMermaidSVG }) => {
				const rendered = renderMermaidSVG(chart, MERMAID_PALETTES[theme]);
				if (!cancelled) setResult({ chart, theme, svg: rendered });
			})
			.catch((err: unknown) => {
				if (!cancelled) setResult({ chart, theme, error: String(err) });
			});

		return () => {
			cancelled = true;
		};
	}, [chart, theme]);

	if (result?.chart === chart && result.theme === theme && result.error) {
		return (
			<pre className="mermaid-error">
				{result.error}
			</pre>
		);
	}

	if (result?.chart !== chart || result.theme !== theme || !result.svg) {
		return (
			<div className="mermaid-status">
				Rendering diagram…
			</div>
		);
	}

	return (
		<div
			className="mermaid-diagram"
			role="img"
			aria-label="Mermaid diagram"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: beautiful-mermaid renders trusted SVG
			dangerouslySetInnerHTML={{ __html: result.svg }}
		/>
	);
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
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
		window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light",
	);

	useEffect(() => {
		const stored = localStorage.getItem("lmv-theme");
		if (stored === "light" || stored === "dark" || stored === "system") {
			setTheme(stored);
		}
	}, []);

	useEffect(() => {
		localStorage.setItem("lmv-theme", theme);

		const root = document.documentElement;
		root.classList.remove("light", "dark");

		if (theme === "system") {
			root.classList.add(systemTheme);
		} else {
			root.classList.add(theme);
		}
	}, [theme, systemTheme]);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) =>
			setSystemTheme(e.matches ? "dark" : "light");
		media.addEventListener("change", handler);
		return () => media.removeEventListener("change", handler);
	}, []);

	return {
		theme,
		setTheme,
		resolvedTheme: theme === "system" ? systemTheme : theme,
	};
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
	const { theme, setTheme, resolvedTheme } = useTheme();
	const { toasts, addToast, removeToast } = useToast();

	const selectedPathRef = useRef<string | null>(null);
	const hasChangesRef = useRef(false);
	const lastSaveRef = useRef<{
		path: string;
		manual: boolean;
	} | null>(null);

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

						// Restore last opened document
						const filePaths = new Set(
							(data.files || []).map((f: ApiFile) => f.path),
						);
						fetch("/api/last-document")
							.then((res) => res.json())
							.then((d: { path: string | null }) => {
								if (d.path && filePaths.has(d.path)) {
									setSelectedPath(d.path);
									setCursorPath(d.path);
									// Expand parent folders so the file is visible
									const parts = d.path.split("/").filter(Boolean);
									if (parts.length > 1) {
										setExpandedFolders((prev) => {
											const next = new Set(prev);
											for (let i = 1; i < parts.length; i++) {
												next.add(parts.slice(0, i).join("/"));
											}
											return next;
										});
									}
								}
							})
							.catch(() => {});
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
		const controller = new AbortController();

		fetch(`/api/file?path=${encodeURIComponent(selectedPath)}`, {
			signal: controller.signal,
		})
			.then(async (res) => {
				const data = await res.json();
				if (!res.ok) {
					throw new Error(data.error || "Failed to read file");
				}
				return data as { content: string; filename: string };
			})
			.then((data) => {
				if (controller.signal.aborted) return;
				setContent(data.content);
				setEditedContent(data.content);
				setFilename(data.filename);
			})
			.catch((error) => {
				if (controller.signal.aborted) return;
				addToast({
					type: "error",
					message: (error as Error).message || "Failed to read file",
				});
				setContent("");
				setEditedContent("");
				setFilename(selectedPath.split("/").pop() || selectedPath);
			});

		return () => controller.abort();
	}, [selectedPath, addToast]);

	// Persist last opened document
	useEffect(() => {
		if (!selectedPath) return;
		fetch("/api/last-document", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path: selectedPath }),
		}).catch(() => {});
	}, [selectedPath]);

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
				const lastSave = lastSaveRef.current;
				const fromOurSave = lastSave?.path === p;
				fetch(`/api/file?path=${encodeURIComponent(p)}`)
					.then((res) => res.json())
					.then((d: { content: string; filename: string }) => {
						setContent(d.content);
						setEditedContent(d.content);
						setFilename(d.filename);
						if (!fromOurSave || lastSave?.manual) {
							addToast({ type: "info", message: "File updated on disk" });
						}
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

	const handleSave = useCallback(
		async (manual = true) => {
			if (!selectedPath) return false;
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
				lastSaveRef.current = { path: selectedPath, manual };
				setTimeout(() => {
					lastSaveRef.current = null;
				}, 2000);
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
		},
		[editedContent, selectedPath, addToast],
	);

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
			handleSave(false);
		}, 1000);
		return () => clearTimeout(timer);
	}, [autosave, isEditing, hasChanges, selectedPath, handleSave]);

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

	const parsed = useMemo(() => parseFrontmatter(content), [content]);

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
											type="button"
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
													<Button
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
													</Button>
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
												onClick={() => handleSave()}
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
						<div className="document-container mx-auto px-5 py-10 sm:px-8 sm:py-12">
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
								<article className="markdown-body">
									{parsed.frontmatter && (
										<FrontmatterDisplay frontmatter={parsed.frontmatter} />
									)}
									<TableOfContents markdown={parsed.body} />
									<div className="markdown-content">
										<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										rehypePlugins={[rehypeHighlight]}
										components={{
											h1: ({ children }) => {
												const text = String(children);
												const id = text
													.toLowerCase()
													.replace(/[^\w\s-]/g, "")
													.replace(/\s+/g, "-");
												return (
													<h1
														id={id}
													>
														{children}
													</h1>
												);
											},
											h2: ({ children }) => {
												const text = String(children);
												const id = text
													.toLowerCase()
													.replace(/[^\w\s-]/g, "")
													.replace(/\s+/g, "-");
												return (
													<h2
														id={id}
													>
														{children}
													</h2>
												);
											},
											h3: ({ children }) => {
												const text = String(children);
												const id = text
													.toLowerCase()
													.replace(/[^\w\s-]/g, "")
													.replace(/\s+/g, "-");
												return (
													<h3
														id={id}
													>
														{children}
													</h3>
												);
											},
											h4: ({ children }) => {
												const text = String(children);
												const id = text
													.toLowerCase()
													.replace(/[^\w\s-]/g, "")
													.replace(/\s+/g, "-");
												return (
													<h4
														id={id}
													>
														{children}
													</h4>
												);
											},
											h5: ({ children }) => {
												const text = String(children);
												const id = text
													.toLowerCase()
													.replace(/[^\w\s-]/g, "")
													.replace(/\s+/g, "-");
												return (
													<h5
														id={id}
													>
														{children}
													</h5>
												);
											},
											h6: ({ children }) => {
												const text = String(children);
												const id = text
													.toLowerCase()
													.replace(/[^\w\s-]/g, "")
													.replace(/\s+/g, "-");
												return (
													<h6
														id={id}
													>
														{children}
													</h6>
												);
											},
											code: ({ className, children, node, ...props }) => {
												const isBlock =
													node?.position &&
													node.position.start.line !== node.position.end.line;
												if (!isBlock) {
													return (
														<code {...props}>
															{children}
														</code>
													);
												}
												if (className?.includes("language-mermaid")) {
													const raw = String(children).replace(/\n$/, "");
													return (
														<MermaidDiagram chart={raw} theme={resolvedTheme} />
													);
												}
												return (
													<code className={className} {...props}>
														{children}
													</code>
												);
											},
											pre: ({ children }) => {
												// Unwrap mermaid diagrams — they render their own container
												const child = Array.isArray(children)
													? children[0]
													: children;
												const isMermaid =
													isValidElement<{ className?: string }>(child) &&
													child.props.className?.includes("language-mermaid");
												if (isMermaid) {
													return <>{children}</>;
												}
												return (
													<pre className="markdown-code-block">
														{children}
													</pre>
												);
											},
											table: ({ children }) => (
												<div className="markdown-table-container">
													<table>
														{children}
													</table>
												</div>
											),
											input: (props) => {
												if (props.type === "checkbox") {
													return (
														<input
															type="checkbox"
															checked={props.checked}
															disabled
															className="markdown-task-checkbox"
														/>
													);
												}
												return <input {...props} />;
											},
										}}
									>
										{parsed.body}
										</ReactMarkdown>
									</div>
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
