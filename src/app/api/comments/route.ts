import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/comments?marketId=xxx - Fetch all comments for a market
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');

    if (!marketId) {
      return NextResponse.json(
        { success: false, error: 'marketId is required' },
        { status: 400 }
      );
    }

    // Fetch all comments for this market with nested replies
    const comments = await prisma.comment.findMany({
      where: {
        marketId,
        parentId: null, // Only get top-level comments
      },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            username: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                username: true,
              },
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    walletAddress: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/comments - Create a new comment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketId, walletAddress, content, parentId } = body;

    // Validation
    if (!marketId || !walletAddress || !content) {
      return NextResponse.json(
        { success: false, error: 'marketId, walletAddress, and content are required' },
        { status: 400 }
      );
    }

    if (content.trim().length < 1) {
      return NextResponse.json(
        { success: false, error: 'Comment cannot be empty' },
        { status: 400 }
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { success: false, error: 'Comment is too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // Find or create user by wallet address
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress,
          username: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        },
      });
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        marketId,
        userId: user.id,
        content,
        parentId: parentId || null,
      },
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

    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
