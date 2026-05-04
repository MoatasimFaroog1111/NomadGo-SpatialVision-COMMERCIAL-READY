import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  Image,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface UploadResult {
  documentId: number;
  fileName: string;
  fileType: string;
  status: string;
  message: string;
}

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.tiff,.eml,.msg";

function FileIcon({ type }: { type: string }) {
  if (type.includes("image"))
    return <Image className="w-5 h-5 text-blue-400" />;
  return <FileText className="w-5 h-5 text-amber-400" />;
}

export default function UploadDocument() {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<
    Array<{
      file: File;
      status: "pending" | "uploading" | "done" | "error";
      result?: UploadResult;
      error?: string;
    }>
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => f.size < 20 * 1024 * 1024);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !existingNames.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setResults((prev) => prev.filter((r) => r.file.name !== name));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("source", "upload");

      const res = await fetch(getApiUrl("upload"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = (await res
          .json()
          .catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return res.json() as Promise<UploadResult>;
    },
  });

  const uploadAll = async () => {
    const pendingFiles = files.filter(
      (f) =>
        !results.find((r) => r.file.name === f.name && r.status === "done"),
    );

    for (const file of pendingFiles) {
      setResults((prev) => {
        const existing = prev.find((r) => r.file.name === file.name);
        if (existing)
          return prev.map((r) =>
            r.file.name === file.name
              ? { ...r, status: "uploading" as const }
              : r,
          );
        return [...prev, { file, status: "uploading" as const }];
      });

      try {
        const result = await uploadMutation.mutateAsync(file);
        setResults((prev) =>
          prev.map((r) =>
            r.file.name === file.name
              ? { ...r, status: "done" as const, result }
              : r,
          ),
        );
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (err) {
        setResults((prev) =>
          prev.map((r) =>
            r.file.name === file.name
              ? { ...r, status: "error" as const, error: String(err) }
              : r,
          ),
        );
      }
    }
  };

  const pendingCount = files.filter(
    (f) => !results.find((r) => r.file.name === f.name && r.status === "done"),
  ).length;
  const doneCount = results.filter((r) => r.status === "done").length;
  const isUploading = results.some((r) => r.status === "uploading");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Documents</h1>
        <p className="text-muted-foreground mt-1">
          Upload invoices, receipts, or expense documents. GuardianAI will
          process them automatically through the 7-agent pipeline.
        </p>
      </div>

      {/* Drop zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-muted-foreground/60",
        )}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
      >
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-colors",
              dragOver ? "bg-primary/20" : "bg-muted",
            )}
          >
            <Upload
              className={cn(
                "w-8 h-8 transition-colors",
                dragOver ? "text-primary" : "text-muted-foreground",
              )}
            />
          </div>
          <div className="text-center">
            <p className="text-base font-medium">
              Drop files here or click to browse
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF, images (JPG, PNG, TIFF), emails — up to 20MB each
            </p>
          </div>
          <Button variant="outline" size="sm" type="button">
            <Plus className="w-4 h-4 mr-2" /> Select Files
          </Button>
        </CardContent>
      </Card>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
      />

      {/* File list */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Selected Files</CardTitle>
                <CardDescription>
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                </CardDescription>
              </div>
              <Button
                onClick={uploadAll}
                disabled={isUploading || pendingCount === 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" /> Upload{" "}
                    {pendingCount > 0
                      ? `${pendingCount} File${pendingCount !== 1 ? "s" : ""}`
                      : "All"}
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((file) => {
              const result = results.find((r) => r.file.name === file.name);
              return (
                <div
                  key={file.name}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/40"
                >
                  <FileIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!result && <Badge variant="secondary">Ready</Badge>}
                    {result?.status === "uploading" && (
                      <div className="flex items-center gap-1.5 text-blue-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Processing...</span>
                      </div>
                    )}
                    {result?.status === "done" && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-emerald-500">
                          ID #{result.result?.documentId}
                        </span>
                      </div>
                    )}
                    {result?.status === "error" && (
                      <div
                        className="flex items-center gap-1.5 text-destructive"
                        title={result.error}
                      >
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs">Failed</span>
                      </div>
                    )}
                    {!result && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.name);
                        }}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Done summary */}
      {doneCount > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center gap-4 pt-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                {doneCount} document{doneCount !== 1 ? "s" : ""} uploaded
                successfully
              </p>
              <p className="text-sm text-muted-foreground">
                The AI pipeline is now running. Check the Document Queue for
                real-time status.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/documents")}>
              View Queue
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
