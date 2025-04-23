import type { BotContext } from '../types/index.js';
import { getOrCreateUser, prisma } from '../db/index.js';
import { declensionByNumber } from '../utils/declensionByNumber.js';

export async function listModules(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('Не удалось определить пользователя. Пожалуйста, начните заново');
    return;
  }

  const user = await getOrCreateUser(BigInt(ctx.from.id));

  const modules = await prisma.module.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { cards: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (modules.length === 0) {
    await ctx.reply('У вас пока нет созданных модулей. Создайте свой первый модуль!', {
      reply_markup: {
        inline_keyboard: [[{ text: '📝 Создать модуль', callback_data: 'create_module' }]],
      },
    });
    return;
  }

  let message = '📚 *Ваши модули:*\n\n';

  for (const module of modules) {
    message += `*${module.name}* (${module._count.cards} ${declensionByNumber(module._count.cards, ['карточка', 'карточки', 'карточек'])})\n${module.description}\n\n`;
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        ...modules.map((module) => [
          {
            text: `${module.name}`,
            callback_data: `view_module_${module.id}`,
          },
        ]),
        [{ text: '◀️ Вернуться в главное меню', callback_data: 'back_to_main' }],
      ],
    },
  });
}

export async function viewModuleCards(ctx: BotContext, moduleId: number): Promise<void> {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      cards: {
        include: {
          customValues: {
            include: {
              customField: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      customFields: true,
    },
  });

  if (!module) {
    await ctx.reply('Модуль не найден');
    return;
  }

  // Экранирование специальных символов Markdown
  const escapedName = module.name.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  const escapedDescription = module.description.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

  let message = `📚 *${escapedName}*\n${escapedDescription}\n\n`;

  if (module.cards.length === 0) {
    message += 'В этом модуле пока нет карточек';
  } else {
    message += `В этом модуле *${module.cards.length} ${declensionByNumber(module.cards.length, ['карточка', 'карточки', 'карточек'])}*`;
  }

  await ctx.reply(message, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Добавить карточку', callback_data: `add_card_${moduleId}` }],
        module.cards.length > 0
          ? [
              { text: '🔄 Управление карточками', callback_data: `manage_cards_${moduleId}` },
              { text: '🗃️ Посмотреть карточки', callback_data: `view_cards_${moduleId}_0` },
            ]
          : [],
        module.cards.length > 0
          ? [
              { text: '🎲 Начать занятие', callback_data: `start_session_${moduleId}` },
              { text: '🗑️ Удалить модуль', callback_data: `delete_module_${moduleId}` },
            ]
          : [{ text: '🗑️ Удалить модуль', callback_data: `delete_module_${moduleId}` }],
        [{ text: '◀️ Назад к модулям', callback_data: 'back_to_modules' }],
      ].filter((row) => row.length > 0),
    },
  });
}

export async function viewAllCards(ctx: BotContext, moduleId: number, page: number = 0) {
  const pageSize = 5;

  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      cards: {
        include: {
          customValues: {
            include: {
              customField: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize + 1, // Берём на 1 больше, чтобы проверить наличие следующей страницы
      },
    },
  });

  if (!module || module.cards.length === 0) {
    await ctx.reply('В модуле нет карточек');
    return;
  }

  const hasNextPage = module.cards.length > pageSize;
  const cardsToShow = hasNextPage ? module.cards.slice(0, pageSize) : module.cards;

  let message = `📚 <b>Карточки модуля "${module.name}"</b> ${hasNextPage ? `(страница ${page + 1})` : ''}\n\n`;

  for (const card of cardsToShow) {
    message += `<b>${card.phrase}</b> – ${card.definition}\n`;
    message += `Подсказка: ${card.hint || '–'}\n`;
    if (card.customValues.length > 0) {
      for (const customValue of card.customValues) {
        message += `<i>${customValue.customField.name}: ${customValue.value || '–'}</i>\n`;
      }
    }
    message += `\n`;
  }

  // Создаём кнопки навигации
  const keyboard = [];

  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: '⬅️ Назад', callback_data: `view_cards_${moduleId}_${page - 1}` });
  }
  if (hasNextPage) {
    navButtons.push({ text: 'Вперёд ➡️', callback_data: `view_cards_${moduleId}_${page + 1}` });
  }

  if (navButtons.length > 0) {
    keyboard.push(navButtons);
  }

  keyboard.push([{ text: '◀️ К модулю', callback_data: `view_module_${moduleId}` }]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function deleteModule(ctx: BotContext, moduleId: number): Promise<void> {
  await ctx.reply(
    'Вы уверены, что хотите удалить этот модуль? Все карточки внутри него также будут удалены',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Да, удалить', callback_data: `confirm_module_delete_${moduleId}` },
            { text: '❌ Нет, отмена', callback_data: `view_module_${moduleId}` },
          ],
        ],
      },
    },
  );
}

