import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/comments/[id]/like - Like or dislike a comment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { action } = body; // 'like' or 'dislike'

    if (!action || !['like', 'dislike', 'unlike', 'undislike'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "like", "dislike", "unlike", or "undislike"' },
        { status: 400 }
      );
    }

    // Find the comment
    const comment = await prisma.comment.findUnique({
      where: { id },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Update likes or dislikes
    let updatedComment;
    if (action === 'like') {
      updatedComment = await prisma.comment.update({
        where: { id },
        data: { likes: comment.likes + 1 },
        include: {
          user: {
            select: {
              id: true,
              walletAddress: true,
              username: true,
            },
          },
        },
      });
    } else if (action === 'unlike') {
      updatedComment = await prisma.comment.update({
        where: { id },
        data: { likes: Math.max(0, comment.likes - 1) },
        include: {
          user: {
            select: {
              id: true,
              walletAddress: true,
              username: true,
            },
          },
        },
      });
    } else if (action === 'dislike') {
      updatedComment = await prisma.comment.update({
        where: { id },
        data: { dislikes: comment.dislikes + 1 },
        include: {
          user: {
            select: {
              id: true,
              walletAddress: true,
              username: true,
            },
          },
        },
      });
    } else if (action === 'undislike') {
      updatedComment = await prisma.comment.update({
        where: { id },
        data: { dislikes: Math.max(0, comment.dislikes - 1) },
        include: {
          user: {
            select: {
              id: true,
              walletAddress: true,
              username: true,
            },
          },
        },
      });
    }

    return NextResponse.json({ success: true, comment: updatedComment });
  } catch (error) {
    console.error('Error updating comment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}
