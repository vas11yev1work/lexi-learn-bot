import type { QuestionTask } from '../types/question.js';
import type { BotContext } from '../types/index.js';
import { prisma } from '../db/index.js';
import _ from 'lodash';

export class ChoiceTask implements QuestionTask {
  type = 'choice';

  async generateQuestion(ctx: BotContext, card: any): Promise<void> {
    // Код для отображения вопроса на выбор варианта
    // Экранирование специальных символов Markdown
    const escapedPhrase = card.phrase.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

    // Формируем сообщение для вопроса
    let message = `*${escapedPhrase}*\n\n`;

    // Добавляем подсказку через спойлер, если она есть
    if (card.hint) {
      message += `Подсказка: ||${card.hint}||\n\n`;
    }

    // Получаем случайные варианты
    const otherCards = await prisma.card.findMany({
      where: {
        moduleId: card.moduleId,
        id: { not: card.id },
      },
      select: { id: true, definition: true },
    });

    let options: { id: number | string; definition: string }[] = [
      { id: card.id, definition: card.definition },
    ];

    options = [...options, ..._.shuffle(otherCards).slice(0, 3).map((c) => ({ id: c.id, definition: c.definition }))];

    // Перемешиваем варианты
    options.sort(() => Math.random() - 0.5);

    // Сохраняем варианты в базе данных
    await Promise.all(
      options.map(async (option) => {
        await prisma.questionOption.create({
          data: {
            questionId: ctx.session.tempData.currentQuestion.id,
            text: option.definition,
            isCorrect: typeof option.id === 'number' && option.id === card.id,
          },
        });
      }),
    );

    const keyboard = options.map((option) => [
      {
        text: option.definition,
        callback_data: `choice_${ctx.session.tempData.currentQuestion.id}_${typeof option.id === 'string' ? 'fake' : option.id}`,
      },
    ]);

    keyboard.push([
      { text: '❓ Я не знаю', callback_data: `idk_${ctx.session.tempData.currentQuestion.id}` },
    ]);

    await ctx.reply(message + 'Выберите правильное определение:', {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  async checkAnswer(
    ctx: BotContext,
    questionId: number,
    selectedOptionId: number | string,
  ): Promise<boolean> {
    // Код для проверки ответа на вопрос выбора
    if (selectedOptionId === 'fake') return false;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { card: true },
    });

    if (!question) return false;

    return parseInt(selectedOptionId as string) === question.card.id;
  }

  async showCorrectAnswer(ctx: BotContext, questionId: number): Promise<void> {
    // Код для отображения правильного ответа
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { card: true },
    });

    if (!question) return;

    await ctx.reply(`Правильный ответ: ${question.card.definition}`);
  }
}
