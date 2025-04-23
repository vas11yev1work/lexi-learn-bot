import { Bot, GrammyError, HttpError, session } from 'grammy';
import dotenv from 'dotenv';
import type { BotContext, SessionData } from '@/types/index.js';
import { conversations, createConversation } from '@grammyjs/conversations';
import { Menu } from '@grammyjs/menu';
import { getOrCreateUser, prisma } from '@/db/index.js';
import { createModuleConversation } from '@/conversations/createModuleConversation.js';
import * as moduleHandlers from '@/handlers/moduleHandlers.js';
import * as sessionHandlers from '@/handlers/sessionHandlers.js';
import * as statisticsHandlers from '@/handlers/statisticsHandlers.js';
import { createCardConversation } from '@/conversations/createCardConversation.js';
import { TaskFactory } from '@/tasks/taskFactory.js';
import { editCardConversation } from '@/conversations/editCardConversation.js';

dotenv.config();

if (!process.env.BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is not defined in .env file');
  process.exit(1);
}

const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

bot.use(
  session({
    initial: (): SessionData => ({
      action: null,
      sessionModuleId: null,
      cardId: null,
      currentSession: null,
      currentQuestionIndex: 0,
      customFields: [],
      tempData: {},
    }),
  }),
);

bot.use(conversations());
bot.use(createConversation<BotContext, BotContext>(createModuleConversation));
bot.use(createConversation<BotContext, BotContext>(createCardConversation));
bot.use(createConversation<BotContext, BotContext>(editCardConversation));

const mainMenu = new Menu<BotContext>('main_menu')
  .text('📚 Мои модули', async (ctx) => {
    await moduleHandlers.listModules(ctx);
  })
  .text('📝 Создать модуль', async (ctx) => {
    await ctx.conversation.enter('createModuleConversation');
  })
  .row()
  .text('🎯 Начать занятие', async (ctx) => {
    await sessionHandlers.selectModuleForSession(ctx);
  })
  .text('📊 Статистика', async (ctx) => {
    await statisticsHandlers.showStatistics(ctx);
  });

bot.use(mainMenu);

bot.command('start', async (ctx) => {
  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, попробуйте еще раз');
    return;
  }

  await getOrCreateUser(BigInt(ctx.from.id));

  await ctx.reply(
    '👋 Добро пожаловать в бота для изучения иностранных слов!\n\n' +
      'Здесь вы можете создавать модули с карточками для изучения и тренировки новых слов и фраз',
    { reply_markup: mainMenu },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '🔍 *Как пользоваться ботом:*\n\n' +
      '1️⃣ Создайте модуль, указав название, описание и кастомные поля\n' +
      '2️⃣ Добавьте карточки в модуль\n' +
      '3️⃣ Начните занятие для тренировки\n\n' +
      'Бот использует алгоритм SuperMemo SM\\-2 для эффективного обучения с интервальными повторениями',
    { parse_mode: 'MarkdownV2' },
  );
});

