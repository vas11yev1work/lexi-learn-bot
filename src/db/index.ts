import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function getOrCreateUser(
  telegramId: bigint,
  info?: { name?: string; lastname?: string; username?: string },
): Promise<{ id: number }> {
  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { telegramId },
    });
  }

  if (
    info &&
    (info.name || info.lastname || info.username) &&
    (user.name !== info.name || user.lastname !== info.lastname || user.username !== info.username)
  ) {
    console.log(`Updating user ${user.id} with new info:`, info);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: info.name,
        lastname: info.lastname,
        username: info.username,
      },
    });
  }

  return user;
}
