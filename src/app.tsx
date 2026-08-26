import {
	Check,
	ChevronRight,
	ExternalLink,
	Eye,
	FileText,
	Loader2,
	MoreHorizontal,
	Monitor,
	Moon,
	PanelLeft,
	Pencil,
	Save,
	Search,
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
	const [isMobile, setIsMobile] = useState(() =>
		window.matchMedia("(max-width: 767px)").matches,
	);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 767px)");
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
	const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
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
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const fileTreeRef = useRef<HTMLDivElement | null>(null);
	const mobileActionsRef = useRef<HTMLDivElement | null>(null);
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

	const toggleEditing = useCallback(() => {
		if (isEditing && hasChanges) {
			// Discard changes when switching back to read mode.
			setEditedContent(content);
		}
		setIsEditing((editing) => !editing);
	}, [content, hasChanges, isEditing]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const target = e.target;
			const targetIsEditable =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				(target instanceof HTMLElement && target.isContentEditable);
			const searchShortcut =
				files.length > 1 &&
				(((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") ||
					(!targetIsEditable &&
						!e.metaKey &&
						!e.ctrlKey &&
						!e.altKey &&
						e.key === "/"));

			if (searchShortcut) {
				e.preventDefault();
				setSidebarVisible(true);
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}

			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				if (isEditing && hasChanges) handleSave();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "e") {
				if (!selectedPath) return;
				e.preventDefault();
				toggleEditing();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "b") {
				if (files.length <= 1) return;
				e.preventDefault();
				setSidebarVisible((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		isEditing,
		hasChanges,
		handleSave,
		files.length,
		selectedPath,
		toggleEditing,
	]);

	useEffect(() => {
		if (!mobileActionsOpen) return;

		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target;
			if (
				target instanceof Node &&
				!mobileActionsRef.current?.contains(target)
			) {
				setMobileActionsOpen(false);
			}
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMobileActionsOpen(false);
		};

		window.addEventListener("pointerdown", closeOnOutsidePointer);
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			window.removeEventListener("pointerdown", closeOnOutsidePointer);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [mobileActionsOpen]);

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

	const cycleTheme = () => {
		const next: Record<Theme, Theme> = {
			system: "light",
			light: "dark",
			dark: "system",
		};
		setTheme(next[theme]);
	};

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
			<div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
				<header className="z-50 flex-none border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
					<div className="grid h-[3.25rem] grid-cols-[minmax(0,1fr)_minmax(15rem,28rem)_minmax(0,1fr)] items-center gap-3 px-3 max-lg:grid-cols-[auto_minmax(0,1fr)_auto] max-lg:gap-2 max-lg:px-2">
						<div className="flex min-w-0 items-center gap-2">
							{showSidebar && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setSidebarVisible((visible) => !visible)}
											aria-label={sidebarVisible ? "Collapse sidebar" : "Expand sidebar"}
											aria-controls="lmv-file-tree"
											aria-expanded={sidebarVisible}
											type="button"
											className="h-8 w-8 flex-none text-muted-foreground hover:text-foreground"
										>
											<PanelLeft className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{sidebarVisible ? "Collapse" : "Expand"} sidebar (Cmd/Ctrl+B)
									</TooltipContent>
								</Tooltip>
							)}

							<span className="hidden flex-none font-mono text-[13px] font-semibold tracking-[-0.02em] md:inline">
								lmv
							</span>

							<div className="hidden min-w-0 items-center gap-2 lg:flex">
								<span className="h-4 w-px flex-none bg-border" />
								<FileText className="h-3.5 w-3.5 flex-none text-muted-foreground" />
								{selectedPath ? (
									<nav aria-label="Current file" className="flex min-w-0 items-center text-xs">
										{breadcrumbs.map((segment, index) => {
											const fullPath = breadcrumbPaths[index];
											if (!fullPath) return null;
											const isLast = index === breadcrumbs.length - 1;

											return (
												<div key={fullPath} className="flex min-w-0 items-center">
													{index > 0 && (
														<ChevronRight className="mx-1 h-3 w-3 flex-none text-muted-foreground/50" />
													)}
													{isLast ? (
														<h1 className="truncate font-medium" title={selectedPath}>
															{segment}
														</h1>
													) : (
														<button
															type="button"
															className="truncate rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
															onClick={() => {
																setSidebarVisible(true);
																setExpandedFolders((previous) => {
																	const next = new Set(previous);
																	const parts = fullPath.split("/").filter(Boolean);
																	for (let i = 0; i < parts.length; i++) {
																		next.add(parts.slice(0, i + 1).join("/"));
																	}
																	return next;
																});
																requestAnimationFrame(() => scrollNodeIntoView(fullPath));
															}}
														>
															{segment}
														</button>
													)}
												</div>
											);
										})}
									</nav>
								) : (
									<span className="truncate text-xs text-muted-foreground">No file selected</span>
								)}
								{hasChanges && (
									<span
										className="h-1.5 w-1.5 flex-none rounded-full bg-ring"
										title="Unsaved changes"
									/>
								)}
							</div>
						</div>

						{showSidebar ? (
							<div className="relative min-w-0">
								<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<input
									ref={searchInputRef}
									type="search"
									value={filterText}
									onChange={(event) => setFilterText(event.target.value)}
									onFocus={() => setSidebarVisible(true)}
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											if (filterText) setFilterText("");
											else event.currentTarget.blur();
										}
										if (event.key === "ArrowDown") {
											event.preventDefault();
											setSidebarVisible(true);
											requestAnimationFrame(() => fileTreeRef.current?.focus());
										}
									}}
									placeholder="Search files…"
									aria-label="Search files by path"
									aria-controls={sidebarVisible ? "lmv-file-tree" : undefined}
									className="h-8 w-full rounded-md border border-border bg-muted/45 pl-8 pr-8 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 hover:bg-muted/65 focus:border-ring focus:bg-background [&::-webkit-search-cancel-button]:hidden"
								/>
								<kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sm:block">
									/
								</kbd>
							</div>
						) : (
							<div className="min-w-0 text-center lg:invisible">
								<span className="block truncate text-xs font-medium">
									{filename || "Local Markdown Viewer"}
								</span>
							</div>
						)}

						<div className="flex min-w-0 items-center justify-end gap-1">
							<div
								className="hidden h-8 items-center rounded-md bg-muted/70 p-0.5 lg:flex"
								role="group"
								aria-label="Document mode"
							>
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										if (isEditing) toggleEditing();
									}}
									disabled={!selectedPath}
									aria-pressed={!isEditing}
									className={cn(
										"h-7 gap-1.5 rounded px-2 text-xs font-normal text-muted-foreground shadow-none hover:text-foreground",
										!isEditing && "bg-background text-foreground shadow-sm hover:bg-background",
									)}
								>
									<Eye className="h-3.5 w-3.5" />
									Read
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										if (!isEditing) toggleEditing();
									}}
									disabled={!selectedPath}
									aria-pressed={isEditing}
									className={cn(
										"h-7 gap-1.5 rounded px-2 text-xs font-normal text-muted-foreground shadow-none hover:text-foreground",
										isEditing && "bg-background text-foreground shadow-sm hover:bg-background",
									)}
								>
									<Pencil className="h-3.5 w-3.5" />
									Edit
								</Button>
							</div>

							{isEditing && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											size="sm"
											onClick={() => handleSave()}
											disabled={!selectedPath || !hasChanges || isSaving}
											aria-label="Save changes"
											className={cn(
												"h-8 px-2.5 max-lg:w-8 max-lg:px-0",
												saveSuccess && "bg-green-600 hover:bg-green-600",
											)}
										>
											{saveSuccess ? <Check /> : <Save />}
											<span className="max-lg:hidden">{saveSuccess ? "Saved" : "Save"}</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>Save changes (Cmd/Ctrl+S)</TooltipContent>
								</Tooltip>
							)}

							<div className="mx-1 hidden h-4 w-px bg-border lg:block" />

							<div className="hidden items-center gap-0.5 lg:flex">
								{isEditing && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Toggle
												pressed={autosave}
												onPressedChange={setAutosave}
												aria-label="Toggle autosave"
												className="h-8 min-w-8 px-1.5 text-muted-foreground"
											>
												{autosave ? <Timer /> : <TimerOff />}
											</Toggle>
										</TooltipTrigger>
										<TooltipContent>{autosave ? "Autosave on" : "Autosave off"}</TooltipContent>
									</Tooltip>
								)}

								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={handleShare}
											disabled={isSharing || !selectedPath}
											aria-label="Share as GitHub Gist"
											className="h-8 w-8 text-muted-foreground hover:text-foreground"
										>
											{isSharing ? <Loader2 className="animate-spin" /> : <Share2 />}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{shareConfigured ? "Share as GitHub Gist" : "GITHUB_TOKEN not set"}
									</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={cycleTheme}
											aria-label={`Cycle theme; current theme is ${theme}`}
											className="h-8 w-8 text-muted-foreground hover:text-foreground"
										>
											<ThemeIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
									</TooltipContent>
								</Tooltip>
							</div>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={toggleEditing}
										disabled={!selectedPath}
										aria-label={isEditing ? "Switch to read mode" : "Switch to edit mode"}
										className="h-8 w-8 text-muted-foreground hover:text-foreground lg:hidden"
									>
										{isEditing ? <Eye /> : <Pencil />}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isEditing ? "Read mode" : "Edit mode"} (Cmd/Ctrl+E)
								</TooltipContent>
							</Tooltip>

							<div ref={mobileActionsRef} className="relative lg:hidden">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => setMobileActionsOpen((open) => !open)}
									aria-label="More actions"
									aria-expanded={mobileActionsOpen}
									aria-controls="lmv-mobile-actions"
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
								>
									<MoreHorizontal />
								</Button>

								{mobileActionsOpen && (
									<div
										id="lmv-mobile-actions"
										className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-border bg-background p-1.5 shadow-xl"
										role="menu"
									>
										<Button
											type="button"
											variant="ghost"
											onClick={() => {
												setMobileActionsOpen(false);
												handleShare();
											}}
											disabled={isSharing || !selectedPath}
											role="menuitem"
											className="h-9 w-full justify-start px-2.5 text-xs font-normal"
										>
											{isSharing ? <Loader2 className="animate-spin" /> : <Share2 />}
											Share as GitHub Gist
										</Button>
										<Button
											type="button"
											variant="ghost"
											onClick={() => {
												cycleTheme();
												setMobileActionsOpen(false);
											}}
											role="menuitem"
											className="h-9 w-full justify-start px-2.5 text-xs font-normal"
										>
											<ThemeIcon />
											Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
										</Button>
										{isEditing && (
											<Button
												type="button"
												variant="ghost"
												onClick={() => setAutosave((enabled) => !enabled)}
												aria-pressed={autosave}
												role="menuitem"
												className="h-9 w-full justify-start px-2.5 text-xs font-normal"
											>
												{autosave ? <Timer /> : <TimerOff />}
												Autosave {autosave ? "on" : "off"}
											</Button>
										)}
									</div>
								)}
							</div>
						</div>
					</div>
				</header>

				<div className="flex min-h-0 flex-1 overflow-hidden">
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
							expandedFolders={expandedFolders}
							onExpandedFoldersChange={setExpandedFolders}
							isMobile={isMobile}
							treeRef={fileTreeRef}
						/>
					)}

					<main
						className="min-w-0 flex-1 overflow-y-auto overscroll-contain"
						aria-label="Document"
						aria-hidden={isMobile && showSidebar && sidebarVisible ? true : undefined}
						inert={isMobile && showSidebar && sidebarVisible ? true : undefined}
					>
						<div className="document-layout document-container mx-auto px-5 py-8 sm:px-8 sm:py-10 lg:py-12">
							{!selectedPath ? (
								<div className="flex min-h-[55vh] items-center justify-center">
									<div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
										<div className="rounded-lg border border-border bg-muted/35 p-2.5">
											<FileText className="h-4 w-4" />
										</div>
										<p className="text-sm">Select a file to view</p>
									</div>
								</div>
							) : isEditing ? (
								<div className="document-primary min-h-[calc(100dvh-7.25rem)]">
									<textarea
										className="min-h-[calc(100dvh-7.25rem)] w-full resize-none rounded-lg border border-input bg-background p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
										value={editedContent}
										onChange={(e) => setEditedContent(e.target.value)}
										placeholder="Start writing markdown..."
										spellCheck={false}
									/>
								</div>
							) : (
								<article className="document-primary markdown-body">
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
