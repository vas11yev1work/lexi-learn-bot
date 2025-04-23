import type { BotContext } from '../types/index.js';
import { getOrCreateUser, prisma } from '../db/index.js';
import { TaskFactory } from '../tasks/taskFactory.js';
import { SM2 } from '../utils/sm2.js';
import { declensionByNumber } from '../utils/declensionByNumber.js';

export async function selectModuleForSession(ctx: BotContext) {
  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, начните заново');
    return;
  }

  const user = await getOrCreateUser(BigInt(ctx.from.id));

  const modules = await prisma.module.findMany({
    where: {
      userId: user.id,
      cards: {
        some: {}, // Модули, где есть хотя бы одна карточка
      },
    },
    include: {
      _count: {
        select: { cards: true },
      },
    },
  });

  if (modules.length === 0) {
    await ctx.reply('У вас нет модулей с карточками для начала занятия');
    return;
  }

  await ctx.reply('Выберите модуль для занятия:', {
    reply_markup: {
      inline_keyboard: [
        ...modules.map((module) => [
          {
            text: `${module.name} (${module._count.cards} карточек)`,
            callback_data: `start_session_${module.id}`,
          },
        ]),
        [{ text: '◀️ Назад', callback_data: 'back_to_main' }],
      ],
    },
  });
}

export async function startSession(ctx: BotContext, moduleId: number) {
  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, начните заново');
    return;
  }

  const user = await getOrCreateUser(BigInt(ctx.from.id));

  // Проверяем наличие карточек в модуле
  const cardsCount = await prisma.card.count({
    where: { moduleId },
  });

  if (cardsCount === 0) {
    await ctx.reply('В этом модуле пока нет карточек. Добавьте карточки, чтобы начать занятие');
    return;
  }

  const today = new Date();
  const cardsForReview = await prisma.progress.findMany({
    where: {
      userId: user.id,
      card: { moduleId },
      nextReview: { lte: today },
    },
    select: {
      cardId: true,
    },
  });

  // Если карточек для повторения нет или их меньше 20, добавляем новые
  let cardIds = cardsForReview.map((p) => p.cardId);

  if (cardIds.length < 20) {
    const newCards = await prisma.card.findMany({
      where: {
        moduleId,
        id: { notIn: cardIds.length > 0 ? cardIds : [-1] },
      },
      take: 20 - cardIds.length,
      select: { id: true },
    });

    cardIds = [...cardIds, ...newCards.map((c) => c.id)];
  }

  cardIds = cardIds.slice(0, 20);
  cardIds.sort(() => Math.random() - 0.5);

  const taskTypes = TaskFactory.getAllTaskTypes();

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      moduleId,
      questions: {
        create: cardIds.map((cardId, index) => ({
          cardId,
          // Случайно выбираем тип задания из всех доступных
          type: taskTypes[index % taskTypes.length],
        })),
      },
    },
    include: { questions: true },
  });

  ctx.session.currentSession = session.id;
  ctx.session.currentQuestionIndex = 0;

  await askNextQuestion(ctx);
}

export async function askNextQuestion(ctx: BotContext): Promise<void> {
  if (!ctx.session.currentSession) {
    await ctx.reply('Активное занятие не найдено. Пожалуйста, начните новое занятие');
    return;
  }

  // Получаем сессию и текущий вопрос
  const session = await prisma.session.findUnique({
    where: { id: ctx.session.currentSession },
    include: {
      questions: true,
    },
  });

  if (!session || ctx.session.currentQuestionIndex >= session.questions.length) {
    // Завершаем сессию
    if (session) {
      await prisma.session.update({
        where: { id: ctx.session.currentSession },
        data: {
          completed: true,
          endedAt: new Date(),
        },
      });
    }

    await ctx.reply('🎉 Занятие завершено! 🎉', {
      reply_markup: {
        inline_keyboard: [[{ text: '◀️ Вернуться в главное меню', callback_data: 'back_to_main' }]],
      },
    });

    return;
  }

  const question = session.questions[ctx.session.currentQuestionIndex];
  ctx.session.tempData.currentQuestion = question;

  const card = await prisma.card.findUnique({
    where: { id: question.cardId },
    include: {
      customValues: {
        include: {
          customField: true,
        },
      },
    },
  });

  if (!card) {
    await ctx.reply('Карточка не найдена. Пропускаем вопрос');
    ctx.session.currentQuestionIndex++;
    await askNextQuestion(ctx);
    return;
  }

  // Получаем задание по типу
  const task = TaskFactory.getTask(question.type);

  if (!task) {
    await ctx.reply(`Неизвестный тип задания: ${question.type}. Пропускаем вопрос`);
    ctx.session.currentQuestionIndex++;
    await askNextQuestion(ctx);
    return;
  }

  // Генерируем вопрос с помощью соответствующего типа задания
  await task.generateQuestion(ctx, card);
}

