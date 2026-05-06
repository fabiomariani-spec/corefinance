"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  warning?: React.ReactNode;
  confirmLabel?: string;
  loadingLabel?: string;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  warning,
  confirmLabel = "Excluir",
  loadingLabel = "Excluindo...",
  loading = false,
  icon: Icon = Trash2,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <div className="text-sm text-zinc-300">{message}</div>
          {warning && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {warning}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white border-0"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {loadingLabel}</>
            ) : (
              <><Icon className="w-4 h-4" /> {confirmLabel}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
