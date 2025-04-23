export class SM2 {
  static calculateNextInterval(
    repetitions: number,
    easeFactor: number,
    difficulty: number,
    currentInterval: number,
  ): {
    repetitions: number;
    interval: number;
    easeFactor: number;
  } {
    // Difficulty от 0 до 5, где 0 - самая сложная, 5 - самая легкая

    if (difficulty < 3) {
      // Если трудно вспомнить, сбрасываем счетчик повторений
      repetitions = 0;
      return { repetitions, interval: 1, easeFactor };
    } else {
      // Обновляем фактор легкости
      const newEaseFactor =
        easeFactor + (0.1 - (5 - difficulty) * (0.08 + (5 - difficulty) * 0.02));

      // Ограничиваем фактор легкости минимальным значением 1.3
      const adjustedEaseFactor = Math.max(1.3, newEaseFactor);

      // Вычисляем интервал
      let interval;
      repetitions += 1;

      if (repetitions === 1) {
        interval = 1;
      } else if (repetitions === 2) {
        interval = 3;
      } else {
        // Добавляем коэффициент замедления 0.7 и ограничиваем интервал до 30 дней
        interval = Math.min(Math.round(currentInterval * adjustedEaseFactor * 0.7), 30);
      }

      return { repetitions, interval, easeFactor: adjustedEaseFactor };
    }
  }
}