export async function processChoiceAnswer(
  ctx: BotContext,
  questionId: number,
  cardIdOrFake: number | 'fake',
) {
  try {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        card: true,
      },
    });

    if (!question) {
      await ctx.reply('Произошла ошибка при обработке ответа');
      return;
    }

    const task = TaskFactory.getTask(question.type);

    if (!task) {
      await ctx.reply('Произошла ошибка при обработке ответа');
      return;
    }

    const correct = await task.checkAnswer(ctx, questionId, cardIdOrFake);

    await prisma.question.update({
      where: { id: questionId },
      data: {
        answered: true,
        correct,
      },
    });

    const progress = await prisma.progress.findFirst({
      where: {
        cardId: question.cardId,
      },
    });

    let replyMessage;

    if (correct) {
      replyMessage = '✅ Правильно!';
      // Если прогресса нет или время следующего повторения меньше текущей даты, показываем кнопки для оценки сложности
      if (!progress || progress.nextReview < new Date()) {
        await ctx.reply(replyMessage + '\n\nНасколько легко было вспомнить ответ?', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '😓 Очень сложно', callback_data: `difficulty_${questionId}_0` },
                { text: '😟 Сложно', callback_data: `difficulty_${questionId}_1` },
              ],
              [
                { text: '😐 Средне', callback_data: `difficulty_${questionId}_2` },
                { text: '🙂 Легко', callback_data: `difficulty_${questionId}_3` },
              ],
              [
                { text: '😊 Очень легко', callback_data: `difficulty_${questionId}_4` },
                { text: '😁 Элементарно', callback_data: `difficulty_${questionId}_5` },
              ],
            ],
          },
        });
      } else {
        await ctx.reply(replyMessage);
        ctx.session.currentQuestionIndex++;
        await askNextQuestion(ctx);
      }
    } else {
      replyMessage = '❌ Неверно';
      await ctx.reply(replyMessage);
      await task.showCorrectAnswer(ctx, questionId);
      await updateProgressForWrongAnswer(ctx, question);
    }
  } catch {
    await ctx.reply('Произошла ошибка при обработке ответа');
  }
}

export async function processDefinitionAnswer(ctx: BotContext, text: string): Promise<void> {
  const questionId = ctx.session.tempData.currentQuestionId;
  const cardId = ctx.session.tempData.currentCardId;

  try {
    if (!questionId || !cardId) {
      await ctx.reply('Произошла ошибка. Пожалуйста, начните занятие заново');
      return;
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { card: true },
    });

    if (!question) {
      await ctx.reply('Вопрос не найден. Пожалуйста, начните занятие заново');
      return;
    }

    const task = TaskFactory.getTask(question.type);

    if (!task) {
      await ctx.reply('Произошла ошибка при обработке ответа');
      return;
    }

    const correct = await task.checkAnswer(ctx, questionId, text);

    await prisma.question.update({
      where: { id: questionId },
      data: {
        answered: true,
        correct,
      },
    });

    const progress = await prisma.progress.findFirst({
      where: {
        cardId: question.cardId,
      },
    });

    let replyMessage;

    if (correct) {
      replyMessage = '✅ Правильно!';
      // Если прогресса нет или время следующего повторения меньше текущей даты, показываем кнопки для оценки сложности
      if (!progress || progress.nextReview < new Date()) {
        await ctx.reply(replyMessage + '\n\nНасколько легко было вспомнить ответ?', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '😓 Очень сложно', callback_data: `difficulty_${questionId}_0` },
                { text: '😟 Сложно', callback_data: `difficulty_${questionId}_1` },
              ],
              [
                { text: '😐 Средне', callback_data: `difficulty_${questionId}_2` },
                { text: '🙂 Легко', callback_data: `difficulty_${questionId}_3` },
              ],
              [
                { text: '😊 Очень легко', callback_data: `difficulty_${questionId}_4` },
                { text: '😁 Элементарно', callback_data: `difficulty_${questionId}_5` },
              ],
            ],
          },
        });
      } else {
        await ctx.reply(replyMessage);
        ctx.session.currentQuestionIndex++;
        await askNextQuestion(ctx);
      }
    } else {
      replyMessage = '❌ Неверно';
      await ctx.reply(replyMessage);
      await task.showCorrectAnswer(ctx, questionId);
      await updateProgressForWrongAnswer(ctx, question);
    }
  } catch {
    await ctx.reply('Произошла ошибка при обработке ответа');
  }
}

