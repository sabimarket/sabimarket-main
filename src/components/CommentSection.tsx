'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { ThumbsUp, ThumbsDown, MessageCircle, Send, Loader2, Wallet } from 'lucide-react';
import { useToast } from './Toast';

interface User {
  id: string;
  walletAddress: string;
  username: string | null;
}

interface Comment {
  id: string;
  marketId: string;
  userId: string;
  user: User;
  content: string;
  parentId: string | null;
  likes: number;
  dislikes: number;
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

interface CommentSectionProps {
  marketId: string;
}

function CommentThread({ comment, marketId, onReply }: { comment: Comment; marketId: string; onReply: (commentId: string) => void }) {
  const { address } = useAccount();
  const { success: toastSuccess, error: toastError } = useToast();
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userLiked, setUserLiked] = useState(false);
  const [userDisliked, setUserDisliked] = useState(false);
  const [localLikes, setLocalLikes] = useState(comment.likes);
  const [localDislikes, setLocalDislikes] = useState(comment.dislikes);

  const handleLike = async () => {
    if (!address) {
      toastError('Wallet required', 'Connect your wallet to like comments');
      return;
    }

    try {
      const action = userLiked ? 'unlike' : 'like';
      const res = await fetch(`/api/comments/${comment.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error('Failed to like comment');

      setUserLiked(!userLiked);
      setLocalLikes((prev) => (userLiked ? prev - 1 : prev + 1));
      
      // If user previously disliked, remove dislike
      if (userDisliked && !userLiked) {
        setUserDisliked(false);
        setLocalDislikes((prev) => prev - 1);
      }
    } catch (err) {
      console.error('Like error:', err);
      toastError('Error', 'Failed to like comment');
    }
  };

  const handleDislike = async () => {
    if (!address) {
      toastError('Wallet required', 'Connect your wallet to dislike comments');
      return;
    }

    try {
      const action = userDisliked ? 'undislike' : 'dislike';
      const res = await fetch(`/api/comments/${comment.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error('Failed to dislike comment');

      setUserDisliked(!userDisliked);
      setLocalDislikes((prev) => (userDisliked ? prev - 1 : prev + 1));
      
      // If user previously liked, remove like
      if (userLiked && !userDisliked) {
        setUserLiked(false);
        setLocalLikes((prev) => prev - 1);
      }
    } catch (err) {
      console.error('Dislike error:', err);
      toastError('Error', 'Failed to dislike comment');
    }
  };

  const handleReplySubmit = async () => {
    if (!address) {
      toastError('Wallet required', 'Connect your wallet to reply');
      return;
    }

    if (!replyText.trim()) {
      toastError('Empty reply', 'Please enter a reply');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          walletAddress: address,
          content: replyText,
          parentId: comment.id,
        }),
      });

      if (!res.ok) throw new Error('Failed to post reply');

      toastSuccess('Reply posted', 'Your reply has been posted successfully');
      setReplyText('');
      setShowReply(false);
      onReply(comment.id);
    } catch (err) {
      console.error('Reply error:', err);
      toastError('Error', 'Failed to post reply');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mb-4">
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
        {/* User info */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00D26A] to-[#3B82F6] flex items-center justify-center text-xs font-bold">
            {comment.user.username?.slice(0, 2).toUpperCase() || comment.user.walletAddress.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {comment.user.username || `${comment.user.walletAddress.slice(0, 6)}...${comment.user.walletAddress.slice(-4)}`}
            </p>
            <p className="text-[10px] text-[#7A7068]">{formatTimestamp(comment.createdAt)}</p>
          </div>
        </div>

        {/* Content */}
        <p className="text-[13px] text-[#E5E7EB] leading-relaxed mb-3">{comment.content}</p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs transition-colors ${
              userLiked ? 'text-[#00D26A]' : 'text-[#7A7068] hover:text-white'
            }`}
          >
            <ThumbsUp size={14} fill={userLiked ? 'currentColor' : 'none'} />
            {localLikes > 0 && <span>{localLikes}</span>}
          </button>

          <button
            onClick={handleDislike}
            className={`flex items-center gap-1 text-xs transition-colors ${
              userDisliked ? 'text-[#FF4560]' : 'text-[#7A7068] hover:text-white'
            }`}
          >
            <ThumbsDown size={14} fill={userDisliked ? 'currentColor' : 'none'} />
            {localDislikes > 0 && <span>{localDislikes}</span>}
          </button>

          <button
            onClick={() => setShowReply(!showReply)}
            className="flex items-center gap-1 text-xs text-[#7A7068] hover:text-white transition-colors"
          >
            <MessageCircle size={14} />
            Reply
          </button>
        </div>

        {/* Reply input */}
        {showReply && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#7A7068] focus:outline-none focus:ring-1 focus:ring-[#00D26A]"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isSubmitting) handleReplySubmit();
                }}
              />
              <button
                onClick={handleReplySubmit}
                disabled={isSubmitting || !replyText.trim()}
                className="bg-[#00D26A] text-black px-3 py-2 rounded-lg font-semibold text-sm hover:bg-[#00D26A]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-6 mt-2">
          {comment.replies.map((reply) => (
            <CommentThread key={reply.id} comment={reply} marketId={marketId} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentSection({ marketId }: CommentSectionProps) {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { success: toastSuccess, error: toastError } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?marketId=${marketId}`);
      const data = await res.json();
      
      if (data.success) {
        setComments(data.comments);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    if (marketId) {
      fetchComments();
    }
  }, [marketId, fetchComments]);

  const handleCommentSubmit = async () => {
    if (!address) {
      toastError('Wallet required', 'Connect your wallet to comment');
      return;
    }

    if (!commentText.trim()) {
      toastError('Empty comment', 'Please enter a comment');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          walletAddress: address,
          content: commentText,
        }),
      });

      if (!res.ok) throw new Error('Failed to post comment');

      toastSuccess('Comment posted', 'Your comment has been posted successfully');
      setCommentText('');
      fetchComments(); // Refresh comments
    } catch (err) {
      console.error('Comment error:', err);
      toastError('Error', 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-white/[0.06]">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <MessageCircle size={18} />
        Discussion ({comments.length})
      </h3>

      {/* Comment input */}
      <div className="mb-6">
        {!address ? (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 text-center flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/[0.05] flex items-center justify-center">
              <Wallet size={18} className="text-[#7A7068]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">Join the Discussion</p>
              <p className="text-xs text-[#7A7068]">Connect your wallet to share your thoughts and engage with other traders</p>
            </div>
            <button
              onClick={() => openConnectModal?.()}
              className="cursor-pointer bg-[#00D26A] text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-[#00B85E] transition-colors"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Share your thoughts..."
              className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[#7A7068] focus:outline-none focus:ring-1 focus:ring-[#00D26A]"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !isSubmitting) handleCommentSubmit();
              }}
            />
            <button
              onClick={handleCommentSubmit}
              disabled={isSubmitting || !commentText.trim()}
              className="cursor-pointer bg-[#00D26A] text-black px-4 py-3 rounded-lg font-semibold text-sm hover:bg-[#00D26A]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Send size={16} />
                  Post
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Comments list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-[#7A7068]" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[#7A7068] text-sm">No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div>
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              marketId={marketId}
              onReply={fetchComments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