bot.callbackQuery('back_to_main', async (ctx) => {
  await ctx.reply('Главное меню:', { reply_markup: mainMenu });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('create_module', async (ctx) => {
  await ctx.conversation.enter('createModuleConversation');
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('back_to_modules', async (ctx) => {
  await moduleHandlers.listModules(ctx);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/view_module_(\d+)/, async (ctx) => {
  const moduleId = parseInt(ctx.match[1]);
  await moduleHandlers.viewModuleCards(ctx, moduleId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/add_card_(\d+)/, async (ctx) => {
  ctx.session.sessionModuleId = parseInt(ctx.match[1]);
  await ctx.conversation.enter('createCardConversation');
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/view_cards_(\d+)_(\d+)/, async (ctx) => {
  const moduleId = parseInt(ctx.match[1]);
  const page = parseInt(ctx.match[2]);
  await moduleHandlers.viewAllCards(ctx, moduleId, page);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/start_session_(\d+)/, async (ctx) => {
  const moduleId = parseInt(ctx.match[1]);
  await sessionHandlers.startSession(ctx, moduleId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/difficulty_(\d+)_(\d+)/, async (ctx) => {
  try {
    const questionId = ctx.match[1];
    const difficultyValue = ctx.match[2];

    const question = await prisma.question.findUnique({
      where: { id: parseInt(questionId) },
    });

    if (!question) {
      await ctx.reply('Произошла ошибка при обработке ответа');
      return;
    }

    await sessionHandlers.handleDifficulty(
      ctx,
      parseInt(questionId),
      question.cardId,
      parseInt(difficultyValue),
    );
  } catch (error) {
    console.error('Error processing difficulty:', error);
    await ctx.reply('Произошла ошибка при обработке оценки сложности');
  } finally {
    await ctx.answerCallbackQuery();
  }
});

bot.callbackQuery(/idk_(\d+)/, async (ctx) => {
  const questionId = parseInt(ctx.match[1]);
  await sessionHandlers.updateProgressForIDK(ctx, questionId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/manage_cards_(\d+)/, async (ctx) => {
  const moduleId = parseInt(ctx.match[1]);
  await moduleHandlers.manageModuleCards(ctx, moduleId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/view_card_(\d+)/, async (ctx) => {
  const cardId = parseInt(ctx.match[1]);
  await moduleHandlers.viewCard(ctx, cardId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/delete_card_(\d+)/, async (ctx) => {
  const cardId = parseInt(ctx.match[1]);
  await moduleHandlers.deleteCard(ctx, cardId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/confirm_card_delete_(\d+)/, async (ctx) => {
  const cardId = parseInt(ctx.match[1]);

  try {
    // Получаем moduleId перед удалением карточки
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: { moduleId: true },
    });

    if (!card) {
      await ctx.reply('Карточка не найдена.');
      return;
    }

    const moduleId = card.moduleId;

    // Удаляем карточку
    await prisma.card.delete({
      where: { id: cardId },
    });

    await ctx.reply('✅ Карточка успешно удалена!');

    // Возвращаемся к управлению карточками
    await moduleHandlers.manageModuleCards(ctx, moduleId);
  } catch (error) {
    console.error('Error deleting card:', error);
    await ctx.reply('Произошла ошибка при удалении карточки. Пожалуйста, попробуйте еще раз.');
  } finally {
    await ctx.answerCallbackQuery();
  }
});

bot.callbackQuery(/delete_module_(\d+)/, async (ctx) => {
  const moduleId = parseInt(ctx.match[1]);
  await moduleHandlers.deleteModule(ctx, moduleId);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/confirm_module_delete_(\d+)/, async (ctx) => {
  const moduleId = parseInt(ctx.match[1]);

  try {
    await prisma.module.delete({
      where: { id: moduleId },
    });

    await ctx.reply('✅ Модуль успешно удален!');
    await ctx.answerCallbackQuery();
    await moduleHandlers.listModules(ctx);
  } catch (error) {
    console.error('Error deleting module:', error);
    await ctx.reply('Произошла ошибка при удалении модуля.');
  } finally {
    await ctx.answerCallbackQuery();
  }
});

bot.callbackQuery(/edit_card_(\d+)/, async (ctx) => {
  ctx.session.cardId = parseInt(ctx.match[1]);
  await ctx.conversation.enter('editCardConversation');
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/choice_(\d+)_(\d+|fake)/, async (ctx) => {
  const [_, questionId, cardIdOrFake] = ctx.match;

  const questionIdParsed = parseInt(questionId);
  const cardIdOrFakeParsed = cardIdOrFake === 'fake' ? 'fake' : parseInt(cardIdOrFake);

  await sessionHandlers.processChoiceAnswer(ctx, questionIdParsed, cardIdOrFakeParsed);
  await ctx.answerCallbackQuery();
});

bot.on('message:text', async (ctx) => {
  // Если пользователь отвечает на вопрос с определением
  if (ctx.session.action === 'answer_definition') {
    ctx.session.action = null;
    if (ctx.message.text) {
      await sessionHandlers.processDefinitionAnswer(ctx, ctx.message.text);
    }
    return;
  }

  // В других случаях показываем главное меню
  await ctx.reply('Используйте меню для навигации', { reply_markup: mainMenu });
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  console.error(err.error);

  if (err.error instanceof GrammyError) {
    console.error('Error in request:', err.error.description);
    if (ctx) {
      ctx.reply(`Ошибка API Telegram: ${err.error.description}`).catch(() => {});
    }
  } else if (err.error instanceof HttpError) {
    console.error('HTTP error:', err.error);
    if (ctx) {
      ctx
        .reply('Ошибка соединения с серверами Telegram. Пожалуйста, попробуйте позже')
        .catch(() => {});
    }
  } else {
    console.error('Unknown error:', err.error);
    if (ctx) {
      ctx
        .reply(
          'Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже или начните сначала с команды /start',
        )
        .catch(() => {});
    }
  }
});

async function shutdown() {
  console.log('Завершение работы...');

  // Отключаемся от базы данных
  await prisma.$disconnect();

  // Останавливаем бота
  await bot.stop();

  console.log('Бот остановлен');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

TaskFactory.initialize();

bot.start();
