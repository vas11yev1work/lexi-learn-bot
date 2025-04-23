import type { BotContext } from '../types/index.js';
import { prisma, getOrCreateUser } from '../db/index.js';

// Функция для отображения статистики обучения
export async function showStatistics(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, начните заново.');
    return;
  }

  const user = await getOrCreateUser(BigInt(ctx.from.id), {
    name: ctx.from.first_name,
    lastname: ctx.from.last_name,
    username: ctx.from.username,
  });

  // Получаем общую статистику по всем модулям
  const totalCards = await prisma.card.count({
    where: {
      module: {
        userId: user.id,
      },
    },
  });

  const learningProgress = await prisma.progress.findMany({
    where: {
      userId: user.id,
    },
    select: {
      interval: true,
      repetitions: true,
      card: {
        select: {
          module: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const completedSessions = await prisma.session.count({
    where: {
      userId: user.id,
      completed: true,
    },
  });

  // Находим карточки, которые нужно повторить сегодня
  const today = new Date();
  const dueTodayCount = await prisma.progress.count({
    where: {
      userId: user.id,
      nextReview: { lte: today },
    },
  });

  // Группируем карточки по модулям
  const moduleStats: Record<string, { totalCards: number; learned: number; name: string }> = {};

  for (const progress of learningProgress) {
    const moduleId = progress.card.module.id.toString();

    if (!moduleStats[moduleId]) {
      moduleStats[moduleId] = {
        name: progress.card.module.name,
        totalCards: 0,
        learned: 0, // Карточки с интервалом >= 30 дней считаем выученными
      };
    }

    moduleStats[moduleId].totalCards++;

    if (progress.interval >= 30) {
      moduleStats[moduleId].learned++;
    }
  }

  // Формируем сообщение со статистикой
  let message = '📊 *Ваша статистика обучения:*\n\n';
  message += `Всего карточек: ${totalCards}\n`;
  message += `Пройдено занятий: ${completedSessions}\n`;
  message += `Нужно повторить сегодня: ${dueTodayCount}\n\n`;

  if (Object.keys(moduleStats).length > 0) {
    message += '*Прогресс по модулям:*\n';

    for (const [_module, stats] of Object.entries(moduleStats)) {
      const percent =
        stats.totalCards > 0 ? Math.round((stats.learned / stats.totalCards) * 100) : 0;
      message += `${stats.name}: ${percent}% (${stats.learned}/${stats.totalCards})\n`;
    }
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
  });
}
