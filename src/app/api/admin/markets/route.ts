import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getAdminWallets(): string[] {
  const raw = process.env.ADMIN_WALLETS ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function isAuthorized(req: NextRequest): boolean {
  const address = req.headers.get('x-wallet-address') ?? '';
  if (!address) return false;
  return getAdminWallets().includes(address);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const markets = await prisma.marketCuration.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(markets);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, isActive } = body as { id?: string; isActive?: boolean };

  if (!id || typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'id and isActive are required' }, { status: 400 });
  }

  const updated = await prisma.marketCuration.update({
    where: { id },
    data: { isActive },
  });

  return NextResponse.json(updated);
}
