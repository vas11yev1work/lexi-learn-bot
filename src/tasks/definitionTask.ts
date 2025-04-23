import type { QuestionTask } from '../types/question.js';
import type { BotContext } from '../types/index.js';
import { prisma } from '../db/index.js';
import { levenshtein } from '../utils/levenshtein.js';

export class DefinitionTask implements QuestionTask {
  type = 'definition';

  async generateQuestion(ctx: BotContext, card: any): Promise<void> {
    // Код для отображения вопроса на ввод определения
    // Экранирование специальных символов Markdown
    const escapedPhrase = card.phrase.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

    // Формируем сообщение для вопроса
    let message = `*${escapedPhrase}*\n\n`;

    // Добавляем подсказку через спойлер, если она есть
    if (card.hint) {
      message += `Подсказка: ||${card.hint}||\n\n`;
    }

    // Сохраняем ID вопроса и карточки в сессии
    ctx.session.action = 'answer_definition';
    ctx.session.tempData.currentQuestionId = ctx.session.tempData.currentQuestion.id;
    ctx.session.tempData.currentCardId = card.id;

    await ctx.reply(message + 'Введите определение:', {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '❓ Я не помню',
              callback_data: `idk_${ctx.session.tempData.currentQuestion.id}`,
            },
          ],
        ],
      },
    });
  }

  async checkAnswer(ctx: BotContext, questionId: number, answer: string): Promise<boolean> {
    // Код для проверки ответа на вопрос определения
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { card: true },
    });

    if (!question) return false;

    const userAnswers = answer
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    const correctVariants = question.card.definition
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    return userAnswers.every((userAns) =>
      correctVariants.some((correct) => {
        const distance = levenshtein(userAns, correct);
        const maxAllowed = Math.floor(correct.length * 0.3);
        return distance <= maxAllowed;
      }),
    );
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
