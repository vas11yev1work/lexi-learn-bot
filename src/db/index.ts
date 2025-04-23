import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function getOrCreateUser(telegramId: bigint): Promise<{ id: number }> {
  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { telegramId },
    });
  }

  return user;
}
