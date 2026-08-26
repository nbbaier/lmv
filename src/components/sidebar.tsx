import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	FileText,
	Folder,
	FolderOpen,
	Link2,
	RefreshCw,
	X,
} from "lucide-react";
import type {
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
	RefObject,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiFile, SortOrder, TreeNode } from "../lib/file-tree";
import {
	buildFileTree,
	filterTree,
	flattenVisibleNodes,
} from "../lib/file-tree";
import { cn } from "../lib/utils";
import { Button } from "./button";

function nodeDomId(path: string) {
	return `lmv-node-${encodeURIComponent(path || "__root__")}`;
}

export function scrollNodeIntoView(path: string) {
	const el = document.getElementById(nodeDomId(path));
	if (!el) return;
	el.scrollIntoView({ block: "center" });
}

export function Sidebar({
	files,
	selectedPath,
	cursorPath,
	onCursorPathChange,
	onOpenPath,
	pendingRefresh,
	onRefresh,
	sidebarVisible,
	onSidebarVisibleChange,
	sidebarWidthPct,
	onSidebarWidthPctChange,
	sortOrder,
	onSortOrderChange,
	filterText,
	expandedFolders,
	onExpandedFoldersChange,
	isMobile,
	treeRef,
}: {
	files: ApiFile[];
	selectedPath: string | null;
	cursorPath: string | null;
	onCursorPathChange: (path: string | null) => void;
	onOpenPath: (path: string) => void;
	pendingRefresh: boolean;
	onRefresh: () => void;
	sidebarVisible: boolean;
	onSidebarVisibleChange: (next: boolean) => void;
	sidebarWidthPct: number;
	onSidebarWidthPctChange: (next: number) => void;
	sortOrder: SortOrder;
	onSortOrderChange: (next: SortOrder) => void;
	filterText: string;
	expandedFolders: Set<string>;
	onExpandedFoldersChange: (next: Set<string>) => void;
	isMobile: boolean;
	treeRef: RefObject<HTMLDivElement | null>;
}) {
	const tree = useMemo(
		() => buildFileTree(files, sortOrder),
		[files, sortOrder],
	);
	const { nodes: filteredTree, autoExpand } = useMemo(
		() => filterTree(tree, filterText),
		[tree, filterText],
	);
	const visible = useMemo(
		() => flattenVisibleNodes(filteredTree, expandedFolders, autoExpand),
		[filteredTree, expandedFolders, autoExpand],
	);
	const fallbackCursorPath =
		(filterText ? visible.find((entry) => entry.node.kind === "file") : visible[0])
			?.node.path ?? null;

	const sidebarRef = useRef<HTMLDivElement | null>(null);
	const [treeFocused, setTreeFocused] = useState(false);
	const [isResizing, setIsResizing] = useState(false);

	useEffect(() => {
		if (!cursorPath && visible.length > 0) {
			onCursorPathChange(fallbackCursorPath);
		}
	}, [cursorPath, fallbackCursorPath, visible.length, onCursorPathChange]);

	useEffect(() => {
		const visiblePaths = new Set(visible.map((v) => v.node.path));
		if (cursorPath && !visiblePaths.has(cursorPath)) {
			onCursorPathChange(fallbackCursorPath);
		}
	}, [cursorPath, fallbackCursorPath, visible, onCursorPathChange]);

	const toggleFolder = (path: string) => {
		const next = new Set(expandedFolders);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		onExpandedFoldersChange(next);
	};

	const onKeyDown = (e: ReactKeyboardEvent) => {
		if (
			e.key !== "ArrowDown" &&
			e.key !== "ArrowUp" &&
			e.key !== "ArrowRight" &&
			e.key !== "ArrowLeft" &&
			e.key !== "Home" &&
			e.key !== "End" &&
			e.key !== "Enter"
		)
			return;
		if (visible.length === 0) return;

		e.preventDefault();

		const idx = cursorPath
			? visible.findIndex((v) => v.node.path === cursorPath)
			: -1;

		const moveTo = (index: number) => {
			const next = visible[index];
			if (!next) return;
			onCursorPathChange(next.node.path);
			scrollNodeIntoView(next.node.path);
		};

		if (e.key === "ArrowDown") {
			moveTo(Math.min(idx + 1, visible.length - 1));
			return;
		}

		if (e.key === "ArrowUp") {
			moveTo(Math.max(idx - 1, 0));
			return;
		}

		if (e.key === "Home") {
			moveTo(0);
			return;
		}

		if (e.key === "End") {
			moveTo(visible.length - 1);
			return;
		}

		const currentIndex = idx >= 0 ? idx : 0;
		const currentEntry = visible[currentIndex];
		if (!currentEntry) return;
		const current = currentEntry.node;

		if (e.key === "Enter") {
			if (current.kind === "folder") toggleFolder(current.path);
			else onOpenPath(current.path);
			return;
		}

		if (e.key === "ArrowRight") {
			if (current.kind !== "folder") return;
			const expanded =
				expandedFolders.has(current.path) || autoExpand.has(current.path);
			if (!expanded) {
				toggleFolder(current.path);
				return;
			}
			const child = visible[currentIndex + 1];
			if (child && child.depth > currentEntry.depth) moveTo(currentIndex + 1);
			return;
		}

		if (e.key === "ArrowLeft") {
			if (
				current.kind === "folder" &&
				expandedFolders.has(current.path) &&
				!autoExpand.has(current.path)
			) {
				toggleFolder(current.path);
				return;
			}

			const parentPath = current.path.split("/").slice(0, -1).join("/");
			if (!parentPath) return;
			const parentIndex = visible.findIndex(
				(entry) => entry.node.path === parentPath,
			);
			if (parentIndex >= 0) moveTo(parentIndex);
		}
	};

	const updateSidebarWidth = (width: number) => {
		const minWidth = 208;
		const maxWidth = Math.min(480, window.innerWidth * 0.6);
		const nextWidth = Math.min(maxWidth, Math.max(minWidth, width));
		onSidebarWidthPctChange(nextWidth / window.innerWidth);
	};

	const onResizePointerDown = (e: ReactPointerEvent) => {
		e.preventDefault();
		setIsResizing(true);
		const startX = e.clientX;
		const startWidth =
			sidebarRef.current?.getBoundingClientRect().width ??
			sidebarWidthPct * window.innerWidth;
		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		const onMove = (ev: PointerEvent) => {
			updateSidebarWidth(startWidth + ev.clientX - startX);
		};
		const onUp = () => {
			setIsResizing(false);
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
	};

	const onResizeKeyDown = (e: ReactKeyboardEvent) => {
		if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
		e.preventDefault();
		const currentWidth =
			sidebarRef.current?.getBoundingClientRect().width ??
			sidebarWidthPct * window.innerWidth;
		const direction = e.key === "ArrowLeft" ? -1 : 1;
		updateSidebarWidth(currentWidth + direction * (e.shiftKey ? 32 : 8));
	};

	const widthStyle = {
		width: `clamp(13rem, ${sidebarWidthPct * 100}vw, 30rem)`,
	};
	const visibleFileCount = visible.filter(
		(entry) => entry.node.kind === "file",
	).length;

	const content = (
		<aside
			aria-label="File browser"
			className="flex h-full min-h-0 flex-col border-r border-border bg-background md:bg-secondary/25"
		>
			<div className="border-b border-border px-2 pb-2 pt-2">
				<div className="flex h-8 items-center justify-between gap-2 px-1">
				<div className="flex items-center gap-2 min-w-0">
					<div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
						Files
					</div>
					<span className="text-xs tabular-nums text-muted-foreground/70">
						{filterText ? `${visibleFileCount}/${files.length}` : files.length}
					</span>
				</div>
				<div className="flex items-center gap-1">
					{pendingRefresh && (
						<Button
							type="button"
							size="icon"
							variant="ghost"
							onClick={onRefresh}
							aria-label="Refresh file list"
							className="h-7 w-7 text-ring hover:text-foreground"
						>
							<RefreshCw className="h-3.5 w-3.5" />
						</Button>
					)}
					{isMobile && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onSidebarVisibleChange(false)}
							aria-label="Close sidebar"
							className="h-7 w-7"
						>
							<X className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</div>

				<label className="sr-only" htmlFor="lmv-file-sort">
					Sort files
				</label>
				<select
					id="lmv-file-sort"
					value={sortOrder}
					onChange={(e) => {
						const value = e.target.value;
						if (
							value === "name-asc" ||
							value === "name-desc" ||
							value === "modified-desc" ||
							value === "modified-asc"
						) {
							onSortOrderChange(value);
						}
					}}
					className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground outline-none transition-colors hover:border-border hover:bg-background/70 hover:text-foreground focus:border-ring focus:bg-background"
				>
					<option value="name-asc">Name · A–Z</option>
					<option value="name-desc">Name · Z–A</option>
					<option value="modified-desc">Modified · newest</option>
					<option value="modified-asc">Modified · oldest</option>
				</select>
			</div>

			<div
				id="lmv-file-tree"
				ref={treeRef}
				role="tree"
				aria-label="Markdown files"
				aria-activedescendant={cursorPath ? nodeDomId(cursorPath) : undefined}
				tabIndex={0}
				onKeyDown={onKeyDown}
				onMouseDown={() => treeRef.current?.focus({ preventScroll: true })}
				onFocus={() => setTreeFocused(true)}
				onBlur={() => setTreeFocused(false)}
				className="min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
			>
				<div className="p-1.5">
					{visible.map(({ node, depth }) => (
						<TreeRow
							key={`${node.kind}:${node.path}`}
							node={node}
							depth={depth}
							expanded={
								node.kind === "folder" &&
								(expandedFolders.has(node.path) || autoExpand.has(node.path))
							}
							selectedPath={selectedPath}
							cursorPath={cursorPath}
							treeFocused={treeFocused}
							onCursor={onCursorPathChange}
							onToggleFolder={toggleFolder}
							onOpenFile={(path) => onOpenPath(path)}
						/>
					))}
					{visible.length === 0 && (
						<div className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
							No files match “{filterText.trim()}”
						</div>
					)}
				</div>
			</div>
		</aside>
	);

	if (!sidebarVisible) return null;

	if (isMobile) {
		return (
			<div className="fixed inset-x-0 bottom-0 top-[3.25rem] z-40">
				<button
					type="button"
					aria-label="Dismiss sidebar"
					className="absolute inset-0 cursor-default bg-foreground/20 backdrop-blur-[1px]"
					onClick={() => onSidebarVisibleChange(false)}
				/>
				<div className="absolute inset-y-0 left-0 w-[88vw] max-w-[360px] shadow-2xl">
					{content}
				</div>
			</div>
		);
	}

	return (
		<div
			ref={sidebarRef}
			className="relative flex-shrink-0"
			style={widthStyle}
		>
			{content}
			<div
				role="separator"
				aria-label="Resize sidebar"
				aria-orientation="vertical"
				aria-valuemin={208}
				aria-valuemax={480}
				aria-valuenow={Math.round(
					Math.min(480, Math.max(208, sidebarWidthPct * window.innerWidth)),
				)}
				tabIndex={0}
				onPointerDown={onResizePointerDown}
				onKeyDown={onResizeKeyDown}
				onDoubleClick={() => onSidebarWidthPctChange(0.25)}
				className="group absolute -right-2 top-0 z-10 flex h-full w-4 cursor-col-resize touch-none items-center justify-center outline-none"
			>
				<div
					className={cn(
						"h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-ring/35 group-focus-visible:bg-ring/55 group-active:bg-ring/70",
						isResizing && "bg-ring/70",
					)}
				/>
				<div
					className={cn(
						"absolute h-7 w-1 rounded-full bg-muted-foreground/55 transition-colors duration-150 group-hover:bg-ring group-focus-visible:bg-ring group-active:bg-ring",
						isResizing && "bg-ring",
					)}
				/>
			</div>
		</div>
	);
}

function TreeRow({
	node,
	depth,
	expanded,
	selectedPath,
	cursorPath,
	treeFocused,
	onCursor,
	onToggleFolder,
	onOpenFile,
}: {
	node: TreeNode;
	depth: number;
	expanded: boolean;
	selectedPath: string | null;
	cursorPath: string | null;
	treeFocused: boolean;
	onCursor: (path: string) => void;
	onToggleFolder: (path: string) => void;
	onOpenFile: (path: string) => void;
}) {
	const isSelected = selectedPath === node.path;
	const isCursor = cursorPath === node.path;
	const paddingLeft = 6 + depth * 14;

	return (
		<div
			id={nodeDomId(node.path)}
			style={{ paddingLeft }}
			className={cn(
				"relative flex h-7 select-none items-center gap-1.5 rounded-md pr-2 text-[13px] leading-5 transition-colors before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-transparent",
				isSelected &&
					"bg-accent/80 font-medium text-accent-foreground before:bg-ring",
				!isSelected && "text-foreground/85 hover:bg-muted/70 hover:text-foreground",
				isCursor && treeFocused && !isSelected &&
					"outline outline-1 -outline-offset-1 outline-ring/60",
			)}
			onClick={() => {
				onCursor(node.path);
				if (node.kind === "folder") onToggleFolder(node.path);
				else onOpenFile(node.path);
			}}
			role="treeitem"
			aria-level={depth + 1}
			aria-expanded={node.kind === "folder" ? expanded : undefined}
			aria-selected={isSelected}
			title={node.path}
		>
			{node.kind === "folder" ? (
				<>
					{expanded ? (
						<ChevronDown className="h-3 w-3 text-muted-foreground/80" />
					) : (
						<ChevronRight className="h-3 w-3 text-muted-foreground/80" />
					)}
					{expanded ? (
						<FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
					) : (
						<Folder className="h-3.5 w-3.5 text-muted-foreground" />
					)}
				</>
			) : node.error ? (
				<>
					<span className="w-3" />
					<AlertTriangle className="h-3.5 w-3.5 text-red-500" />
				</>
			) : node.isSymlink ? (
				<>
					<span className="w-3" />
					<Link2 className="h-3.5 w-3.5 text-muted-foreground" />
				</>
			) : (
				<>
					<span className="w-3" />
					<FileText className="h-3.5 w-3.5 text-muted-foreground" />
				</>
			)}

			<span className="truncate min-w-0 flex-1">{node.name}</span>
		</div>
	);
}
