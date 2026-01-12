import { useState, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Eye,
  Pencil,
  Save,
  Sun,
  Moon,
  Monitor,
  Check,
  FileText,
  Share2,
  Loader2,
  ExternalLink,
  X,
} from "lucide-react";
import { Button } from "./components/button";
import { Toggle } from "./components/toggle";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./components/tooltip";
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

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

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
            toast.type === "info" && "bg-primary text-primary-foreground"
          )}
        >
          <span className="flex-1 text-sm">{toast.message}</span>
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:no-underline"
            >
              {toast.action.label}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          <button
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
        "(prefers-color-scheme: dark)"
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

function useFileParam(): string | null {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("file");
  }, []);
}

export function App() {
  const fileParam = useFileParam();
  const [content, setContent] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareConfigured, setShareConfigured] = useState(false);
  const { theme, setTheme } = useTheme();
  const { toasts, addToast, removeToast } = useToast();

  const apiUrl = fileParam ? `/api/file?file=${encodeURIComponent(fileParam)}` : null;

  useEffect(() => {
    if (!apiUrl) {
      setError("No file specified. Use: lmv <file.md>");
      return;
    }

    fetch(apiUrl)
      .then(async (res) => {
        const data = (await res.json()) as { content?: string; filename?: string; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to load file");
          return;
        }
        if (typeof data.content === "string" && typeof data.filename === "string") {
          setContent(data.content);
          setEditedContent(data.content);
          setFilename(data.filename);
        }
      })
      .catch(() => setError("Failed to load file"));

    fetch("/api/share")
      .then((res) => res.json())
      .then((data: { configured: boolean }) => {
        setShareConfigured(data.configured);
      })
      .catch(console.error);
  }, [apiUrl]);

  useEffect(() => {
    setHasChanges(editedContent !== content);
  }, [editedContent, content]);

  const handleSave = useCallback(async () => {
    if (!apiUrl) return;
    setIsSaving(true);
    try {
      const res = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedContent }),
      });
      if (res.ok) {
        setContent(editedContent);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  }, [apiUrl, editedContent]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isEditing && hasChanges) handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        setIsEditing((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, hasChanges, handleSave]);

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
    } catch (error) {
      addToast({
        type: "error",
        message: "Failed to create gist",
      });
    } finally {
      setIsSharing(false);
    }
  }, [shareConfigured, isEditing, editedContent, content, filename, addToast]);

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-medium text-foreground">{error}</h1>
          <p className="text-sm text-muted-foreground">
            Run <code className="bg-muted px-1.5 py-0.5 rounded">lmv &lt;file.md&gt;</code> to view a file
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-sm font-medium truncate max-w-[300px] sm:max-w-none">
                {filename}
              </h1>
              {hasChanges && (
                <span className="text-xs text-muted-foreground">(modified)</span>
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
                    disabled={isSharing}
                  >
                    {isSharing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {shareConfigured ? "Share as GitHub Gist" : "GITHUB_TOKEN not set"}
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!hasChanges || isSaving}
                      className={cn(
                        "transition-all",
                        saveSuccess && "bg-green-600 hover:bg-green-600"
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
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {isEditing ? (
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
                    <h1 className="text-3xl font-bold mt-0 mb-4 pb-2 border-b border-border">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-2xl font-semibold mt-8 mb-4 pb-1 border-b border-border">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xl font-semibold mt-6 mb-3">{children}</h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-lg font-semibold mt-5 mb-2">{children}</h4>
                  ),
                  p: ({ children }) => (
                    <p className="my-4 leading-7">{children}</p>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300">{children}</a>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-4 ml-6 list-disc space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-4 ml-6 list-decimal space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-7">{children}</li>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-muted-foreground/30 pl-4 my-4 italic text-muted-foreground">{children}</blockquote>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
                      );
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                  pre: ({ children }) => (
                    <pre className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-4 my-4 overflow-x-auto text-sm">{children}</pre>
                  ),
                  hr: () => <hr className="my-8 border-border" />,
                  table: ({ children }) => (
                    <div className="my-4 overflow-x-auto">
                      <table className="w-full border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border bg-muted px-4 py-2 text-left font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border px-4 py-2">{children}</td>
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
                    <img src={src} alt={alt} className="max-w-full h-auto rounded-lg my-4" />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          )}
        </main>

        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    </TooltipProvider>
  );
}
