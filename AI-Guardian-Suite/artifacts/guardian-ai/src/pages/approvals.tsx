import {
  useListApprovals,
  useApproveTransaction,
  useRejectTransaction,
} from "@workspace/api-client-react";
import type { ApprovalRequest } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Check, X, FileText, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Approvals() {
  const { data, isLoading, refetch } = useListApprovals({ status: "pending" });
  const approveMutation = useApproveTransaction();
  const rejectMutation = useRejectTransaction();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Record<number, string>>({});

  const handleApprove = (id: number) => {
    approveMutation.mutate(
      { id, data: { note: notes[id] } },
      {
        onSuccess: () => {
          toast({
            title: "Transaction Approved",
            description: "The transaction has been approved and posted.",
          });
          refetch();
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to approve transaction.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleReject = (id: number) => {
    if (!notes[id]) {
      toast({
        title: "Note Required",
        description: "Please provide a reason for rejection.",
        variant: "destructive",
      });
      return;
    }
    rejectMutation.mutate(
      { id, data: { note: notes[id] } },
      {
        onSuccess: () => {
          toast({
            title: "Transaction Rejected",
            description: "The transaction has been rejected.",
          });
          refetch();
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to reject transaction.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pending Approvals</h1>
        <p className="text-muted-foreground mt-2">
          Review documents that require human validation.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : data?.approvals.length === 0 ? (
        <Card className="border-dashed border-2 bg-transparent">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Check className="h-12 w-12 mb-4 text-success opacity-50" />
            <p className="text-lg font-medium">All caught up</p>
            <p className="text-sm">
              There are no pending approvals at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {data?.approvals.map((approval: ApprovalRequest) => (
            <Card
              key={approval.id}
              className="overflow-hidden border-warning/20"
            >
              <div className="bg-warning/5 px-6 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 text-warning font-medium text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Reason: {approval.reason}
                </div>
                <Badge
                  variant="outline"
                  className="bg-warning/20 text-warning border-warning/30"
                >
                  Pending Review
                </Badge>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-secondary rounded-lg">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">
                          {approval.document?.fileName}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Uploaded{" "}
                          {new Date(
                            approval.document?.createdAt || "",
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">Supplier</p>
                        <p className="font-medium">
                          {approval.document?.extractedData?.supplier ||
                            "Unknown"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Amount</p>
                        <p className="font-medium font-mono text-lg">
                          {approval.document?.extractedData?.currency}{" "}
                          {approval.document?.extractedData?.totalAmount != null
                            ? Number(
                                approval.document.extractedData.totalAmount,
                              ).toFixed(2)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">
                          Invoice Number
                        </p>
                        <p className="font-medium font-mono">
                          {approval.document?.extractedData?.invoiceNumber ||
                            "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Date</p>
                        <p className="font-medium">
                          {approval.document?.extractedData?.invoiceDate ||
                            "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col h-full">
                    <Textarea
                      placeholder="Add review notes (required for rejection)..."
                      className="flex-1 min-h-[120px] mb-4 resize-none"
                      value={notes[approval.id] || ""}
                      onChange={(e) =>
                        setNotes({ ...notes, [approval.id]: e.target.value })
                      }
                    />
                    <div className="flex items-center gap-3 mt-auto">
                      <Button
                        variant="outline"
                        className="flex-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => handleReject(approval.id)}
                        disabled={
                          rejectMutation.isPending || approveMutation.isPending
                        }
                      >
                        <X className="mr-2 h-4 w-4" /> Reject
                      </Button>
                      <Button
                        className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                        onClick={() => handleApprove(approval.id)}
                        disabled={
                          rejectMutation.isPending || approveMutation.isPending
                        }
                      >
                        <Check className="mr-2 h-4 w-4" /> Approve & Post
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
