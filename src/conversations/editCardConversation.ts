import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '@/types/index.js';
import { prisma } from '@/db/index.js';
import * as moduleHandlers from '@/handlers/moduleHandlers.js';

export async function editCardConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const session = await conversation.external((ctx) => ctx.session);

  if (!session.cardId) {
    await ctx.reply('Не выбрана карточка. Пожалуйста, сначала выберите карточку');
    return;
  }

  const cardId = session.cardId;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      customValues: {
        include: {
          customField: true,
        },
      },
      module: {
        include: {
          customFields: true,
        },
      },
    },
  });

  if (!card) {
    await ctx.reply('Карточка не найдена. Пожалуйста, выберите другую карточку');
    return;
  }

  // Запрашиваем новую фразу
  await ctx.reply(
    `Текущая фраза: ${card.phrase}\nВведите новую фразу или отправьте /skip, чтобы оставить текущее значение:`,
  );
  const phraseResponse = await conversation.wait();

  if (!phraseResponse.message?.text) {
    await ctx.reply('Необходимо ввести текст. Пожалуйста, начните заново');
    return;
  }

  const phrase =
    phraseResponse.message.text !== '/skip' ? phraseResponse.message.text : card.phrase;

  await ctx.reply(
    `Текущее определение: ${card.definition}\nВведите новое определение или отправьте /skip, чтобы оставить текущее значение:`,
  );
  const defResponse = await conversation.wait();

  if (!defResponse.message?.text) {
    await ctx.reply('Необходимо ввести текст. Пожалуйста, начните заново.');
    return;
  }

  const definition =
    defResponse.message.text !== '/skip' ? defResponse.message.text : card.definition;

  const currentHint = card.hint || '–';

  await ctx.reply(
    `Текущая подсказка: ${currentHint}\nВведите новую подсказку. Отправьте /skip, чтобы оставить текущее значение${card.hint ? ' или /remove чтобы удалить подсказку' : ''}:`,
  );
  const hintResponse = await conversation.wait();

  if (!hintResponse.message?.text) {
    await ctx.reply('Необходимо ввести текст. Пожалуйста, начните заново.');
    return;
  }

  let hint = card.hint;
  if (hintResponse.message.text === '/remove') {
    hint = null;
  } else if (hintResponse.message.text !== '/skip') {
    hint = hintResponse.message.text;
  }

  const updateData = {
    phrase,
    definition,
    hint,
  };

  try {
    for (const field of card.module.customFields) {
      const existingValue = card.customValues.find((cv) => cv.customFieldId === field.id);
      const currentValue = existingValue ? existingValue.value : '–';

      await ctx.reply(
        `Поле "${field.name}": ${currentValue}\nВведите новое значение. Отправьте /skip, чтобы оставить текущее значение${existingValue ? ' или /remove чтобы удалить значение' : ''}:`,
      );
      const valueResponse = await conversation.wait();

      if (!valueResponse.message?.text) {
        await ctx.reply('Необходимо ввести текст. Пропускаем это поле.');
        continue;
      }

      if (valueResponse.message.text !== '/skip') {
        if (existingValue) {
          if (valueResponse.message.text === '/remove') {
            await prisma.customFieldValue.delete({
              where: { id: existingValue.id },
            });
          } else {
            await prisma.customFieldValue.update({
              where: { id: existingValue.id },
              data: { value: valueResponse.message.text },
            });
          }
        } else {
          await prisma.customFieldValue.create({
            data: {
              value: valueResponse.message.text,
              cardId: card.id,
              customFieldId: field.id,
            },
          });
        }
      }
    }

    await prisma.card.update({
      where: { id: cardId },
      data: updateData,
    });

    await ctx.reply(`✅ Карточка успешно обновлена!`);
    await moduleHandlers.manageModuleCards(ctx, card.moduleId);
  } catch {
    await ctx.reply('Произошла ошибка при обновлении карточки. Пожалуйста, попробуйте еще раз');
  }
}
