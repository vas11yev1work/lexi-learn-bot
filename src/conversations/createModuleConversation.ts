import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../types/index.js';
import { getOrCreateUser, prisma } from '../db/index.js';

export async function createModuleConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await ctx.reply(
    'Вы начали создание нового модуля. Если вы хотите отменить действие, отправьте команду /cancel',
  );

  await ctx.reply('Введите название модуля:');
  const nameResponse = await conversation.wait();

  if (!nameResponse.message?.text) {
    await ctx.reply('Не удалось получить название модуля. Пожалуйста, попробуйте еще раз');
    return;
  }

  if (nameResponse.message.text === '/cancel') {
    await ctx.reply('Создание модуля отменено');
    return;
  }

  const moduleName = nameResponse.message.text;

  await ctx.reply('Введите описание модуля:');
  const descriptionResponse = await conversation.wait();

  if (!descriptionResponse.message?.text) {
    await ctx.reply('Не удалось получить описание модуля. Пожалуйста, попробуйте еще раз');
    return;
  }

  if (descriptionResponse.message.text === '/cancel') {
    await ctx.reply('Создание модуля отменено');
    return;
  }

  const moduleDescription = descriptionResponse.message.text;

  await ctx.reply(
    `Введите кастомные поля через запятую (например: Транскрипция, Группа) или отправьте /skip если они не нужны:`,
  );

  const fieldsResponse = await conversation.wait();

  if (!fieldsResponse.message?.text) {
    await ctx.reply('Не удалось получить кастомные поля. Пожалуйста, попробуйте еще раз');
    return;
  }

  if (fieldsResponse.message.text === '/cancel') {
    await ctx.reply('Создание модуля отменено');
    return;
  }

  const fieldsText = fieldsResponse.message.text;

  let customFields: string[] = [];
  if (fieldsText !== '/skip') {
    customFields = fieldsText
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field);
  }

  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, начните заново');
    return;
  }

  const user = await getOrCreateUser(BigInt(ctx.from.id));

  try {
    const module = await prisma.module.create({
      data: {
        name: moduleName,
        description: moduleDescription,
        userId: user.id,
        customFields: {
          create: customFields.map((field) => ({
            name: field,
          })),
        },
      },
    });

    await ctx.reply(`✅ Модуль "${moduleName}" успешно создан!`, {
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть модуль', callback_data: `view_module_${module.id}` }]],
      },
    });
  } catch (error) {
    console.error('Error creating module:', error);
    await ctx.reply('Произошла ошибка при создании модуля. Пожалуйста, попробуйте еще раз');
  }
}
