import type { BotContext } from './index.js';

// Базовый интерфейс для всех типов заданий
export interface QuestionTask {
  type: string;

  // Метод для генерации вопроса
  generateQuestion(ctx: BotContext, card: any): Promise<void>;

  // Метод для проверки ответа
  checkAnswer(ctx: BotContext, questionId: number, answer: any): Promise<boolean>;

  // Метод для отображения правильного ответа
  showCorrectAnswer(ctx: BotContext, questionId: number): Promise<void>;
}
