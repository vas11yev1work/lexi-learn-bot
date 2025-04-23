import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../types/index.js';
import { prisma } from '../db/index.js';

export async function createCardConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const session = await conversation.external((ctx) => ctx.session);
  if (!session.sessionModuleId) {
    await ctx.reply(
      'Не удалось найти модуль. Пожалуйста, создайте модуль перед созданием карточки',
    );
    return;
  }

  const moduleId = session.sessionModuleId;

  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: { customFields: true },
  });

  if (!module) {
    await ctx.reply('Модуль не найден. Пожалуйста, выберите другой модуль');
    return;
  }

  await ctx.reply('Введите фразу для карточки:');
  const phraseResponse = await conversation.wait();

  if (!phraseResponse.message?.text) {
    await ctx.reply('Необходимо ввести текст. Пожалуйста, начните заново');
    return;
  }

  const phrase = phraseResponse.message.text;

  await ctx.reply(
    'Введите определение (перевод) для карточки. Вы можете ввести несколько вариантов через запятую, при решении задачи будет использоваться один из них:',
  );
  const defResponse = await conversation.wait();

  if (!defResponse.message?.text) {
    await ctx.reply('Необходимо ввести текст. Пожалуйста, начните заново');
    return;
  }

  const definition = defResponse.message.text;

  // Запрашиваем подсказку (опционально)
  await ctx.reply('Введите подсказку для карточки (или отправьте /skip если не нужна):');
  const hintResponse = await conversation.wait();

  if (!hintResponse.message?.text) {
    await ctx.reply('Необходимо ввести текст. Пожалуйста, начните заново');
    return;
  }

  const hint = hintResponse.message.text !== '/skip' ? hintResponse.message.text : null;

  const cardData: any = {
    phrase,
    definition,
    hint,
    moduleId,
    customValues: {
      create: [] as { customFieldId: number; value: string }[],
    },
  };

  if (module.customFields.length > 0) {
    const customValues = [];

    for (const field of module.customFields) {
      await ctx.reply(
        `Введите значение для поля "${field.name}" (или отправтьте /skip, чтобы не задавать значение):`,
      );
      const valueResponse = await conversation.wait();

      if (!valueResponse.message?.text || valueResponse.message.text === '/skip') {
        await ctx.reply('Продолжаем с пустым значением');
        customValues.push({
          customFieldId: field.id,
          value: '',
        });
        continue;
      }

      customValues.push({
        customFieldId: field.id,
        value: valueResponse.message.text,
      });
    }

    cardData.customValues.create = customValues;
  }

  try {
    await prisma.card.create({
      data: cardData,
    });

    await ctx.reply(`✅ Карточка "${phrase}" успешно создана!`);

    await ctx.reply('Хотите добавить еще одну карточку?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Да', callback_data: `add_card_${moduleId}` },
            { text: '❌ Нет', callback_data: `view_module_${moduleId}` },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Error creating card:', error);
    await ctx.reply('Произошла ошибка при создании карточки. Пожалуйста, попробуйте еще раз');
  }
}