export async function updateProgressForIDK(ctx: BotContext, questionId: number) {
  if (!ctx.from) return;

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) {
    await ctx.reply('Вопрос не найден. Пожалуйста, начните занятие заново');
    return;
  }

  const task = TaskFactory.getTask(question.type);

  if (!task) {
    await ctx.reply('Произошла ошибка при обработке ответа');
    return;
  }

  await task.showCorrectAnswer(ctx, questionId);

  await updateProgressForWrongAnswer(ctx, question);
}

async function updateProgressForWrongAnswer(ctx: BotContext, question: any): Promise<void> {
  if (!ctx.from) return;

  const user = await getOrCreateUser(BigInt(ctx.from.id));

  // Получаем или создаём запись прогресса
  let progress = await prisma.progress.findFirst({
    where: {
      userId: user.id,
      cardId: question.cardId,
    },
  });

  if (!progress) {
    progress = await prisma.progress.create({
      data: {
        userId: user.id,
        cardId: question.cardId,
        easeFactor: 2.1,
        interval: 0,
        repetitions: 0,
      },
    });
  }

  // Для неправильных ответов всегда сбрасываем интервал
  // но сохраняем фактор легкости
  const nextReviewDate = new Date(); // Сегодня

  await prisma.progress.update({
    where: { id: progress.id },
    data: {
      repetitions: 0,
      interval: 1,
      nextReview: nextReviewDate,
      lastReviewed: new Date(),
    },
  });

  // Показываем информацию о следующем повторении
  await ctx.reply('📅 Карточка будет повторена завтра');

  // Переходим к следующему вопросу
  ctx.session.currentQuestionIndex++;
  await askNextQuestion(ctx);
}

export async function handleDifficulty(
  ctx: BotContext,
  questionId: number,
  cardId: number,
  difficulty: number,
) {
  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, начните заново');
    return;
  }

  const user = await getOrCreateUser(BigInt(ctx.from.id));

  // Получаем вопрос
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) {
    await ctx.reply('Произошла ошибка при обработке ответа');
    return;
  }

  await prisma.question.update({
    where: { id: questionId },
    data: { difficulty },
  });

  let progress = await prisma.progress.findFirst({
    where: {
      userId: user.id,
      cardId: question.cardId,
    },
  });

  if (!progress) {
    // Создаем новую запись прогресса
    progress = await prisma.progress.create({
      data: {
        userId: user.id,
        cardId: question.cardId,
        easeFactor: 2.1,
        interval: 0,
        repetitions: 0,
      },
    });
  }

  const result = SM2.calculateNextInterval(
    progress.repetitions,
    progress.easeFactor,
    difficulty,
    progress.interval,
  );

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + result.interval);

  await prisma.progress.update({
    where: { id: progress.id },
    data: {
      repetitions: result.repetitions,
      easeFactor: result.easeFactor,
      interval: result.interval,
      nextReview: nextReviewDate,
      lastReviewed: new Date(),
    },
  });

  await ctx.reply(
    `📅 Следующее повторение через: ${result.interval} ${declensionByNumber(result.interval, ['день', 'дня', 'дней'])}`,
  );
  ctx.session.currentQuestionIndex++;
  await askNextQuestion(ctx);
}
