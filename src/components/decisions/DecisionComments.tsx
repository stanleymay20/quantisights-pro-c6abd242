import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSafeChannel } from "@/lib/realtime-channel";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, Loader2, Reply, Trash2, AtSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Comment {
  id: string;
  decision_id: string;
  user_id: string;
  content: string;
  mentions: string[] | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string;
}

interface TeamMember {
  user_id: string;
  full_name: string;
}

interface DecisionCommentsProps {
  decisionId: string;
}

const DecisionComments = ({ decisionId }: DecisionCommentsProps) => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!currentOrgId) { setLoading(false); return; }
    fetchComments();
    fetchTeamMembers();

    return createSafeChannel(`comments-${decisionId}`, (channel) =>
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "decision_comments",
        filter: `decision_id=eq.${decisionId}`,
      }, () => fetchComments())
      .subscribe()
    );
  }, [decisionId, currentOrgId]);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("decision_comments")
      .select("*")
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) || []);
    setLoading(false);
  };

  const fetchTeamMembers = async () => {
    if (!currentOrgId) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("organization_id", currentOrgId);
    setTeamMembers((data as TeamMember[]) || []);
  };

  const extractMentions = (text: string): string[] => {
    const mentionPattern = /@(\w[\w\s]*)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionPattern.exec(text)) !== null) {
      const name = match[1].trim();
      const member = teamMembers.find(
        (m) => m.full_name?.toLowerCase() === name.toLowerCase()
      );
      if (member) mentions.push(member.user_id);
    }
    return mentions;
  };

  const submitComment = async () => {
    if (!newComment.trim() || !user || !currentOrgId) return;
    setSubmitting(true);
    try {
      const mentions = extractMentions(newComment);
      const { error } = await supabase.from("decision_comments").insert({
        decision_id: decisionId,
        organization_id: currentOrgId,
        user_id: user.id,
        content: newComment.trim(),
        mentions: mentions.length > 0 ? mentions : null,
        parent_id: replyTo,
      });
      if (error) throw error;
      setNewComment("");
      setReplyTo(null);
      toast({ title: "Comment posted" });
      if (mentions.length > 0) {
        toast({
          title: `${mentions.length} team member${mentions.length > 1 ? "s" : ""} mentioned`,
          description: "They'll see this in their activity feed.",
        });
      }
    } catch (err: unknown) {
      toast({ title: "Failed to post comment", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("decision_comments").delete().eq("id", id);
    if (error) {
      toast({ title: "Cannot delete", description: error.message, variant: "destructive" });
    }
  };

  const insertMention = (member: TeamMember) => {
    setNewComment((prev) => prev + `@${member.full_name} `);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const getUserName = (userId: string) => {
    const member = teamMembers.find((m) => m.user_id === userId);
    return member?.full_name || "Unknown";
  };

  const topLevel = comments.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  const renderContent = (content: string) => {
    // Highlight @mentions
    return content.replace(/@(\w[\w\s]*)/g, (match) => {
      return match; // In JSX we handle this differently
    });
  };

  const CommentBubble = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    const isOwn = comment.user_id === user?.id;
    const replies = getReplies(comment.id);

    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${isReply ? "ml-8 border-l-2 border-border pl-4" : ""}`}
      >
        <div className="group flex gap-3 py-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
            {getUserName(comment.user_id).slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold">{getUserName(comment.user_id)}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(comment.created_at).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {comment.mentions && comment.mentions.length > 0 && (
                <Badge variant="outline" className="text-[9px] gap-0.5 px-1 py-0">
                  <AtSign className="w-2.5 h-2.5" />
                  {comment.mentions.length}
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {comment.content.split(/(@\w[\w\s]*)/g).map((part, i) =>
                part.startsWith("@") ? (
                  <span key={i} className="text-primary font-medium">{part}</span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
            <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isReply && (
                <button
                  onClick={() => setReplyTo(comment.id)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                >
                  <Reply className="w-3 h-3" /> Reply
                </button>
              )}
              {isOwn && (
                <button
                  onClick={() => deleteComment(comment.id)}
                  className="text-[10px] text-destructive/60 hover:text-destructive flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
        {replies.length > 0 && (
          <div className="space-y-0">
            {replies.map((r) => (
              <CommentBubble key={r.id} comment={r} isReply />
            ))}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold">Discussion ({comments.length})</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-xs">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-0 max-h-64 overflow-y-auto mb-3">
          <AnimatePresence>
            {topLevel.map((c) => (
              <CommentBubble key={c.id} comment={c} />
            ))}
          </AnimatePresence>
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No comments yet. Start the discussion.</p>
          )}
        </div>
      )}

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
          <Reply className="w-3 h-3" />
          Replying to {getUserName(comments.find((c) => c.id === replyTo)?.user_id || "")}
          <button onClick={() => setReplyTo(null)} className="ml-auto text-destructive/60 hover:text-destructive text-[10px]">
            Cancel
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end relative">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitComment();
              }
              if (e.key === "@" || (newComment.endsWith("@") && e.key !== "Backspace")) {
                setShowMentions(true);
              } else if (e.key === " " || e.key === "Escape") {
                setShowMentions(false);
              }
            }}
            placeholder="Add a comment… Use @ to mention team members"
            className="min-h-[36px] text-sm resize-none"
            rows={1}
          />
          {/* Mentions dropdown */}
          {showMentions && teamMembers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full max-h-32 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-10">
              {teamMembers.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => insertMention(m)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <AtSign className="w-3 h-3 text-primary" />
                  {m.full_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={submitComment}
          disabled={!newComment.trim() || submitting}
          className="shrink-0"
        >
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">⌘+Enter to send · @ to mention</p>
    </div>
  );
};

export default DecisionComments;
