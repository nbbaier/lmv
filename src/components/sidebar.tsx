import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	FileText,
	Link2,
	X,
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef } from "react";
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
	onFilterTextChange,
	expandedFolders,
	onExpandedFoldersChange,
	isMobile,
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
	onFilterTextChange: (next: string) => void;
	expandedFolders: Set<string>;
	onExpandedFoldersChange: (next: Set<string>) => void;
	isMobile: boolean;
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

	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!cursorPath && visible.length > 0) {
			onCursorPathChange(visible[0]?.node.path ?? null);
		}
	}, [cursorPath, visible, onCursorPathChange]);

	useEffect(() => {
		const visiblePaths = new Set(visible.map((v) => v.node.path));
		if (cursorPath && !visiblePaths.has(cursorPath)) {
			onCursorPathChange(visible[0]?.node.path ?? null);
		}
	}, [cursorPath, visible, onCursorPathChange]);

	const toggleFolder = (path: string) => {
		const next = new Set(expandedFolders);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		onExpandedFoldersChange(next);
	};

	const onKeyDown = (e: ReactKeyboardEvent) => {
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter")
			return;
		if (visible.length === 0) return;

		e.preventDefault();

		const idx = cursorPath
			? visible.findIndex((v) => v.node.path === cursorPath)
			: -1;

		if (e.key === "ArrowDown") {
			const next = visible[Math.min(idx + 1, visible.length - 1)]!;
			onCursorPathChange(next.node.path);
			scrollNodeIntoView(next.node.path);
			return;
		}

		if (e.key === "ArrowUp") {
			const next = visible[Math.max(idx - 1, 0)]!;
			onCursorPathChange(next.node.path);
			scrollNodeIntoView(next.node.path);
			return;
		}

		if (e.key === "Enter") {
			const current = visible[Math.max(idx, 0)]?.node;
			if (!current) return;
			if (current.kind === "folder") toggleFolder(current.path);
			else onOpenPath(current.path);
		}
	};

	const onResizeMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startPct = sidebarWidthPct;

		const onMove = (ev: MouseEvent) => {
			const delta = ev.clientX - startX;
			const next = startPct + delta / window.innerWidth;
			onSidebarWidthPctChange(Math.min(0.6, Math.max(0.15, next)));
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	const widthStyle = { width: `${sidebarWidthPct * 100}%` };

	const content = (
		<div className="h-full flex flex-col border-r border-border bg-background">
			<div className="flex items-center justify-between gap-2 p-3 border-b border-border">
				<div className="flex items-center gap-2 min-w-0">
					<FileText className="h-4 w-4 text-muted-foreground" />
					<div className="text-sm font-medium truncate">Files</div>
				</div>
				<div className="flex items-center gap-1">
					{pendingRefresh && (
						<Button size="sm" variant="outline" onClick={onRefresh}>
							Refresh
						</Button>
					)}
					{isMobile && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onSidebarVisibleChange(false)}
							aria-label="Close sidebar"
						>
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			<div className="p-3 flex flex-col gap-2 border-b border-border">
				<input
					value={filterText}
					onChange={(e) => onFilterTextChange(e.target.value)}
					placeholder="Filter…"
					className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
				/>
				<select
					value={sortOrder}
					onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
					className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="name-asc">Name (A-Z)</option>
					<option value="name-desc">Name (Z-A)</option>
					<option value="modified-desc">Modified (newest)</option>
					<option value="modified-asc">Modified (oldest)</option>
				</select>
			</div>

			<div
				ref={listRef}
				onKeyDown={onKeyDown}
				className="flex-1 overflow-auto outline-none focus:ring-2 focus:ring-ring"
			>
				<div className="p-2">
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
							onCursor={onCursorPathChange}
							onToggleFolder={toggleFolder}
							onOpenFile={(path) => onOpenPath(path)}
						/>
					))}
				</div>
			</div>
		</div>
	);

	if (!sidebarVisible) return null;

	if (isMobile) {
		return (
			<div className="fixed inset-0 z-40">
				<div
					className="absolute inset-0 bg-black/40"
					onClick={() => onSidebarVisibleChange(false)}
				/>
				<div className="absolute inset-y-0 left-0 w-[85vw] max-w-[360px] shadow-xl">
					{content}
				</div>
			</div>
		);
	}

	return (
		<div className="relative flex-shrink-0" style={widthStyle}>
			{content}
			<div
				onMouseDown={onResizeMouseDown}
				className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-border"
				aria-hidden
			/>
		</div>
	);
}

function TreeRow({
	node,
	depth,
	expanded,
	selectedPath,
	cursorPath,
	onCursor,
	onToggleFolder,
	onOpenFile,
}: {
	node: TreeNode;
	depth: number;
	expanded: boolean;
	selectedPath: string | null;
	cursorPath: string | null;
	onCursor: (path: string) => void;
	onToggleFolder: (path: string) => void;
	onOpenFile: (path: string) => void;
}) {
	const isSelected = selectedPath === node.path;
	const isCursor = cursorPath === node.path;
	const paddingLeft = 8 + depth * 14;

	return (
		<div
			id={nodeDomId(node.path)}
			style={{ paddingLeft }}
			className={cn(
				"flex items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none",
				isSelected && "bg-accent text-accent-foreground",
				!isSelected && "hover:bg-muted",
				isCursor && !isSelected && "ring-1 ring-ring",
			)}
			onMouseEnter={() => onCursor(node.path)}
			onClick={() => {
				onCursor(node.path);
				if (node.kind === "folder") onToggleFolder(node.path);
				else onOpenFile(node.path);
			}}
			role="treeitem"
		>
			{node.kind === "folder" ? (
				expanded ? (
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				) : (
					<ChevronRight className="h-4 w-4 text-muted-foreground" />
				)
			) : node.error ? (
				<AlertTriangle className="h-4 w-4 text-red-500" />
			) : node.isSymlink ? (
				<Link2 className="h-4 w-4 text-muted-foreground" />
			) : (
				<FileText className="h-4 w-4 text-muted-foreground" />
			)}

			<span className="truncate min-w-0 flex-1">{node.name}</span>
		</div>
	);
}