export async function manageModuleCards(ctx: BotContext, moduleId: number): Promise<void> {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      cards: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!module || module.cards.length === 0) {
    await ctx.reply('В модуле нет карточек', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀️ Назад к модулю', callback_data: `view_module_${moduleId}` }],
        ],
      },
    });
    return;
  }

  // Экранирование специальных символов Markdown
  const escapedName = module.name.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

  let message = `🔄 *Управление карточками модуля "${escapedName}"*\n\nВыберите карточку для редактирования или удаления:`;

  const keyboard = [];
  let row = [];

  // Перебираем все карточки
  for (let i = 0; i < module.cards.length; i++) {
    const card = module.cards[i];

    // Добавляем кнопку в текущий ряд
    row.push({ text: card.phrase, callback_data: `view_card_${card.id}` });

    // Если в ряду уже 2 кнопки или это последняя карточка, добавляем ряд в клавиатуру
    if (row.length === 2 || i === module.cards.length - 1) {
      keyboard.push([...row]); // Создаем копию массива
      row = []; // Очищаем ряд для следующих кнопок
    }
  }

  keyboard.push([{ text: '◀️ Назад к модулю', callback_data: `view_module_${moduleId}` }]);

  await ctx.reply(message, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

// Функция для просмотра отдельной карточки с возможностью редактирования и удаления
export async function viewCard(ctx: BotContext, cardId: number): Promise<void> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      customValues: {
        include: {
          customField: true,
        },
      },
      module: true,
    },
  });

  if (!card) {
    await ctx.reply('Карточка не найдена');
    return;
  }

  // Экранирование специальных символов Markdown
  const escapedPhrase = card.phrase.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  const escapedDefinition = card.definition.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

  let message = `🔍 *Карточка "${escapedPhrase}"*\n\n`;
  message += `*Фраза:* ${escapedPhrase}\n`;
  message += `*Определение:* ${escapedDefinition}\n`;

  const escapedHint = card.hint?.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  message += `*Подсказка:* ${escapedHint ?? '–'}\n`;

  if (card.customValues.length > 0) {
    message += '\n*Дополнительные поля:*\n';
    for (const cv of card.customValues) {
      const escapedFieldName = cv.customField.name.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
      const escapedValue = cv.value.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
      message += `_${escapedFieldName}: ${escapedValue || '–'}_\n`;
    }
  }

  await ctx.reply(message, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ Редактировать', callback_data: `edit_card_${card.id}` },
          { text: '🗑️ Удалить', callback_data: `delete_card_${card.id}` },
        ],
        [{ text: '◀️ Назад к списку карточек', callback_data: `manage_cards_${card.module.id}` }],
      ],
    },
  });
}

export async function deleteCard(ctx: BotContext, cardId: number): Promise<void> {
  await ctx.reply('Вы уверены, что хотите удалить эту карточку?', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Да, удалить', callback_data: `confirm_card_delete_${cardId}` },
          { text: '❌ Нет, отмена', callback_data: `view_card_${cardId}` },
        ],
      ],
    },
  });
}
